"use client";

import { create } from "zustand";

/** Fast-changing HUD numbers, written at ~10 Hz by the HudFeed system (never per frame). */
interface HudState {
  speedKmh: number;
  battery: number;
  /** Parked on a charging pad. */
  charging: boolean;
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
  charging: false,
  vehicle: "",
  vehicleId: "",
  loadFraction: 0,
  movedM3: 0,
  ping: 0,
  set: (patch) => set(patch),
}));

/** What the RC transmitter overlay shows, written at 15 Hz by the HudFeed system. */
interface TransmitterState {
  /** Left stick: steer (x, right +) and throttle (y, forward +). */
  lx: number;
  ly: number;
  /** Right stick: tool axes 3 (x) and 1 (y). */
  rx: number;
  ry: number;
  /** Rocker switches: tool axes 0 and 2. */
  r0: number;
  r2: number;
  horn: boolean;
  brake: boolean;
  device: "keyboard" | "gamepad" | "touch";
  set: (patch: Partial<Omit<TransmitterState, "set">>) => void;
}

export const useTransmitter = create<TransmitterState>((set) => ({
  lx: 0,
  ly: 0,
  rx: 0,
  ry: 0,
  r0: 0,
  r2: 0,
  horn: false,
  brake: false,
  device: "keyboard",
  set: (patch) => set(patch),
}));
