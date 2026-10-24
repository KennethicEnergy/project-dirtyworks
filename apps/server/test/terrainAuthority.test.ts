import {
  applySnapshot,
  createTerrainForMap,
  decodeSnapshot,
  identityPose,
  m3ToQuanta,
  MAPS,
  MATERIALS,
  OP,
  quatFromYaw,
  restJoints,
  VEHICLES,
  type Pose,
  type VehicleId,
} from "@dirtyworks/shared";
import { describe, expect, it } from "vitest";
import { TerrainAuthority, type Actor } from "../src/game/TerrainAuthority";

const map = MAPS["mini-quarry"];
const unlimited = { take: () => true };

function poseAt(x: number, z: number, yaw = 0): Pose {
  const q = quatFromYaw(yaw, { x: 0, y: 0, z: 0, w: 1 });
  const t = createTerrainForMap(map);
  return { ...identityPose(), x, y: t.heightAt(x, z), z, qx: q.x, qy: q.y, qz: q.z, qw: q.w };
}

function actor(sessionId: string, vehicle: VehicleId, pose: Pose, loadQ = 0): Actor {
  const spec = VEHICLES[vehicle];
  return { sessionId, spec, pose, joints: restJoints(spec), loadQ, bucket: unlimited };
}

function authority(opts: { logSize?: number } = {}) {
  return new TerrainAuthority(map, MATERIALS.gravel, opts);
}

describe("TerrainAuthority", () => {
  it("credits dug material to the digger's bucket and numbers the op", () => {
    const ta = authority();
    const digger = actor("ex", "excavator", poseAt(36, -30));
    const res = ta.handle({ kind: "dig", x: 3600, z: -2400, r: 100, d: 25 }, digger, []);
    if (!res.ok) throw new Error(res.reason);
    expect(res.ops).toHaveLength(1);
    expect(res.ops[0]!.code).toBe(OP.DIG);
    expect(res.ops[0]!.seq).toBe(1);
    expect(res.loads.ex).toBe(res.ops[0]!.resultQ);
    expect(res.loads.ex).toBeGreaterThan(0);
    expect(res.movedQ).toBe(res.ops[0]!.resultQ);
  });

  it("never digs more than the bucket can still hold", () => {
    const ta = authority();
    const capacity = m3ToQuanta(VEHICLES.excavator.tool.capacityM3);
    const digger = actor("ex", "excavator", poseAt(36, -30), capacity - 50);
    const res = ta.handle({ kind: "dig", x: 3600, z: -2400, r: 100, d: 30 }, digger, []);
    if (!res.ok) throw new Error(res.reason);
    expect(res.ops[0]!.resultQ).toBeLessThanOrEqual(50);
  });

  it("fills a truck bed up to capacity and drops the rest on the ground", () => {
    const ta = authority();
    const bedCapacity = m3ToQuanta(VEHICLES["dump-truck"].tool.capacityM3);
    const truckPose = poseAt(36, -24);
    const truck = actor("truck", "dump-truck", truckPose, bedCapacity - 300);
    const loader = actor("loader", "wheel-loader", poseAt(36, -30), 1000);
    // Bucket over the middle of the bed (bed center is 1.3 m behind the truck origin).
    const res = ta.handle({ kind: "release", x: 3600, z: -2530 }, loader, [truck]);
    if (!res.ok) throw new Error(res.reason);
    expect(res.loads.truck).toBe(bedCapacity);
    const dropped = res.ops.find((o) => o.code === OP.FILL);
    expect(dropped?.resultQ).toBe(700);
    expect(res.loads.loader).toBe(0);
  });

  it("drops a release on the ground when no truck bed is underneath", () => {
    const ta = authority();
    const loader = actor("loader", "wheel-loader", poseAt(36, -30), 1500);
    const res = ta.handle({ kind: "release", x: 3600, z: -2600 }, loader, []);
    if (!res.ok) throw new Error(res.reason);
    expect(res.ops).toHaveLength(1);
    expect(res.ops[0]!.code).toBe(OP.FILL);
    expect(res.loads.loader).toBe(1500 - res.ops[0]!.resultQ);
  });

  it("pours part of a tipped truck's load behind it", () => {
    const ta = authority();
    const truck = actor("truck", "dump-truck", poseAt(36, -30), 4000);
    (truck.joints as number[])[0] = 0.8;
    const res = ta.handle({ kind: "dump", x: 3600, z: -3400 }, truck, []);
    if (!res.ok) throw new Error(res.reason);
    expect(res.ops[0]!.code).toBe(OP.FILL);
    expect(res.loads.truck).toBe(4000 - res.ops[0]!.resultQ);
    expect(res.ops[0]!.resultQ).toBeLessThan(4000);
  });

  it("keeps sequence numbers strictly increasing across ops", () => {
    const ta = authority();
    const digger = actor("ex", "excavator", poseAt(36, -30));
    const seqs: number[] = [];
    for (let i = 0; i < 4; i++) {
      const res = ta.handle(
        { kind: "dig", x: 3600 + i * 100, z: -2400, r: 100, d: 20 },
        digger,
        [],
      );
      if (res.ok) seqs.push(...res.ops.map((o) => o.seq));
      digger.loadQ = 0;
    }
    expect(seqs).toEqual([1, 2, 3, 4]);
    expect(ta.seq).toBe(4);
  });

  it("serves a missed range from the op log, or null once it has been folded away", () => {
    const ta = authority({ logSize: 3 });
    const digger = actor("ex", "excavator", poseAt(36, -30));
    for (let i = 0; i < 6; i++) {
      ta.handle({ kind: "dig", x: 3600, z: -2400 + i * 50, r: 100, d: 20 }, digger, []);
      digger.loadQ = 0;
    }
    expect(ta.opsSince(4)?.map((o) => o.seq)).toEqual([5, 6]);
    expect(ta.opsSince(1)).toBeNull();
  });

  it("produces a snapshot a late joiner can rebuild the exact terrain from", () => {
    const ta = authority();
    const digger = actor("ex", "excavator", poseAt(36, -30));
    ta.handle({ kind: "dig", x: 3600, z: -2400, r: 100, d: 25 }, digger, []);
    const snap = decodeSnapshot(ta.snapshot());
    expect(snap.seq).toBe(1);
    const joiner = createTerrainForMap(map);
    applySnapshot(joiner, snap);
    expect(joiner.hash()).toBe(ta.hash());
  });

  it("resets to the base terrain and starts a new snapshot epoch", () => {
    const ta = authority();
    const base = createTerrainForMap(map).hash();
    const digger = actor("ex", "excavator", poseAt(36, -30));
    ta.handle({ kind: "dig", x: 3600, z: -2400, r: 100, d: 25 }, digger, []);
    expect(ta.hash()).not.toBe(base);
    ta.reset();
    expect(ta.hash()).toBe(base);
    expect(decodeSnapshot(ta.snapshot()).chunks).toHaveLength(0);
    // Up-to-date clients need nothing more; anyone older missed the reset and needs a snapshot.
    expect(ta.opsSince(ta.seq)).toEqual([]);
    expect(ta.opsSince(ta.seq - 1)).toBeNull();
  });

  it("restores a saved table", () => {
    const a = authority();
    const digger = actor("ex", "excavator", poseAt(36, -30));
    a.handle({ kind: "dig", x: 3600, z: -2400, r: 100, d: 25 }, digger, []);
    const b = authority();
    b.restore(a.snapshot());
    expect(b.hash()).toBe(a.hash());
  });

  it("passes on validation failures", () => {
    const ta = authority();
    const truck = actor("truck", "dump-truck", poseAt(36, -30));
    expect(ta.handle({ kind: "dig", x: 3600, z: -2600, r: 100, d: 25 }, truck, [])).toEqual({
      ok: false,
      reason: "tool",
    });
    expect(ta.seq).toBe(0);
  });
});
