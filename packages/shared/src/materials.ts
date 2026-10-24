/** Terrain material presets. Each table picks one; it drives colors, particles and slope relaxation. */
import { MATERIAL_IDS, type MaterialId } from "./ids";

export { MATERIAL_IDS, type MaterialId };

export interface MaterialPreset {
  id: MaterialId;
  displayName: string;
  /** Angle of repose in degrees (informational; the simulation uses `reposeQ`). */
  reposeDeg: number;
  /**
   * Max height difference between neighbouring 1 m cells, in 1/1024 m quanta: round(tan(angle) × 1024).
   * Precomputed so the deterministic terrain code never calls trig functions.
   */
  reposeQ: number;
  /** Blend colors by slope/height: steep → rock, mid → dirt, flat/high → sand. */
  colors: { rock: number; dirt: number; sand: number };
  /** Freshly dug ground tint. */
  fresh: number;
  particleColor: number;
  /** Multiplier on dig depth per op; soft material digs faster. */
  softness: number;
}

export const MATERIALS: Record<MaterialId, MaterialPreset> = {
  sand: {
    id: "sand",
    displayName: "Sand",
    reposeDeg: 30,
    reposeQ: 591,
    colors: { rock: 0x8b8178, dirt: 0xc9a26b, sand: 0xe6cf9c },
    fresh: 0xb08b56,
    particleColor: 0xe1c896,
    softness: 1.2,
  },
  gravel: {
    id: "gravel",
    displayName: "Gravel",
    reposeDeg: 38,
    reposeQ: 800,
    colors: { rock: 0x6d6a66, dirt: 0x8c8170, sand: 0xa9a196 },
    fresh: 0x6f675c,
    particleColor: 0x9a948a,
    softness: 0.8,
  },
  "damp-dirt": {
    id: "damp-dirt",
    displayName: "Damp dirt",
    reposeDeg: 45,
    reposeQ: 1024,
    colors: { rock: 0x5e5850, dirt: 0x5b4330, sand: 0x7a5a3e },
    fresh: 0x3f2d20,
    particleColor: 0x5a4231,
    softness: 1,
  },
};
