/**
 * One mesh per terrain chunk, full resolution near the camera and half resolution beyond the LOD
 * distance. Dirty chunks queue up and at most `budget` are rebuilt per frame; only the dirty
 * rectangle's vertices and normals are rewritten and uploaded.
 */
import {
  CHUNK_CELLS,
  CHUNK_VERTS,
  HEIGHT_Q_PER_M,
  type Terrain,
  type TerrainChunk,
  type VertexRect,
} from "@dirtyworks/shared";
import {
  BufferAttribute,
  BufferGeometry,
  Mesh,
  type Camera,
  type Material,
  type Object3D,
} from "three";

const HALF_VERTS = CHUNK_CELLS / 2 + 1;
/** Fresh-dig timestamp for untouched ground: long ago. */
const NEVER = -1e6;

interface Lod {
  mesh: Mesh;
  geometry: BufferGeometry;
  position: BufferAttribute;
  normal: BufferAttribute;
  fresh: BufferAttribute;
  wear: BufferAttribute;
  /** Vertices per side (33 or 17) and grid step in terrain vertices (1 or 2). */
  side: number;
  step: number;
}

interface Entry {
  chunk: TerrainChunk;
  full: Lod;
  half: Lod;
  centerX: number;
  centerZ: number;
  /** Pending rect for each LOD (null = up to date). */
  pendingFull: VertexRect | null;
  pendingHalf: VertexRect | null;
  queued: boolean;
  markFresh: boolean;
}

export interface MeshStats {
  rebuilds: number;
  queue: number;
}

function union(a: VertexRect | null, b: VertexRect): VertexRect {
  if (!a) return { ...b };
  return {
    i0: Math.min(a.i0, b.i0),
    j0: Math.min(a.j0, b.j0),
    i1: Math.max(a.i1, b.i1),
    j1: Math.max(a.j1, b.j1),
  };
}

export class ChunkMeshes {
  private readonly entries: Entry[] = [];
  private readonly queue: Entry[] = [];
  readonly stats: MeshStats = { rebuilds: 0, queue: 0 };
  /** Wear per global vertex (0..1), written by the track-mark system. */
  readonly wear: Float32Array;

  constructor(
    private readonly terrain: Terrain,
    material: Material,
    private readonly parent: Object3D,
    public lodDistance: number,
  ) {
    this.wear = new Float32Array(terrain.vertsX * terrain.vertsZ);
    for (const chunk of terrain.chunks) {
      const full = this.makeLod(chunk, CHUNK_VERTS, 1, material);
      const half = this.makeLod(chunk, HALF_VERTS, 2, material);
      half.mesh.visible = false;
      parent.add(full.mesh, half.mesh);
      this.entries.push({
        chunk,
        full,
        half,
        centerX: chunk.cx * CHUNK_CELLS + CHUNK_CELLS / 2 - terrain.cellsX / 2,
        centerZ: chunk.cz * CHUNK_CELLS + CHUNK_CELLS / 2 - terrain.cellsZ / 2,
        pendingFull: null,
        pendingHalf: null,
        queued: false,
        markFresh: false,
      });
      terrain.clearDirty(chunk);
    }
  }

  private makeLod(chunk: TerrainChunk, side: number, step: number, material: Material): Lod {
    const n = side * side;
    const geometry = new BufferGeometry();
    const position = new BufferAttribute(new Float32Array(n * 3), 3);
    const normal = new BufferAttribute(new Float32Array(n * 3), 3);
    const fresh = new BufferAttribute(new Float32Array(n).fill(NEVER), 1);
    const wear = new BufferAttribute(new Float32Array(n), 1);
    const cells = side - 1;
    const index = new Uint16Array(cells * cells * 6);
    let k = 0;
    for (let z = 0; z < cells; z++) {
      for (let x = 0; x < cells; x++) {
        const a = z * side + x;
        const b = a + 1;
        const c = a + side;
        const d = c + 1;
        index[k++] = a;
        index[k++] = c;
        index[k++] = b;
        index[k++] = b;
        index[k++] = c;
        index[k++] = d;
      }
    }
    geometry.setIndex(new BufferAttribute(index, 1));
    geometry.setAttribute("position", position);
    geometry.setAttribute("normal", normal);
    geometry.setAttribute("aFresh", fresh);
    geometry.setAttribute("aWear", wear);
    const mesh = new Mesh(geometry, material);
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    mesh.name = `terrain-${chunk.cx}-${chunk.cz}-${step}`;
    const lod: Lod = { mesh, geometry, position, normal, fresh, wear, side, step };
    const i0 = chunk.cx * CHUNK_CELLS;
    const j0 = chunk.cz * CHUNK_CELLS;
    this.writeRect(lod, chunk, { i0, j0, i1: i0 + CHUNK_CELLS, j1: j0 + CHUNK_CELLS }, false, 0);
    return lod;
  }

  /** Queues chunks the terrain marked dirty. `fresh` darkens the edited area (digs, not loads). */
  collect(fresh: boolean): void {
    for (const e of this.entries) {
      const rect = e.chunk.dirtyRect;
      if (!e.chunk.dirty || !rect) continue;
      e.pendingFull = union(e.pendingFull, rect);
      e.pendingHalf = union(e.pendingHalf, rect);
      e.markFresh ||= fresh;
      this.terrain.clearDirty(e.chunk);
      if (!e.queued) {
        e.queued = true;
        this.queue.push(e);
      }
    }
    this.stats.queue = this.queue.length;
  }

  /** Rebuilds up to `budget` queued chunks and picks each chunk's LOD for `camera`. */
  update(camera: Camera, time: number, budget = 2): number {
    let rebuilt = 0;
    while (rebuilt < budget && this.queue.length) {
      const e = this.queue.shift()!;
      e.queued = false;
      const useHalf = this.isFar(e, camera);
      // Rebuild the LOD on screen now; the other one catches up when it becomes visible.
      if (useHalf && e.pendingHalf) {
        this.writeRect(e.half, e.chunk, e.pendingHalf, e.markFresh, time);
        e.pendingHalf = null;
      } else if (!useHalf && e.pendingFull) {
        this.writeRect(e.full, e.chunk, e.pendingFull, e.markFresh, time);
        e.pendingFull = null;
      }
      // The off-screen LOD stays pending (not re-queued) and catches up when it becomes visible.
      e.markFresh = false;
      rebuilt++;
    }
    for (const e of this.entries) {
      const useHalf = this.isFar(e, camera);
      // Queued chunks wait for their budget slot; only refresh a stale LOD after a switch.
      if (e.queued) {
        e.full.mesh.visible = !useHalf;
        e.half.mesh.visible = useHalf;
        continue;
      }
      if (useHalf && e.pendingHalf) {
        this.writeRect(e.half, e.chunk, e.pendingHalf, false, time);
        e.pendingHalf = null;
      } else if (!useHalf && e.pendingFull) {
        this.writeRect(e.full, e.chunk, e.pendingFull, false, time);
        e.pendingFull = null;
      }
      e.full.mesh.visible = !useHalf;
      e.half.mesh.visible = useHalf;
    }
    this.stats.rebuilds += rebuilt;
    this.stats.queue = this.queue.length;
    return rebuilt;
  }

  /** Copies the global wear field into chunks touching `rect` (track marks). */
  refreshWear(rect: VertexRect): void {
    for (const e of this.entries) {
      for (const lod of [e.full, e.half]) {
        if (!this.overlaps(e.chunk, rect)) continue;
        const arr = lod.wear.array as Float32Array;
        const i0 = e.chunk.cx * CHUNK_CELLS;
        const j0 = e.chunk.cz * CHUNK_CELLS;
        for (let z = 0; z < lod.side; z++) {
          for (let x = 0; x < lod.side; x++) {
            const gi = i0 + x * lod.step;
            const gj = j0 + z * lod.step;
            arr[z * lod.side + x] = this.wear[gj * this.terrain.vertsX + gi]!;
          }
        }
        lod.wear.needsUpdate = true;
      }
    }
  }

  dispose(): void {
    for (const e of this.entries) {
      for (const lod of [e.full, e.half]) {
        this.parent.remove(lod.mesh);
        lod.geometry.dispose();
      }
    }
    this.entries.length = 0;
    this.queue.length = 0;
  }

  private overlaps(chunk: TerrainChunk, r: VertexRect): boolean {
    const i0 = chunk.cx * CHUNK_CELLS;
    const j0 = chunk.cz * CHUNK_CELLS;
    return r.i1 >= i0 && r.i0 <= i0 + CHUNK_CELLS && r.j1 >= j0 && r.j0 <= j0 + CHUNK_CELLS;
  }

  private isFar(e: Entry, camera: Camera): boolean {
    const dx = camera.position.x - e.centerX;
    const dz = camera.position.z - e.centerZ;
    return dx * dx + dz * dz > this.lodDistance * this.lodDistance;
  }

  /** Rewrites positions (and normals one vertex around) for `rect` in one LOD. */
  private writeRect(
    lod: Lod,
    chunk: TerrainChunk,
    rect: VertexRect,
    fresh: boolean,
    time: number,
  ): void {
    const t = this.terrain;
    const i0 = chunk.cx * CHUNK_CELLS;
    const j0 = chunk.cz * CHUNK_CELLS;
    const step = lod.step;
    const side = lod.side;
    // Expand by one grid step so neighbouring normals see the new heights.
    const x0 = Math.max(0, Math.floor((rect.i0 - i0) / step) - 1);
    const x1 = Math.min(side - 1, Math.ceil((rect.i1 - i0) / step) + 1);
    const z0 = Math.max(0, Math.floor((rect.j0 - j0) / step) - 1);
    const z1 = Math.min(side - 1, Math.ceil((rect.j1 - j0) / step) + 1);
    if (x0 > x1 || z0 > z1) return;
    const pos = lod.position.array as Float32Array;
    const nrm = lod.normal.array as Float32Array;
    const fr = lod.fresh.array as Float32Array;
    const hx = t.cellsX / 2;
    const hz = t.cellsZ / 2;
    const h = (gi: number, gj: number) => {
      const ci = gi < 0 ? 0 : gi > t.cellsX ? t.cellsX : gi;
      const cj = gj < 0 ? 0 : gj > t.cellsZ ? t.cellsZ : gj;
      return t.getQ(ci, cj) / HEIGHT_Q_PER_M;
    };
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) {
        const gi = i0 + x * step;
        const gj = j0 + z * step;
        const v = z * side + x;
        pos[v * 3] = gi - hx;
        pos[v * 3 + 1] = h(gi, gj);
        pos[v * 3 + 2] = gj - hz;
        // Central differences across chunk borders keep seams invisible.
        const nx = h(gi - step, gj) - h(gi + step, gj);
        const nz = h(gi, gj - step) - h(gi, gj + step);
        const ny = 2 * step;
        const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
        nrm[v * 3] = nx / len;
        nrm[v * 3 + 1] = ny / len;
        nrm[v * 3 + 2] = nz / len;
        if (fresh && gi >= rect.i0 && gi <= rect.i1 && gj >= rect.j0 && gj <= rect.j1) fr[v] = time;
      }
    }
    const first = z0 * side;
    const count = (z1 - z0 + 1) * side;
    lod.position.addUpdateRange(first * 3, count * 3);
    lod.normal.addUpdateRange(first * 3, count * 3);
    lod.position.needsUpdate = true;
    lod.normal.needsUpdate = true;
    if (fresh) {
      lod.fresh.addUpdateRange(first, count);
      lod.fresh.needsUpdate = true;
    }
    lod.geometry.computeBoundingSphere();
    lod.geometry.computeBoundingBox();
  }
}
