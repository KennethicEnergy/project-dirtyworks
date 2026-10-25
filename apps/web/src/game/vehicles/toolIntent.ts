/**
 * Turns what the local vehicle's tool is doing this frame into a terrain intent for the server:
 * a bucket closing below ground digs, a loaded bucket opening above ground releases, a tipped
 * loaded bed dumps, a lowered blade moving forward pushes. Pure, so it is unit tested.
 */
import {
  jointIndex,
  m3ToQuanta,
  toolTipWorld,
  vec3,
  type Pose,
  type TerrainIntent,
  type VehicleSpec,
} from "@dirtyworks/shared";

export interface ToolFrame {
  spec: VehicleSpec;
  pose: Pose;
  joints: ArrayLike<number>;
  /** Joint values one frame ago (to know which way the bucket is moving). */
  prevJoints: ArrayLike<number>;
  dt: number;
  /** Material in the bucket/bed (quanta), as the server last reported it. */
  loadQ: number;
  /** Signed forward speed (m/s). */
  speed: number;
  groundAt: (x: number, z: number) => number;
}

/** Bucket joint speed (rad/s) that counts as deliberately closing/opening. */
const CURL_THRESHOLD = 0.05;
/** The bucket lip must be this far below the surface to bite (m). */
const BITE = 0.03;
/** …and this far above it to release (m). */
const RELEASE_CLEARANCE = 0.15;
const PUSH_MIN_SPEED = 0.4;
/** Windrow lands this many brush radii ahead of the blade. */
const WINDROW_AHEAD = 1.4;

const tip = vec3();
const cm = (m: number) => Math.round(m * 100);

export function detectToolIntent(f: ToolFrame): TerrainIntent | null {
  const { spec, pose } = f;
  const tool = spec.tool;
  toolTipWorld(spec, pose, f.joints, tip);
  const ground = f.groundAt(tip.x, tip.z);

  if (tool.kind === "bucket") {
    const curl = tool.curl!;
    const i = jointIndex(spec, curl.joint);
    const rate =
      (((f.joints[i] ?? 0) - (f.prevJoints[i] ?? 0)) * curl.closeDir) / Math.max(f.dt, 1e-3);
    if (rate > CURL_THRESHOLD && tip.y < ground - BITE && f.loadQ < m3ToQuanta(tool.capacityM3)) {
      const depth = Math.min(tool.maxDigDepth, ground - tip.y);
      return {
        kind: "dig",
        x: cm(tip.x),
        z: cm(tip.z),
        r: cm(tool.brushRadius),
        d: Math.max(1, cm(depth)),
      };
    }
    if (rate < -CURL_THRESHOLD && f.loadQ > 0 && tip.y > ground + RELEASE_CLEARANCE) {
      return { kind: "release", x: cm(tip.x), z: cm(tip.z) };
    }
    return null;
  }

  if (tool.kind === "bed") {
    const angle = f.joints[jointIndex(spec, "bed")] ?? 0;
    if (f.loadQ > 0 && angle >= (tool.dumpAngle ?? Infinity)) {
      return { kind: "dump", x: cm(tip.x), z: cm(tip.z) };
    }
    return null;
  }

  // Blade: scrape when it sits at or below grade and the dozer drives forward.
  if (f.speed > PUSH_MIN_SPEED && tip.y < ground + 0.02) {
    const { qx, qy, qz, qw } = pose;
    let fx = 2 * (qx * qz + qw * qy);
    let fz = 1 - 2 * (qx * qx + qy * qy);
    const len = Math.hypot(fx, fz) || 1;
    fx /= len;
    fz /= len;
    const ahead = tool.brushRadius * WINDROW_AHEAD;
    return {
      kind: "push",
      x: cm(tip.x),
      z: cm(tip.z),
      r: cm(tool.brushRadius),
      h: cm(tip.y),
      fx: cm(tip.x + fx * ahead),
      fz: cm(tip.z + fz * ahead),
    };
  }
  return null;
}
