/**
 * The one game loop. Systems register into named, ordered phases; nothing in game code calls
 * useFrame except the LoopDriver that ticks this loop.
 */
export const PHASES = [
  "inputs",
  "player:pre-physics",
  "vehicle:pre-physics",
  "terrain:colliders",
  "physics",
  "vehicle:post-physics",
  "network:send",
  "network:interpolate",
  "terrain:apply",
  "camera",
  "visuals",
  "audio",
  "render",
] as const;
export type Phase = (typeof PHASES)[number];

export interface FrameContext {
  /** Seconds since the previous tick, clamped to MAX_DT. */
  dt: number;
  /** Seconds since the loop started (sum of clamped dts). */
  time: number;
  frame: number;
}

export interface System {
  name: string;
  update(ctx: FrameContext): void;
}

interface Entry {
  system: System;
  order: number;
  seq: number;
}

/** Longest step simulated in one tick; longer gaps (tab switches, breakpoints) are dropped. */
export const MAX_DT = 0.1;

export class GameLoop {
  private readonly phases = new Map<Phase, Entry[]>(PHASES.map((p) => [p, []]));
  private flat: System[] = [];
  private dirty = false;
  private seq = 0;
  private readonly ctx: FrameContext = { dt: 0, time: 0, frame: 0 };
  /** Milliseconds spent per phase in the last tick (perf overlay). */
  readonly phaseMs = new Float32Array(PHASES.length);
  lastTickMs = 0;

  constructor(private readonly onError: (system: string, err: unknown) => void = defaultOnError) {}

  register(phase: Phase, system: System, order = 0): () => void {
    const entry: Entry = { system, order, seq: this.seq++ };
    const list = this.phases.get(phase)!;
    list.push(entry);
    list.sort((a, b) => a.order - b.order || a.seq - b.seq);
    this.dirty = true;
    return () => {
      const i = list.indexOf(entry);
      if (i !== -1) {
        list.splice(i, 1);
        this.dirty = true;
      }
    };
  }

  tick(rawDt: number): void {
    if (this.dirty) this.rebuild();
    const ctx = this.ctx;
    ctx.dt = rawDt > MAX_DT ? MAX_DT : rawDt < 0 ? 0 : rawDt;
    ctx.time += ctx.dt;
    ctx.frame++;
    const start = performance.now();
    let p = 0;
    for (const phase of PHASES) {
      const t0 = performance.now();
      for (const entry of this.phases.get(phase)!) {
        try {
          entry.system.update(ctx);
        } catch (err) {
          this.onError(entry.system.name, err);
        }
      }
      this.phaseMs[p++] = performance.now() - t0;
    }
    this.lastTickMs = performance.now() - start;
  }

  /** Frames ticked so far (perf overlay). */
  get frame(): number {
    return this.ctx.frame;
  }

  /** Registered system names in execution order (debug/perf). */
  get systems(): readonly System[] {
    if (this.dirty) this.rebuild();
    return this.flat;
  }

  private rebuild(): void {
    this.flat = PHASES.flatMap((phase) => this.phases.get(phase)!.map((e) => e.system));
    this.dirty = false;
  }
}

const reported = new Set<string>();
function defaultOnError(system: string, err: unknown): void {
  // Log once per system so a broken system cannot flood the console at 60 fps.
  if (reported.has(system)) return;
  reported.add(system);
  console.error(`[game loop] system "${system}" failed`, err);
}
