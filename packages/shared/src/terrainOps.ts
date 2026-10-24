/**
 * Terrain op protocol. Clients send *intents* (what the tool is doing, in centimetres); the
 * server validates them, turns them into *applied ops* with every parameter fixed (including
 * volume limits it decided), applies them, and broadcasts them with a sequence number. Every
 * client replays applied ops in order with `applyTerrainOp` and ends up bit-identical.
 */
import { z } from "zod";
import type { MaterialPreset } from "./materials";
import { applyBrush, relaxRepose, type Terrain, type VertexRect } from "./terrain";

const cm = z.number().int().min(-20_000).max(20_000);
const radiusCm = z.number().int().min(20).max(500);

export const terrainIntentSchema = z.discriminatedUnion("kind", [
  /** Bucket closing below ground: remove up to `d` cm at (x, z). */
  z.object({
    kind: z.literal("dig"),
    x: cm,
    z: cm,
    r: radiusCm,
    d: z.number().int().min(1).max(100),
  }),
  /** Bucket opening: drop the load at (x, z) (into a truck bed when one is there). */
  z.object({ kind: z.literal("release"), x: cm, z: cm }),
  /** Tipped truck bed: pour some of the load at (x, z). */
  z.object({ kind: z.literal("dump"), x: cm, z: cm }),
  /** Blade: scrape to height `h` cm at (x, z), windrow the surplus at (fx, fz). */
  z.object({
    kind: z.literal("push"),
    x: cm,
    z: cm,
    r: radiusCm,
    h: z.number().int().min(-1000).max(5000),
    fx: cm,
    fz: cm,
  }),
]);
export type TerrainIntent = z.infer<typeof terrainIntentSchema>;

export const OP = { DIG: 1, FILL: 2, PUSH: 3 } as const;
export type OpCode = (typeof OP)[keyof typeof OP];

/**
 * A fully specified edit. Positions and radius in cm.
 * DIG: a = depthQ, b = limitQ. FILL: a = volumeQ. PUSH: a = targetQ, b = fx, c = fz (cm).
 */
export interface AppliedOp {
  seq: number;
  code: OpCode;
  /** Session that caused it ("" for the table itself, e.g. resets). */
  by: string;
  x: number;
  z: number;
  r: number;
  a: number;
  b: number;
  c: number;
  /** The authoritative result (quanta) — clients compare their replay against it. */
  resultQ: number;
}

export type WireOp = [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  string,
];

export function encodeOp(op: AppliedOp): WireOp {
  return [op.seq, op.code, op.x, op.z, op.r, op.a, op.b, op.c, op.resultQ, op.by];
}

const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);

export function decodeOp(w: unknown): AppliedOp | null {
  if (!Array.isArray(w) || w.length !== 10) return null;
  const [seq, code, x, zc, r, a, b, c, resultQ, by] = w as unknown[];
  if (![seq, code, x, zc, r, a, b, c, resultQ].every(isInt) || typeof by !== "string") return null;
  if (code !== OP.DIG && code !== OP.FILL && code !== OP.PUSH) return null;
  return {
    seq: seq as number,
    code: code as OpCode,
    by,
    x: x as number,
    z: zc as number,
    r: r as number,
    a: a as number,
    b: b as number,
    c: c as number,
    resultQ: resultQ as number,
  };
}

export const DIG_FALLOFF = 0.6;
export const FILL_FALLOFF = 0.8;
export const PUSH_FALLOFF = 0.25;
/** Repose passes per op (material travels at most one cell per pass). */
export const RELAX_PASSES = 8;

function union(a: VertexRect | null, b: VertexRect | null): VertexRect | null {
  if (!a) return b;
  if (!b) return a;
  return {
    i0: Math.min(a.i0, b.i0),
    j0: Math.min(a.j0, b.j0),
    i1: Math.max(a.i1, b.i1),
    j1: Math.max(a.j1, b.j1),
  };
}

/**
 * Applies one op exactly as the server did. Returns the quanta it moved: removed (DIG),
 * added (FILL) or scraped and windrowed (PUSH).
 */
export function applyTerrainOp(t: Terrain, op: AppliedOp, material: MaterialPreset): number {
  const x = op.x / 100;
  const zc = op.z / 100;
  const radius = op.r / 100;
  let result = 0;
  let rect: VertexRect | null = null;
  switch (op.code) {
    case OP.DIG: {
      const res = applyBrush(t, {
        x,
        z: zc,
        radius,
        falloff: DIG_FALLOFF,
        mode: "dig",
        depthQ: op.a,
        limitQ: op.b,
      });
      result = res.changedQ;
      rect = res.rect;
      break;
    }
    case OP.FILL: {
      const res = applyBrush(t, {
        x,
        z: zc,
        radius,
        falloff: FILL_FALLOFF,
        mode: "fill",
        volumeQ: op.a,
      });
      result = res.changedQ;
      rect = res.rect;
      break;
    }
    case OP.PUSH: {
      const scrape = applyBrush(t, {
        x,
        z: zc,
        radius,
        falloff: PUSH_FALLOFF,
        mode: "flatten",
        targetQ: op.a,
      });
      rect = scrape.rect;
      if (scrape.changedQ > 0) {
        const windrow = applyBrush(t, {
          x: op.b / 100,
          z: op.c / 100,
          radius,
          falloff: FILL_FALLOFF,
          mode: "fill",
          volumeQ: scrape.changedQ,
        });
        rect = union(rect, windrow.rect);
        // Anything the windrow could not take (max height) goes back where it came from.
        const leftover = scrape.changedQ - windrow.changedQ;
        if (leftover > 0) {
          const back = applyBrush(t, {
            x,
            z: zc,
            radius,
            falloff: FILL_FALLOFF,
            mode: "fill",
            volumeQ: leftover,
          });
          rect = union(rect, back.rect);
        }
        result = windrow.changedQ;
      }
      break;
    }
  }
  if (rect) relaxRepose(t, rect, material.reposeQ, RELAX_PASSES);
  return result;
}
