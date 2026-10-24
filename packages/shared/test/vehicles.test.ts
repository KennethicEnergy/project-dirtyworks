import { describe, expect, it } from "vitest";
import { vec3, type Pose } from "../src/math";
import {
  clampJoints,
  integrateJoints,
  restJoints,
  toolTipLocal,
  toolTipWorld,
  validateVehicleSpec,
  VEHICLE_IDS,
  VEHICLES,
  type VehicleSpec,
} from "../src/vehicles";

const clone = (spec: VehicleSpec): VehicleSpec => JSON.parse(JSON.stringify(spec)) as VehicleSpec;

/** A two-link arm with hand-checkable geometry: base (0,1,0), boom 2 m, stick 1 m. */
function armSpec(): VehicleSpec {
  const spec = clone(VEHICLES.excavator);
  spec.rig = {
    base: vec3(0, 1, 0),
    swing: "swing",
    chain: [
      { joint: "boom", length: 2, offset: 0 },
      { joint: "stick", length: 1, offset: 0 },
    ],
  };
  for (const j of spec.joints) {
    j.min = -Math.PI;
    j.max = Math.PI;
    j.rest = 0;
  }
  return spec;
}

function zeros(spec: VehicleSpec): number[] {
  return spec.joints.map(() => 0);
}

function setJoint(spec: VehicleSpec, values: number[], id: string, v: number): void {
  values[spec.joints.findIndex((j) => j.id === id)] = v;
}

describe("vehicle specs", () => {
  it("accepts all four built-in vehicles", () => {
    expect(VEHICLE_IDS).toEqual(["excavator", "dump-truck", "bulldozer", "wheel-loader"]);
    for (const id of VEHICLE_IDS) {
      const result = validateVehicleSpec(VEHICLES[id]);
      expect(result.ok, `${id}: ${result.ok ? "" : result.errors.join("; ")}`).toBe(true);
    }
  });

  it("rejects a joint whose min is not below its max", () => {
    const spec = clone(VEHICLES.excavator);
    spec.joints[1]!.min = 1;
    spec.joints[1]!.max = 1;
    const result = validateVehicleSpec(spec);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join()).toMatch(/boom/);
  });

  it("rejects a rest value outside the joint limits", () => {
    const spec = clone(VEHICLES["dump-truck"]);
    spec.joints[0]!.rest = 5;
    expect(validateVehicleSpec(spec).ok).toBe(false);
  });

  it("rejects a wheeled vehicle without wheels", () => {
    const spec = clone(VEHICLES["dump-truck"]);
    spec.wheels = [];
    expect(validateVehicleSpec(spec).ok).toBe(false);
  });

  it("rejects duplicate joint ids", () => {
    const spec = clone(VEHICLES.excavator);
    spec.joints[2]!.id = spec.joints[1]!.id;
    expect(validateVehicleSpec(spec).ok).toBe(false);
  });

  it("rejects a rig that references a joint the vehicle does not have", () => {
    const spec = clone(VEHICLES["wheel-loader"]);
    spec.rig.chain[0]!.joint = "boom";
    expect(validateVehicleSpec(spec).ok).toBe(false);
  });

  it("rejects non-objects and missing fields", () => {
    expect(validateVehicleSpec(null).ok).toBe(false);
    expect(validateVehicleSpec({ id: "excavator" }).ok).toBe(false);
  });
});

describe("clampJoints", () => {
  it("clamps each joint into its limits", () => {
    const spec = VEHICLES["dump-truck"];
    const bed = spec.joints[0]!;
    expect(clampJoints(spec, [bed.max + 1], [])).toEqual([bed.max]);
    expect(clampJoints(spec, [bed.min - 1], [])).toEqual([bed.min]);
  });

  it("replaces NaN, Infinity and missing values with the rest pose", () => {
    const spec = VEHICLES.excavator;
    const out = clampJoints(spec, [Number.NaN, Number.POSITIVE_INFINITY], []);
    expect(out).toEqual(restJoints(spec));
  });

  it("writes into the provided array instead of allocating", () => {
    const spec = VEHICLES.bulldozer;
    const out: number[] = [];
    expect(clampJoints(spec, restJoints(spec), out)).toBe(out);
  });
});

describe("tool kinematics", () => {
  it("extends the chain straight forward when every joint is zero", () => {
    const spec = armSpec();
    const tip = toolTipLocal(spec, zeros(spec), vec3());
    expect(tip.x).toBeCloseTo(0);
    expect(tip.y).toBeCloseTo(1);
    expect(tip.z).toBeCloseTo(3);
  });

  it("raises the tip when the boom pitches up", () => {
    const spec = armSpec();
    const joints = zeros(spec);
    setJoint(spec, joints, "boom", Math.PI / 2);
    const tip = toolTipLocal(spec, joints, vec3());
    expect(tip.y).toBeCloseTo(4);
    expect(tip.z).toBeCloseTo(0);
  });

  it("accumulates link angles down the chain", () => {
    const spec = armSpec();
    const joints = zeros(spec);
    setJoint(spec, joints, "boom", Math.PI / 2);
    setJoint(spec, joints, "stick", -Math.PI / 2);
    const tip = toolTipLocal(spec, joints, vec3());
    expect(tip.y).toBeCloseTo(3);
    expect(tip.z).toBeCloseTo(1);
  });

  it("swings the whole arm to the left (+X) for positive swing", () => {
    const spec = armSpec();
    const joints = zeros(spec);
    setJoint(spec, joints, "swing", Math.PI / 2);
    const tip = toolTipLocal(spec, joints, vec3());
    expect(tip.x).toBeCloseTo(3);
    expect(tip.z).toBeCloseTo(0);
  });

  it("adds the slide joint to the base height for a lifting tool", () => {
    const spec = clone(VEHICLES.bulldozer);
    const joints = restJoints(spec);
    const low = toolTipLocal(spec, joints, vec3()).y;
    setJoint(spec, joints, "blade", spec.joints[0]!.rest + 0.5);
    expect(toolTipLocal(spec, joints, vec3()).y).toBeCloseTo(low + 0.5);
  });

  it("applies pose translation and yaw in world space", () => {
    const spec = armSpec();
    const half = Math.SQRT1_2;
    const pose: Pose = { x: 10, y: 0, z: 5, qx: 0, qy: half, qz: 0, qw: half, vx: 0, vy: 0, vz: 0 };
    const tip = toolTipWorld(spec, pose, zeros(spec), vec3());
    expect(tip.x).toBeCloseTo(13);
    expect(tip.y).toBeCloseTo(1);
    expect(tip.z).toBeCloseTo(5);
  });

  it("keeps every built-in vehicle's rest tool tip within its reach", () => {
    for (const id of VEHICLE_IDS) {
      const spec = VEHICLES[id];
      const tip = toolTipLocal(spec, restJoints(spec), vec3());
      expect(Math.hypot(tip.x, tip.z), id).toBeLessThanOrEqual(spec.tool.reach);
    }
  });
});

describe("integrateJoints", () => {
  it("moves a joint at its speed in the pressed direction, honoring inputSign", () => {
    const spec = VEHICLES.excavator;
    const joints = restJoints(spec);
    integrateJoints(spec, joints, [1, 0, 0, 0], 0.5);
    // swing has inputSign -1 and speed 0.9 rad/s: E (+1) swings right (negative yaw).
    expect(joints[0]).toBeCloseTo(-0.45);
    expect(joints[1]).toBeCloseTo(spec.joints[1]!.rest);
  });

  it("stops at the joint limit", () => {
    const spec = VEHICLES["dump-truck"];
    const joints = restJoints(spec);
    integrateJoints(spec, joints, [0, 1, 0, 0], 60);
    expect(joints[0]).toBe(spec.joints[0]!.max);
  });

  it("reports how hard the hydraulics worked (0 when idle or pinned at a limit)", () => {
    const spec = VEHICLES["dump-truck"];
    const joints = restJoints(spec);
    expect(integrateJoints(spec, joints, [0, 0, 0, 0], 0.1)).toBe(0);
    expect(integrateJoints(spec, joints, [0, 0.5, 0, 0], 0.1)).toBeCloseTo(0.5);
    joints[0] = spec.joints[0]!.max;
    expect(integrateJoints(spec, joints, [0, 1, 0, 0], 0.1)).toBe(0);
  });
});
