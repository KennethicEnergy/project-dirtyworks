import {
  identityPose,
  m3ToQuanta,
  restJoints,
  TokenBucket,
  VEHICLES,
  type Pose,
  type TerrainIntent,
  type VehicleId,
} from "@dirtyworks/shared";
import { describe, expect, it } from "vitest";
import { validateIntent, type IntentContext } from "../src/game/terrainValidation";

const at = (x: number, y: number, z: number): Pose => ({ ...identityPose(), x, y, z });

function ctx(vehicle: VehicleId, patch: Partial<IntentContext> = {}): IntentContext {
  const spec = VEHICLES[vehicle];
  return {
    spec,
    pose: at(0, 5, 0),
    joints: restJoints(spec),
    loadQ: 0,
    bucket: new TokenBucket(10, 10, () => 0),
    ...patch,
  };
}

const dig = (
  xM: number,
  zM: number,
  extra: Partial<Extract<TerrainIntent, { kind: "dig" }>> = {},
): TerrainIntent => ({
  kind: "dig",
  x: Math.round(xM * 100),
  z: Math.round(zM * 100),
  r: 100,
  d: 25,
  ...extra,
});

describe("validateIntent", () => {
  it("accepts a legal excavator dig 6 m in front", () => {
    expect(validateIntent(dig(0, 6), ctx("excavator"))).toEqual({ ok: true });
  });

  it("rejects a dig beyond the arm's reach", () => {
    expect(validateIntent(dig(0, 15), ctx("excavator"))).toEqual({ ok: false, reason: "reach" });
  });

  it("rejects the 11th op within one second", () => {
    const c = ctx("excavator");
    for (let i = 0; i < 10; i++) expect(validateIntent(dig(0, 6), c).ok).toBe(true);
    expect(validateIntent(dig(0, 6), c)).toEqual({ ok: false, reason: "rate" });
  });

  it("rejects digging with a full bucket", () => {
    const full = m3ToQuanta(VEHICLES.excavator.tool.capacityM3);
    expect(validateIntent(dig(0, 6), ctx("excavator", { loadQ: full }))).toEqual({
      ok: false,
      reason: "volume",
    });
  });

  it("rejects releasing an empty bucket", () => {
    expect(validateIntent({ kind: "release", x: 0, z: 600 }, ctx("wheel-loader"))).toEqual({
      ok: false,
      reason: "volume",
    });
  });

  it("rejects dumping before the bed is tipped past 40°", () => {
    const spec = VEHICLES["dump-truck"];
    const joints = restJoints(spec);
    joints[0] = (20 * Math.PI) / 180;
    const c = ctx("dump-truck", { joints, loadQ: 5000 });
    expect(validateIntent({ kind: "dump", x: 0, z: -400 }, c)).toEqual({
      ok: false,
      reason: "angle",
    });
    joints[0] = (45 * Math.PI) / 180;
    expect(validateIntent({ kind: "dump", x: 0, z: -400 }, c)).toEqual({ ok: true });
  });

  it("rejects a dig from a vehicle without a bucket", () => {
    expect(validateIntent(dig(0, 3), ctx("dump-truck"))).toEqual({ ok: false, reason: "tool" });
  });

  it("rejects a brush wider than the tool", () => {
    expect(validateIntent(dig(0, 6, { r: 400 }), ctx("excavator"))).toEqual({
      ok: false,
      reason: "radius",
    });
  });

  it("rejects a dig deeper than one bite", () => {
    expect(validateIntent(dig(0, 6, { d: 90 }), ctx("excavator"))).toEqual({
      ok: false,
      reason: "depth",
    });
  });

  it("accepts a bulldozer push at blade height and rejects a blade 2 m below the tracks", () => {
    const push = (hM: number): TerrainIntent => ({
      kind: "push",
      x: 0,
      z: 300,
      r: 160,
      h: Math.round(hM * 100),
      fx: 0,
      fz: 520,
    });
    expect(validateIntent(push(5), ctx("bulldozer"))).toEqual({ ok: true });
    expect(validateIntent(push(3), ctx("bulldozer"))).toEqual({ ok: false, reason: "blade" });
  });

  it("rejects a windrow placed far from the blade", () => {
    expect(
      validateIntent(
        { kind: "push", x: 0, z: 300, r: 160, h: 500, fx: 2000, fz: 300 },
        ctx("bulldozer"),
      ),
    ).toEqual({ ok: false, reason: "reach" });
  });

  it("rejects ops from a player without a vehicle", () => {
    expect(validateIntent(dig(0, 6), { ...ctx("excavator"), spec: null, pose: null })).toEqual({
      ok: false,
      reason: "no-vehicle",
    });
  });
});
