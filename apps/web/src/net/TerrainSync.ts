/**
 * Keeps the client's terrain replica in step with the server: load a snapshot, then apply
 * broadcast ops strictly in sequence order. Early or out-of-order ops wait in a buffer; a gap
 * that stays open asks the server to resync; a replay that disagrees with the server's result
 * rebuilds from the base terrain.
 */
import {
  applySnapshot,
  applyTerrainOp,
  decodeOp,
  decodeSnapshot,
  type AppliedOp,
  type MaterialPreset,
  type Terrain,
} from "@dirtyworks/shared";

export interface TerrainSyncOptions {
  /** Ask the server for everything after `fromSeq` (ops, or a snapshot if they're gone). */
  requestResync: (fromSeq: number) => void;
  now?: () => number;
  /** How long a gap may stay open before asking for a resync (ms). */
  gapTimeoutMs?: number;
}

/** Buffered ops beyond this mean something went badly wrong: start over. */
const MAX_PENDING = 4096;

export class TerrainSync {
  seq = 0;
  ready = false;
  mismatches = 0;
  /** Called for every op applied (dust, sounds). */
  onApplied: ((op: AppliedOp) => void) | null = null;

  private readonly pending = new Map<number, AppliedOp>();
  private gapSince: number | null = null;
  private resyncRequested = false;
  private readonly now: () => number;
  private readonly gapTimeoutMs: number;

  constructor(
    private readonly terrain: Terrain,
    private readonly base: Terrain,
    private readonly material: MaterialPreset,
    private readonly opts: TerrainSyncOptions,
  ) {
    this.now = opts.now ?? (() => performance.now());
    this.gapTimeoutMs = opts.gapTimeoutMs ?? 2000;
  }

  get queueLength(): number {
    return this.pending.size;
  }

  loadSnapshot(bytes: Uint8Array, seq: number): void {
    this.terrain.copyFrom(this.base);
    applySnapshot(this.terrain, decodeSnapshot(bytes));
    this.seq = seq;
    this.ready = true;
    for (const s of [...this.pending.keys()]) if (s <= seq) this.pending.delete(s);
    this.gapSince = null;
    this.resyncRequested = false;
  }

  receive(wire: unknown): void {
    const op = decodeOp(wire);
    if (!op) return;
    if (this.ready && op.seq <= this.seq) return;
    this.pending.set(op.seq, op);
    if (this.pending.size > MAX_PENDING) this.restart();
  }

  /** Applies buffered ops that are next in line (up to `budget`). Returns how many. */
  flush(budget = Infinity): number {
    if (!this.ready) return 0;
    let applied = 0;
    while (applied < budget) {
      const op = this.pending.get(this.seq + 1);
      if (!op) break;
      this.pending.delete(op.seq);
      const result = applyTerrainOp(this.terrain, op, this.material);
      if (result !== op.resultQ) {
        this.mismatches++;
        this.restart();
        return applied;
      }
      this.seq = op.seq;
      this.onApplied?.(op);
      applied++;
    }
    this.checkGap();
    return applied;
  }

  /** The replica diverged (or the buffer overflowed): rebuild from the base and refetch. */
  private restart(): void {
    this.terrain.copyFrom(this.base);
    this.seq = 0;
    this.pending.clear();
    this.gapSince = null;
    this.resyncRequested = true;
    this.opts.requestResync(0);
  }

  private checkGap(): void {
    if (this.pending.size === 0 || this.pending.has(this.seq + 1)) {
      this.gapSince = null;
      this.resyncRequested = false;
      return;
    }
    const t = this.now();
    if (this.gapSince === null) {
      this.gapSince = t;
    } else if (!this.resyncRequested && t - this.gapSince > this.gapTimeoutMs) {
      this.resyncRequested = true;
      this.opts.requestResync(this.seq);
    }
  }
}
