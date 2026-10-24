import { describe, expect, it } from "vitest";
import { InterpBuffer, type InterpPose } from "@/net/InterpBuffer";
import { ServerClock } from "@/net/ServerClock";

const pose = (x: number, yaw = 0): InterpPose => ({
  x,
  y: 1,
  z: -x,
  qx: 0,
  qy: Math.sin(yaw / 2),
  qz: 0,
  qw: Math.cos(yaw / 2),
});

function fresh(): { out: InterpPose; joints: number[] } {
  return { out: pose(0), joints: [0, 0, 0, 0] };
}

describe("InterpBuffer", () => {
  it("interpolates position and joints between the two surrounding samples", () => {
    const buf = new InterpBuffer();
    buf.push(1000, pose(0), [0, 1]);
    buf.push(1100, pose(10), [1, 3]);
    const { out, joints } = fresh();
    expect(buf.sample(1025, out, joints)).toBe(true);
    expect(out.x).toBeCloseTo(2.5);
    expect(out.z).toBeCloseTo(-2.5);
    expect(joints.slice(0, 2)).toEqual([0.25, 1.5]);
  });

  it("holds the first sample before the buffer starts and the last one after it ends", () => {
    const buf = new InterpBuffer();
    buf.push(1000, pose(4), [0]);
    buf.push(1100, pose(8), [0]);
    const { out, joints } = fresh();
    buf.sample(500, out, joints);
    expect(out.x).toBe(4);
    buf.sample(9999, out, joints);
    expect(out.x).toBe(8);
  });

  it("slerps rotation along the shortest arc even when quaternion signs flip", () => {
    const buf = new InterpBuffer();
    const a = pose(0, 0.1);
    const b = pose(0, 0.3);
    b.qy = -b.qy;
    b.qw = -b.qw;
    buf.push(0, a, []);
    buf.push(100, b, []);
    const { out, joints } = fresh();
    buf.sample(50, out, joints);
    const yaw = 2 * Math.atan2(Math.abs(out.qy), Math.abs(out.qw));
    expect(yaw).toBeCloseTo(0.2, 5);
  });

  it("ignores duplicate and out-of-order samples", () => {
    const buf = new InterpBuffer();
    buf.push(1000, pose(0), []);
    buf.push(1100, pose(10), []);
    buf.push(1100, pose(99), []);
    buf.push(1050, pose(99), []);
    expect(buf.size).toBe(2);
  });

  it("keeps only the newest samples when the ring fills up", () => {
    const buf = new InterpBuffer(4);
    for (let i = 0; i < 10; i++) buf.push(i * 100, pose(i), []);
    expect(buf.size).toBe(4);
    const { out, joints } = fresh();
    buf.sample(0, out, joints);
    expect(out.x).toBe(6);
  });

  it("reports nothing to sample when empty", () => {
    const { out, joints } = fresh();
    expect(new InterpBuffer().sample(0, out, joints)).toBe(false);
  });

  it("writes into the caller's objects instead of allocating", () => {
    const buf = new InterpBuffer();
    buf.push(0, pose(0), [1]);
    buf.push(100, pose(1), [2]);
    const { out, joints } = fresh();
    const before = out;
    buf.sample(50, out, joints);
    expect(out).toBe(before);
    expect(joints[0]).toBeCloseTo(1.5);
  });
});

describe("ServerClock", () => {
  it("maps local time to server time using the lowest observed delay", () => {
    const clock = new ServerClock();
    clock.observe(1000, 5050); // 50 ms in flight
    clock.observe(1100, 5130); // 30 ms: better estimate
    clock.observe(1200, 5290); // 90 ms: ignored as jitter
    expect(clock.toServer(6000)).toBeCloseTo(6000 - 4030, 0);
  });

  it("is not ready until it has seen a server timestamp", () => {
    const clock = new ServerClock();
    expect(clock.ready).toBe(false);
    clock.observe(1, 2);
    expect(clock.ready).toBe(true);
  });

  it("slowly relaxes so a better path discovered later is adopted gradually", () => {
    const clock = new ServerClock();
    clock.observe(0, 100);
    for (let i = 1; i <= 2000; i++) clock.observe(i * 10, i * 10 + 120);
    // Offset drifts toward the new 120 ms delay instead of staying pinned at 100 ms forever.
    expect(clock.toServer(10_000)).toBeLessThan(10_000 - 100);
  });
});
