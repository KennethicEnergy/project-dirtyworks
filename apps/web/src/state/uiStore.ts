"use client";

import { create } from "zustand";

export type CameraMode = "operator" | "chase" | "free";

/** Overlay and HUD visibility (not persisted). */
interface UiState {
  cameraMode: CameraMode;
  garageOpen: boolean;
  chatOpen: boolean;
  playerListOpen: boolean;
  settingsOpen: boolean;
  photoMode: boolean;
  perfOpen: boolean;
  set: (patch: Partial<Omit<UiState, "set">>) => void;
}

export const useUi = create<UiState>((set) => ({
  cameraMode: "operator",
  garageOpen: false,
  chatOpen: false,
  playerListOpen: false,
  settingsOpen: false,
  photoMode: false,
  perfOpen: false,
  set: (patch) => set(patch),
}));
