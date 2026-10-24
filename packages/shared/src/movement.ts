/**
 * Server-side plausibility checks for client-authoritative movement. Generous enough for
 * bumps, ramps and network jitter; strict enough to stop teleports and speed hacks.
 */
import { GRAVITY } from "./constants";
import type { Bounds } from "./maps";
import type { Pose } from "./math";
import type { VehicleSpec } from "./vehicles";

export type MovementReason = "nan" | "bounds" | "overspeed" | "teleport" | "accel";
export type MovementCheck = { ok: true } | { ok: false; reason: MovementReason };

export const MOVEMENT_TOLERANCE = {
  /** Allowed overshoot of the spec's top speed (×) plus an absolute slack (m/s). */
  speedFactor: 1.25,
  speedSlack: 1,
  maxVerticalSpeed: 40,
  /** Displacement allowed per update: displacementFactor × maxSpeed × dt + displacementSlack. */
  displacementFactor: 1.3,
  displacementSlack: 0.75,
  /** Horizontal Δv allowed: (accelFactor × maxAccel + accelSlack) × dt + deltaVSlack. */
  accelFactor: 1.5,
  accelSlack: 2,
  verticalAccel: 2 * GRAVITY,
  deltaVSlack: 1,
  /** Map bounds margin (m) so a vehicle grazing the rim is not rejected. */
  boundsMargin: 2,
  /** dt is clamped into this range so stalls and bursts neither loosen nor tighten checks. */
  minDt: 0.04,
  maxDt: 0.5,
} as const;

function finitePose(p: Pose): boolean {
  return (
    Number.isFinite(p.x) &&
    Number.isFinite(p.y) &&
    Number.isFinite(p.z) &&
    Number.isFinite(p.qx) &&
    Number.isFinite(p.qy) &&
    Number.isFinite(p.qz) &&
    Number.isFinite(p.qw) &&
    Number.isFinite(p.vx) &&
    Number.isFinite(p.vy) &&
    Number.isFinite(p.vz)
  );
}

export function validateMovement(
  prev: Pose,
  next: Pose,
  spec: VehicleSpec,
  bounds: Bounds,
  dtSec: number,
): MovementCheck {
  const T = MOVEMENT_TOLERANCE;
  if (!finitePose(next)) return { ok: false, reason: "nan" };
  const qn = next.qx * next.qx + next.qy * next.qy + next.qz * next.qz + next.qw * next.qw;
  if (Math.abs(qn - 1) > 0.1) return { ok: false, reason: "nan" };

  if (
    next.x < bounds.minX - T.boundsMargin ||
    next.x > bounds.maxX + T.boundsMargin ||
    next.z < bounds.minZ - T.boundsMargin ||
    next.z > bounds.maxZ + T.boundsMargin ||
    next.y < bounds.minY ||
    next.y > bounds.maxY
  ) {
    return { ok: false, reason: "bounds" };
  }

  const hSpeed = Math.sqrt(next.vx * next.vx + next.vz * next.vz);
  if (hSpeed > spec.maxSpeed * T.speedFactor + T.speedSlack) {
    return { ok: false, reason: "overspeed" };
  }
  if (Math.abs(next.vy) > T.maxVerticalSpeed) return { ok: false, reason: "overspeed" };

  const dt = Math.min(T.maxDt, Math.max(T.minDt, dtSec));
  const dx = next.x - prev.x;
  const dz = next.z - prev.z;
  const maxStep = T.displacementFactor * spec.maxSpeed * dt + T.displacementSlack;
  if (Math.sqrt(dx * dx + dz * dz) > maxStep) return { ok: false, reason: "teleport" };
  if (Math.abs(next.y - prev.y) > T.maxVerticalSpeed * dt + T.displacementSlack) {
    return { ok: false, reason: "teleport" };
  }

  const dvx = next.vx - prev.vx;
  const dvz = next.vz - prev.vz;
  const maxDv = (T.accelFactor * spec.maxAccel + T.accelSlack) * dt + T.deltaVSlack;
  if (Math.sqrt(dvx * dvx + dvz * dvz) > maxDv) return { ok: false, reason: "accel" };
  if (Math.abs(next.vy - prev.vy) > T.verticalAccel * dt + T.deltaVSlack) {
    return { ok: false, reason: "accel" };
  }

  return { ok: true };
}
