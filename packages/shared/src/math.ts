/**
 * Minimal plain-object vector math for shared logic (no three.js on the server).
 * Functions that return vectors write into an `out` argument so hot paths can reuse objects.
 */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Quat {
  x: number;
  y: number;
  z: number;
  w: number;
}

/** Position, orientation and linear velocity of a vehicle, as sent over the network. */
export interface Pose {
  x: number;
  y: number;
  z: number;
  qx: number;
  qy: number;
  qz: number;
  qw: number;
  vx: number;
  vy: number;
  vz: number;
}

export const vec3 = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z });

export const clamp = (v: number, min: number, max: number): number =>
  v < min ? min : v > max ? max : v;

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export function identityPose(): Pose {
  return { x: 0, y: 0, z: 0, qx: 0, qy: 0, qz: 0, qw: 1, vx: 0, vy: 0, vz: 0 };
}

export function copyPose(from: Pose, to: Pose): Pose {
  to.x = from.x;
  to.y = from.y;
  to.z = from.z;
  to.qx = from.qx;
  to.qy = from.qy;
  to.qz = from.qz;
  to.qw = from.qw;
  to.vx = from.vx;
  to.vy = from.vy;
  to.vz = from.vz;
  return to;
}

/** Rotates `v` by the unit quaternion (qx, qy, qz, qw) into `out` (may alias `v`). */
export function rotateByQuat(
  v: Vec3,
  qx: number,
  qy: number,
  qz: number,
  qw: number,
  out: Vec3,
): Vec3 {
  // t = 2 * cross(q.xyz, v); v' = v + w * t + cross(q.xyz, t)
  const tx = 2 * (qy * v.z - qz * v.y);
  const ty = 2 * (qz * v.x - qx * v.z);
  const tz = 2 * (qx * v.y - qy * v.x);
  const x = v.x + qw * tx + (qy * tz - qz * ty);
  const y = v.y + qw * ty + (qz * tx - qx * tz);
  const z = v.z + qw * tz + (qx * ty - qy * tx);
  out.x = x;
  out.y = y;
  out.z = z;
  return out;
}

/** Rotates `v` by the inverse of the unit quaternion into `out` (may alias `v`). */
export function rotateByQuatInverse(
  v: Vec3,
  qx: number,
  qy: number,
  qz: number,
  qw: number,
  out: Vec3,
): Vec3 {
  return rotateByQuat(v, -qx, -qy, -qz, qw, out);
}

/** Heading of a pose around +Y in radians; 0 faces +Z, positive turns toward +X. */
export function yawOf(qx: number, qy: number, qz: number, qw: number): number {
  // Forward (+Z) rotated by q, projected onto XZ.
  const fx = 2 * (qx * qz + qw * qy);
  const fz = 1 - 2 * (qx * qx + qy * qy);
  return Math.atan2(fx, fz);
}

export function quatFromYaw(yaw: number, out: Quat): Quat {
  out.x = 0;
  out.y = Math.sin(yaw / 2);
  out.z = 0;
  out.w = Math.cos(yaw / 2);
  return out;
}

export function distXZ(ax: number, az: number, bx: number, bz: number): number {
  const dx = ax - bx;
  const dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
}
