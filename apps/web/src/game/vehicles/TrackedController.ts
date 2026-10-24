/**
 * Tracked vehicles (excavator, bulldozer) as simplified differential drive: while the tracks
 * touch the ground, the body's velocity is steered toward a target forward speed and yaw rate;
 * sideways sliding is damped away. Gravity and collisions stay with Rapier.
 */
import type { Ray, RigidBody, World } from "@dimforge/rapier3d-compat";
import { identityPose, type Pose, type VehicleSpec } from "@dirtyworks/shared";
import { isSameWorld, worldToken, type WorldToken } from "../physics/worldToken";
import type { Rapier } from "../runtime";
import type { VehicleModel } from "./models/VehicleModel";
import {
  createVehicleBody,
  readPose,
  type DriveCommand,
  type VehicleController,
} from "./VehicleBody";

const LATERAL_GRIP = 10;
const REVERSE_FACTOR = 0.6;
const TURN_ACCEL = 3;

const moveToward = (v: number, target: number, step: number) =>
  v < target ? Math.min(target, v + step) : Math.max(target, v - step);

export class TrackedController implements VehicleController {
  readonly body: RigidBody;
  private readonly token: WorldToken;
  private readonly centerY: number;
  private readonly cmd: DriveCommand = { throttle: 0, steer: 0, handbrake: false, speedFactor: 1 };
  private readonly pose: Pose = identityPose();
  private readonly ray: Ray;
  private readonly vel = { x: 0, y: 0, z: 0 };
  private readonly ang = { x: 0, y: 0, z: 0 };
  private left = 0;
  private right = 0;

  constructor(
    private readonly world: World,
    rapier: Rapier,
    private readonly spec: VehicleSpec,
    pose: Pose,
  ) {
    this.token = worldToken(world);
    const made = createVehicleBody(world, rapier, spec, pose, 0.02, 0, true);
    this.body = made.body;
    this.centerY = made.centerY;
    this.ray = new rapier.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });
  }

  command(cmd: DriveCommand): void {
    this.cmd.throttle = cmd.throttle;
    this.cmd.steer = cmd.steer;
    this.cmd.handbrake = cmd.handbrake;
    this.cmd.speedFactor = cmd.speedFactor;
  }

  preStep(dt: number): void {
    const p = readPose(this.body, this.pose);
    const { qx, qy, qz, qw } = p;
    // Local axes in world space.
    const fx = 2 * (qx * qz + qw * qy);
    const fy = 2 * (qy * qz - qw * qx);
    const fz = 1 - 2 * (qx * qx + qy * qy);
    const ux = 2 * (qx * qy - qw * qz);
    const uy = 1 - 2 * (qx * qx + qz * qz);
    const uz = 2 * (qy * qz + qw * qx);
    const rx = uy * fz - uz * fy;
    const ry = uz * fx - ux * fz;
    const rz = ux * fy - uy * fx;

    // Grounded when a ray from the chassis center hits something just below the tracks.
    const t = this.body.translation();
    this.ray.origin.x = t.x + ux * this.centerY;
    this.ray.origin.y = t.y + uy * this.centerY;
    this.ray.origin.z = t.z + uz * this.centerY;
    this.ray.dir.x = -ux;
    this.ray.dir.y = -uy;
    this.ray.dir.z = -uz;
    const hit = this.world.castRay(
      this.ray,
      this.centerY + 0.35,
      true,
      undefined,
      undefined,
      undefined,
      this.body,
    );
    if (!hit) {
      this.left = this.right = 0;
      return;
    }

    const { throttle, steer, handbrake, speedFactor } = this.cmd;
    const spec = this.spec;
    const top = spec.maxSpeed * speedFactor;
    const forward = p.vx * fx + p.vy * fy + p.vz * fz;
    const lateral = p.vx * rx + p.vy * ry + p.vz * rz;
    const vertical = p.vx * ux + p.vy * uy + p.vz * uz;
    const target = handbrake ? 0 : throttle >= 0 ? throttle * top : throttle * top * REVERSE_FACTOR;
    const braking = handbrake || target === 0 || Math.sign(target) !== Math.sign(forward);
    const newForward = moveToward(forward, target, spec.maxAccel * (braking ? 1.6 : 1) * dt);
    const newLateral = lateral * Math.max(0, 1 - LATERAL_GRIP * dt);
    this.vel.x = fx * newForward + rx * newLateral + ux * vertical;
    this.vel.y = fy * newForward + ry * newLateral + uy * vertical;
    this.vel.z = fz * newForward + rz * newLateral + uz * vertical;
    this.body.setLinvel(this.vel, true);

    // Right steer turns right (negative yaw). Tracks can pivot in place.
    const w = this.body.angvel();
    const yawRate = w.x * ux + w.y * uy + w.z * uz;
    const targetYaw = -steer * (spec.steer.turnRate ?? 0.8) * (handbrake ? 0 : 1);
    const newYaw = moveToward(yawRate, targetYaw, TURN_ACCEL * dt);
    const dYaw = newYaw - yawRate;
    this.ang.x = w.x + ux * dYaw;
    this.ang.y = w.y + uy * dYaw;
    this.ang.z = w.z + uz * dYaw;
    this.body.setAngvel(this.ang, true);

    const half = (spec.tracks?.gauge ?? 2.4) / 2;
    this.left = newForward - newYaw * half;
    this.right = newForward + newYaw * half;
  }

  syncVisuals(model: VehicleModel, dt: number): void {
    model.setTracks(this.left, this.right, dt);
  }

  dispose(): void {
    if (!isSameWorld(this.world, this.token)) return;
    this.world.removeRigidBody(this.body);
  }
}
