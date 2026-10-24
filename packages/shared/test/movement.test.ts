import { describe, expect, it } from "vitest";
import { MAPS, mapBounds } from "../src/maps";
import { identityPose, type Pose } from "../src/math";
import { validateMovement } from "../src/movement";
import { VEHICLES } from "../src/vehicles";

const truck = VEHICLES["dump-truck"]; // maxSpeed 11 m/s, maxAccel 4 m/s²
const bounds = mapBounds(MAPS["mini-quarry"]);

function pose(patch: Partial<Pose>): Pose {
  return { ...identityPose(), y: 6, ...patch };
}

describe("validateMovement", () => {
  it("accepts driving at 10 m/s for one 50 ms update", () => {
    const prev = pose({ vz: 10 });
    const next = pose({ z: 0.5, vz: 10 });
    expect(validateMovement(prev, next, truck, bounds, 0.05)).toEqual({ ok: true });
  });

  it("accepts standing still", () => {
    expect(validateMovement(pose({}), pose({}), truck, bounds, 0.05)).toEqual({ ok: true });
  });

  it("accepts free fall at gravity", () => {
    const prev = pose({ vy: -4 });
    const next = pose({ y: 5.78, vy: -4.49 });
    expect(validateMovement(prev, next, truck, bounds, 0.05)).toEqual({ ok: true });
  });

  it("accepts a late packet using the clamped time step", () => {
    const prev = pose({ vz: 10 });
    const next = pose({ z: 4.5, vz: 10 });
    expect(validateMovement(prev, next, truck, bounds, 0.45).ok).toBe(true);
  });

  it("rejects a 40 m jump as a teleport", () => {
    const next = pose({ x: 40 });
    expect(validateMovement(pose({}), next, truck, bounds, 0.05)).toEqual({
      ok: false,
      reason: "teleport",
    });
  });

  it("rejects three times the top speed", () => {
    const prev = pose({ vz: 33 });
    const next = pose({ z: 1.65, vz: 33 });
    expect(validateMovement(prev, next, truck, bounds, 0.05)).toEqual({
      ok: false,
      reason: "overspeed",
    });
  });

  it("rejects going from 0 to 12 m/s in one update", () => {
    const next = pose({ z: 0.3, vz: 12 });
    expect(validateMovement(pose({}), next, truck, bounds, 0.05)).toEqual({
      ok: false,
      reason: "accel",
    });
  });

  it("rejects leaving the table bounds", () => {
    const prev = pose({ x: bounds.maxX + 1.9 });
    const next = pose({ x: bounds.maxX + 2.3 });
    expect(validateMovement(prev, next, truck, bounds, 0.05)).toEqual({
      ok: false,
      reason: "bounds",
    });
  });

  it("rejects falling through the tabletop", () => {
    const next = pose({ y: bounds.minY - 1 });
    expect(validateMovement(pose({ y: bounds.minY - 0.9 }), next, truck, bounds, 0.05).ok).toBe(
      false,
    );
  });

  it.each([
    ["NaN position", { x: Number.NaN }],
    ["infinite velocity", { vx: Number.POSITIVE_INFINITY }],
    ["a zero quaternion", { qw: 0 }],
  ])("rejects %s", (_label, patch) => {
    expect(validateMovement(pose({}), pose(patch), truck, bounds, 0.05)).toEqual({
      ok: false,
      reason: "nan",
    });
  });
});
