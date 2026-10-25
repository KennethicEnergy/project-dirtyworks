"use client";

import { useThree } from "@react-three/fiber";
import { useRapier } from "@react-three/rapier";
import { useEffect } from "react";
import { QUALITY, useSettings } from "@/state/settingsStore";
import { useRuntime } from "../runtime";
import { ChunkColliders } from "./ChunkColliders";
import { ChunkMeshes } from "./ChunkMeshes";
import { createTerrainMaterial } from "./terrainMaterial";

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
    rt.terrainView = { meshes, colliders };

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
