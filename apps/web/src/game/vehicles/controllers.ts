import type { World } from "@dimforge/rapier3d-compat";
import type { Pose, VehicleSpec } from "@dirtyworks/shared";
import type { Rapier } from "../runtime";
import { TrackedController } from "./TrackedController";
import type { VehicleController } from "./VehicleBody";
import { WheeledController } from "./WheeledController";

export function createController(
  world: World,
  rapier: Rapier,
  spec: VehicleSpec,
  pose: Pose,
): VehicleController {
  return spec.drive === "wheeled"
    ? new WheeledController(world, rapier, spec, pose)
    : new TrackedController(world, rapier, spec, pose);
}
