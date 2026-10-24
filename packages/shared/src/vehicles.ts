/**
 * Vehicle definitions as data. Everything a client needs to build, drive and animate a vehicle,
 * and everything the server needs to validate it, lives here.
 *
 * Conventions: vehicle-local origin sits on the ground under the chassis center, forward is +Z,
 * up is +Y, and positive yaw turns left (toward +X). Pitch joints raise toward +Y when positive.
 */
import { z } from "zod";
import { rotateByQuat, vec3, type Pose, type Vec3 } from "./math";

export const VEHICLE_IDS = ["excavator", "dump-truck", "bulldozer", "wheel-loader"] as const;
export type VehicleId = (typeof VEHICLE_IDS)[number];

/** Index of the shared tool control axis a joint listens to (see the web app's controls map). */
export type ToolAxis = 0 | 1 | 2 | 3;

export type JointMotion = "yaw" | "pitch" | "roll" | "slide";

export interface JointSpec {
  id: string;
  label: string;
  /** Node name a GLB model must expose for this joint (e.g. `boom`). */
  node: string;
  motion: JointMotion;
  /** Radians for rotations, metres for slides. */
  min: number;
  max: number;
  /** Units per second at full input. */
  speed: number;
  rest: number;
  input: ToolAxis;
  /** Multiplies the control axis so keys read naturally (e.g. E swings right). */
  inputSign: 1 | -1;
  /** On-screen hints for the [negative key, positive key] of the axis. */
  hints: [string, string];
}

export interface WheelSpec {
  /** Suspension attachment point in vehicle-local space. */
  x: number;
  y: number;
  z: number;
  radius: number;
  /** Multiplier on the steering angle: 1 front steer, -1 counter-steer (articulation), 0 fixed. */
  steer: 1 | 0 | -1;
  drive: boolean;
}

export interface ToolRig {
  /** Pivot of the first link (or the tool point when there is no chain), vehicle-local. */
  base: Vec3;
  /** Joint that yaws the whole rig around the vehicle's vertical axis. */
  swing?: string;
  /** Slide joint that raises the base. */
  lift?: string;
  /** Planar links in the forward/up plane; each link's angle adds to the previous ones. */
  chain: { joint?: string; length: number; offset: number }[];
}

export interface ToolSpec {
  kind: "bucket" | "bed" | "blade";
  /** Carried volume in m³ (0 for a blade). */
  capacityM3: number;
  /** Max horizontal distance from the vehicle origin to a terrain op. */
  reach: number;
  /** Brush radius in metres for this tool's terrain ops. */
  brushRadius: number;
  /** Deepest single dig/scrape op in metres. */
  maxDigDepth: number;
  /** Bucket joint and the direction (+1/-1) of its value when the bucket closes. */
  curl?: { joint: string; closeDir: 1 | -1 };
  /** Bed angle (radians) above which material starts sliding out. */
  dumpAngle?: number;
  /** Bed volume in vehicle-local space; bucket releases inside it fill the bed. */
  bedBox?: { center: Vec3; size: Vec3 };
  blade?: { width: number; maxDepth: number };
}

export interface VehicleSpec {
  id: VehicleId;
  displayName: string;
  blurb: string;
  capability: string;
  drive: "wheeled" | "tracked";
  articulated: boolean;
  mass: number;
  chassis: { size: Vec3; comOffset: Vec3 };
  wheels?: WheelSpec[];
  tracks?: { width: number; length: number; gauge: number };
  /** m/s */
  maxSpeed: number;
  /** m/s² */
  maxAccel: number;
  steer: { maxAngle?: number; turnRate?: number };
  suspension: { stiffness: number; damping: number; restLength: number; travel: number };
  joints: JointSpec[];
  rig: ToolRig;
  tool: ToolSpec;
  /** Antenna mount point, vehicle-local. */
  antenna: Vec3;
}

const DEG = Math.PI / 180;

export const VEHICLES: Record<VehicleId, VehicleSpec> = {
  excavator: {
    id: "excavator",
    displayName: "Excavator",
    blurb: "Swings, digs and never skips leg day.",
    capability: "Digs and loads trucks",
    drive: "tracked",
    articulated: false,
    mass: 16000,
    chassis: { size: vec3(3, 1.1, 4.6), comOffset: vec3(0, -0.3, 0) },
    tracks: { width: 0.6, length: 4.4, gauge: 2.4 },
    maxSpeed: 3.5,
    maxAccel: 2.5,
    steer: { turnRate: 0.9 },
    suspension: { stiffness: 30, damping: 4, restLength: 0, travel: 0.1 },
    joints: [
      {
        id: "swing",
        label: "Cab swing",
        node: "cab",
        motion: "yaw",
        min: -Math.PI,
        max: Math.PI,
        speed: 0.9,
        rest: 0,
        input: 0,
        inputSign: -1,
        hints: ["Swing left", "Swing right"],
      },
      {
        id: "boom",
        label: "Boom",
        node: "boom",
        motion: "pitch",
        min: -0.5,
        max: 1.1,
        speed: 0.6,
        rest: 0.3,
        input: 1,
        inputSign: 1,
        hints: ["Boom down", "Boom up"],
      },
      {
        id: "stick",
        label: "Stick",
        node: "stick",
        motion: "pitch",
        min: -2.6,
        max: -0.4,
        speed: 0.7,
        rest: -1.3,
        input: 2,
        inputSign: 1,
        hints: ["Stick in", "Stick out"],
      },
      {
        id: "bucket",
        label: "Bucket",
        node: "bucket",
        motion: "pitch",
        min: -2,
        max: 1,
        speed: 1.2,
        rest: 0.5,
        input: 3,
        inputSign: 1,
        hints: ["Curl bucket", "Open bucket"],
      },
    ],
    rig: {
      base: vec3(0, 1.9, 0.6),
      swing: "swing",
      chain: [
        { joint: "boom", length: 5, offset: 0 },
        { joint: "stick", length: 2.8, offset: 0 },
        { joint: "bucket", length: 1.2, offset: 0 },
      ],
    },
    tool: {
      kind: "bucket",
      capacityM3: 1.2,
      reach: 9.5,
      brushRadius: 1,
      maxDigDepth: 0.3,
      curl: { joint: "bucket", closeDir: -1 },
    },
    antenna: vec3(-1, 3.2, -1.2),
  },
  "dump-truck": {
    id: "dump-truck",
    displayName: "Dump truck",
    blurb: "Hauls dirt across the table, beeps when it backs up (in spirit).",
    capability: "Hauls 12 m³ and dumps piles",
    drive: "wheeled",
    articulated: false,
    mass: 12000,
    chassis: { size: vec3(2.8, 1.3, 7.2), comOffset: vec3(0, -0.4, 0.3) },
    wheels: [
      { x: 1.25, y: 1.1, z: 2.4, radius: 0.75, steer: 1, drive: false },
      { x: -1.25, y: 1.1, z: 2.4, radius: 0.75, steer: 1, drive: false },
      { x: 1.25, y: 1.1, z: -1.4, radius: 0.75, steer: 0, drive: true },
      { x: -1.25, y: 1.1, z: -1.4, radius: 0.75, steer: 0, drive: true },
      { x: 1.25, y: 1.1, z: -2.7, radius: 0.75, steer: 0, drive: true },
      { x: -1.25, y: 1.1, z: -2.7, radius: 0.75, steer: 0, drive: true },
    ],
    maxSpeed: 11,
    maxAccel: 4,
    steer: { maxAngle: 0.55 },
    suspension: { stiffness: 18, damping: 2.2, restLength: 0.35, travel: 0.35 },
    joints: [
      {
        id: "bed",
        label: "Dump bed",
        node: "bed",
        motion: "pitch",
        min: 0,
        max: 0.95,
        speed: 0.35,
        rest: 0,
        input: 1,
        inputSign: 1,
        hints: ["Lower bed", "Raise bed"],
      },
    ],
    rig: { base: vec3(0, 1, -4), chain: [] },
    tool: {
      kind: "bed",
      capacityM3: 12,
      reach: 6,
      brushRadius: 1.6,
      maxDigDepth: 0,
      dumpAngle: 40 * DEG,
      bedBox: { center: vec3(0, 2.3, -1.3), size: vec3(2.6, 1.6, 4.4) },
    },
    antenna: vec3(1.1, 3.6, 2.6),
  },
  bulldozer: {
    id: "bulldozer",
    displayName: "Bulldozer",
    blurb: "Pushes piles around. Has opinions about flat ground.",
    capability: "Pushes and levels material",
    drive: "tracked",
    articulated: false,
    mass: 15000,
    chassis: { size: vec3(3, 1.4, 4.2), comOffset: vec3(0, -0.4, 0) },
    tracks: { width: 0.6, length: 3.8, gauge: 2.4 },
    maxSpeed: 4,
    maxAccel: 2.5,
    steer: { turnRate: 0.8 },
    suspension: { stiffness: 30, damping: 4, restLength: 0, travel: 0.1 },
    joints: [
      {
        id: "blade",
        label: "Blade height",
        node: "blade",
        motion: "slide",
        min: -0.4,
        max: 1,
        speed: 0.5,
        rest: 0.25,
        input: 1,
        inputSign: 1,
        hints: ["Lower blade", "Raise blade"],
      },
      {
        id: "bladeTilt",
        label: "Blade tilt",
        node: "bladeTilt",
        motion: "roll",
        min: -0.25,
        max: 0.25,
        speed: 0.4,
        rest: 0,
        input: 2,
        inputSign: 1,
        hints: ["Tilt left", "Tilt right"],
      },
    ],
    rig: { base: vec3(0, 0, 3), lift: "blade", chain: [] },
    tool: {
      kind: "blade",
      capacityM3: 0,
      reach: 4.5,
      brushRadius: 1.6,
      maxDigDepth: 0.4,
      blade: { width: 3.4, maxDepth: 0.4 },
    },
    antenna: vec3(-1.2, 3, -1.6),
  },
  "wheel-loader": {
    id: "wheel-loader",
    displayName: "Wheel loader",
    blurb: "Bends in the middle on purpose. Scoops like a champ.",
    capability: "Scoops, carries and loads",
    drive: "wheeled",
    articulated: true,
    mass: 11000,
    chassis: { size: vec3(2.6, 1.4, 6.4), comOffset: vec3(0, -0.4, -0.4) },
    wheels: [
      { x: 1.1, y: 1.15, z: 1.7, radius: 0.8, steer: 1, drive: true },
      { x: -1.1, y: 1.15, z: 1.7, radius: 0.8, steer: 1, drive: true },
      { x: 1.1, y: 1.15, z: -1.7, radius: 0.8, steer: -1, drive: true },
      { x: -1.1, y: 1.15, z: -1.7, radius: 0.8, steer: -1, drive: true },
    ],
    maxSpeed: 8,
    maxAccel: 3.5,
    steer: { maxAngle: 0.4 },
    suspension: { stiffness: 20, damping: 2.4, restLength: 0.35, travel: 0.3 },
    joints: [
      {
        id: "arm",
        label: "Lift arm",
        node: "arm",
        motion: "pitch",
        min: -0.45,
        max: 1.15,
        speed: 0.5,
        rest: -0.4,
        input: 1,
        inputSign: 1,
        hints: ["Lower arm", "Raise arm"],
      },
      {
        id: "tilt",
        label: "Bucket tilt",
        node: "tilt",
        motion: "pitch",
        min: -0.9,
        max: 0.9,
        speed: 0.8,
        rest: 0,
        input: 2,
        inputSign: 1,
        hints: ["Dump bucket", "Tilt back"],
      },
    ],
    rig: {
      base: vec3(0, 1.9, 1.6),
      chain: [
        { joint: "arm", length: 3, offset: 0 },
        { joint: "tilt", length: 1.1, offset: -0.2 },
      ],
    },
    tool: {
      kind: "bucket",
      capacityM3: 2.5,
      reach: 6,
      brushRadius: 1.2,
      maxDigDepth: 0.3,
      curl: { joint: "tilt", closeDir: 1 },
    },
    antenna: vec3(0.9, 3.3, -2.4),
  },
};

export const vehicleIdSchema = z.enum(VEHICLE_IDS);

const num = z.number();
const vec3Schema = z.object({ x: num, y: num, z: num });

export const vehicleSpecSchema = z.object({
  id: vehicleIdSchema,
  displayName: z.string().min(1),
  blurb: z.string(),
  capability: z.string(),
  drive: z.enum(["wheeled", "tracked"]),
  articulated: z.boolean(),
  mass: num.positive(),
  chassis: z.object({ size: vec3Schema, comOffset: vec3Schema }),
  wheels: z
    .array(
      z.object({
        x: num,
        y: num,
        z: num,
        radius: num.positive(),
        steer: z.union([z.literal(1), z.literal(0), z.literal(-1)]),
        drive: z.boolean(),
      }),
    )
    .optional(),
  tracks: z
    .object({ width: num.positive(), length: num.positive(), gauge: num.positive() })
    .optional(),
  maxSpeed: num.positive(),
  maxAccel: num.positive(),
  steer: z.object({ maxAngle: num.positive().optional(), turnRate: num.positive().optional() }),
  suspension: z.object({
    stiffness: num.positive(),
    damping: num.nonnegative(),
    restLength: num.nonnegative(),
    travel: num.nonnegative(),
  }),
  joints: z
    .array(
      z.object({
        id: z.string().min(1),
        label: z.string().min(1),
        node: z.string().min(1),
        motion: z.enum(["yaw", "pitch", "roll", "slide"]),
        min: num,
        max: num,
        speed: num.positive(),
        rest: num,
        input: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
        inputSign: z.union([z.literal(1), z.literal(-1)]),
        hints: z.tuple([z.string(), z.string()]),
      }),
    )
    .min(1)
    .max(4),
  rig: z.object({
    base: vec3Schema,
    swing: z.string().optional(),
    lift: z.string().optional(),
    chain: z.array(z.object({ joint: z.string().optional(), length: num.positive(), offset: num })),
  }),
  tool: z.object({
    kind: z.enum(["bucket", "bed", "blade"]),
    capacityM3: num.nonnegative(),
    reach: num.positive(),
    brushRadius: num.positive(),
    maxDigDepth: num.nonnegative(),
    curl: z
      .object({ joint: z.string(), closeDir: z.union([z.literal(1), z.literal(-1)]) })
      .optional(),
    dumpAngle: num.positive().optional(),
    bedBox: z.object({ center: vec3Schema, size: vec3Schema }).optional(),
    blade: z.object({ width: num.positive(), maxDepth: num.positive() }).optional(),
  }),
  antenna: vec3Schema,
});

export type VehicleSpecResult = { ok: true; spec: VehicleSpec } | { ok: false; errors: string[] };

/** Structural (zod) plus semantic checks: limits, references between rig/tool and joints. */
export function validateVehicleSpec(input: unknown): VehicleSpecResult {
  const parsed = vehicleSpecSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((i) => `${i.path.join(".") || "spec"}: ${i.message}`),
    };
  }
  const spec = parsed.data as VehicleSpec;
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const j of spec.joints) {
    if (ids.has(j.id)) errors.push(`joint ${j.id}: duplicate id`);
    ids.add(j.id);
    if (!(j.min < j.max)) errors.push(`joint ${j.id}: min must be below max`);
    if (j.rest < j.min || j.rest > j.max) errors.push(`joint ${j.id}: rest outside limits`);
  }
  const needJoint = (id: string | undefined, where: string) => {
    if (id !== undefined && !ids.has(id)) errors.push(`${where}: unknown joint ${id}`);
  };
  needJoint(spec.rig.swing, "rig.swing");
  needJoint(spec.rig.lift, "rig.lift");
  spec.rig.chain.forEach((link, i) => needJoint(link.joint, `rig.chain.${i}`));

  if (spec.drive === "wheeled") {
    const wheels = spec.wheels ?? [];
    if (wheels.length < 3) errors.push("wheels: a wheeled vehicle needs at least 3 wheels");
    if (!wheels.some((w) => w.drive)) errors.push("wheels: no driven wheel");
    if (!wheels.some((w) => w.steer !== 0)) errors.push("wheels: no steered wheel");
    if (spec.steer.maxAngle === undefined) errors.push("steer.maxAngle: required when wheeled");
  } else {
    if (!spec.tracks) errors.push("tracks: required when tracked");
    if (spec.steer.turnRate === undefined) errors.push("steer.turnRate: required when tracked");
  }

  const tool = spec.tool;
  if (tool.kind === "bucket") {
    if (!tool.curl) errors.push("tool.curl: required for a bucket");
    else needJoint(tool.curl.joint, "tool.curl");
    if (tool.capacityM3 <= 0) errors.push("tool.capacityM3: a bucket must hold something");
  }
  if (tool.kind === "bed") {
    if (!tool.bedBox) errors.push("tool.bedBox: required for a bed");
    if (tool.dumpAngle === undefined) errors.push("tool.dumpAngle: required for a bed");
    if (tool.capacityM3 <= 0) errors.push("tool.capacityM3: a bed must hold something");
  }
  if (tool.kind === "blade" && !tool.blade) errors.push("tool.blade: required for a blade");

  return errors.length ? { ok: false, errors } : { ok: true, spec };
}

export function restJoints(spec: VehicleSpec): number[] {
  return spec.joints.map((j) => j.rest);
}

/** Clamps joint values into their limits; non-finite or missing values become the rest pose. */
export function clampJoints(spec: VehicleSpec, values: ArrayLike<number>, out: number[]): number[] {
  const joints = spec.joints;
  out.length = joints.length;
  for (let i = 0; i < joints.length; i++) {
    const j = joints[i]!;
    const v = i < values.length ? values[i]! : Number.NaN;
    out[i] = Number.isFinite(v) ? (v < j.min ? j.min : v > j.max ? j.max : v) : j.rest;
  }
  return out;
}

export function jointIndex(spec: VehicleSpec, id: string): number {
  const joints = spec.joints;
  for (let i = 0; i < joints.length; i++) if (joints[i]!.id === id) return i;
  return -1;
}

function jointValue(spec: VehicleSpec, joints: ArrayLike<number>, id: string | undefined): number {
  if (id === undefined) return 0;
  const i = jointIndex(spec, id);
  return i >= 0 && i < joints.length ? joints[i]! : 0;
}

/** Tool tip (bucket lip, blade edge, dump point) in vehicle-local space. */
export function toolTipLocal(spec: VehicleSpec, joints: ArrayLike<number>, out: Vec3): Vec3 {
  const rig = spec.rig;
  let forward = rig.base.z;
  let up = rig.base.y + jointValue(spec, joints, rig.lift);
  let angle = 0;
  for (const link of rig.chain) {
    angle += jointValue(spec, joints, link.joint) + link.offset;
    forward += link.length * Math.cos(angle);
    up += link.length * Math.sin(angle);
  }
  const side = rig.base.x;
  const swing = jointValue(spec, joints, rig.swing);
  const c = Math.cos(swing);
  const s = Math.sin(swing);
  out.x = side * c + forward * s;
  out.y = up;
  out.z = -side * s + forward * c;
  return out;
}

/** Tool tip in world space for a vehicle at `pose`. */
export function toolTipWorld(
  spec: VehicleSpec,
  pose: Pose,
  joints: ArrayLike<number>,
  out: Vec3,
): Vec3 {
  toolTipLocal(spec, joints, out);
  rotateByQuat(out, pose.qx, pose.qy, pose.qz, pose.qw, out);
  out.x += pose.x;
  out.y += pose.y;
  out.z += pose.z;
  return out;
}
