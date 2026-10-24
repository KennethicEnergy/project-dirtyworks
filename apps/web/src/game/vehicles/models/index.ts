import type { Livery, VehicleId } from "@dirtyworks/shared";
import { DumpTruckModel } from "./DumpTruckModel";
import type { VehicleModel } from "./VehicleModel";

/** Builds the placeholder model for a vehicle. Swap a case for a GLB loader later. */
export function createVehicleModel(id: VehicleId, livery: Livery): VehicleModel {
  switch (id) {
    case "dump-truck":
      return new DumpTruckModel(livery);
    default:
      // Remaining vehicles arrive in the next task; fall back so the table still works.
      return new DumpTruckModel(livery);
  }
}
