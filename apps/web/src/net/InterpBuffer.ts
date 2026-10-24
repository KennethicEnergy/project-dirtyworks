/**
 * Snapshot interpolation for remote vehicles: a fixed ring of timestamped poses (+ joints),
 * sampled at render time ≈ server time − 100 ms. Never allocates after construction.
 */
export interface InterpPose {
  x: number;
  y: number;
  z: number;
  qx: number;
  qy: number;
  qz: number;
  qw: number;
}

const MAX_JOINTS = 4;
const STRIDE = 7 + MAX_JOINTS;

export class InterpBuffer {
  private readonly times: Float64Array;
  private readonly data: Float32Array;
  private head = 0;
  private count = 0;

  constructor(private readonly capacity = 32) {
    this.times = new Float64Array(capacity);
    this.data = new Float32Array(capacity * STRIDE);
  }

  get size(): number {
    return this.count;
  }

  /** Latest sample time, or −Infinity when empty. */
  get latest(): number {
    return this.count === 0
      ? -Infinity
      : this.times[(this.head - 1 + this.capacity) % this.capacity]!;
  }

  clear(): void {
    this.head = 0;
    this.count = 0;
  }

  push(t: number, p: InterpPose, joints: ArrayLike<number>): void {
    if (this.count > 0 && t <= this.latest) return;
    const i = this.head;
    this.times[i] = t;
    const o = i * STRIDE;
    const d = this.data;
    d[o] = p.x;
    d[o + 1] = p.y;
    d[o + 2] = p.z;
    d[o + 3] = p.qx;
    d[o + 4] = p.qy;
    d[o + 5] = p.qz;
    d[o + 6] = p.qw;
    for (let j = 0; j < MAX_JOINTS; j++) d[o + 7 + j] = j < joints.length ? joints[j]! : 0;
    this.head = (this.head + 1) % this.capacity;
    if (this.count < this.capacity) this.count++;
  }

  /** Writes the pose at time `t` into `out`/`joints`; false when there is nothing to sample. */
  sample(t: number, out: InterpPose, joints: number[]): boolean {
    if (this.count === 0) return false;
    const cap = this.capacity;
    const first = (this.head - this.count + cap) % cap;
    const last = (this.head - 1 + cap) % cap;
    if (this.count === 1 || t <= this.times[first]!) return this.copy(first, out, joints);
    if (t >= this.times[last]!) return this.copy(last, out, joints);

    let a = first;
    for (let k = 0; k < this.count - 1; k++) {
      const b = (a + 1) % cap;
      if (t <= this.times[b]!) {
        const span = this.times[b]! - this.times[a]!;
        const alpha = span > 0 ? (t - this.times[a]!) / span : 0;
        this.blend(a, b, alpha, out, joints);
        return true;
      }
      a = b;
    }
    return this.copy(last, out, joints);
  }

  private copy(i: number, out: InterpPose, joints: number[]): boolean {
    const d = this.data;
    const o = i * STRIDE;
    out.x = d[o]!;
    out.y = d[o + 1]!;
    out.z = d[o + 2]!;
    out.qx = d[o + 3]!;
    out.qy = d[o + 4]!;
    out.qz = d[o + 5]!;
    out.qw = d[o + 6]!;
    for (let j = 0; j < joints.length && j < MAX_JOINTS; j++) joints[j] = d[o + 7 + j]!;
    return true;
  }

  private blend(a: number, b: number, t: number, out: InterpPose, joints: number[]): void {
    const d = this.data;
    const oa = a * STRIDE;
    const ob = b * STRIDE;
    out.x = d[oa]! + (d[ob]! - d[oa]!) * t;
    out.y = d[oa + 1]! + (d[ob + 1]! - d[oa + 1]!) * t;
    out.z = d[oa + 2]! + (d[ob + 2]! - d[oa + 2]!) * t;
    for (let j = 0; j < joints.length && j < MAX_JOINTS; j++) {
      joints[j] = d[oa + 7 + j]! + (d[ob + 7 + j]! - d[oa + 7 + j]!) * t;
    }

    // Slerp along the shortest arc.
    const ax = d[oa + 3]!;
    const ay = d[oa + 4]!;
    const az = d[oa + 5]!;
    const aw = d[oa + 6]!;
    let bx = d[ob + 3]!;
    let by = d[ob + 4]!;
    let bz = d[ob + 5]!;
    let bw = d[ob + 6]!;
    let cos = ax * bx + ay * by + az * bz + aw * bw;
    if (cos < 0) {
      cos = -cos;
      bx = -bx;
      by = -by;
      bz = -bz;
      bw = -bw;
    }
    let s0: number;
    let s1: number;
    if (cos > 0.9995) {
      s0 = 1 - t;
      s1 = t;
    } else {
      const theta = Math.acos(cos);
      const sin = Math.sin(theta);
      s0 = Math.sin((1 - t) * theta) / sin;
      s1 = Math.sin(t * theta) / sin;
    }
    let qx = ax * s0 + bx * s1;
    let qy = ay * s0 + by * s1;
    let qz = az * s0 + bz * s1;
    let qw = aw * s0 + bw * s1;
    const len = Math.hypot(qx, qy, qz, qw) || 1;
    qx /= len;
    qy /= len;
    qz /= len;
    qw /= len;
    out.qx = qx;
    out.qy = qy;
    out.qz = qz;
    out.qw = qw;
  }
}
