import {
  identityPose,
  MAPS,
  mapBounds,
  MOVEMENT_TOLERANCE,
  VEHICLES,
  type Pose,
} from "@dirtyworks/shared";
import { describe, expect, it } from "vitest";
import { MovementGuard } from "../src/game/MovementGuard";

const spec = VEHICLES["dump-truck"];
const bounds = mapBounds(MAPS["mini-quarry"]);
const at = (x: number, vz = 0): Pose => ({ ...identityPose(), x, y: 6, vz });

describe("MovementGuard", () => {
  it("accepts legal motion and remembers it as the last valid pose", () => {
    const guard = new MovementGuard(spec, bounds);
    guard.reset(at(0), 1000);
    expect(guard.accept(at(0.4), 1050)).toEqual({ ok: true });
    expect(guard.lastValid.x).toBe(0.4);
  });

  it("keeps the last valid pose after a rejected update", () => {
    const guard = new MovementGuard(spec, bounds);
    guard.reset(at(0), 1000);
    expect(guard.accept(at(30), 1050)).toEqual({ ok: false, reason: "teleport", correction: null });
    expect(guard.lastValid.x).toBe(0);
  });

  it("sends a correction after three consecutive rejections, then starts counting again", () => {
    const guard = new MovementGuard(spec, bounds);
    guard.reset(at(0), 1000);
    guard.accept(at(30), 1050);
    guard.accept(at(31), 1100);
    const third = guard.accept(at(32), 1150);
    expect(third.ok).toBe(false);
    if (!third.ok) expect(third.correction).toMatchObject({ x: 0, y: 6, z: 0 });
    const fourth = guard.accept(at(33), 1200);
    expect(fourth.ok).toBe(false);
    if (!fourth.ok) expect(fourth.correction).toBeNull();
  });

  it("lets a corrected player drive on from rest (the client zeroes its velocity on a snap)", () => {
    const guard = new MovementGuard(spec, bounds);
    guard.reset(at(0, 10), 1000);
    // A crash: 10 m/s to standstill in one update is too sharp, three times over.
    guard.accept(at(0.5), 1050);
    guard.accept(at(0.5), 1100);
    const third = guard.accept(at(0.5), 1150);
    expect(third.ok).toBe(false);
    if (!third.ok) expect(third.correction).toMatchObject({ x: 0, vx: 0, vy: 0, vz: 0 });
    // Back at the corrected spot and standing still: accepted, not rubber-banded forever.
    expect(guard.accept(at(0), 1200)).toEqual({ ok: true });
  });

  it("resets the strike count after a legal update", () => {
    const guard = new MovementGuard(spec, bounds);
    guard.reset(at(0), 1000);
    guard.accept(at(30), 1050);
    guard.accept(at(31), 1100);
    guard.accept(at(0.2), 1150);
    const next = guard.accept(at(40), 1200);
    expect(next.ok).toBe(false);
    if (!next.ok) expect(next.correction).toBeNull();
  });

  it("measures time between accepted updates on the server clock", () => {
    const guard = new MovementGuard(spec, bounds);
    guard.reset(at(0, 10), 1000);
    // 4 m in 0.4 s at 10 m/s is fine even though one packet in between was rejected.
    guard.accept(at(50, 10), 1200);
    expect(guard.accept(at(4, 10), 1400)).toEqual({ ok: true });
  });

  /** Top-speed travel in one 50 ms update plus `extra` metres, reporting no velocity at all. */
  const sneaky = (extra: number) =>
    MOVEMENT_TOLERANCE.displacementFactor * spec.maxSpeed * 0.05 + extra;

  it("stops a speed hack that hides inside the per-update slack, update after update", () => {
    const guard = new MovementGuard(spec, bounds);
    guard.reset(at(-40), 1000);
    let x = -40;
    const reasons = new Set<string>();
    for (let i = 1; i <= 40; i++) {
      const r = guard.accept(at(x + sneaky(0.7)), 1000 + i * 50);
      if (r.ok) x += sneaky(0.7);
      else reasons.add(r.reason);
    }
    expect(reasons).toContain("overspeed");
    // Over 2 s: top-speed travel plus the slack budget and its refill, not 0.7 m extra × 40.
    const T = MOVEMENT_TOLERANCE;
    expect(x + 40).toBeLessThanOrEqual(
      T.displacementFactor * spec.maxSpeed * 2 + T.slackBudget + T.slackRefill * 2 + 1e-9,
    );
    expect(x + 40).toBeLessThan(40 * sneaky(0.7) * 0.7);
  });

  it("still forgives the odd bump, and the allowance comes back with time", () => {
    const guard = new MovementGuard(spec, bounds);
    guard.reset(at(0), 1000);
    expect(guard.accept(at(sneaky(0.7)), 1050)).toEqual({ ok: true });
    expect(guard.accept(at(sneaky(0.7) * 2), 1100)).toEqual({ ok: true });
    let x = sneaky(0.7) * 2;
    for (let t = 1150; t <= 3100; t += 50) {
      x += sneaky(0);
      expect(guard.accept(at(x), t)).toEqual({ ok: true });
    }
    expect(guard.accept(at(x + sneaky(0.7)), 3150)).toEqual({ ok: true });
  });
});
