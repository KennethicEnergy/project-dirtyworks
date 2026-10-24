/** Identifier lists shared by table settings, maps and materials. */
export const MAP_IDS = [
  "backyard-sandbox",
  "mini-quarry",
  "construction-yard",
  "beach-dig-site",
] as const;
export type MapId = (typeof MAP_IDS)[number];

export const MATERIAL_IDS = ["sand", "gravel", "damp-dirt"] as const;
export type MaterialId = (typeof MATERIAL_IDS)[number];
