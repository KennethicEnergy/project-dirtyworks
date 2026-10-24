/**
 * Per-table game runtime: the loop, input, physics/three handles and the local vehicle.
 * React components fetch it from context and register systems into the loop.
 */
import type RAPIER from "@dimforge/rapier3d-compat";
import type { RigidBody, World } from "@dimforge/rapier3d-compat";
import {
  MAPS,
  MATERIALS,
  type MapId,
  type MaterialId,
  type MaterialPreset,
  type Pose,
  type TableMap,
  type VehicleId,
  type VehicleSpec,
} from "@dirtyworks/shared";
import { createContext, useContext } from "react";
import type { PerspectiveCamera, Scene, WebGLRenderer } from "three";
import { InputSystem } from "./input/InputSystem";
import { GameLoop } from "./loop/GameLoop";
import type { VehicleModel } from "./vehicles/models/VehicleModel";

export type Rapier = typeof RAPIER;

export interface LocalVehicle {
  id: VehicleId;
  spec: VehicleSpec;
  body: RigidBody;
  model: VehicleModel;
  /** World pose after the latest physics step. */
  pose: Pose;
  joints: number[];
  /** Signed forward speed, m/s. */
  speed: number;
  /** 0..1 hydraulic activity this frame (sound, battery, LED). */
  toolActivity: number;
  /** 0..1 */
  battery: number;
}

export class GameRuntime {
  readonly loop = new GameLoop();
  readonly input = new InputSystem();
  readonly map: TableMap;
  readonly material: MaterialPreset;
  physics: { world: World; rapier: Rapier } | null = null;
  three: { gl: WebGLRenderer; scene: Scene; camera: PerspectiveCamera } | null = null;
  local: LocalVehicle | null = null;
  /** Called before every physics substep with the substep length (vehicle controllers). */
  readonly preStep = new Set<(dt: number) => void>();
  /** Height of the ground at (x, z); replaced by the terrain once it is loaded. */
  groundHeightAt: (x: number, z: number) => number;

  constructor(mapId: MapId, materialId: MaterialId) {
    this.map = MAPS[mapId];
    this.material = MATERIALS[materialId];
    const ground = this.map.baseTerrain.groundHeight;
    this.groundHeightAt = () => ground;
  }
}

export const RuntimeContext = createContext<GameRuntime | null>(null);

export function useRuntime(): GameRuntime {
  const rt = useContext(RuntimeContext);
  if (!rt) throw new Error("useRuntime() outside <RuntimeContext>");
  return rt;
}
