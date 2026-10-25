import RAPIER from "@dimforge/rapier3d-compat";
import { applyBrush, createTerrainForMap, MAPS, toQ } from "@dirtyworks/shared";
import { beforeAll, describe, expect, it } from "vitest";
import { chunkHeightfield } from "@/game/terrain/heightfield";

beforeAll(async () => {
  await RAPIER.init();
});

/** Casts straight down from high above (x, z) and returns the hit height. */
function groundAt(world: RAPIER.World, x: number, z: number): number | null {
  const ray = new RAPIER.Ray({ x, y: 100, z }, { x: 0, y: -1, z: 0 });
  const hit = world.castRay(ray, 200, true);
  return hit ? 100 - hit.timeOfImpact : null;
}

describe("chunk heightfield colliders", () => {
  it("match the terrain everywhere, including slopes that are not symmetric in x and z", () => {
    const map = MAPS["backyard-sandbox"];
    const terrain = createTerrainForMap(map);
    // An asymmetric dent and a pile, so a transposed layout cannot pass by accident.
    applyBrush(terrain, { x: -30, z: 10, radius: 4, falloff: 0.8, mode: "dig", depthQ: toQ(1.2) });
    applyBrush(terrain, { x: 20, z: -25, radius: 3, falloff: 0.5, mode: "fill", volumeQ: 60_000 });

    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    for (const chunk of terrain.chunks) {
      const hf = chunkHeightfield(terrain, chunk);
      world.createCollider(
        RAPIER.ColliderDesc.heightfield(hf.nrows, hf.ncols, hf.heights, hf.scale).setTranslation(
          hf.center.x,
          0,
          hf.center.z,
        ),
      );
    }
    world.step();

    const samples: [number, number][] = [
      [-30, 10],
      [-28.5, 11.7],
      [-33.2, 8.1],
      [20, -25],
      [21.3, -23.6],
      [0, 0],
      [-47.5, 47.5],
      [47.2, -47.9],
      [16.4, 15.9],
      [-15.9, -16.1],
    ];
    for (const [x, z] of samples) {
      const hit = groundAt(world, x, z);
      expect(hit, `no ground at ${x},${z}`).not.toBeNull();
      expect(hit!).toBeCloseTo(terrain.heightAt(x, z), 1);
    }
    world.free();
  });
});
