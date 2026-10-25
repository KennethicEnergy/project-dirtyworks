import {
  applyTerrainOp,
  createTerrainForMap,
  encodeOp,
  encodeSnapshot,
  MAPS,
  MATERIALS,
  OP,
  toQ,
  type AppliedOp,
} from "@dirtyworks/shared";
import { describe, expect, it } from "vitest";
import { TerrainSync } from "@/net/TerrainSync";

const map = MAPS["mini-quarry"];
const material = MATERIALS.gravel;

/** A server-side terrain producing real ops with real results. */
function server() {
  const terrain = createTerrainForMap(map);
  let seq = 0;
  return {
    terrain,
    dig(x: number, z: number): AppliedOp {
      const op: AppliedOp = {
        seq: ++seq,
        code: OP.DIG,
        by: "s",
        x,
        z,
        r: 100,
        a: toQ(0.25),
        b: 5000,
        c: 0,
        resultQ: 0,
      };
      op.resultQ = applyTerrainOp(terrain, op, material);
      return op;
    },
    snapshot() {
      return encodeSnapshot(terrain, createTerrainForMap(map), {
        mapId: map.id,
        materialId: material.id,
        seq,
      });
    },
    get seq() {
      return seq;
    },
  };
}

function client(opts: { now?: () => number } = {}) {
  const resyncs: number[] = [];
  const terrain = createTerrainForMap(map);
  const sync = new TerrainSync(terrain, createTerrainForMap(map), material, {
    requestResync: (from) => resyncs.push(from),
    now: opts.now,
  });
  return { terrain, sync, resyncs };
}

describe("TerrainSync", () => {
  it("drops ops already contained in the snapshot and applies later ones (late join)", () => {
    const s = server();
    const early = [s.dig(3600, -2400), s.dig(3700, -2400)];
    const snap = s.snapshot();
    const late = s.dig(3800, -2400);
    const c = client();
    // Ops sent before the welcome arrive first, then the snapshot, then a later op.
    for (const op of early) c.sync.receive(encodeOp(op));
    c.sync.loadSnapshot(snap, 2);
    c.sync.receive(encodeOp(late));
    c.sync.flush();
    expect(c.sync.seq).toBe(3);
    expect(c.terrain.hash()).toBe(s.terrain.hash());
  });

  it("buffers out-of-order ops and applies them strictly in sequence", () => {
    const s = server();
    const ops = [s.dig(3600, -2400), s.dig(3650, -2400), s.dig(3600, -2350)];
    const c = client();
    c.sync.loadSnapshot(server().snapshot(), 0);
    c.sync.receive(encodeOp(ops[2]!));
    c.sync.receive(encodeOp(ops[0]!));
    expect(c.sync.flush()).toBe(1);
    expect(c.sync.queueLength).toBe(1);
    c.sync.receive(encodeOp(ops[1]!));
    expect(c.sync.flush()).toBe(2);
    expect(c.terrain.hash()).toBe(s.terrain.hash());
  });

  it("asks for a resync once when a gap stays open for two seconds", () => {
    let t = 0;
    const s = server();
    const ops = [s.dig(3600, -2400), s.dig(3650, -2400), s.dig(3700, -2400)];
    const c = client({ now: () => t });
    c.sync.loadSnapshot(server().snapshot(), 0);
    c.sync.receive(encodeOp(ops[1]!));
    c.sync.receive(encodeOp(ops[2]!));
    c.sync.flush();
    t = 1500;
    c.sync.flush();
    expect(c.resyncs).toEqual([]);
    t = 2100;
    c.sync.flush();
    c.sync.flush();
    expect(c.resyncs).toEqual([0]);
    c.sync.receive(encodeOp(ops[0]!));
    c.sync.flush();
    expect(c.sync.seq).toBe(3);
  });

  it("ignores ops until the first snapshot arrives, then catches up from the buffer", () => {
    const s = server();
    const c = client();
    c.sync.receive(encodeOp(s.dig(3600, -2400)));
    expect(c.sync.flush()).toBe(0);
    c.sync.loadSnapshot(server().snapshot(), 0);
    expect(c.sync.flush()).toBe(1);
  });

  it("reports when a replayed op disagrees with the server's result", () => {
    const s = server();
    const op = s.dig(3600, -2400);
    const c = client();
    c.sync.loadSnapshot(server().snapshot(), 0);
    c.sync.receive(encodeOp({ ...op, resultQ: op.resultQ + 1 }));
    c.sync.flush();
    expect(c.sync.mismatches).toBe(1);
    // A diverged replica cannot be patched: rebuild from the base and fetch everything again.
    expect(c.resyncs).toEqual([0]);
    expect(c.sync.seq).toBe(0);
    expect(c.terrain.hash()).toBe(createTerrainForMap(map).hash());
  });

  it("starts over from a fresh snapshot after a reset", () => {
    const s = server();
    const c = client();
    c.sync.loadSnapshot(server().snapshot(), 0);
    c.sync.receive(encodeOp(s.dig(3600, -2400)));
    c.sync.flush();
    c.sync.loadSnapshot(server().snapshot(), 7);
    expect(c.sync.seq).toBe(7);
    expect(c.terrain.hash()).toBe(createTerrainForMap(map).hash());
  });

  it("calls back for every applied op (dust, sounds)", () => {
    const s = server();
    const c = client();
    const applied: number[] = [];
    c.sync.onApplied = (op) => applied.push(op.seq);
    c.sync.loadSnapshot(server().snapshot(), 0);
    c.sync.receive(encodeOp(s.dig(3600, -2400)));
    c.sync.flush();
    expect(applied).toEqual([1]);
  });
});
