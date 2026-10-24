/**
 * Chunked, editable, deterministic heightmap shared by the server (authority) and every client.
 *
 * Determinism rules (server and all browsers must produce bit-identical heights):
 * - every stored height is an integer number of quanta (1/1024 m), kept in Float32Arrays;
 * - edits use only + − × ÷, Math.round/floor/sqrt and integer hashing, in a fixed row-major order;
 * - no trigonometry, no Map/Set iteration, no time or randomness.
 */
import { CHUNK_CELLS } from "./constants";
import type { TableMap } from "./maps";

export const HEIGHT_Q_PER_M = 1024;
export const CHUNK_VERTS = CHUNK_CELLS + 1;

export const toQ = (meters: number): number => Math.round(meters * HEIGHT_Q_PER_M);
export const fromQ = (q: number): number => q / HEIGHT_Q_PER_M;
/** With 1 m cells, one height quantum on one vertex is 1/1024 m³. */
export const quantaToM3 = (q: number): number => q / HEIGHT_Q_PER_M;
export const m3ToQuanta = (m3: number): number => Math.round(m3 * HEIGHT_Q_PER_M);

/** Inclusive rectangle of global vertex indices. */
export interface VertexRect {
  i0: number;
  j0: number;
  i1: number;
  j1: number;
}

export interface TerrainChunk {
  cx: number;
  cz: number;
  /** 33 × 33 surface heights (m), row-major by z then x, including the shared border. */
  heights: Float32Array;
  /** 33 × 33 bedrock heights (m): nothing digs or slides below these. */
  bedrock: Float32Array;
  /** Increments on every change; consumers compare it to know when to rebuild. */
  version: number;
  /** Set on edit; cleared by the consumer that rebuilds meshes. */
  dirty: boolean;
  dirtyRect: VertexRect | null;
}

export class Terrain {
  readonly vertsX: number;
  readonly vertsZ: number;
  readonly chunksX: number;
  readonly chunksZ: number;
  readonly maxQ: number;
  readonly chunks: TerrainChunk[];

  constructor(
    readonly cellsX: number,
    readonly cellsZ: number,
    maxHeightM: number,
  ) {
    if (cellsX % CHUNK_CELLS !== 0 || cellsZ % CHUNK_CELLS !== 0) {
      throw new Error(`terrain size must be a multiple of ${CHUNK_CELLS} cells`);
    }
    this.vertsX = cellsX + 1;
    this.vertsZ = cellsZ + 1;
    this.chunksX = cellsX / CHUNK_CELLS;
    this.chunksZ = cellsZ / CHUNK_CELLS;
    this.maxQ = toQ(maxHeightM);
    this.chunks = [];
    for (let cz = 0; cz < this.chunksZ; cz++) {
      for (let cx = 0; cx < this.chunksX; cx++) {
        this.chunks.push({
          cx,
          cz,
          heights: new Float32Array(CHUNK_VERTS * CHUNK_VERTS),
          bedrock: new Float32Array(CHUNK_VERTS * CHUNK_VERTS),
          version: 0,
          dirty: false,
          dirtyRect: null,
        });
      }
    }
  }

  chunkAt(cx: number, cz: number): TerrainChunk {
    return this.chunks[cz * this.chunksX + cx]!;
  }

  /** Global vertex index along X for world x (fractional). */
  gridX(x: number): number {
    return x + this.cellsX / 2;
  }

  gridZ(z: number): number {
    return z + this.cellsZ / 2;
  }

  getQ(i: number, j: number): number {
    const cx = i >= this.cellsX ? this.chunksX - 1 : (i / CHUNK_CELLS) | 0;
    const cz = j >= this.cellsZ ? this.chunksZ - 1 : (j / CHUNK_CELLS) | 0;
    const c = this.chunks[cz * this.chunksX + cx]!;
    return Math.round(
      c.heights[(j - cz * CHUNK_CELLS) * CHUNK_VERTS + (i - cx * CHUNK_CELLS)]! * HEIGHT_Q_PER_M,
    );
  }

  bedrockQ(i: number, j: number): number {
    const cx = i >= this.cellsX ? this.chunksX - 1 : (i / CHUNK_CELLS) | 0;
    const cz = j >= this.cellsZ ? this.chunksZ - 1 : (j / CHUNK_CELLS) | 0;
    const c = this.chunks[cz * this.chunksX + cx]!;
    return Math.round(
      c.bedrock[(j - cz * CHUNK_CELLS) * CHUNK_VERTS + (i - cx * CHUNK_CELLS)]! * HEIGHT_Q_PER_M,
    );
  }

  /** Writes a height to every chunk that holds vertex (i, j) and marks them changed. */
  setQ(i: number, j: number, q: number): void {
    this.writeAll(i, j, q / HEIGHT_Q_PER_M, false);
  }

  setBedrockQ(i: number, j: number, q: number): void {
    this.writeAll(i, j, q / HEIGHT_Q_PER_M, true);
  }

  private writeAll(i: number, j: number, value: number, bedrock: boolean): void {
    const cxA = i >= this.cellsX ? this.chunksX - 1 : (i / CHUNK_CELLS) | 0;
    const czA = j >= this.cellsZ ? this.chunksZ - 1 : (j / CHUNK_CELLS) | 0;
    const shareX = i % CHUNK_CELLS === 0 && i > 0 && i < this.cellsX;
    const shareZ = j % CHUNK_CELLS === 0 && j > 0 && j < this.cellsZ;
    this.writeOne(cxA, czA, i, j, value, bedrock);
    if (shareX) this.writeOne(cxA - 1, czA, i, j, value, bedrock);
    if (shareZ) this.writeOne(cxA, czA - 1, i, j, value, bedrock);
    if (shareX && shareZ) this.writeOne(cxA - 1, czA - 1, i, j, value, bedrock);
  }

  private writeOne(
    cx: number,
    cz: number,
    i: number,
    j: number,
    value: number,
    bedrock: boolean,
  ): void {
    const c = this.chunks[cz * this.chunksX + cx]!;
    const k = (j - cz * CHUNK_CELLS) * CHUNK_VERTS + (i - cx * CHUNK_CELLS);
    if (bedrock) {
      c.bedrock[k] = value;
      return;
    }
    if (c.heights[k] === value) return;
    c.heights[k] = value;
    c.version++;
    c.dirty = true;
    const r = c.dirtyRect;
    if (!r) c.dirtyRect = { i0: i, j0: j, i1: i, j1: j };
    else {
      if (i < r.i0) r.i0 = i;
      if (i > r.i1) r.i1 = i;
      if (j < r.j0) r.j0 = j;
      if (j > r.j1) r.j1 = j;
    }
  }

  clearDirty(chunk: TerrainChunk): void {
    chunk.dirty = false;
    chunk.dirtyRect = null;
  }

  /** Bilinear height (m) at world (x, z), clamped to the table. */
  heightAt(x: number, z: number): number {
    let gx = this.gridX(x);
    let gz = this.gridZ(z);
    gx = gx < 0 ? 0 : gx > this.cellsX ? this.cellsX : gx;
    gz = gz < 0 ? 0 : gz > this.cellsZ ? this.cellsZ : gz;
    const i = Math.min(this.cellsX - 1, Math.floor(gx));
    const j = Math.min(this.cellsZ - 1, Math.floor(gz));
    const fx = gx - i;
    const fz = gz - j;
    const h00 = this.getQ(i, j);
    const h10 = this.getQ(i + 1, j);
    const h01 = this.getQ(i, j + 1);
    const h11 = this.getQ(i + 1, j + 1);
    const top = h00 + (h10 - h00) * fx;
    const bottom = h01 + (h11 - h01) * fx;
    return (top + (bottom - top) * fz) / HEIGHT_Q_PER_M;
  }

  /** Total material on the table, in quanta (each vertex counted once). */
  sumQ(): number {
    let sum = 0;
    for (let j = 0; j < this.vertsZ; j++)
      for (let i = 0; i < this.vertsX; i++) sum += this.getQ(i, j);
    return sum;
  }

  /** FNV-1a over every vertex's quantized height (row-major), for cross-machine comparison. */
  hash(): number {
    let h = 0x811c9dc5;
    for (let j = 0; j < this.vertsZ; j++) {
      for (let i = 0; i < this.vertsX; i++) {
        const q = this.getQ(i, j) >>> 0;
        h = Math.imul(h ^ (q & 0xff), 0x01000193);
        h = Math.imul(h ^ ((q >>> 8) & 0xff), 0x01000193);
        h = Math.imul(h ^ ((q >>> 16) & 0xff), 0x01000193);
        h = Math.imul(h ^ (q >>> 24), 0x01000193);
      }
    }
    return h >>> 0;
  }

  clone(): Terrain {
    const t = new Terrain(this.cellsX, this.cellsZ, this.maxQ / HEIGHT_Q_PER_M);
    t.copyFrom(this);
    return t;
  }

  copyFrom(other: Terrain): void {
    for (let k = 0; k < this.chunks.length; k++) {
      const dst = this.chunks[k]!;
      const src = other.chunks[k]!;
      dst.heights.set(src.heights);
      dst.bedrock.set(src.bedrock);
      dst.version++;
      dst.dirty = true;
      dst.dirtyRect = {
        i0: dst.cx * CHUNK_CELLS,
        j0: dst.cz * CHUNK_CELLS,
        i1: dst.cx * CHUNK_CELLS + CHUNK_CELLS,
        j1: dst.cz * CHUNK_CELLS + CHUNK_CELLS,
      };
    }
  }
}

// ─── brushes ───────────────────────────────────────────────────────────────

export type BrushMode = "dig" | "fill" | "flatten";

export interface Brush {
  /** World center (m). */
  x: number;
  z: number;
  radius: number;
  /** 0 = flat-topped brush, 1 = smooth dome. */
  falloff: number;
  mode: BrushMode;
  /** dig: depth at the center, in quanta. */
  depthQ?: number;
  /** dig: stop after removing this many quanta (remaining bucket capacity). */
  limitQ?: number;
  /** fill: exact quanta to add. */
  volumeQ?: number;
  /** flatten: target height in quanta. */
  targetQ?: number;
}

export interface BrushResult {
  /** dig: quanta removed; fill: quanta added; flatten: surplus quanta scraped off (≥ 0). */
  changedQ: number;
  rect: VertexRect | null;
}

const NONE: BrushResult = Object.freeze({ changedQ: 0, rect: null }) as BrushResult;

let weights = new Float64Array(256);
let alloc = new Int32Array(256);

function scratch(n: number): void {
  if (weights.length < n) {
    weights = new Float64Array(n * 2);
    alloc = new Int32Array(n * 2);
  }
}

class RectTracker {
  i0 = Infinity;
  j0 = Infinity;
  i1 = -Infinity;
  j1 = -Infinity;
  add(i: number, j: number): void {
    if (i < this.i0) this.i0 = i;
    if (i > this.i1) this.i1 = i;
    if (j < this.j0) this.j0 = j;
    if (j > this.j1) this.j1 = j;
  }
  get rect(): VertexRect | null {
    return this.i0 === Infinity ? null : { i0: this.i0, j0: this.j0, i1: this.i1, j1: this.j1 };
  }
}

/** Applies one brush. Volumes are exact integers of quanta; see BrushResult for the meaning. */
export function applyBrush(t: Terrain, b: Brush): BrushResult {
  const r = b.radius;
  if (!(r > 0)) return NONE;
  const gx = t.gridX(b.x);
  const gz = t.gridZ(b.z);
  const i0 = Math.max(0, Math.ceil(gx - r));
  const i1 = Math.min(t.vertsX - 1, Math.floor(gx + r));
  const j0 = Math.max(0, Math.ceil(gz - r));
  const j1 = Math.min(t.vertsZ - 1, Math.floor(gz + r));
  if (i0 > i1 || j0 > j1) return NONE;

  const r2 = r * r;
  const f = b.falloff < 0 ? 0 : b.falloff > 1 ? 1 : b.falloff;
  const w = (i: number, j: number): number => {
    const dx = i - gx;
    const dz = j - gz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= r2) return 0;
    const tt = 1 - d2 / r2;
    return 1 - f + f * tt * tt;
  };
  const touched = new RectTracker();

  if (b.mode === "dig") {
    const depth = b.depthQ ?? 0;
    let remaining = b.limitQ ?? Infinity;
    let removed = 0;
    for (let j = j0; j <= j1 && remaining > 0; j++) {
      for (let i = i0; i <= i1 && remaining > 0; i++) {
        const wt = w(i, j);
        if (wt <= 0) continue;
        const want = Math.round(depth * wt);
        if (want <= 0) continue;
        const q = t.getQ(i, j);
        const take = Math.min(want, q - t.bedrockQ(i, j), remaining);
        if (take <= 0) continue;
        t.setQ(i, j, q - take);
        removed += take;
        remaining -= take;
        touched.add(i, j);
      }
    }
    return { changedQ: removed, rect: touched.rect };
  }

  if (b.mode === "fill") {
    const volume = Math.max(0, Math.floor(b.volumeQ ?? 0));
    if (volume === 0) return NONE;
    const n = (i1 - i0 + 1) * (j1 - j0 + 1);
    scratch(n);
    let total = 0;
    let k = 0;
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++, k++) total += weights[k] = w(i, j);
    if (total <= 0) return NONE;
    let given = 0;
    for (k = 0; k < n; k++) {
      const share = weights[k]! > 0 ? Math.floor((volume * weights[k]!) / total) : 0;
      alloc[k] = share;
      given += share;
    }
    // Hand out the rounding remainder one quantum at a time, in fixed order.
    let remainder = volume - given;
    while (remainder > 0) {
      for (k = 0; k < n && remainder > 0; k++) {
        if (weights[k]! > 0) {
          alloc[k]!++;
          remainder--;
        }
      }
    }
    let added = 0;
    k = 0;
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++, k++) {
        const want = alloc[k]!;
        if (want <= 0) continue;
        const q = t.getQ(i, j);
        const add = Math.min(want, t.maxQ - q);
        if (add <= 0) continue;
        t.setQ(i, j, q + add);
        added += add;
        touched.add(i, j);
      }
    }
    return { changedQ: added, rect: touched.rect };
  }

  // flatten: scrape down to the target, then use (only) the scraped material to fill up to it.
  const target = b.targetQ ?? 0;
  let budget = 0;
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const q = t.getQ(i, j);
      if (q <= target) continue;
      const wt = w(i, j);
      if (wt <= 0) continue;
      const take = Math.min(Math.round((q - target) * wt), q - t.bedrockQ(i, j));
      if (take <= 0) continue;
      t.setQ(i, j, q - take);
      budget += take;
      touched.add(i, j);
    }
  }
  for (let j = j0; j <= j1 && budget > 0; j++) {
    for (let i = i0; i <= i1 && budget > 0; i++) {
      const q = t.getQ(i, j);
      if (q >= target) continue;
      const wt = w(i, j);
      if (wt <= 0) continue;
      const give = Math.min(Math.round((target - q) * wt), budget, t.maxQ - q);
      if (give <= 0) continue;
      t.setQ(i, j, q + give);
      budget -= give;
      touched.add(i, j);
    }
  }
  return { changedQ: budget, rect: touched.rect };
}

/**
 * Angle-of-repose relaxation: moves loose material (above bedrock) from a vertex to its lower
 * 4-neighbour until no step exceeds `reposeQ`. Works on `rect` grown by `maxPasses` cells, in a
 * fixed order; conserves volume exactly. Returns the quanta moved.
 */
export function relaxRepose(t: Terrain, rect: VertexRect, reposeQ: number, maxPasses = 8): number {
  const i0 = Math.max(0, rect.i0 - maxPasses);
  const j0 = Math.max(0, rect.j0 - maxPasses);
  const i1 = Math.min(t.vertsX - 1, rect.i1 + maxPasses);
  const j1 = Math.min(t.vertsZ - 1, rect.j1 + maxPasses);
  let total = 0;
  for (let pass = 0; pass < maxPasses; pass++) {
    let moved = 0;
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        if (i < i1) moved += relaxPair(t, i, j, i + 1, j, reposeQ);
        if (j < j1) moved += relaxPair(t, i, j, i, j + 1, reposeQ);
      }
    }
    total += moved;
    if (moved === 0) break;
  }
  return total;
}

function relaxPair(
  t: Terrain,
  ia: number,
  ja: number,
  ib: number,
  jb: number,
  reposeQ: number,
): number {
  let qa = t.getQ(ia, ja);
  let qb = t.getQ(ib, jb);
  let diff = qa - qb;
  if (diff < 0) {
    // Make `a` the higher vertex.
    [ia, ib] = [ib, ia];
    [ja, jb] = [jb, ja];
    [qa, qb] = [qb, qa];
    diff = -diff;
  }
  if (diff <= reposeQ) return 0;
  const m = Math.min(Math.floor((diff - reposeQ + 1) / 2), qa - t.bedrockQ(ia, ja), t.maxQ - qb);
  if (m <= 0) return 0;
  t.setQ(ia, ja, qa - m);
  t.setQ(ib, jb, qb + m);
  return m;
}

// ─── base terrain ──────────────────────────────────────────────────────────

/** Integer hash → [0, 1). Math.imul and shifts are exact everywhere. */
function hash2(ix: number, iz: number, seed: number): number {
  let h = Math.imul(ix, 0x27d4eb2d) ^ Math.imul(iz, 0x165667b1) ^ Math.imul(seed, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const smooth = (t: number): number => t * t * (3 - 2 * t);

function valueNoise(x: number, z: number, cell: number, seed: number): number {
  const gx = x / cell;
  const gz = z / cell;
  const ix = Math.floor(gx);
  const iz = Math.floor(gz);
  const fx = smooth(gx - ix);
  const fz = smooth(gz - iz);
  const a = hash2(ix, iz, seed);
  const b = hash2(ix + 1, iz, seed);
  const c = hash2(ix, iz + 1, seed);
  const d = hash2(ix + 1, iz + 1, seed);
  const top = a + (b - a) * fx;
  const bottom = c + (d - c) * fx;
  return top + (bottom - top) * fz;
}

/** Two octaves of value noise in [0, 1). */
function noise(x: number, z: number, seed: number): number {
  return 0.65 * valueNoise(x, z, 16, seed) + 0.35 * valueNoise(x, z, 6, seed + 1);
}

function moundsAt(
  mounds: readonly { x: number; z: number; radius: number; height: number }[],
  x: number,
  z: number,
): number {
  let h = 0;
  for (const m of mounds) {
    const dx = x - m.x;
    const dz = z - m.z;
    const d2 = dx * dx + dz * dz;
    const r2 = m.radius * m.radius;
    if (d2 >= r2) continue;
    const t = 1 - d2 / r2;
    h += m.height * t * t;
  }
  return h;
}

/** Builds a table's untouched terrain (surface + bedrock). Deterministic for a given map. */
export function createTerrainForMap(map: TableMap): Terrain {
  const t = new Terrain(map.cellsX, map.cellsZ, map.maxHeight);
  const spec = map.baseTerrain;
  for (let j = 0; j < t.vertsZ; j++) {
    for (let i = 0; i < t.vertsX; i++) {
      const x = i - map.cellsX / 2;
      const z = j - map.cellsZ / 2;
      const n = noise(x, z, spec.seed) * 2 - 1;
      let h: number;
      let bedrock: number;

      if (spec.kind === "flat") {
        h = spec.groundHeight + spec.noiseAmp * n;
        bedrock = Math.max(0, spec.groundHeight - spec.looseDepth);
      } else {
        const ground = spec.groundHeight + spec.noiseAmp * n;
        const bottom = spec.groundHeight - spec.pit.depth;
        const pdx = x - spec.pit.x;
        const pdz = z - spec.pit.z;
        const r = Math.sqrt(pdx * pdx + pdz * pdz);
        let rock = false;
        h = ground;
        bedrock = spec.groundHeight - spec.looseDepth;
        if (r < spec.pit.floorRadius) {
          h = bottom + spec.noiseAmp * 0.4 * n;
          bedrock = bottom - 1.5;
        } else if (r < spec.pit.radius) {
          const s = smooth((r - spec.pit.floorRadius) / (spec.pit.radius - spec.pit.floorRadius));
          h = bottom + (ground - bottom) * s;
          rock = true;
        }

        // Ramp road: a straight corridor descending linearly from the rim road to the pit floor.
        const { x0, z0, x1, z1, width } = spec.ramp;
        const rdx = x1 - x0;
        const rdz = z1 - z0;
        const len2 = rdx * rdx + rdz * rdz;
        let u = ((x - x0) * rdx + (z - z0) * rdz) / len2;
        u = u < 0 ? 0 : u > 1 ? 1 : u;
        const ex = x - (x0 + rdx * u);
        const ez = z - (z0 + rdz * u);
        const dist = Math.sqrt(ex * ex + ez * ez);
        const half = width / 2;
        const blend = 1.5;
        if (dist < half + blend) {
          const rampH = spec.groundHeight + (bottom - spec.groundHeight) * u;
          const w = dist <= half ? 1 : smooth(1 - (dist - half) / blend);
          h += (rampH - h) * w;
          if (w > 0.5) {
            rock = false;
            bedrock = h - 0.6;
          }
        }

        // Flat loading area at ground height, blended over 2 m.
        const lx = Math.abs(x - spec.loading.x) - spec.loading.w / 2;
        const lz = Math.abs(z - spec.loading.z) - spec.loading.d / 2;
        const outside = Math.max(lx, lz);
        if (outside < 2) {
          const w = outside <= 0 ? 1 : smooth(1 - outside / 2);
          h += (spec.groundHeight - h) * w;
        }
        if (rock) bedrock = h;
      }

      // Loose piles sit on top of everything.
      h += moundsAt(spec.mounds, x, z);
      let q = Math.round(h * HEIGHT_Q_PER_M);
      q = q < 0 ? 0 : q > t.maxQ ? t.maxQ : q;
      let bq = Math.round(bedrock * HEIGHT_Q_PER_M);
      bq = bq < 0 ? 0 : bq > q ? q : bq;
      t.setBedrockQ(i, j, bq);
      t.setQ(i, j, q);
    }
  }
  for (const c of t.chunks) {
    c.version = 0;
    t.clearDirty(c);
  }
  return t;
}
