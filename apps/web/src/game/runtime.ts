/**
 * Per-table game runtime: the loop, input, physics/three handles and the local vehicle.
 * React components fetch it from context and register systems into the loop.
 */
import type RAPIER from "@dimforge/rapier3d-compat";
import type { RigidBody, World } from "@dimforge/rapier3d-compat";
import {
  createTerrainForMap,
  MAPS,
  MATERIALS,
  type Terrain,
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
import type { TerrainSync } from "@/net/TerrainSync";
import type { Dust } from "./fx/Dust";
import type { ChunkColliders } from "./terrain/ChunkColliders";
import type { ChunkMeshes } from "./terrain/ChunkMeshes";
import type { RemoteVehicles } from "./vehicles/RemoteVehicles";
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
  /** Parked on a charging pad this frame. */
  charging: boolean;
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
  /** Operator spot along the table rim (0..1), sent with every state update. */
  edgeT = 0.5;
  /** Number of rendered remote vehicles (perf overlay). */
  remoteCount: () => number = () => 0;
  /** The table's terrain replica; server ops are replayed into it in seq order. */
  readonly terrain: Terrain;
  /** Mesh and collider managers once the terrain view is mounted (perf overlay, track marks). */
  terrainView: { meshes: ChunkMeshes; colliders: ChunkColliders } | null = null;
  /** Set for one frame when a whole snapshot is applied, so it is not shaded as fresh digging. */
  suppressFresh = false;
  /** The replica's sync state (perf overlay). */
  terrainSync: TerrainSync | null = null;
  /** Material in the local bucket/bed and total moved, from the server (quanta). */
  localLoadQ = 0;
  localMovedQ = 0;
  /** Dust/debris emitter once mounted. */
  dust: Dust | null = null;
  /** Tilt-shift focus line (0 bottom … 1 top), kept on the local vehicle by the camera. */
  focusY = 0.5;
  /** Other drivers, once the table session is mounted (nameplates, spectate camera). */
  remotes: RemoteVehicles | null = null;
  /** Session id of the driver a spectator is watching. */
  spectateId: string | null = null;
  /** Set by photo mode: resolved with a PNG data URL right after the next frame renders. */
  captureRequest: ((dataUrl: string) => void) | null = null;
  /** Each RC car keeps its own charge across garage swaps and respawns. */
  readonly batteries: Partial<Record<VehicleId, number>> = {};

  constructor(mapId: MapId, materialId: MaterialId) {
    this.map = MAPS[mapId];
    this.material = MATERIALS[materialId];
    this.terrain = createTerrainForMap(this.map);
  }

  /** Ground height (m) at world (x, z). */
  groundHeightAt(x: number, z: number): number {
    return this.terrain.heightAt(x, z);
  }
}

export const RuntimeContext = createContext<GameRuntime | null>(null);

export function useRuntime(): GameRuntime {
  const rt = useContext(RuntimeContext);
  if (!rt) throw new Error("useRuntime() outside <RuntimeContext>");
  return rt;
}
