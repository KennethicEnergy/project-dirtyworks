/** Shared rigid-body setup for every vehicle: dynamic body + chassis collider with spec mass. */
import type { Collider, RigidBody, World } from "@dimforge/rapier3d-compat";
import type { Pose, VehicleSpec } from "@dirtyworks/shared";
import type { Rapier } from "../runtime";
import type { VehicleModel } from "./models/VehicleModel";

export interface VehicleBody {
  body: RigidBody;
  collider: Collider;
  /** Height of the chassis collider's center above the vehicle origin. */
  centerY: number;
}

export function createVehicleBody(
  world: World,
  rapier: Rapier,
  spec: VehicleSpec,
  pose: Pose,
  clearance: number,
  friction: number,
  /** Tracked vehicles own their grip in the controller; ground friction must not fight it. */
  frictionless = false,
): VehicleBody {
  const body = world.createRigidBody(
    rapier.RigidBodyDesc.dynamic()
      .setTranslation(pose.x, pose.y, pose.z)
      .setRotation({ x: pose.qx, y: pose.qy, z: pose.qz, w: pose.qw })
      .setLinearDamping(0.05)
      .setAngularDamping(0.6)
      .setCanSleep(false)
      .setCcdEnabled(true),
  );
  const s = spec.chassis.size;
  const centerY = clearance + s.y / 2;
  const m = spec.mass;
  const desc = rapier.ColliderDesc.roundCuboid(s.x / 2 - 0.1, s.y / 2 - 0.1, s.z / 2 - 0.1, 0.1)
    .setTranslation(0, centerY, 0)
    .setFriction(frictionless ? 0 : friction)
    .setFrictionCombineRule(
      frictionless ? rapier.CoefficientCombineRule.Min : rapier.CoefficientCombineRule.Average,
    )
    .setRestitution(0.05)
    .setMassProperties(
      m,
      {
        x: spec.chassis.comOffset.x,
        y: centerY + spec.chassis.comOffset.y,
        z: spec.chassis.comOffset.z,
      },
      {
        x: (m / 12) * (s.y * s.y + s.z * s.z),
        y: (m / 12) * (s.x * s.x + s.z * s.z),
        z: (m / 12) * (s.x * s.x + s.y * s.y),
      },
      { x: 0, y: 0, z: 0, w: 1 },
    );
  const collider = world.createCollider(desc, body);
  return { body, collider, centerY };
}

/** Writes the body's translation, rotation and linear velocity into `out`. */
export function readPose(body: RigidBody, out: Pose): Pose {
  const t = body.translation();
  const r = body.rotation();
  const v = body.linvel();
  out.x = t.x;
  out.y = t.y;
  out.z = t.z;
  out.qx = r.x;
  out.qy = r.y;
  out.qz = r.z;
  out.qw = r.w;
  out.vx = v.x;
  out.vy = v.y;
  out.vz = v.z;
  return out;
}

/** Forward (+Z local) component of the body's velocity. */
export function forwardSpeed(pose: Pose): number {
  const { qx, qy, qz, qw } = pose;
  const fx = 2 * (qx * qz + qw * qy);
  const fy = 2 * (qy * qz - qw * qx);
  const fz = 1 - 2 * (qx * qx + qy * qy);
  return pose.vx * fx + pose.vy * fy + pose.vz * fz;
}

export interface DriveCommand {
  /** −1..1, forward positive. */
  throttle: number;
  /** −1..1, right positive. */
  steer: number;
  handbrake: boolean;
  /** Multiplier on top speed (battery). */
  speedFactor: number;
}

export interface VehicleController {
  readonly body: RigidBody;
  command(cmd: DriveCommand): void;
  /** Runs before every physics substep. */
  preStep(dt: number): void;
  /** Wheels, tracks and articulation visuals after the physics step. */
  syncVisuals(model: VehicleModel, dt: number): void;
  dispose(): void;
}
