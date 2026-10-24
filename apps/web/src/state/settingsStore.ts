"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { safeJSONStorage } from "./storage";

export type Quality = "low" | "medium" | "high";

export interface QualityPreset {
  shadows: boolean;
  shadowMapSize: number;
  dprCap: number;
  particles: number;
  drawDistance: number;
  /** Terrain chunks beyond this distance use half-resolution geometry. */
  lodDistance: number;
}

export const QUALITY: Record<Quality, QualityPreset> = {
  low: {
    shadows: false,
    shadowMapSize: 512,
    dprCap: 1,
    particles: 150,
    drawDistance: 80,
    lodDistance: 40,
  },
  medium: {
    shadows: true,
    shadowMapSize: 1024,
    dprCap: 1.5,
    particles: 400,
    drawDistance: 140,
    lodDistance: 60,
  },
  high: {
    shadows: true,
    shadowMapSize: 2048,
    dprCap: 2,
    particles: 800,
    drawDistance: 220,
    lodDistance: 80,
  },
};

interface SettingsState {
  quality: Quality;
  tiltShift: boolean;
  /** 0..1 */
  volume: number;
  /** Mouse orbit sensitivity multiplier. */
  cameraSensitivity: number;
  set: (patch: Partial<Omit<SettingsState, "set">>) => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      quality: "medium",
      tiltShift: true,
      volume: 0.6,
      cameraSensitivity: 1,
      set: (patch) => set(patch),
    }),
    {
      name: "dirtyworks.settings",
      version: 1,
      storage: safeJSONStorage,
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<SettingsState>;
        const num = (v: unknown, lo: number, hi: number, d: number) =>
          typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d;
        return {
          ...current,
          quality: p.quality && p.quality in QUALITY ? p.quality : current.quality,
          tiltShift: typeof p.tiltShift === "boolean" ? p.tiltShift : current.tiltShift,
          volume: num(p.volume, 0, 1, current.volume),
          cameraSensitivity: num(p.cameraSensitivity, 0.25, 3, current.cameraSensitivity),
        };
      },
    },
  ),
);

export function qualityPreset(): QualityPreset {
  return QUALITY[useSettings.getState().quality];
}
