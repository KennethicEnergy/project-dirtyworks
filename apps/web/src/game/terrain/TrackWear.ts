/**
 * Track marks: wheels and tracks darken the ground they roll over, and the marks fade slowly.
 * Writes a per-vertex wear field (0..1) that ChunkMeshes copies into the terrain's `aWear`
 * attribute. At most `cap` vertices are worn at once; past that the oldest marks go first.
 */
import type { VertexRect } from "@dirtyworks/shared";

export const MAX_WEAR_VERTICES = 4096;
/** Seconds for a fully worn vertex to fade back to clean ground. */
export const WEAR_FADE_SECONDS = 90;
/** Fading runs on this slow clock so the whole worn area is not re-uploaded every frame. */
const FADE_STEP_SECONDS = 0.5;
/** A wheel's footprint radius (m); terrain vertices are 1 m apart. */
const FOOTPRINT = 0.9;

export class TrackWear {
  /** Worn vertex indices, oldest first (a ring: `head` is the oldest, `count` long). */
  private readonly ring: Int32Array;
  private readonly worn: Uint8Array;
  private head = 0;
  private count = 0;
  private fadeClock = 0;
  private readonly dirty: VertexRect = { i0: 0, j0: 0, i1: 0, j1: 0 };
  private hasDirty = false;

  constructor(
    private readonly field: Float32Array,
    private readonly vertsX: number,
    private readonly vertsZ: number,
    private readonly cap = MAX_WEAR_VERTICES,
  ) {
    this.ring = new Int32Array(cap);
    this.worn = new Uint8Array(vertsX * vertsZ);
  }

  /** Number of vertices currently worn. */
  get active(): number {
    return this.count;
  }

  /** Adds `amount` of wear around world (x, z), strongest at the center. */
  stamp(x: number, z: number, amount: number): void {
    const gx = x + (this.vertsX - 1) / 2;
    const gz = z + (this.vertsZ - 1) / 2;
    const i0 = Math.max(0, Math.ceil(gx - FOOTPRINT));
    const i1 = Math.min(this.vertsX - 1, Math.floor(gx + FOOTPRINT));
    const j0 = Math.max(0, Math.ceil(gz - FOOTPRINT));
    const j1 = Math.min(this.vertsZ - 1, Math.floor(gz + FOOTPRINT));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const w = 1 - Math.hypot(i - gx, j - gz) / FOOTPRINT;
        if (w <= 0) continue;
        const v = j * this.vertsX + i;
        if (!this.worn[v]) this.add(v);
        this.field[v] = Math.min(1, this.field[v]! + amount * w);
        this.mark(v);
      }
    }
  }

  /**
   * Advances the fade. Returns the vertices changed since the last call (stamps, evictions and
   * fading), or null. The rect is reused: read it before the next call.
   */
  update(dt: number): VertexRect | null {
    this.fadeClock += dt;
    if (this.fadeClock >= FADE_STEP_SECONDS && this.count > 0) {
      const fade = this.fadeClock / WEAR_FADE_SECONDS;
      this.fadeClock = 0;
      let kept = 0;
      for (let k = 0; k < this.count; k++) {
        const v = this.ring[(this.head + k) % this.cap]!;
        const next = this.field[v]! - fade;
        this.mark(v);
        if (next > 0) {
          this.field[v] = next;
          this.ring[(this.head + kept) % this.cap] = v;
          kept++;
        } else {
          this.field[v] = 0;
          this.worn[v] = 0;
        }
      }
      this.count = kept;
    } else if (this.fadeClock >= FADE_STEP_SECONDS) {
      this.fadeClock = 0;
    }
    return this.takeDirty();
  }

  /** Wipes every mark (the table was reset). Returns the rect to refresh, or null. */
  clear(): VertexRect | null {
    for (let k = 0; k < this.count; k++) {
      const v = this.ring[(this.head + k) % this.cap]!;
      this.field[v] = 0;
      this.worn[v] = 0;
      this.mark(v);
    }
    this.head = 0;
    this.count = 0;
    return this.takeDirty();
  }

  private add(v: number): void {
    if (this.count === this.cap) {
      const oldest = this.ring[this.head]!;
      this.field[oldest] = 0;
      this.worn[oldest] = 0;
      this.mark(oldest);
      this.head = (this.head + 1) % this.cap;
      this.count--;
    }
    this.ring[(this.head + this.count) % this.cap] = v;
    this.count++;
    this.worn[v] = 1;
  }

  private mark(v: number): void {
    const i = v % this.vertsX;
    const j = (v - i) / this.vertsX;
    const r = this.dirty;
    if (!this.hasDirty) {
      r.i0 = r.i1 = i;
      r.j0 = r.j1 = j;
      this.hasDirty = true;
      return;
    }
    if (i < r.i0) r.i0 = i;
    if (i > r.i1) r.i1 = i;
    if (j < r.j0) r.j0 = j;
    if (j > r.j1) r.j1 = j;
  }

  private takeDirty(): VertexRect | null {
    if (!this.hasDirty) return null;
    this.hasDirty = false;
    return this.dirty;
  }
}
