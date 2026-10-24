/**
 * Server-side plausibility checks for terrain intents. Pure: everything the check needs is passed
 * in, so it can be unit tested without a room.
 */
import {
  jointIndex,
  m3ToQuanta,
  type Pose,
  type TerrainIntent,
  type TokenBucket,
  type VehicleSpec,
} from "@dirtyworks/shared";

export type IntentRejection =
  "rate" | "no-vehicle" | "tool" | "reach" | "radius" | "depth" | "volume" | "angle" | "blade";

export type IntentCheck = { ok: true } | { ok: false; reason: IntentRejection };

export interface IntentContext {
  spec: VehicleSpec | null;
  /** Last validated pose of the player's vehicle. */
  pose: Pose | null;
  joints: ArrayLike<number>;
  /** Material the player's bucket/bed currently holds (quanta). */
  loadQ: number;
  /** The player's terrain-op rate limiter (10/s). */
  bucket: Pick<TokenBucket, "take">;
}

/** Network lag lets the tool lead the last validated pose a little. */
export const REACH_SLACK = 1;
const RADIUS_SLACK = 1.25;
/** Soft materials dig a little deeper per bite. */
const DEPTH_SLACK = 1.2;
const BLADE_SLACK = 0.3;
const BLADE_MAX_ABOVE = 2.5;

const ok: IntentCheck = { ok: true };
const no = (reason: IntentRejection): IntentCheck => ({ ok: false, reason });

export function validateIntent(intent: TerrainIntent, ctx: IntentContext): IntentCheck {
  if (!ctx.bucket.take()) return no("rate");
  const { spec, pose } = ctx;
  if (!spec || !pose) return no("no-vehicle");
  const tool = spec.tool;
  const x = intent.x / 100;
  const z = intent.z / 100;
  if (Math.hypot(x - pose.x, z - pose.z) > tool.reach + REACH_SLACK) return no("reach");

  switch (intent.kind) {
    case "dig": {
      if (tool.kind !== "bucket") return no("tool");
      if (intent.r / 100 > tool.brushRadius * RADIUS_SLACK) return no("radius");
      if (intent.d / 100 > tool.maxDigDepth * DEPTH_SLACK) return no("depth");
      if (ctx.loadQ >= m3ToQuanta(tool.capacityM3)) return no("volume");
      return ok;
    }
    case "release": {
      if (tool.kind !== "bucket") return no("tool");
      if (ctx.loadQ <= 0) return no("volume");
      return ok;
    }
    case "dump": {
      if (tool.kind !== "bed") return no("tool");
      if (ctx.loadQ <= 0) return no("volume");
      const bed = jointIndex(spec, "bed");
      const angle = bed >= 0 ? (ctx.joints[bed] ?? 0) : 0;
      if (angle < (tool.dumpAngle ?? Infinity)) return no("angle");
      return ok;
    }
    case "push": {
      if (tool.kind !== "blade") return no("tool");
      const radius = intent.r / 100;
      if (radius > tool.brushRadius * RADIUS_SLACK) return no("radius");
      const h = intent.h / 100;
      const maxDepth = tool.blade?.maxDepth ?? tool.maxDigDepth;
      if (h < pose.y - maxDepth - BLADE_SLACK || h > pose.y + BLADE_MAX_ABOVE) return no("blade");
      const windrow = Math.hypot(intent.fx / 100 - x, intent.fz / 100 - z);
      if (windrow > 2 * radius + 1) return no("reach");
      return ok;
    }
  }
}
