/**
 * Other players' vehicles: rendered from interpolated server snapshots, never simulated.
 * Each nearby one also gets a kinematic collider so local vehicles bump into it.
 */
import type { Collider, RigidBody, World } from "@dimforge/rapier3d-compat";
import {
  DEFAULT_LIVERY,
  liverySchema,
  VEHICLES,
  type Livery,
  type VehicleId,
} from "@dirtyworks/shared";
import type { Scene } from "three";
import { InterpBuffer, type InterpPose } from "@/net/InterpBuffer";
import { isSameWorld, worldToken, type WorldToken } from "../physics/worldToken";
import type { Rapier } from "../runtime";
import { createVehicleModel } from "./models";
import type { VehicleModel } from "./models/VehicleModel";

/** Remote vehicles beyond this distance (m) get no collider. */
const COLLIDER_RANGE = 60;
/** A jump larger than this between samples is a respawn: don't interpolate across it. */
const TELEPORT_DISTANCE = 15;

/** The fields of a synced player that remote rendering reads (Colyseus schema instance). */
export interface RemotePlayerState {
  sessionId: string;
  role: string;
  vehicle: string;
  connected: boolean;
  color: string;
  decal: string;
  number: number;
  x: number;
  y: number;
  z: number;
  qx: number;
  qy: number;
  qz: number;
  qw: number;
  vx: number;
  vz: number;
  t: number;
  load: number;
  joints: { length: number; at(i: number): number | undefined };
}

interface Remote {
  sessionId: string;
  vehicle: VehicleId;
  model: VehicleModel;
  buffer: InterpBuffer;
  body: RigidBody;
  collider: Collider;
  lastT: number;
  liveryKey: string;
  seenFrame: number;
  speed: number;
  spin: number;
  pose: InterpPose;
  joints: number[];
  /** Latest sample (for teleport detection). */
  lx: number;
  lz: number;
}

export class RemoteVehicles {
  private readonly remotes = new Map<string, Remote>();
  private readonly token: WorldToken;
  private frame = 0;
  private readonly sampleJoints: number[] = [0, 0, 0, 0];
  private readonly samplePose: InterpPose = { x: 0, y: 0, z: 0, qx: 0, qy: 0, qz: 0, qw: 1 };

  constructor(
    private readonly world: World,
    private readonly rapier: Rapier,
    private readonly scene: Scene,
  ) {
    this.token = worldToken(world);
  }

  get count(): number {
    return this.remotes.size;
  }

  beginFrame(): void {
    this.frame++;
  }

  /** Feed one synced player (not the local one). */
  observe(p: RemotePlayerState): void {
    if (p.role !== "driver" || !p.vehicle || !(p.vehicle in VEHICLES)) {
      this.remove(p.sessionId);
      return;
    }
    let r = this.remotes.get(p.sessionId);
    if (r && r.vehicle !== p.vehicle) {
      this.remove(p.sessionId);
      r = undefined;
    }
    if (!r) r = this.create(p);
    r.seenFrame = this.frame;

    const liveryKey = `${p.color}|${p.decal}|${p.number}`;
    if (liveryKey !== r.liveryKey) {
      r.liveryKey = liveryKey;
      r.model.setLivery(toLivery(p));
    }

    if (p.t !== r.lastT) {
      r.lastT = p.t;
      const jumped = Math.hypot(p.x - r.lx, p.z - r.lz) > TELEPORT_DISTANCE;
      if (jumped) r.buffer.clear();
      r.lx = p.x;
      r.lz = p.z;
      const sp = this.samplePose;
      sp.x = p.x;
      sp.y = p.y;
      sp.z = p.z;
      sp.qx = p.qx;
      sp.qy = p.qy;
      sp.qz = p.qz;
      sp.qw = p.qw;
      const sj = this.sampleJoints;
      for (let i = 0; i < 4; i++) sj[i] = p.joints.at(i) ?? 0;
      r.buffer.push(p.t, sp, sj);
      r.speed = Math.hypot(p.vx, p.vz);
      const capacity = VEHICLES[r.vehicle].tool.capacityM3;
      r.model.setLoad(capacity > 0 ? p.load / 1024 / capacity : 0);
    }
  }

  /** Drops vehicles whose players vanished this frame. */
  endFrame(): void {
    for (const [id, r] of this.remotes) if (r.seenFrame !== this.frame) this.remove(id);
  }

  /** Places every remote at `renderTime` (server ms) and updates culling and colliders. */
  update(renderTime: number, dt: number, viewX: number, viewZ: number, drawDistance: number): void {
    for (const r of this.remotes.values()) {
      if (!r.buffer.sample(renderTime, r.pose, r.joints)) continue;
      const p = r.pose;
      const dist = Math.hypot(p.x - viewX, p.z - viewZ);
      r.model.root.visible = dist <= drawDistance;
      r.model.root.position.set(p.x, p.y, p.z);
      r.model.root.quaternion.set(p.qx, p.qy, p.qz, p.qw);
      r.model.setJoints(r.joints);
      r.spin += (r.speed / 0.75) * dt;
      const wheels = VEHICLES[r.vehicle].wheels;
      if (wheels) {
        for (let i = 0; i < wheels.length; i++)
          r.model.setWheel(i, 0, r.spin, VEHICLES[r.vehicle].suspension.restLength);
      } else {
        r.model.setTracks(r.speed, r.speed, dt);
      }
      const near = dist <= COLLIDER_RANGE;
      if (r.collider.isEnabled() !== near) r.collider.setEnabled(near);
      r.body.setNextKinematicTranslation({ x: p.x, y: p.y, z: p.z });
      r.body.setNextKinematicRotation({ x: p.qx, y: p.qy, z: p.qz, w: p.qw });
    }
  }

  dispose(): void {
    for (const id of [...this.remotes.keys()]) this.remove(id);
  }

  private create(p: RemotePlayerState): Remote {
    const vehicle = p.vehicle as VehicleId;
    const spec = VEHICLES[vehicle];
    const model = createVehicleModel(vehicle, toLivery(p));
    this.scene.add(model.root);
    const body = this.world.createRigidBody(
      this.rapier.RigidBodyDesc.kinematicPositionBased()
        .setTranslation(p.x, p.y, p.z)
        .setRotation({ x: p.qx, y: p.qy, z: p.qz, w: p.qw }),
    );
    const s = spec.chassis.size;
    const clearance =
      spec.drive === "wheeled" ? Math.min(...spec.wheels!.map((w) => w.y)) - 0.15 : 0.02;
    const collider = this.world.createCollider(
      this.rapier.ColliderDesc.cuboid(s.x / 2, s.y / 2, s.z / 2).setTranslation(
        0,
        clearance + s.y / 2,
        0,
      ),
      body,
    );
    const r: Remote = {
      sessionId: p.sessionId,
      vehicle,
      model,
      buffer: new InterpBuffer(),
      body,
      collider,
      lastT: -1,
      liveryKey: "",
      seenFrame: this.frame,
      speed: 0,
      spin: 0,
      pose: { x: p.x, y: p.y, z: p.z, qx: p.qx, qy: p.qy, qz: p.qz, qw: p.qw },
      joints: [0, 0, 0, 0],
      lx: p.x,
      lz: p.z,
    };
    this.remotes.set(p.sessionId, r);
    return r;
  }

  private remove(id: string): void {
    const r = this.remotes.get(id);
    if (!r) return;
    this.remotes.delete(id);
    r.model.dispose();
    if (isSameWorld(this.world, this.token)) this.world.removeRigidBody(r.body);
  }
}

function toLivery(p: RemotePlayerState): Livery {
  const parsed = liverySchema.safeParse({ color: p.color, decal: p.decal, number: p.number });
  return parsed.success ? parsed.data : DEFAULT_LIVERY;
}
