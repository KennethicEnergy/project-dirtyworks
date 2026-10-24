import type { Livery, VehicleId } from "@dirtyworks/shared";
import { BulldozerModel } from "./BulldozerModel";
import { DumpTruckModel } from "./DumpTruckModel";
import { ExcavatorModel } from "./ExcavatorModel";
import type { VehicleModel } from "./VehicleModel";
import { WheelLoaderModel } from "./WheelLoaderModel";

/** Builds the placeholder model for a vehicle. Swap a case for a GLB-backed model later. */
export function createVehicleModel(id: VehicleId, livery: Livery): VehicleModel {
  switch (id) {
    case "excavator":
      return new ExcavatorModel(livery);
    case "dump-truck":
      return new DumpTruckModel(livery);
    case "bulldozer":
      return new BulldozerModel(livery);
    case "wheel-loader":
      return new WheelLoaderModel(livery);
  }
}
