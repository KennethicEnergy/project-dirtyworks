import { describe, expect, it } from "vitest";
import { MAX_WEAR_VERTICES, TrackWear, WEAR_FADE_SECONDS } from "@/game/terrain/TrackWear";

/** 64 × 64 cells of 1 m: vertex (32, 32) sits at the world origin. */
const SIDE = 65;
const at = (field: Float32Array, i: number, j: number) => field[j * SIDE + i]!;

function setup(cap?: number) {
  const field = new Float32Array(SIDE * SIDE);
  return { field, wear: new TrackWear(field, SIDE, SIDE, cap) };
}

describe("TrackWear", () => {
  it("darkens the vertex under a wheel and reports it for upload", () => {
    const { field, wear } = setup();
    wear.stamp(0, 0, 0.5);
    expect(at(field, 32, 32)).toBeCloseTo(0.5);
    expect(at(field, 33, 32)).toBe(0);
    expect(wear.active).toBe(1);
    expect(wear.update(0)).toEqual({ i0: 32, j0: 32, i1: 32, j1: 32 });
    expect(wear.update(0)).toBeNull();
  });

  it("spreads a stamp between the vertices around it, weaker further away", () => {
    const { field, wear } = setup();
    wear.stamp(0.5, -2, 0.6);
    expect(at(field, 32, 30)).toBeGreaterThan(0);
    expect(at(field, 33, 30)).toBeCloseTo(at(field, 32, 30));
    expect(at(field, 32, 30)).toBeLessThan(0.6);
  });

  it("saturates at full wear", () => {
    const { field, wear } = setup();
    for (let k = 0; k < 5; k++) wear.stamp(3, 3, 0.5);
    expect(at(field, 35, 35)).toBe(1);
  });

  it("fades slowly and frees vertices once they are clean", () => {
    const { field, wear } = setup();
    wear.stamp(0, 0, 1);
    wear.update(0);
    const rect = wear.update(WEAR_FADE_SECONDS / 2);
    expect(at(field, 32, 32)).toBeCloseTo(0.5);
    expect(rect).toEqual({ i0: 32, j0: 32, i1: 32, j1: 32 });
    wear.update(WEAR_FADE_SECONDS);
    expect(at(field, 32, 32)).toBe(0);
    expect(wear.active).toBe(0);
  });

  it("fades on a slow clock, not every frame", () => {
    const { field, wear } = setup();
    wear.stamp(0, 0, 1);
    wear.update(0);
    expect(wear.update(1 / 60)).toBeNull();
    expect(at(field, 32, 32)).toBe(1);
  });

  it("drops the oldest marks first when the active budget is full", () => {
    const { field, wear } = setup(3);
    for (const x of [-2, -1, 0, 1]) wear.stamp(x, 0, 0.5);
    expect(wear.active).toBe(3);
    expect(at(field, 30, 32)).toBe(0);
    expect(at(field, 33, 32)).toBeCloseTo(0.5);
    expect(wear.update(0)).toEqual({ i0: 30, j0: 32, i1: 33, j1: 32 });
  });

  it("keeps at most 4,096 active vertices by default", () => {
    expect(MAX_WEAR_VERTICES).toBe(4096);
    const { wear } = setup();
    for (let j = 0; j < SIDE; j++) for (let i = 0; i < SIDE; i++) wear.stamp(i - 32, j - 32, 0.2);
    expect(wear.active).toBe(4096);
  });

  it("ignores stamps beyond the table edge", () => {
    const { wear } = setup();
    wear.stamp(1000, 0, 1);
    wear.stamp(-33.5, 0, 1);
    expect(wear.active).toBe(0);
  });

  it("clears every mark (terrain reset)", () => {
    const { field, wear } = setup();
    wear.stamp(0, 0, 1);
    wear.stamp(10, 10, 1);
    wear.update(0);
    expect(wear.clear()).toEqual({ i0: 32, j0: 32, i1: 42, j1: 42 });
    expect(wear.active).toBe(0);
    expect(field.every((v) => v === 0)).toBe(true);
  });
});
