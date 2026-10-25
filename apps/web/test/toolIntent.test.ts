import {
  identityPose,
  jointIndex,
  m3ToQuanta,
  restJoints,
  VEHICLES,
  type VehicleId,
} from "@dirtyworks/shared";
import { describe, expect, it } from "vitest";
import { detectToolIntent, type ToolFrame } from "@/game/vehicles/toolIntent";

function frame(vehicle: VehicleId, patch: Partial<ToolFrame> = {}): ToolFrame {
  const spec = VEHICLES[vehicle];
  const joints = restJoints(spec);
  return {
    spec,
    pose: identityPose(),
    joints,
    prevJoints: [...joints],
    dt: 0.05,
    loadQ: 0,
    speed: 0,
    groundAt: () => 0,
    ...patch,
  };
}

/** Moves the bucket's curl joint by `delta` (in the closing direction when positive). */
function curl(f: ToolFrame, delta: number): ToolFrame {
  const curlSpec = f.spec.tool.curl!;
  const i = jointIndex(f.spec, curlSpec.joint);
  const joints = Array.from(f.joints);
  joints[i] = f.prevJoints[i]! + delta * curlSpec.closeDir;
  return { ...f, joints };
}

describe("detectToolIntent", () => {
  it("digs where the excavator bucket closes below ground", () => {
    const intent = detectToolIntent(curl(frame("excavator", { groundAt: () => 2 }), 0.05));
    expect(intent?.kind).toBe("dig");
    if (intent?.kind !== "dig") return;
    expect(intent.r).toBe(100);
    expect(intent.d).toBeGreaterThan(0);
    expect(intent.d).toBeLessThanOrEqual(30);
    expect(Math.hypot(intent.x, intent.z) / 100).toBeGreaterThan(5);
  });

  it("does not dig with a full bucket", () => {
    const full = m3ToQuanta(VEHICLES.excavator.tool.capacityM3);
    expect(
      detectToolIntent(curl(frame("excavator", { groundAt: () => 2, loadQ: full }), 0.05)),
    ).toBeNull();
  });

  it("does not dig when the bucket is above ground", () => {
    expect(detectToolIntent(curl(frame("excavator", { groundAt: () => -5 }), 0.05))).toBeNull();
  });

  it("releases where a loaded bucket opens above ground", () => {
    const intent = detectToolIntent(
      curl(frame("wheel-loader", { groundAt: () => -2, loadQ: 900 }), -0.05),
    );
    expect(intent?.kind).toBe("release");
  });

  it("does nothing while the bucket is still", () => {
    expect(detectToolIntent(frame("excavator", { groundAt: () => 2, loadQ: 100 }))).toBeNull();
  });

  it("dumps from a loaded truck once the bed is tipped past 40°", () => {
    const spec = VEHICLES["dump-truck"];
    const joints = restJoints(spec);
    joints[0] = (45 * Math.PI) / 180;
    expect(
      detectToolIntent(frame("dump-truck", { joints, prevJoints: joints, loadQ: 3000 }))?.kind,
    ).toBe("dump");
    joints[0] = (30 * Math.PI) / 180;
    expect(
      detectToolIntent(frame("dump-truck", { joints, prevJoints: joints, loadQ: 3000 })),
    ).toBeNull();
    joints[0] = (45 * Math.PI) / 180;
    expect(
      detectToolIntent(frame("dump-truck", { joints, prevJoints: joints, loadQ: 0 })),
    ).toBeNull();
  });

  it("pushes with a lowered blade while driving forward, windrowing ahead of the blade", () => {
    const intent = detectToolIntent(frame("bulldozer", { groundAt: () => 0.5, speed: 2 }));
    expect(intent?.kind).toBe("push");
    if (intent?.kind !== "push") return;
    expect(intent.fz).toBeGreaterThan(intent.z);
    expect(intent.h).toBe(25);
  });

  it("does not push while reversing or standing still", () => {
    expect(detectToolIntent(frame("bulldozer", { groundAt: () => 0.5, speed: -2 }))).toBeNull();
    expect(detectToolIntent(frame("bulldozer", { groundAt: () => 0.5, speed: 0 }))).toBeNull();
  });
});
