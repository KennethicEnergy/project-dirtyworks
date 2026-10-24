/** Vehicle paint jobs. Only these colors and decals exist; everything else is rejected. */
import { z } from "zod";

export const LIVERY_COLORS = {
  "safety-yellow": { name: "Safety yellow", hex: "#F5C518" },
  "brick-red": { name: "Brick red", hex: "#B5452F" },
  "cafe-cream": { name: "Cafe cream", hex: "#F2E6CF" },
  "forest-green": { name: "Forest green", hex: "#3F6B48" },
  "sky-blue": { name: "Sky blue", hex: "#4F86C6" },
  tangerine: { name: "Tangerine", hex: "#E9822E" },
  charcoal: { name: "Charcoal", hex: "#3A3A3A" },
  bubblegum: { name: "Bubblegum", hex: "#E58FB5" },
} as const;
export type LiveryColor = keyof typeof LIVERY_COLORS;
export const LIVERY_COLOR_IDS = Object.keys(LIVERY_COLORS) as [LiveryColor, ...LiveryColor[]];

export const DECALS = ["none", "stripes", "number", "checker"] as const;
export type Decal = (typeof DECALS)[number];

export const liverySchema = z.object({
  color: z.enum(LIVERY_COLOR_IDS),
  decal: z.enum(DECALS),
  number: z.number().int().min(0).max(99),
});
export type Livery = z.output<typeof liverySchema>;

export const DEFAULT_LIVERY: Livery = { color: "safety-yellow", decal: "stripes", number: 7 };
