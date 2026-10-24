import { describe, expect, it } from "vitest";
import { MAPS } from "../src/maps";
import { MATERIALS } from "../src/materials";
import { applySnapshot, decodeSnapshot, encodeSnapshot } from "../src/snapshot";
import { createTerrainForMap, toQ } from "../src/terrain";
import {
  applyTerrainOp,
  decodeOp,
  encodeOp,
  OP,
  terrainIntentSchema,
  type AppliedOp,
} from "../src/terrainOps";

const map = MAPS["mini-quarry"];
const material = MATERIALS.gravel;

/** mulberry32: tiny seeded PRNG so the op log is reproducible. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function opLog(count: number, seed: number): AppliedOp[] {
  const r = rng(seed);
  const cm = (range: number) => Math.round((r() * 2 - 1) * range * 100);
  const ops: AppliedOp[] = [];
  for (let seq = 1; seq <= count; seq++) {
    const pick = r();
    const x = cm(55);
    const z = cm(55);
    if (pick < 0.5) {
      ops.push({
        seq,
        code: OP.DIG,
        by: "a",
        x,
        z,
        r: 80 + Math.round(r() * 120),
        a: toQ(0.1 + r() * 0.3),
        b: 1229,
        c: 0,
        resultQ: 0,
      });
    } else if (pick < 0.85) {
      ops.push({
        seq,
        code: OP.FILL,
        by: "b",
        x,
        z,
        r: 120 + Math.round(r() * 80),
        a: 300 + Math.round(r() * 2500),
        b: 0,
        c: 0,
        resultQ: 0,
      });
    } else {
      ops.push({
        seq,
        code: OP.PUSH,
        by: "c",
        x,
        z,
        r: 160,
        a: toQ(4 + r() * 2),
        b: x + 250,
        c: z,
        resultQ: 0,
      });
    }
  }
  return ops;
}

describe("applyTerrainOp", () => {
  it("replays a 500-op log identically on two independent terrains", () => {
    const a = createTerrainForMap(map);
    const b = createTerrainForMap(map);
    const log = opLog(500, 42);
    for (const op of log) {
      expect(applyTerrainOp(a, op, material)).toBe(applyTerrainOp(b, op, material));
    }
    expect(a.hash()).toBe(b.hash());
    expect(a.hash()).not.toBe(createTerrainForMap(map).hash());
  });

  it("produces a different terrain when the same ops arrive in another order", () => {
    const a = createTerrainForMap(map);
    const b = createTerrainForMap(map);
    const log = opLog(80, 7);
    for (const op of log) applyTerrainOp(a, op, material);
    for (const op of [...log].reverse()) applyTerrainOp(b, op, material);
    expect(a.hash()).not.toBe(b.hash());
  });

  it("returns the removed volume for a dig and conserves volume through repose", () => {
    const t = createTerrainForMap(map);
    const before = t.sumQ();
    const removed = applyTerrainOp(
      t,
      {
        seq: 1,
        code: OP.DIG,
        by: "a",
        x: 3600,
        z: -3000,
        r: 150,
        a: toQ(0.4),
        b: 100_000,
        c: 0,
        resultQ: 0,
      },
      material,
    );
    expect(removed).toBeGreaterThan(0);
    expect(before - t.sumQ()).toBe(removed);
  });

  it("pushes scraped material into a windrow ahead of the blade (net zero)", () => {
    const t = createTerrainForMap(map);
    const before = t.sumQ();
    const moved = applyTerrainOp(
      t,
      {
        seq: 1,
        code: OP.PUSH,
        by: "a",
        x: 4800,
        z: -4200,
        r: 160,
        a: toQ(6),
        b: 4800,
        c: -3800,
        resultQ: 0,
      },
      material,
    );
    expect(moved).toBeGreaterThan(0);
    expect(t.sumQ()).toBe(before);
  });
});

describe("terrain op wire format", () => {
  it("round-trips through the compact tuple", () => {
    const op: AppliedOp = {
      seq: 9,
      code: OP.PUSH,
      by: "sess1",
      x: -120,
      z: 4500,
      r: 160,
      a: 5120,
      b: 130,
      c: 4700,
      resultQ: 321,
    };
    expect(decodeOp(encodeOp(op))).toEqual(op);
  });

  it("rejects malformed tuples", () => {
    expect(decodeOp([1, 9, 0, 0, 100, 0, 0, 0, 0, "x"] as never)).toBeNull();
    expect(decodeOp(["1", 1, 0, 0, 100, 0, 0, 0, 0, "x"] as never)).toBeNull();
    expect(decodeOp([1, 1, 0, 0] as never)).toBeNull();
  });
});

describe("terrain intents", () => {
  it("accepts centimetre integers and rejects floats, huge brushes and unknown kinds", () => {
    expect(
      terrainIntentSchema.safeParse({ kind: "dig", x: 120, z: -340, r: 100, d: 25 }).success,
    ).toBe(true);
    expect(terrainIntentSchema.safeParse({ kind: "release", x: 120, z: -340 }).success).toBe(true);
    expect(
      terrainIntentSchema.safeParse({ kind: "dig", x: 1.5, z: 0, r: 100, d: 25 }).success,
    ).toBe(false);
    expect(terrainIntentSchema.safeParse({ kind: "dig", x: 0, z: 0, r: 5000, d: 25 }).success).toBe(
      false,
    );
    expect(terrainIntentSchema.safeParse({ kind: "nuke", x: 0, z: 0 }).success).toBe(false);
  });
});

describe("snapshots", () => {
  it("restores an identical terrain from a snapshot of an edited table", () => {
    const edited = createTerrainForMap(map);
    for (const op of opLog(200, 3)) applyTerrainOp(edited, op, material);
    const bytes = encodeSnapshot(edited, createTerrainForMap(map), {
      mapId: map.id,
      materialId: material.id,
      seq: 200,
    });
    const snap = decodeSnapshot(bytes);
    expect(snap.seq).toBe(200);
    expect(snap.mapId).toBe("mini-quarry");
    const restored = createTerrainForMap(map);
    applySnapshot(restored, snap);
    expect(restored.hash()).toBe(edited.hash());
  });

  it("includes no chunks for an untouched table", () => {
    const t = createTerrainForMap(map);
    const snap = decodeSnapshot(
      encodeSnapshot(t, createTerrainForMap(map), { mapId: map.id, materialId: "gravel", seq: 0 }),
    );
    expect(snap.chunks).toHaveLength(0);
  });

  it("stays small: a well-dug quarry fits in 64 KB", () => {
    const edited = createTerrainForMap(map);
    for (const op of opLog(200, 11)) applyTerrainOp(edited, op, material);
    const bytes = encodeSnapshot(edited, createTerrainForMap(map), {
      mapId: map.id,
      materialId: material.id,
      seq: 200,
    });
    expect(bytes.byteLength).toBeLessThan(64 * 1024);
  });

  it("rejects data that is not a terrain snapshot", () => {
    expect(() => decodeSnapshot(new Uint8Array([1, 2, 3, 4, 5]))).toThrow();
  });
});
