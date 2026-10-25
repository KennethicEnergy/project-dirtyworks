/**
 * One Rapier heightfield collider per terrain chunk. A changed chunk is rebuilt at most every
 * 100 ms and at most `budget` chunks per frame; the new collider is created before the old one
 * is removed, so vehicles never fall through mid-rebuild.
 */
import type { Collider, World } from "@dimforge/rapier3d-compat";
import { CHUNK_VERTS, type Terrain } from "@dirtyworks/shared";
import { isSameWorld, worldToken, type WorldToken } from "../physics/worldToken";
import type { Rapier } from "../runtime";
import { chunkHeightfield } from "./heightfield";

export const COLLIDER_MIN_INTERVAL_MS = 100;

export interface ColliderStats {
  rebuilds: number;
  /** Slowest single rebuild seen (ms). */
  worstMs: number;
  lastMs: number;
}

export class ChunkColliders {
  private readonly colliders: (Collider | null)[];
  private readonly builtVersion: number[];
  private readonly builtAt: number[];
  private readonly scratch = new Float32Array(CHUNK_VERTS * CHUNK_VERTS);
  private readonly token: WorldToken;
  readonly stats: ColliderStats = { rebuilds: 0, worstMs: 0, lastMs: 0 };

  constructor(
    private readonly world: World,
    private readonly rapier: Rapier,
    private readonly terrain: Terrain,
  ) {
    this.token = worldToken(world);
    this.colliders = terrain.chunks.map(() => null);
    this.builtVersion = terrain.chunks.map(() => -1);
    this.builtAt = terrain.chunks.map(() => -Infinity);
    for (let k = 0; k < terrain.chunks.length; k++) this.rebuild(k, 0);
    this.stats.rebuilds = 0;
  }

  /** Rebuilds changed chunks, throttled. Returns how many were rebuilt. */
  update(nowMs: number, budget = 2): number {
    let done = 0;
    const chunks = this.terrain.chunks;
    for (let k = 0; k < chunks.length && done < budget; k++) {
      if (chunks[k]!.version === this.builtVersion[k]) continue;
      if (nowMs - this.builtAt[k]! < COLLIDER_MIN_INTERVAL_MS) continue;
      this.rebuild(k, nowMs);
      done++;
    }
    return done;
  }

  private rebuild(k: number, nowMs: number): void {
    const chunk = this.terrain.chunks[k]!;
    const start = performance.now();
    const hf = chunkHeightfield(this.terrain, chunk, this.scratch);
    const next = this.world.createCollider(
      this.rapier.ColliderDesc.heightfield(hf.nrows, hf.ncols, hf.heights, hf.scale)
        .setTranslation(hf.center.x, 0, hf.center.z)
        .setFriction(1),
    );
    const old = this.colliders[k];
    this.colliders[k] = next;
    if (old) this.world.removeCollider(old, true);
    this.builtVersion[k] = chunk.version;
    this.builtAt[k] = nowMs;
    const ms = performance.now() - start;
    this.stats.lastMs = ms;
    if (ms > this.stats.worstMs) this.stats.worstMs = ms;
    this.stats.rebuilds++;
  }

  dispose(): void {
    if (!isSameWorld(this.world, this.token)) return;
    for (const c of this.colliders) if (c) this.world.removeCollider(c, false);
    this.colliders.fill(null);
  }
}
