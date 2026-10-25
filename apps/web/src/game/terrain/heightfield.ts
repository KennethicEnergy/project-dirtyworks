/**
 * Converts a terrain chunk into Rapier heightfield parameters. Rapier wants an
 * (nrows+1)×(ncols+1) matrix in column-major order with rows along local Z and columns along
 * local X; our chunk arrays are row-major by Z then X, so the data is transposed here.
 */
import { CHUNK_CELLS, CHUNK_VERTS, type Terrain, type TerrainChunk } from "@dirtyworks/shared";

export interface ChunkHeightfield {
  nrows: number;
  ncols: number;
  heights: Float32Array;
  scale: { x: number; y: number; z: number };
  /** World position of the heightfield's center (y = 0). */
  center: { x: number; z: number };
}

export function chunkHeightfield(
  terrain: Terrain,
  chunk: TerrainChunk,
  out: Float32Array = new Float32Array(CHUNK_VERTS * CHUNK_VERTS),
): ChunkHeightfield {
  const src = chunk.heights;
  for (let iz = 0; iz < CHUNK_VERTS; iz++) {
    for (let ix = 0; ix < CHUNK_VERTS; ix++) {
      out[ix * CHUNK_VERTS + iz] = src[iz * CHUNK_VERTS + ix]!;
    }
  }
  return {
    nrows: CHUNK_CELLS,
    ncols: CHUNK_CELLS,
    heights: out,
    scale: { x: CHUNK_CELLS, y: 1, z: CHUNK_CELLS },
    center: {
      x: chunk.cx * CHUNK_CELLS + CHUNK_CELLS / 2 - terrain.cellsX / 2,
      z: chunk.cz * CHUNK_CELLS + CHUNK_CELLS / 2 - terrain.cellsZ / 2,
    },
  };
}
