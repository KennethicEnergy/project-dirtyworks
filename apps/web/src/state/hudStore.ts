"use client";

import { create } from "zustand";

/** Fast-changing HUD numbers, written at ~10 Hz by the HudFeed system (never per frame). */
interface HudState {
  speedKmh: number;
  battery: number;
  vehicle: string;
  vehicleId: string;
  /** Carried material 0..1 of the local vehicle's capacity. */
  loadFraction: number;
  /** Total volume this player has moved, m³. */
  movedM3: number;
  ping: number;
  set: (patch: Partial<Omit<HudState, "set">>) => void;
}

export const useHud = create<HudState>((set) => ({
  speedKmh: 0,
  battery: 1,
  vehicle: "",
  vehicleId: "",
  loadFraction: 0,
  movedM3: 0,
  ping: 0,
  set: (patch) => set(patch),
}));
