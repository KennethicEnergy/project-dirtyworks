import { describe, expect, it } from "vitest";
import { MAP_IDS, MAPS } from "../src/maps";
import {
  applyBrush,
  CHUNK_VERTS,
  createTerrainForMap,
  relaxRepose,
  Terrain,
  toQ,
  type Brush,
} from "../src/terrain";

/** A flat 64 × 64 m test table: 1 m of loose material over bedrock at 0.5 m, max 10 m. */
function flat(heightM = 1.5, bedrockM = 0.5): Terrain {
  const t = new Terrain(64, 64, 10);
  for (let j = 0; j < t.vertsZ; j++) {
    for (let i = 0; i < t.vertsX; i++) {
      t.setBedrockQ(i, j, toQ(bedrockM));
      t.setQ(i, j, toQ(heightM));
    }
  }
  return t;
}

const dig = (
  x: number,
  z: number,
  radius: number,
  depthM: number,
  extra: Partial<Brush> = {},
): Brush => ({
  x,
  z,
  radius,
  falloff: 0.6,
  mode: "dig",
  depthQ: toQ(depthM),
  ...extra,
});

/** Largest height difference between 4-neighbours inside [i0..i1]×[j0..j1]. */
function maxNeighbourDiff(t: Terrain, i0: number, j0: number, i1: number, j1: number): number {
  let max = 0;
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      if (i < i1) max = Math.max(max, Math.abs(t.getQ(i, j) - t.getQ(i + 1, j)));
      if (j < j1) max = Math.max(max, Math.abs(t.getQ(i, j) - t.getQ(i, j + 1)));
    }
  }
  return max;
}

describe("Terrain grid", () => {
  it("splits the table into 33 × 33-vertex chunks", () => {
    const t = new Terrain(96, 128, 10);
    expect(t.chunksX).toBe(3);
    expect(t.chunksZ).toBe(4);
    expect(t.chunks).toHaveLength(12);
    expect(t.chunks[0]!.heights).toHaveLength(CHUNK_VERTS * CHUNK_VERTS);
  });

  it("stores heights as exact multiples of 1/1024 m", () => {
    const t = flat();
    t.setQ(5, 5, 1234);
    expect(t.getQ(5, 5)).toBe(1234);
    expect(t.heightAt(5 - 32, 5 - 32)).toBe(1234 / 1024);
  });

  it("keeps shared border vertices identical in every chunk that holds them", () => {
    const t = flat();
    applyBrush(t, dig(0, 0, 3, 0.4)); // world origin = vertex (32, 32), a four-chunk corner
    for (const chunk of t.chunks) {
      for (let lj = 0; lj < CHUNK_VERTS; lj++) {
        for (let li = 0; li < CHUNK_VERTS; li++) {
          const q = Math.round(chunk.heights[lj * CHUNK_VERTS + li]! * 1024);
          expect(q).toBe(t.getQ(chunk.cx * 32 + li, chunk.cz * 32 + lj));
        }
      }
    }
  });

  it("bumps the version of every chunk an edit touches, and only those", () => {
    const t = flat();
    const before = t.chunks.map((c) => c.version);
    applyBrush(t, dig(-20, -20, 2, 0.3));
    const changed = t.chunks.filter((c, i) => c.version !== before[i]).map((c) => [c.cx, c.cz]);
    expect(changed).toEqual([[0, 0]]);
    expect(t.chunks[0]!.dirty).toBe(true);
  });

  it("interpolates heights bilinearly between vertices", () => {
    const t = flat(1);
    t.setQ(32, 32, toQ(3));
    expect(t.heightAt(0, 0)).toBeCloseTo(3);
    expect(t.heightAt(0.5, 0)).toBeCloseTo(2);
    expect(t.heightAt(0.5, 0.5)).toBeCloseTo(1.5);
  });

  it("hashes equal terrains equally and different terrains differently", () => {
    const a = flat();
    const b = flat();
    expect(a.hash()).toBe(b.hash());
    b.setQ(10, 10, b.getQ(10, 10) + 1);
    expect(a.hash()).not.toBe(b.hash());
  });
});

describe("applyBrush", () => {
  it("dig returns exactly the quanta it removed", () => {
    const t = flat();
    const before = t.sumQ();
    const res = applyBrush(t, dig(0, 0, 2.5, 0.3));
    expect(res.changedQ).toBeGreaterThan(0);
    expect(before - t.sumQ()).toBe(res.changedQ);
  });

  it("dig never goes below bedrock", () => {
    const t = flat(1.5, 1.4);
    const before = t.sumQ();
    const res = applyBrush(t, dig(0, 0, 2, 5));
    expect(t.getQ(32, 32)).toBe(toQ(1.4));
    expect(before - t.sumQ()).toBe(res.changedQ);
  });

  it("dig stops once the bucket limit is reached", () => {
    const t = flat();
    const res = applyBrush(t, dig(0, 0, 3, 0.5, { limitQ: 700 }));
    expect(res.changedQ).toBe(700);
  });

  it("fill adds exactly the requested volume on open ground", () => {
    const t = flat();
    const before = t.sumQ();
    const res = applyBrush(t, {
      x: 3.3,
      z: -7.6,
      radius: 2.2,
      falloff: 0.8,
      mode: "fill",
      volumeQ: 5000,
    });
    expect(res.changedQ).toBe(5000);
    expect(t.sumQ() - before).toBe(5000);
  });

  it("fill never exceeds the maximum height", () => {
    const t = flat(9.9, 0.5);
    const res = applyBrush(t, {
      x: 0,
      z: 0,
      radius: 1.5,
      falloff: 0.5,
      mode: "fill",
      volumeQ: 100_000,
    });
    expect(res.changedQ).toBeLessThan(100_000);
    for (let j = 28; j <= 36; j++)
      for (let i = 28; i <= 36; i++) expect(t.getQ(i, j)).toBeLessThanOrEqual(toQ(10));
  });

  it("flatten never adds net material and reports the surplus it scraped", () => {
    const t = flat(1.5);
    applyBrush(t, { x: 0, z: 0, radius: 2, falloff: 0, mode: "fill", volumeQ: 20_000 });
    const before = t.sumQ();
    const res = applyBrush(t, {
      x: 0,
      z: 0,
      radius: 3,
      falloff: 0,
      mode: "flatten",
      targetQ: toQ(1.5),
    });
    expect(res.changedQ).toBeGreaterThanOrEqual(0);
    expect(before - t.sumQ()).toBe(res.changedQ);
    expect(t.getQ(32, 32)).toBe(toQ(1.5));
  });

  it("reports the rectangle of vertices it changed", () => {
    const t = flat();
    const res = applyBrush(t, dig(0, 0, 2, 0.3));
    expect(res.rect).not.toBeNull();
    expect(res.rect!.i0).toBeGreaterThanOrEqual(30);
    expect(res.rect!.i1).toBeLessThanOrEqual(34);
  });

  it("does nothing outside the table", () => {
    const t = flat();
    const before = t.hash();
    expect(applyBrush(t, dig(500, 500, 2, 0.3))).toEqual({ changedQ: 0, rect: null });
    expect(t.hash()).toBe(before);
  });
});

describe("angle of repose", () => {
  it("relaxes a tall spike until no neighbour step exceeds the limit, conserving volume", () => {
    const t = flat(1.5, 0);
    t.setQ(32, 32, toQ(6));
    const before = t.sumQ();
    const rect = { i0: 32, j0: 32, i1: 32, j1: 32 };
    const moved = relaxRepose(t, rect, 591, 64);
    expect(moved).toBeGreaterThan(0);
    expect(t.sumQ()).toBe(before);
    expect(maxNeighbourDiff(t, 24, 24, 40, 40)).toBeLessThanOrEqual(592);
  });

  it("does not wear away rock (material at bedrock stays put)", () => {
    const t = flat(1, 1);
    t.setBedrockQ(32, 32, toQ(4));
    t.setQ(32, 32, toQ(4));
    const moved = relaxRepose(t, { i0: 32, j0: 32, i1: 32, j1: 32 }, 591);
    expect(moved).toBe(0);
    expect(t.getQ(32, 32)).toBe(toQ(4));
  });

  it("only moves the loose layer of a partly rocky vertex", () => {
    const t = flat(1, 1);
    t.setBedrockQ(32, 32, toQ(3));
    t.setQ(32, 32, toQ(4));
    relaxRepose(t, { i0: 32, j0: 32, i1: 32, j1: 32 }, 591, 64);
    expect(t.getQ(32, 32)).toBeGreaterThanOrEqual(toQ(3));
  });
});

describe("base terrain", () => {
  it.each(MAP_IDS)("generates %s identically every time", (id) => {
    expect(createTerrainForMap(MAPS[id]).hash()).toBe(createTerrainForMap(MAPS[id]).hash());
  });

  it("digs a quarry pit below the rim with a drivable ramp into it", () => {
    const map = MAPS["mini-quarry"];
    const t = createTerrainForMap(map);
    const spec = map.baseTerrain;
    if (spec.kind !== "quarry") throw new Error("expected quarry");
    const rim = t.heightAt(spec.pit.x + spec.pit.radius + 4, spec.pit.z);
    const floor = t.heightAt(spec.pit.x, spec.pit.z);
    expect(rim - floor).toBeGreaterThan(3.5);
    // Walk down the ramp: every metre the slope stays gentle (< 25°).
    const { x0, z0, x1, z1 } = spec.ramp;
    const len = Math.hypot(x1 - x0, z1 - z0);
    let prev = t.heightAt(x0, z0);
    for (let s = 1; s <= Math.floor(len); s++) {
      const h = t.heightAt(x0 + ((x1 - x0) * s) / len, z0 + ((z1 - z0) * s) / len);
      expect(Math.abs(h - prev)).toBeLessThan(Math.tan((25 * Math.PI) / 180));
      prev = h;
    }
  });

  it("keeps the loading area flat", () => {
    const map = MAPS["mini-quarry"];
    const t = createTerrainForMap(map);
    if (map.baseTerrain.kind !== "quarry") throw new Error("expected quarry");
    const { x, z } = map.baseTerrain.loading;
    expect(t.heightAt(x - 5, z)).toBeCloseTo(t.heightAt(x + 5, z + 3), 2);
  });

  it("never puts the surface below bedrock or bedrock below the tabletop", () => {
    for (const id of MAP_IDS) {
      const t = createTerrainForMap(MAPS[id]);
      for (let j = 0; j < t.vertsZ; j += 3) {
        for (let i = 0; i < t.vertsX; i += 3) {
          expect(t.getQ(i, j)).toBeGreaterThanOrEqual(t.bedrockQ(i, j));
          expect(t.bedrockQ(i, j)).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });
});
