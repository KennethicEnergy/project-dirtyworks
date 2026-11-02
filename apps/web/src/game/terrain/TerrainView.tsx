"use client";

import { VEHICLE_IDS, VEHICLES, yawOf, type Pose, type VehicleId } from "@dirtyworks/shared";
import { useThree } from "@react-three/fiber";
import { useRapier } from "@react-three/rapier";
import { useEffect } from "react";
import { QUALITY, useSettings } from "@/state/settingsStore";
import { useRuntime } from "../runtime";
import type { RemoteView } from "../vehicles/RemoteVehicles";
import { ChunkColliders } from "./ChunkColliders";
import { ChunkMeshes } from "./ChunkMeshes";
import { createTerrainMaterial } from "./terrainMaterial";
import { TrackWear } from "./TrackWear";

/** Distance a vehicle rolls between track stamps (m), and the wear each stamp adds. */
const STAMP_EVERY = 0.4;
const WEAR_PER_STAMP = 0.22;
/** Farther than this between stamps is a respawn or a correction, not a track (m). */
const STAMP_JUMP = 6;

/** Half the distance between the left and right wheels or tracks, per vehicle. */
const HALF_GAUGE = Object.fromEntries(
  VEHICLE_IDS.map((id) => {
    const s = VEHICLES[id];
    const half = s.tracks
      ? s.tracks.gauge / 2
      : Math.max(...(s.wheels ?? []).map((w) => Math.abs(w.x)));
    return [id, half];
  }),
) as Record<VehicleId, number>;

/** Where a vehicle is and which way it faces (local pose or interpolated remote). */
type Placed = Pick<Pose, "x" | "y" | "z" | "qx" | "qy" | "qz" | "qw">;

/** Mounts the terrain's chunk meshes and heightfield colliders and registers their systems. */
export function TerrainView() {
  const rt = useRuntime();
  const { world, rapier } = useRapier();
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const quality = useSettings((s) => s.quality);

  useEffect(() => {
    const mat = createTerrainMaterial(rt.material, rt.map.baseTerrain.groundHeight);
    const meshes = new ChunkMeshes(
      rt.terrain,
      mat.material,
      scene,
      QUALITY[useSettings.getState().quality].lodDistance,
    );
    const colliders = new ChunkColliders(world, rapier, rt.terrain);
    const wear = new TrackWear(meshes.wear, rt.terrain.vertsX, rt.terrain.vertsZ);
    rt.terrainView = { meshes, colliders, wear };

    // Track marks: each grounded vehicle stamps under its left and right wheels or tracks.
    const lastStamp = new Map<string, { x: number; z: number }>();
    const roll = (id: string, vehicle: VehicleId, p: Placed) => {
      const last = lastStamp.get(id);
      if (!last) return void lastStamp.set(id, { x: p.x, z: p.z });
      const moved = Math.hypot(p.x - last.x, p.z - last.z);
      if (moved < STAMP_EVERY) return;
      last.x = p.x;
      last.z = p.z;
      if (moved > STAMP_JUMP) return;
      if (p.y - rt.groundHeightAt(p.x, p.z) > VEHICLES[vehicle].chassis.size.y + 1.5) return;
      const yaw = yawOf(p.qx, p.qy, p.qz, p.qw);
      const sx = Math.cos(yaw) * HALF_GAUGE[vehicle];
      const sz = -Math.sin(yaw) * HALF_GAUGE[vehicle];
      wear.stamp(p.x + sx, p.z + sz, WEAR_PER_STAMP);
      wear.stamp(p.x - sx, p.z - sz, WEAR_PER_STAMP);
    };
    const rollRemote = (r: RemoteView, id: string) => {
      if (r.visible) roll(id, r.vehicle, r.pose);
    };
    const offWear = rt.loop.register(
      "visuals",
      {
        name: "track-marks",
        update(ctx) {
          if (rt.local) roll("local", rt.local.id, rt.local.pose);
          rt.remotes?.forEach(rollRemote);
          const rect = wear.update(ctx.dt);
          if (rect) meshes.refreshWear(rect);
        },
      },
      -1,
    );

    const offColliders = rt.loop.register("terrain:colliders", {
      name: "terrain-colliders",
      update: () => void colliders.update(performance.now()),
    });
    const offMeshes = rt.loop.register("visuals", {
      name: "terrain-meshes",
      update(ctx) {
        mat.uniforms.uTime.value = ctx.time;
        meshes.collect(!rt.suppressFresh);
        rt.suppressFresh = false;
        meshes.update(camera, ctx.time);
      },
    });

    return () => {
      offColliders();
      offWear();
      offMeshes();
      meshes.dispose();
      colliders.dispose();
      mat.dispose();
      rt.terrainView = null;
    };
  }, [rt, world, rapier, scene, camera]);

  useEffect(() => {
    if (rt.terrainView) rt.terrainView.meshes.lodDistance = QUALITY[quality].lodDistance;
  }, [rt, quality]);

  return null;
}
