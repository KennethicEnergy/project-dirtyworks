import { identityPose, quatFromYaw } from "@dirtyworks/shared";
import { describe, expect, it } from "vitest";
import { AntennaSpring, ledFor, motorSound, servoSound } from "@/game/vehicles/RcFeel";

const DT = 1 / 60;

/** Drives the spring with a constant world velocity sequence and returns the antenna. */
function run(spring: AntennaSpring, steps: number, vel: (i: number) => [number, number], yaw = 0) {
  const pose = identityPose();
  const q = quatFromYaw(yaw, { x: 0, y: 0, z: 0, w: 1 });
  pose.qx = q.x;
  pose.qy = q.y;
  pose.qz = q.z;
  pose.qw = q.w;
  for (let i = 0; i < steps; i++) {
    const [vx, vz] = vel(i);
    pose.vx = vx;
    pose.vz = vz;
    spring.update(pose, DT);
  }
  return spring;
}

describe("antenna spring", () => {
  it("whips backward when the vehicle accelerates forward", () => {
    const s = run(new AntennaSpring(), 10, (i) => [0, i * 0.2]);
    expect(s.tiltX).toBeLessThan(-0.01);
    expect(Math.abs(s.tiltZ)).toBeLessThan(1e-6);
  });

  it("leans away from a turn (sideways acceleration to the left tips it right)", () => {
    // Vehicle faces +Z; local +X is its left side.
    const s = run(new AntennaSpring(), 10, (i) => [i * 0.2, 0]);
    expect(s.tiltZ).toBeGreaterThan(0.01);
  });

  it("reads acceleration in the chassis frame", () => {
    // Facing +X (yaw 90°), accelerating along +X is forward.
    const s = run(new AntennaSpring(), 10, (i) => [i * 0.2, 0], Math.PI / 2);
    expect(s.tiltX).toBeLessThan(-0.01);
    expect(Math.abs(s.tiltZ)).toBeLessThan(0.005);
  });

  it("wobbles past upright and settles once the speed is steady", () => {
    const s = new AntennaSpring();
    run(s, 20, (i) => [0, i * 0.3]);
    let crossed = false;
    for (let i = 0; i < 600; i++) {
      run(s, 1, () => [0, 6]);
      if (s.tiltX > 0.002) crossed = true;
    }
    expect(crossed).toBe(true);
    expect(Math.abs(s.tiltX)).toBeLessThan(1e-3);
  });

  it("stays bounded under absurd acceleration and long frames", () => {
    const s = new AntennaSpring();
    const pose = identityPose();
    for (let i = 0; i < 50; i++) {
      pose.vz = i % 2 ? 500 : -500;
      s.update(pose, 0.1);
      expect(Math.abs(s.tiltX)).toBeLessThanOrEqual(0.7);
      expect(Number.isFinite(s.tiltX)).toBe(true);
    }
  });

  it("ignores the first frame and teleports (no velocity history)", () => {
    const s = new AntennaSpring();
    const pose = identityPose();
    pose.vz = 8;
    s.update(pose, DT);
    expect(s.tiltX).toBe(0);
    s.reset();
    pose.vz = -8;
    s.update(pose, DT);
    expect(s.tiltX).toBe(0);
  });
});

describe("status LED", () => {
  it("is steady green when idle with a good battery", () => {
    expect(ledFor(0.8, 0, false, 1.23)).toEqual({ state: "ok", on: true });
  });

  it("blinks blue while the hydraulics move", () => {
    const a = ledFor(0.8, 0.5, false, 0.0);
    const b = ledFor(0.8, 0.5, false, 0.1);
    expect(a.state).toBe("busy");
    expect(b.state).toBe("busy");
    expect(a.on).not.toBe(b.on);
  });

  it("turns amber when the battery is low and blinks when nearly empty", () => {
    expect(ledFor(0.15, 0, false, 0)).toEqual({ state: "low", on: true });
    const blink = [0, 0.3].map((t) => ledFor(0.05, 0, false, t));
    expect(blink.every((l) => l.state === "low")).toBe(true);
    expect(blink[0]!.on).not.toBe(blink[1]!.on);
  });

  it("pulses green while charging, even when low", () => {
    const a = ledFor(0.05, 0, true, 0.1);
    const b = ledFor(0.05, 0, true, 0.45);
    expect(a.state).toBe("ok");
    expect(a.on).not.toBe(b.on);
  });
});

describe("RC sound levels", () => {
  it("keeps the servo silent at rest and louder/higher as joints move faster", () => {
    expect(servoSound(0).gain).toBe(0);
    const slow = servoSound(0.2);
    const fast = servoSound(1);
    expect(fast.gain).toBeGreaterThan(slow.gain);
    expect(fast.rate).toBeGreaterThan(slow.rate);
    expect(servoSound(5).gain).toBe(servoSound(1).gain);
  });

  it("hums the motor with speed and throttle", () => {
    expect(motorSound(0, 8, 0).gain).toBeGreaterThan(0);
    expect(motorSound(8, 8, 1).gain).toBeGreaterThan(motorSound(0, 8, 0).gain);
    expect(motorSound(8, 8, 1).rate).toBeGreaterThan(motorSound(2, 8, 1).rate);
    expect(motorSound(-8, 8, -1).rate).toBeCloseTo(motorSound(8, 8, 1).rate);
  });
});
