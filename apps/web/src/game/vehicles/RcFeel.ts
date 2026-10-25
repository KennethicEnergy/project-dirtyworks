/**
 * The pure parts of the RC "feel": the whip antenna's damped spring, the status LED pattern and
 * the servo/motor sound levels. Vehicle systems apply them to models and the sound layer.
 */
import { BATTERY, rotateByQuatInverse, vec3, type Pose } from "@dirtyworks/shared";
import type { LoopLevel } from "../audio/sound";
import type { LedState } from "./models/VehicleModel";

/** Spring stiffness (1/s²) and damping (1/s): loose enough to wobble a few times. */
const STIFFNESS = 90;
const DAMPING = 3.2;
/** Antenna tilt (rad) per m/s² of chassis acceleration. */
const GAIN = 0.035;
const MAX_TILT = 0.6;
const MAX_STEP = 1 / 120;
/** Physics velocities jitter a little; acceleration is low-passed at this rate (1/s). */
const ACCEL_SMOOTH = 25;

const accel = vec3();

const clamp = (v: number, m: number) => (v < -m ? -m : v > m ? m : v);
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const frac = (v: number) => v - Math.floor(v);

/**
 * Antenna tilt that lags behind the chassis: accelerating forward whips it back, turning leans it
 * out of the turn. `tiltX`/`tiltZ` go straight onto the antenna node's rotation.
 */
export class AntennaSpring {
  tiltX = 0;
  tiltZ = 0;
  private velX = 0;
  private velZ = 0;
  /** Smoothed acceleration in the chassis frame (m/s²): x = left, z = forward. */
  private ax = 0;
  private az = 0;
  private lastVx = 0;
  private lastVy = 0;
  private lastVz = 0;
  private primed = false;

  /** Forget the velocity history (spawn, teleport). */
  reset(): void {
    this.tiltX = this.tiltZ = this.velX = this.velZ = this.ax = this.az = 0;
    this.primed = false;
  }

  update(pose: Pose, dt: number): void {
    if (dt <= 0) return;
    if (!this.primed) {
      this.primed = true;
      this.lastVx = pose.vx;
      this.lastVy = pose.vy;
      this.lastVz = pose.vz;
      return;
    }
    accel.x = (pose.vx - this.lastVx) / dt;
    accel.y = (pose.vy - this.lastVy) / dt;
    accel.z = (pose.vz - this.lastVz) / dt;
    this.lastVx = pose.vx;
    this.lastVy = pose.vy;
    this.lastVz = pose.vz;
    rotateByQuatInverse(accel, pose.qx, pose.qy, pose.qz, pose.qw, accel);
    const k = 1 - Math.exp(-ACCEL_SMOOTH * dt);
    this.ax += (accel.x - this.ax) * k;
    this.az += (accel.z - this.az) * k;

    // The tip lags: forward acceleration tips it back (−X rotation), leftward tips it right (+Z).
    const targetX = clamp(-GAIN * this.az, MAX_TILT);
    const targetZ = clamp(GAIN * this.ax, MAX_TILT);
    const steps = Math.ceil(dt / MAX_STEP);
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      this.velX += (STIFFNESS * (targetX - this.tiltX) - DAMPING * this.velX) * h;
      this.velZ += (STIFFNESS * (targetZ - this.tiltZ) - DAMPING * this.velZ) * h;
      this.tiltX += this.velX * h;
      this.tiltZ += this.velZ * h;
    }
    if (Math.abs(this.tiltX) > MAX_TILT) {
      this.tiltX = clamp(this.tiltX, MAX_TILT);
      this.velX = 0;
    }
    if (Math.abs(this.tiltZ) > MAX_TILT) {
      this.tiltZ = clamp(this.tiltZ, MAX_TILT);
      this.velZ = 0;
    }
  }
}

export interface LedPattern {
  state: LedState;
  on: boolean;
}

/**
 * Status LED: pulsing green while charging, blinking blue while the hydraulics move, amber when
 * the battery is low (blinking when nearly empty), steady green otherwise.
 */
export function ledFor(
  battery: number,
  activity: number,
  charging: boolean,
  time: number,
): LedPattern {
  if (charging) return { state: "ok", on: frac(time * 1.2) < 0.5 };
  if (activity > 0.05) return { state: "busy", on: frac(time * 5) < 0.5 };
  if (battery < BATTERY.lowThreshold) {
    return { state: "low", on: battery >= 0.1 || frac(time * 2) < 0.5 };
  }
  return { state: "ok", on: true };
}

/** Servo whine from joint activity (0..1): silent at rest, louder and higher when busy. */
export function servoSound(activity: number): LoopLevel {
  const a = clamp01(activity);
  return { gain: a === 0 ? 0 : 0.05 + 0.25 * a, rate: 0.8 + 0.7 * a };
}

/** Electric motor hum from forward speed (m/s, signed) and throttle (−1..1). */
export function motorSound(speed: number, maxSpeed: number, throttle: number): LoopLevel {
  const s = clamp01(Math.abs(speed) / Math.max(maxSpeed, 0.1));
  const t = clamp01(Math.abs(throttle));
  return { gain: 0.06 + 0.18 * s + 0.1 * t, rate: 0.6 + 1.2 * s + 0.1 * t };
}
