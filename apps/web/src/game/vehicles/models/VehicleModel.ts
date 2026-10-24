/**
 * What the game logic needs from a vehicle's visuals. Primitive placeholder models implement it
 * today; a GLB-backed model only has to expose the same named nodes (`boom`, `bed`, `blade`…).
 */
import type { Livery, VehicleId } from "@dirtyworks/shared";
import type { Group, Object3D } from "three";

export type LedState = "ok" | "low" | "busy";

export interface VehicleModel {
  readonly id: VehicleId;
  readonly root: Group;
  /** Joint nodes keyed by the spec's `node` names, plus `antenna`, `led`, `load`. */
  readonly nodes: Partial<Record<string, Object3D>>;
  /** Applies joint values (spec order) to their nodes. */
  setJoints(values: ArrayLike<number>): void;
  /** Wheel `i`: steering angle (rad), spin angle (rad), suspension length from its mount (m). */
  setWheel(i: number, steer: number, spin: number, suspension: number): void;
  /** Track/road-wheel animation from left and right ground speeds (m/s). */
  setTracks(left: number, right: number, dt: number): void;
  /** Loader articulation bend (rad); no-op for rigid vehicles. */
  setArticulation(angle: number): void;
  setLivery(livery: Livery): void;
  /** Carried material 0..1 shown as a heap in the bucket or bed. */
  setLoad(fraction: number): void;
  setLed(state: LedState, on: boolean): void;
  dispose(): void;
}
