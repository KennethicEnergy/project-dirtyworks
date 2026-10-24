/** Classic token bucket. Time comes from an injectable clock so tests and rooms stay deterministic. */
export class TokenBucket {
  private available: number;
  private last: number;

  constructor(
    readonly capacity: number,
    readonly refillPerSec: number,
    private readonly now: () => number = Date.now,
  ) {
    this.available = capacity;
    this.last = now();
  }

  private refill(): void {
    const t = this.now();
    const elapsed = t - this.last;
    if (elapsed > 0) {
      this.available = Math.min(
        this.capacity,
        this.available + (elapsed / 1000) * this.refillPerSec,
      );
      this.last = t;
    }
  }

  take(n = 1): boolean {
    this.refill();
    if (this.available + 1e-9 < n) return false;
    this.available -= n;
    return true;
  }

  get tokens(): number {
    this.refill();
    return this.available;
  }
}

export interface RateConfig {
  capacity: number;
  refillPerSec: number;
}

/** Per-client limits for every client → server message type. */
export const RATES = {
  state: { capacity: 25, refillPerSec: 25 },
  spawn: { capacity: 2, refillPerSec: 2 },
  terrainOp: { capacity: 10, refillPerSec: 10 },
  terrainResync: { capacity: 2, refillPerSec: 1 },
  chat: { capacity: 3, refillPerSec: 1 },
  emote: { capacity: 3, refillPerSec: 0.5 },
  livery: { capacity: 2, refillPerSec: 1 },
  report: { capacity: 1, refillPerSec: 0.1 },
  pong: { capacity: 2, refillPerSec: 1 },
  host: { capacity: 4, refillPerSec: 2 },
} as const satisfies Record<string, RateConfig>;

export type RateName = keyof typeof RATES;

export function bucketFor(name: RateName, now?: () => number): TokenBucket {
  const r = RATES[name];
  return new TokenBucket(r.capacity, r.refillPerSec, now);
}
