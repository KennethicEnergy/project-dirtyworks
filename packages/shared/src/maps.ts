/**
 * Table (map) definitions. The terrain is centered on the origin: vertex (i, j) sits at
 * x = i − cellsX/2, z = j − cellsZ/2, with 1 m cells. The tabletop surface is y = 0.
 */
import { MAP_IDS, type MapId, type MaterialId } from "./ids";
import type { Vec3 } from "./math";

export { MAP_IDS, type MapId };

export type PropKind =
  "cone" | "pallet" | "toy-house" | "tree" | "rock" | "barrier" | "shed" | "charging-station";

export interface PropSpec {
  kind: PropKind;
  x: number;
  z: number;
  yaw: number;
  scale: number;
}

export interface SpawnPoint {
  x: number;
  z: number;
  yaw: number;
}

export interface Mound {
  x: number;
  z: number;
  radius: number;
  height: number;
}

export type BaseTerrainSpec =
  | {
      kind: "quarry";
      seed: number;
      groundHeight: number;
      noiseAmp: number;
      /** Loose material above bedrock on gentle ground (m). Pit walls are bare rock. */
      looseDepth: number;
      pit: { x: number; z: number; radius: number; floorRadius: number; depth: number };
      ramp: { x0: number; z0: number; x1: number; z1: number; width: number };
      loading: { x: number; z: number; w: number; d: number };
      mounds: Mound[];
    }
  | {
      kind: "flat";
      seed: number;
      groundHeight: number;
      noiseAmp: number;
      looseDepth: number;
      mounds: Mound[];
    };

export interface LightingSpec {
  sunColor: number;
  sunIntensity: number;
  /** Direction toward the light (not normalized). */
  sunDir: Vec3;
  skyColor: number;
  groundColor: number;
  ambientIntensity: number;
  backdrop: number;
  fog: number;
}

export interface TableMap {
  id: MapId;
  displayName: string;
  tagline: string;
  cellsX: number;
  cellsZ: number;
  baseTerrain: BaseTerrainSpec;
  /** Highest allowed terrain height (m). */
  maxHeight: number;
  spawnPoints: SpawnPoint[];
  props: PropSpec[];
  ambience: { day: LightingSpec; night: LightingSpec; fogNear: number; fogFar: number };
  defaultMaterial: MaterialId;
  tabletop: {
    kind: "wood" | "concrete";
    color: number;
    rimColor: number;
    rimWidth: number;
    rimHeight: number;
  };
}

const DAY: LightingSpec = {
  sunColor: 0xffe2b8,
  sunIntensity: 2.4,
  sunDir: { x: -0.55, y: 1, z: 0.4 },
  skyColor: 0xfff1dd,
  groundColor: 0x6b5440,
  ambientIntensity: 0.7,
  backdrop: 0x3b2a20,
  fog: 0x4a362a,
};

const NIGHT: LightingSpec = {
  sunColor: 0xffb36b,
  sunIntensity: 1.3,
  sunDir: { x: 0.35, y: 1, z: -0.25 },
  skyColor: 0x8a93b8,
  groundColor: 0x2b2018,
  ambientIntensity: 0.35,
  backdrop: 0x1d1612,
  fog: 0x231a14,
};

const AMBIENCE = { day: DAY, night: NIGHT, fogNear: 140, fogFar: 460 };

/** Eight spawn points in a row across the table, facing +Z. */
function spawnRow(z: number, xs: number[]): SpawnPoint[] {
  return xs.map((x) => ({ x, z, yaw: 0 }));
}

const prop = (kind: PropKind, x: number, z: number, yaw = 0, scale = 1): PropSpec => ({
  kind,
  x,
  z,
  yaw,
  scale,
});

const RAMP_YAW = Math.atan2(-32, -16);

export const MAPS: Record<MapId, TableMap> = {
  "mini-quarry": {
    id: "mini-quarry",
    displayName: "Mini Quarry",
    tagline: "A pit, a ramp and more rocks than a geology club.",
    cellsX: 128,
    cellsZ: 128,
    baseTerrain: {
      kind: "quarry",
      seed: 7,
      groundHeight: 6,
      noiseAmp: 0.35,
      looseDepth: 2.5,
      pit: { x: -14, z: 6, radius: 34, floorRadius: 18, depth: 6 },
      ramp: { x0: 32, z0: 30, x1: 0, z1: 14, width: 7 },
      loading: { x: 36, z: -30, w: 30, d: 28 },
      mounds: [
        { x: 48, z: -42, radius: 6, height: 3 },
        { x: 22, z: -46, radius: 5, height: 2.5 },
      ],
    },
    maxHeight: 16,
    spawnPoints: [...spawnRow(-22, [26, 32, 38, 44]), ...spawnRow(-36, [26, 32, 38, 44])],
    props: [
      prop("rock", -47.8, -6.3, 0.3, 1.8),
      prop("rock", -37.1, 33.6, 1.2, 1.5),
      prop("rock", -26.3, -27.8, 2.1, 2),
      prop("rock", -1.7, 39.8, 0.7, 1.4),
      prop("rock", 4, -25.2, 1.9, 1.6),
      prop("rock", -20, 0, 0.2, 1.1),
      prop("rock", -8, 12, 2.6, 0.9),
      prop("barrier", 27.6, 22.8, RAMP_YAW),
      prop("barrier", 23.6, 30.8, RAMP_YAW),
      prop("barrier", 18, 18, RAMP_YAW),
      prop("barrier", 14, 26, RAMP_YAW),
      prop("barrier", 8.4, 13.2, RAMP_YAW),
      prop("barrier", 4.4, 21.2, RAMP_YAW),
      prop("shed", 55, -6, Math.PI / 2),
      prop("shed", 56, 12, Math.PI / 2),
      prop("cone", 22, -14),
      prop("cone", 50, -14),
      prop("cone", 22, -46),
      prop("pallet", 54, -50, 0.4),
      prop("pallet", 57, -47, 0.1),
      prop("tree", -56, -56, 0, 1.3),
      prop("tree", -56, 56, 0, 1.1),
      prop("tree", 56, 56, 0, 1.4),
      prop("charging-station", 55, -26, -Math.PI / 2),
    ],
    ambience: AMBIENCE,
    defaultMaterial: "gravel",
    tabletop: { kind: "wood", color: 0x8a5a36, rimColor: 0x6e4428, rimWidth: 3, rimHeight: 6.6 },
  },
  "backyard-sandbox": {
    id: "backyard-sandbox",
    displayName: "Backyard Sandbox",
    tagline: "Where every great operator got their start.",
    cellsX: 96,
    cellsZ: 96,
    baseTerrain: {
      kind: "flat",
      seed: 11,
      groundHeight: 2,
      noiseAmp: 0.25,
      looseDepth: 2,
      mounds: [
        { x: -20, z: 15, radius: 8, height: 1.6 },
        { x: 18, z: -16, radius: 6, height: 1.2 },
        { x: 25, z: 22, radius: 5, height: 2 },
      ],
    },
    maxHeight: 10,
    spawnPoints: spawnRow(-5, [-21, -15, -9, -3, 3, 9, 15, 21]),
    props: [
      prop("toy-house", -36, 34, 0.4, 1.2),
      prop("toy-house", 38, -36, -0.6),
      prop("tree", -40, -38, 0, 1.2),
      prop("tree", 40, 40, 0, 1.4),
      prop("tree", -42, 10),
      prop("cone", 0, -30),
      prop("cone", 4, -30),
      prop("cone", 8, -30),
      prop("pallet", 30, 0, 0.3),
      prop("rock", -10, -12, 0.5, 0.8),
      prop("charging-station", -32, -32, Math.PI / 4),
    ],
    ambience: AMBIENCE,
    defaultMaterial: "sand",
    tabletop: { kind: "wood", color: 0x9a6a42, rimColor: 0x7b4f2e, rimWidth: 3, rimHeight: 2.6 },
  },
  "construction-yard": {
    id: "construction-yard",
    displayName: "Construction Yard",
    tagline: "Hard hats on. Coffee optional (but encouraged).",
    cellsX: 96,
    cellsZ: 96,
    baseTerrain: {
      kind: "flat",
      seed: 23,
      groundHeight: 2,
      noiseAmp: 0.15,
      looseDepth: 2,
      mounds: [
        { x: -25, z: -20, radius: 7, height: 2.2 },
        { x: 20, z: 25, radius: 6, height: 1.5 },
      ],
    },
    maxHeight: 10,
    spawnPoints: spawnRow(-5, [-21, -15, -9, -3, 3, 9, 15, 21]),
    props: [
      prop("shed", -35, 35),
      prop("shed", -20, 38, 0.1),
      prop("barrier", -9, 12, Math.PI / 2),
      prop("barrier", -3, 12, Math.PI / 2),
      prop("barrier", 3, 12, Math.PI / 2),
      prop("barrier", 9, 12, Math.PI / 2),
      prop("pallet", 30, -30),
      prop("pallet", 33, -30, 0.2),
      prop("pallet", 36, -30, -0.1),
      prop("cone", -40, -40),
      prop("cone", -36, -40),
      prop("charging-station", 38, 38, Math.PI),
    ],
    ambience: AMBIENCE,
    defaultMaterial: "damp-dirt",
    tabletop: {
      kind: "concrete",
      color: 0x8d8a84,
      rimColor: 0x6c6964,
      rimWidth: 3,
      rimHeight: 2.6,
    },
  },
  "beach-dig-site": {
    id: "beach-dig-site",
    displayName: "Beach Dig Site",
    tagline: "Sandcastles, but with hydraulics.",
    cellsX: 96,
    cellsZ: 96,
    baseTerrain: {
      kind: "flat",
      seed: 37,
      groundHeight: 2.2,
      noiseAmp: 0.4,
      looseDepth: 2.2,
      mounds: [
        { x: -30, z: 25, radius: 10, height: 2.5 },
        { x: 28, z: 30, radius: 9, height: 2 },
        { x: 0, z: -35, radius: 8, height: 1.8 },
      ],
    },
    maxHeight: 10,
    spawnPoints: spawnRow(0, [-21, -15, -9, -3, 3, 9, 15, 21]),
    props: [
      prop("tree", -40, 40, 0, 1.5),
      prop("tree", 40, -40, 0, 1.3),
      prop("tree", -38, -10, 0, 1.2),
      prop("rock", 20, 10, 0.6, 1.2),
      prop("rock", 24, 12, 1.4, 0.8),
      prop("toy-house", 38, 20, -Math.PI / 2),
      prop("cone", -8, -20),
      prop("cone", 8, -20),
      prop("charging-station", -36, -36, Math.PI / 4),
    ],
    ambience: AMBIENCE,
    defaultMaterial: "sand",
    tabletop: { kind: "wood", color: 0xa47548, rimColor: 0x84592f, rimWidth: 3, rimHeight: 2.8 },
  },
};

export interface Bounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  minY: number;
  maxY: number;
}

export function mapBounds(map: TableMap): Bounds {
  const hx = map.cellsX / 2;
  const hz = map.cellsZ / 2;
  return { minX: -hx, maxX: hx, minZ: -hz, maxZ: hz, minY: -2, maxY: map.maxHeight + 40 };
}

/** Half extents of the rim walkway rectangle the operators stand on. */
function rimExtents(map: TableMap): { hx: number; hz: number; perimeter: number } {
  const hx = map.cellsX / 2 + map.tabletop.rimWidth / 2;
  const hz = map.cellsZ / 2 + map.tabletop.rimWidth / 2;
  return { hx, hz, perimeter: 4 * (hx + hz) };
}

/**
 * Point on the table rim for a perimeter parameter `edgeT` in [0, 1): starts at the (−x, −z)
 * corner and runs along −z, +x, +z, −x sides.
 */
export function rimPoint(map: TableMap, edgeT: number, out: Vec3): Vec3 {
  const { hx, hz, perimeter } = rimExtents(map);
  let s = (edgeT - Math.floor(edgeT)) * perimeter;
  out.y = map.tabletop.rimHeight;
  if (s < 2 * hx) {
    out.x = -hx + s;
    out.z = -hz;
    return out;
  }
  s -= 2 * hx;
  if (s < 2 * hz) {
    out.x = hx;
    out.z = -hz + s;
    return out;
  }
  s -= 2 * hz;
  if (s < 2 * hx) {
    out.x = hx - s;
    out.z = hz;
    return out;
  }
  s -= 2 * hx;
  out.x = -hx;
  out.z = hz - s;
  return out;
}

/** Perimeter parameter of the rim point closest to (x, z). */
export function nearestEdgeT(map: TableMap, x: number, z: number): number {
  const { hx, hz, perimeter } = rimExtents(map);
  const cx = Math.min(hx, Math.max(-hx, x));
  const cz = Math.min(hz, Math.max(-hz, z));
  // Distance to each side (clamped onto the rectangle) and the perimeter offset of that point.
  let bestD = Math.hypot(x - cx, z + hz);
  let bestS = cx + hx;
  const dEast = Math.hypot(x - hx, z - cz);
  if (dEast < bestD) {
    bestD = dEast;
    bestS = 2 * hx + (cz + hz);
  }
  const dNorth = Math.hypot(x - cx, z - hz);
  if (dNorth < bestD) {
    bestD = dNorth;
    bestS = 2 * hx + 2 * hz + (hx - cx);
  }
  const dWest = Math.hypot(x + hx, z - cz);
  if (dWest < bestD) bestS = 4 * hx + 2 * hz + (hz - cz);
  const t = bestS / perimeter;
  return t >= 1 ? t - 1 : t;
}
