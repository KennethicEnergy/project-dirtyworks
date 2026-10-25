import { applyBrush, createTerrainForMap, MAPS, toQ } from "@dirtyworks/shared";
import { Group, MeshBasicMaterial, PerspectiveCamera } from "three";
import { describe, expect, it } from "vitest";
import { ChunkMeshes } from "@/game/terrain/ChunkMeshes";

function setup() {
  const terrain = createTerrainForMap(MAPS["backyard-sandbox"]); // 3 × 3 chunks
  const parent = new Group();
  const meshes = new ChunkMeshes(terrain, new MeshBasicMaterial(), parent, 60);
  const camera = new PerspectiveCamera();
  camera.position.set(0, 50, 0);
  return { terrain, parent, meshes, camera };
}

/** Height of the full-resolution mesh vertex at global vertex (i, j). */
function meshHeight(parent: Group, i: number, j: number): number {
  const cx = Math.min(2, Math.floor(i / 32));
  const cz = Math.min(2, Math.floor(j / 32));
  const mesh = parent.getObjectByName(`terrain-${cx}-${cz}-1`) as unknown as {
    geometry: { attributes: { position: { array: Float32Array } } };
  };
  const v = (j - cz * 32) * 33 + (i - cx * 32);
  return mesh.geometry.attributes.position.array[v * 3 + 1]!;
}

describe("ChunkMeshes", () => {
  it("builds one full and one half resolution mesh per chunk", () => {
    const { parent } = setup();
    expect(parent.children).toHaveLength(18);
  });

  it("rebuilds at most `budget` dirty chunks per frame and queues the rest", () => {
    const { terrain, meshes, camera, parent } = setup();
    const lastBefore = meshHeight(parent, 88, 88);
    // Five digs in five different chunks.
    for (const [x, z] of [
      [-40, -40],
      [0, -40],
      [40, -40],
      [-40, 0],
      [40, 40],
    ]) {
      applyBrush(terrain, { x: x!, z: z!, radius: 2, falloff: 0.5, mode: "dig", depthQ: toQ(0.5) });
    }
    meshes.collect(true);
    expect(meshes.update(camera, 1, 2)).toBe(2);
    expect(meshes.stats.queue).toBe(3);
    // The last chunk in line (dig at 40, 40) must still show its old surface.
    expect(meshHeight(parent, 88, 88)).toBe(lastBefore);
    expect(meshes.update(camera, 1, 2)).toBe(2);
    expect(meshHeight(parent, 88, 88)).toBe(lastBefore);
    expect(meshes.update(camera, 1, 2)).toBe(1);
    expect(meshHeight(parent, 88, 88)).toBeCloseTo(terrain.getQ(88, 88) / 1024);
    expect(meshHeight(parent, 88, 88)).toBeLessThan(lastBefore);
    expect(meshes.stats.queue).toBe(0);
  });

  it("writes the new heights into the mesh in place", () => {
    const { terrain, meshes, camera, parent } = setup();
    const before = meshHeight(parent, 48, 48);
    applyBrush(terrain, { x: 0, z: 0, radius: 1.5, falloff: 0, mode: "dig", depthQ: toQ(0.6) });
    meshes.collect(true);
    meshes.update(camera, 1);
    expect(meshHeight(parent, 48, 48)).toBeCloseTo(terrain.getQ(48, 48) / 1024);
    expect(meshHeight(parent, 48, 48)).toBeLessThan(before);
  });

  it("shows the half resolution mesh beyond the LOD distance", () => {
    const { meshes, camera, parent } = setup();
    camera.position.set(-40, 50, -40);
    meshes.update(camera, 0);
    expect(parent.getObjectByName("terrain-0-0-1")!.visible).toBe(true);
    expect(parent.getObjectByName("terrain-2-2-1")!.visible).toBe(false);
    expect(parent.getObjectByName("terrain-2-2-2")!.visible).toBe(true);
  });
});
