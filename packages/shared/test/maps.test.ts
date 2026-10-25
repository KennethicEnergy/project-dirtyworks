import { describe, expect, it } from "vitest";
import { CHUNK_CELLS } from "../src/constants";
import {
  MAP_IDS,
  MAPS,
  mapBounds,
  nearestEdgeT,
  rimExtents,
  rimPoint,
  walkEdgeT,
} from "../src/maps";
import { MATERIALS, MATERIAL_IDS } from "../src/materials";
import { vec3 } from "../src/math";

describe("table maps", () => {
  it("defines all four tables", () => {
    expect(Object.keys(MAPS).sort()).toEqual([...MAP_IDS].sort());
  });

  it.each(MAP_IDS)("%s has a chunk-aligned size", (id) => {
    const map = MAPS[id];
    expect(map.cellsX % CHUNK_CELLS).toBe(0);
    expect(map.cellsZ % CHUNK_CELLS).toBe(0);
  });

  it.each(MAP_IDS)("%s keeps spawn points and props on the table", (id) => {
    const map = MAPS[id];
    const b = mapBounds(map);
    expect(map.spawnPoints.length).toBeGreaterThanOrEqual(8);
    for (const p of [...map.spawnPoints, ...map.props]) {
      expect(p.x).toBeGreaterThan(b.minX);
      expect(p.x).toBeLessThan(b.maxX);
      expect(p.z).toBeGreaterThan(b.minZ);
      expect(p.z).toBeLessThan(b.maxZ);
    }
  });

  it.each(MAP_IDS)("%s has exactly one charging station", (id) => {
    expect(MAPS[id].props.filter((p) => p.kind === "charging-station")).toHaveLength(1);
  });

  it("builds the Mini Quarry from the quarry generator and the rest from flat ground", () => {
    expect(MAPS["mini-quarry"].baseTerrain.kind).toBe("quarry");
    for (const id of ["backyard-sandbox", "construction-yard", "beach-dig-site"] as const) {
      expect(MAPS[id].baseTerrain.kind).toBe("flat");
    }
  });

  it("uses a known material for every table", () => {
    for (const id of MAP_IDS) expect(MATERIAL_IDS).toContain(MAPS[id].defaultMaterial);
  });
});

describe("table rim", () => {
  const map = MAPS["mini-quarry"];

  it("closes the loop: t=0 and t=1 are the same point", () => {
    const a = rimPoint(map, 0, vec3());
    const b = rimPoint(map, 1, vec3());
    expect(a.x).toBeCloseTo(b.x);
    expect(a.z).toBeCloseTo(b.z);
  });

  it("walks the rim outside the terrain", () => {
    const b = mapBounds(map);
    for (const t of [0.1, 0.3, 0.6, 0.9]) {
      const p = rimPoint(map, t, vec3());
      const outside = p.x <= b.minX || p.x >= b.maxX || p.z <= b.minZ || p.z >= b.maxZ;
      expect(outside, `t=${t}`).toBe(true);
    }
  });

  it.each([0.05, 0.2, 0.4, 0.55, 0.7, 0.95])("finds t=%s back from its rim point", (t) => {
    const p = rimPoint(map, t, vec3());
    expect(nearestEdgeT(map, p.x, p.z)).toBeCloseTo(t, 5);
  });

  it("maps a point near the middle of the east side to that side", () => {
    const t = nearestEdgeT(map, 60, 0);
    const p = rimPoint(map, t, vec3());
    expect(p.x).toBeGreaterThan(60);
    expect(p.z).toBeCloseTo(0);
  });
});

describe("operator walking the rim", () => {
  const map = MAPS["mini-quarry"];
  const { perimeter } = rimExtents(map);

  it("moves toward the target by at most the given distance", () => {
    const t = walkEdgeT(map, 0.2, 0.4, 10);
    expect(t).toBeCloseTo(0.2 + 10 / perimeter, 6);
  });

  it("stops exactly on the target when it is close enough", () => {
    expect(walkEdgeT(map, 0.2, 0.2001, 10)).toBe(0.2001);
  });

  it("takes the short way round across t = 0", () => {
    const t = walkEdgeT(map, 0.98, 0.02, 5);
    expect(t).toBeCloseTo(0.98 + 5 / perimeter, 6);
    const back = walkEdgeT(map, 0.02, 0.98, 5);
    expect(back).toBeCloseTo(0.02 - 5 / perimeter, 6);
  });

  it("always stays in [0, 1)", () => {
    expect(walkEdgeT(map, 0.999, 0.01, 50)).toBeLessThan(1);
    expect(walkEdgeT(map, 0.001, 0.99, 50)).toBeGreaterThanOrEqual(0);
    expect(walkEdgeT(map, 0.999, 0.01, 50)).toBeCloseTo(0.01, 6);
  });
});

describe("materials", () => {
  it("orders repose limits sand < gravel < damp dirt", () => {
    expect(MATERIALS.sand.reposeQ).toBeLessThan(MATERIALS.gravel.reposeQ);
    expect(MATERIALS.gravel.reposeQ).toBeLessThan(MATERIALS["damp-dirt"].reposeQ);
  });

  it("stores repose limits as integer height quanta matching the angle", () => {
    for (const id of MATERIAL_IDS) {
      const m = MATERIALS[id];
      expect(Number.isInteger(m.reposeQ)).toBe(true);
      expect(m.reposeQ / 1024).toBeCloseTo(Math.tan((m.reposeDeg * Math.PI) / 180), 2);
    }
  });
});
