/**
 * Wheeled vehicles on Rapier's raycast vehicle controller. Soft suspension gives the slightly
 * floaty RC feel. The wheel loader approximates articulated steering by counter-steering the rear.
 */
import type { DynamicRayCastVehicleController, RigidBody, World } from "@dimforge/rapier3d-compat";
import { GRAVITY, identityPose, type Pose, type VehicleSpec } from "@dirtyworks/shared";
import { isSameWorld, worldToken, type WorldToken } from "../physics/worldToken";
import type { Rapier } from "../runtime";
import type { VehicleModel } from "./models/VehicleModel";
import {
  createVehicleBody,
  forwardSpeed,
  readPose,
  type DriveCommand,
  type VehicleController,
} from "./VehicleBody";

const REVERSE_FACTOR = 0.5;
const ROLLING_BRAKE = 0.03;
const HANDBRAKE = 0.6;

export class WheeledController implements VehicleController {
  readonly body: RigidBody;
  private readonly controller: DynamicRayCastVehicleController;
  private readonly driven: number;
  private readonly cmd: DriveCommand = { throttle: 0, steer: 0, handbrake: false, speedFactor: 1 };
  private readonly scratch: Pose = identityPose();
  private steerAngle = 0;
  private readonly token: WorldToken;

  constructor(
    private readonly world: World,
    rapier: Rapier,
    private readonly spec: VehicleSpec,
    pose: Pose,
  ) {
    this.token = worldToken(world);
    const wheels = spec.wheels!;
    const lowestMount = Math.min(...wheels.map((w) => w.y));
    const { body } = createVehicleBody(world, rapier, spec, pose, lowestMount - 0.15, 0.4);
    this.body = body;
    this.controller = world.createVehicleController(body);
    this.controller.indexUpAxis = 1;
    this.controller.setIndexForwardAxis = 2;
    const s = spec.suspension;
    const perWheelLoad = (spec.mass * GRAVITY) / wheels.length;
    wheels.forEach((w, i) => {
      this.controller.addWheel(
        { x: w.x, y: w.y, z: w.z },
        { x: 0, y: -1, z: 0 },
        { x: -1, y: 0, z: 0 },
        s.restLength,
        w.radius,
      );
      this.controller.setWheelSuspensionStiffness(i, s.stiffness);
      this.controller.setWheelSuspensionCompression(i, s.damping);
      this.controller.setWheelSuspensionRelaxation(i, s.damping * 1.1);
      this.controller.setWheelMaxSuspensionTravel(i, s.travel);
      this.controller.setWheelMaxSuspensionForce(i, perWheelLoad * 4);
      this.controller.setWheelFrictionSlip(i, 1.6);
      this.controller.setWheelSideFrictionStiffness(i, 1);
    });
    this.driven = wheels.filter((w) => w.drive).length;
  }

  command(cmd: DriveCommand): void {
    this.cmd.throttle = cmd.throttle;
    this.cmd.steer = cmd.steer;
    this.cmd.handbrake = cmd.handbrake;
    this.cmd.speedFactor = cmd.speedFactor;
  }

  preStep(dt: number): void {
    const spec = this.spec;
    const wheels = spec.wheels!;
    const speed = forwardSpeed(readPose(this.body, this.scratch));
    const { throttle, steer, handbrake, speedFactor } = this.cmd;
    const top = spec.maxSpeed * speedFactor;

    // Engine: full force until top speed, none beyond. Braking when pushing against motion.
    const force = (spec.mass * spec.maxAccel) / Math.max(1, this.driven);
    let engine = 0;
    let brake = 0;
    if (throttle !== 0 && Math.sign(throttle) !== Math.sign(speed) && Math.abs(speed) > 0.5) {
      brake = (spec.mass * 0.9 * Math.abs(throttle)) / wheels.length;
    } else if (throttle > 0 && speed < top) {
      engine = force * throttle;
    } else if (throttle < 0 && speed > -top * REVERSE_FACTOR) {
      engine = force * throttle;
    } else if (throttle === 0) {
      brake = (spec.mass * ROLLING_BRAKE) / wheels.length;
    }

    // Steering eases toward the target and narrows at speed.
    const maxAngle = spec.steer.maxAngle ?? 0.5;
    const speedRatio = Math.min(1, Math.abs(speed) / spec.maxSpeed);
    const target = -steer * maxAngle * (1 - 0.45 * speedRatio);
    this.steerAngle += (target - this.steerAngle) * Math.min(1, dt * 8);

    for (let i = 0; i < wheels.length; i++) {
      const w = wheels[i]!;
      this.controller.setWheelEngineForce(i, w.drive ? engine : 0);
      this.controller.setWheelSteering(i, this.steerAngle * w.steer);
      const hand =
        handbrake && (w.steer <= 0 || spec.articulated)
          ? (spec.mass * HANDBRAKE) / wheels.length
          : 0;
      this.controller.setWheelBrake(i, Math.max(brake, hand));
    }
    this.controller.updateVehicle(dt);
  }

  /** Copies wheel steering, spin and suspension into the model. */
  syncVisuals(model: VehicleModel): void {
    const n = this.spec.wheels!.length;
    for (let i = 0; i < n; i++) {
      model.setWheel(
        i,
        this.controller.wheelSteering(i) ?? 0,
        this.controller.wheelRotation(i) ?? 0,
        this.controller.wheelSuspensionLength(i) ?? this.spec.suspension.restLength,
      );
    }
    if (this.spec.articulated) model.setArticulation(this.steerAngle);
  }

  dispose(): void {
    if (!isSameWorld(this.world, this.token)) return;
    this.world.removeVehicleController(this.controller);
    this.world.removeRigidBody(this.body);
  }
}
