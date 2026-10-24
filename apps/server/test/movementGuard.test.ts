import { identityPose, MAPS, mapBounds, VEHICLES, type Pose } from "@dirtyworks/shared";
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
});
