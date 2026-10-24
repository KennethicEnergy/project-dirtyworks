/**
 * The table's authoritative terrain. Turns validated intents into fully specified ops, applies
 * them with the shared deterministic code, numbers them, owns bucket/bed loads, keeps a bounded
 * op log for resyncs and serves compressed snapshots for late joiners.
 */
import {
  applySnapshot,
  applyTerrainOp,
  createTerrainForMap,
  decodeSnapshot,
  encodeSnapshot,
  m3ToQuanta,
  OP,
  rotateByQuatInverse,
  type AppliedOp,
  type MaterialPreset,
  type Pose,
  type TableMap,
  type TerrainIntent,
  type Terrain,
  type VehicleSpec,
} from "@dirtyworks/shared";
import { validateIntent, type IntentRejection } from "./terrainValidation";

/** A player issuing an intent, as the room knows them right now. */
export interface Actor {
  sessionId: string;
  spec: VehicleSpec | null;
  pose: Pose | null;
  joints: ArrayLike<number>;
  loadQ: number;
  bucket: { take(): boolean };
}

export type HandleResult =
  | {
      ok: true;
      ops: AppliedOp[];
      /** New absolute loads (quanta) for every session whose load changed. */
      loads: Record<string, number>;
      /** Material the actor moved with this intent (quanta), for their "volume moved" counter. */
      movedQ: number;
    }
  | { ok: false; reason: IntentRejection };

/** Material a tipped bed pours per dump op (≈ 2 m³/s at a few ops per second). */
export const DUMP_PER_OP_Q = m3ToQuanta(0.4);
/** Extra margin around the truck bed footprint when catching a bucket release. */
const BED_MARGIN = 0.3;

export class TerrainAuthority {
  readonly base: Terrain;
  readonly terrain: Terrain;
  private seqNo = 0;
  /** Ops with seq > logFloor are kept in `log` (bounded). */
  private logFloor = 0;
  private readonly log: AppliedOp[] = [];
  private cache: { seq: number; bytes: Uint8Array } | null = null;
  private readonly logSize: number;
  private readonly scratch = { x: 0, y: 0, z: 0 };

  constructor(
    readonly map: TableMap,
    readonly material: MaterialPreset,
    opts: { logSize?: number } = {},
  ) {
    this.base = createTerrainForMap(map);
    this.terrain = this.base.clone();
    this.logSize = opts.logSize ?? 512;
  }

  get seq(): number {
    return this.seqNo;
  }

  hash(): number {
    return this.terrain.hash();
  }

  heightAt(x: number, z: number): number {
    return this.terrain.heightAt(x, z);
  }

  handle(intent: TerrainIntent, actor: Actor, trucks: readonly Actor[]): HandleResult {
    const check = validateIntent(intent, actor);
    if (!check.ok) return check;
    const spec = actor.spec!;
    const tool = spec.tool;
    const loads: Record<string, number> = {};
    const ops: AppliedOp[] = [];
    let movedQ = 0;

    switch (intent.kind) {
      case "dig": {
        const capacity = m3ToQuanta(tool.capacityM3);
        const op = this.make(OP.DIG, actor.sessionId, intent.x, intent.z, intent.r, {
          a: Math.round((intent.d * 1024 * this.material.softness) / 100),
          b: capacity - actor.loadQ,
        });
        if (this.apply(op) > 0) {
          ops.push(op);
          loads[actor.sessionId] = actor.loadQ + op.resultQ;
          movedQ = op.resultQ;
        }
        break;
      }
      case "release": {
        let load = actor.loadQ;
        const truck = this.truckUnder(intent.x / 100, intent.z / 100, trucks, actor.sessionId);
        if (truck) {
          const room = m3ToQuanta(truck.spec!.tool.capacityM3) - truck.loadQ;
          const transfer = Math.max(0, Math.min(load, room));
          if (transfer > 0) {
            loads[truck.sessionId] = truck.loadQ + transfer;
            load -= transfer;
          }
        }
        if (load > 0) {
          const op = this.make(
            OP.FILL,
            actor.sessionId,
            intent.x,
            intent.z,
            Math.round(tool.brushRadius * 120),
            {
              a: load,
            },
          );
          this.apply(op);
          ops.push(op);
          load -= op.resultQ;
        }
        loads[actor.sessionId] = load;
        break;
      }
      case "dump": {
        const amount = Math.min(actor.loadQ, DUMP_PER_OP_Q);
        const op = this.make(
          OP.FILL,
          actor.sessionId,
          intent.x,
          intent.z,
          Math.round(tool.brushRadius * 100),
          {
            a: amount,
          },
        );
        this.apply(op);
        ops.push(op);
        loads[actor.sessionId] = actor.loadQ - op.resultQ;
        movedQ = op.resultQ;
        break;
      }
      case "push": {
        const op = this.make(OP.PUSH, actor.sessionId, intent.x, intent.z, intent.r, {
          a: Math.round((intent.h * 1024) / 100),
          b: intent.fx,
          c: intent.fz,
        });
        if (this.apply(op) > 0) {
          ops.push(op);
          movedQ = op.resultQ;
        }
        break;
      }
    }
    return { ok: true, ops, loads, movedQ };
  }

  /** Ops after `fromSeq`, or null when they were folded away (the client needs a snapshot). */
  opsSince(fromSeq: number): AppliedOp[] | null {
    if (fromSeq >= this.seqNo) return [];
    if (fromSeq < this.logFloor) return null;
    return this.log.filter((op) => op.seq > fromSeq);
  }

  /** Compressed snapshot of the current terrain (cached per sequence number). */
  snapshot(): Uint8Array {
    if (this.cache?.seq !== this.seqNo) {
      this.cache = {
        seq: this.seqNo,
        bytes: encodeSnapshot(this.terrain, this.base, {
          mapId: this.map.id,
          materialId: this.material.id,
          seq: this.seqNo,
        }),
      };
    }
    return this.cache.bytes;
  }

  /** Back to the untouched table. Starts a new epoch: older ops can no longer be replayed. */
  reset(): void {
    this.terrain.copyFrom(this.base);
    this.seqNo++;
    this.foldAll();
  }

  /** Loads a saved table's snapshot onto the base terrain. */
  restore(bytes: Uint8Array): void {
    const snap = decodeSnapshot(bytes);
    if (snap.mapId !== this.map.id) throw new Error("snapshot is for another table");
    this.terrain.copyFrom(this.base);
    applySnapshot(this.terrain, snap);
    this.seqNo++;
    this.foldAll();
  }

  private foldAll(): void {
    this.log.length = 0;
    this.logFloor = this.seqNo;
    this.cache = null;
  }

  private make(
    code: AppliedOp["code"],
    by: string,
    x: number,
    z: number,
    r: number,
    p: { a: number; b?: number; c?: number },
  ): AppliedOp {
    return { seq: 0, code, by, x, z, r, a: p.a, b: p.b ?? 0, c: p.c ?? 0, resultQ: 0 };
  }

  private apply(op: AppliedOp): number {
    op.seq = ++this.seqNo;
    op.resultQ = applyTerrainOp(this.terrain, op, this.material);
    this.log.push(op);
    if (this.log.length > this.logSize) {
      const dropped = this.log.splice(0, this.log.length - this.logSize);
      this.logFloor = dropped[dropped.length - 1]!.seq;
    }
    return op.resultQ;
  }

  private truckUnder(
    x: number,
    z: number,
    trucks: readonly Actor[],
    exclude: string,
  ): Actor | null {
    for (const t of trucks) {
      if (t.sessionId === exclude || !t.pose || t.spec?.tool.kind !== "bed") continue;
      const box = t.spec.tool.bedBox!;
      const p = this.scratch;
      p.x = x - t.pose.x;
      p.y = 0;
      p.z = z - t.pose.z;
      rotateByQuatInverse(p, t.pose.qx, t.pose.qy, t.pose.qz, t.pose.qw, p);
      if (
        Math.abs(p.x - box.center.x) <= box.size.x / 2 + BED_MARGIN &&
        Math.abs(p.z - box.center.z) <= box.size.z / 2 + BED_MARGIN
      ) {
        return t;
      }
    }
    return null;
  }
}
