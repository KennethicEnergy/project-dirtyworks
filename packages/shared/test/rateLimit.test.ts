import { describe, expect, it } from "vitest";
import { TokenBucket } from "../src/rateLimit";

function fakeClock(start = 1_000_000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

describe("TokenBucket", () => {
  it("allows a burst up to capacity, then blocks", () => {
    const clock = fakeClock();
    const bucket = new TokenBucket(3, 1, clock.now);
    expect([bucket.take(), bucket.take(), bucket.take(), bucket.take()]).toEqual([
      true,
      true,
      true,
      false,
    ]);
  });

  it("refills at the configured rate", () => {
    const clock = fakeClock();
    const bucket = new TokenBucket(2, 4, clock.now);
    bucket.take();
    bucket.take();
    expect(bucket.take()).toBe(false);
    clock.advance(250);
    expect(bucket.take()).toBe(true);
    expect(bucket.take()).toBe(false);
  });

  it("never refills beyond capacity", () => {
    const clock = fakeClock();
    const bucket = new TokenBucket(2, 10, clock.now);
    clock.advance(60_000);
    expect(bucket.tokens).toBe(2);
  });

  it("takes several tokens at once only when enough are available", () => {
    const clock = fakeClock();
    const bucket = new TokenBucket(5, 1, clock.now);
    expect(bucket.take(4)).toBe(true);
    expect(bucket.take(2)).toBe(false);
    expect(bucket.take(1)).toBe(true);
  });

  it("ignores a clock that goes backwards", () => {
    const clock = fakeClock();
    const bucket = new TokenBucket(1, 1, clock.now);
    bucket.take();
    clock.advance(-5000);
    expect(bucket.take()).toBe(false);
  });
});
