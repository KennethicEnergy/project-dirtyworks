import {
  DEFAULT_LIVERY,
  restJoints,
  toolTipLocal,
  vec3,
  VEHICLES,
  type VehicleId,
} from "@dirtyworks/shared";
import { Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { createVehicleModel } from "@/game/vehicles/models";

/** Deterministic pseudo-random joint values within limits. */
function sampleJoints(id: VehicleId, seed: number): number[] {
  let s = seed;
  const rand = () => (s = (s * 16807) % 2147483647) / 2147483647;
  return VEHICLES[id].joints.map((j) => j.min + (j.max - j.min) * rand());
}

/** World position of the tool tip according to the model's node hierarchy. */
function modelTip(id: VehicleId, joints: number[]): Vector3 {
  const model = createVehicleModel(id, DEFAULT_LIVERY);
  model.setJoints(joints);
  model.root.updateMatrixWorld(true);
  const spec = VEHICLES[id];
  const last = spec.rig.chain[spec.rig.chain.length - 1]!;
  const node =
    model.nodes[
      last.joint === "tilt" ? "tiltOffset" : spec.joints.find((j) => j.id === last.joint)!.node
    ]!;
  const tip = node.localToWorld(new Vector3(0, 0, last.length));
  model.dispose();
  return tip;
}

describe("vehicle models follow the shared tool kinematics", () => {
  it.each(["excavator", "wheel-loader"] as VehicleId[])(
    "%s bucket tip matches toolTipLocal",
    (id) => {
      for (const seed of [1, 7, 42, 1234, 99999]) {
        const joints = sampleJoints(id, seed);
        const expected = toolTipLocal(VEHICLES[id], joints, vec3());
        const tip = modelTip(id, joints);
        expect(tip.x).toBeCloseTo(expected.x, 4);
        expect(tip.y).toBeCloseTo(expected.y, 4);
        expect(tip.z).toBeCloseTo(expected.z, 4);
      }
    },
  );

  it("raises the bulldozer blade by exactly the slide joint value", () => {
    const spec = VEHICLES.bulldozer;
    const model = createVehicleModel("bulldozer", DEFAULT_LIVERY);
    const joints = restJoints(spec);
    joints[0] = 0.8;
    model.setJoints(joints);
    expect(model.nodes.blade!.position.y).toBeCloseTo(spec.rig.base.y + 0.8);
    model.dispose();
  });

  it("builds every vehicle with the nodes its joints drive", () => {
    for (const id of Object.keys(VEHICLES) as VehicleId[]) {
      const model = createVehicleModel(id, DEFAULT_LIVERY);
      for (const j of VEHICLES[id].joints)
        expect(model.nodes[j.node], `${id}.${j.node}`).toBeDefined();
      expect(model.nodes.antenna).toBeDefined();
      model.dispose();
    }
  });
});
