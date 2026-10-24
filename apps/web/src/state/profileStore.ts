"use client";

import { DEFAULT_LIVERY, liverySchema, type Livery } from "@dirtyworks/shared";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { safeJSONStorage } from "./storage";

export const RADIO_CHANNELS = [
  { name: "Gravel FM", tagline: "Classic rock. Literally." },
  { name: "Smooth Diesel 88.1", tagline: "Low revs, high vibes." },
  { name: "Lo-fi Backhoe Beats", tagline: "Beats to dig and relax to." },
] as const;

interface ProfileState {
  livery: Livery;
  /** User ids whose chat and emotes are hidden on this device. */
  muted: string[];
  /** `${dateKey}:${challengeId}` entries the player ticked off. */
  challengeDone: string[];
  radio: { on: boolean; channel: number };
  setLivery: (livery: Livery) => void;
  toggleMute: (userId: string) => void;
  setChallengeDone: (key: string, done: boolean) => void;
  setRadio: (radio: { on: boolean; channel: number }) => void;
}

export const useProfile = create<ProfileState>()(
  persist(
    (set) => ({
      livery: DEFAULT_LIVERY,
      muted: [],
      challengeDone: [],
      radio: { on: false, channel: 0 },
      setLivery: (livery) => set({ livery: liverySchema.parse(livery) }),
      toggleMute: (userId) =>
        set((s) => ({
          muted: s.muted.includes(userId)
            ? s.muted.filter((id) => id !== userId)
            : [...s.muted, userId],
        })),
      setChallengeDone: (key, done) =>
        set((s) => ({
          challengeDone: done
            ? Array.from(new Set([...s.challengeDone, key])).slice(-60)
            : s.challengeDone.filter((k) => k !== key),
        })),
      setRadio: (radio) => set({ radio }),
    }),
    {
      name: "dirtyworks.profile",
      version: 1,
      storage: safeJSONStorage,
      // Stored data is untrusted: fall back to defaults for anything that no longer validates.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<ProfileState>;
        const livery = liverySchema.safeParse(p.livery);
        return {
          ...current,
          livery: livery.success ? livery.data : DEFAULT_LIVERY,
          muted: Array.isArray(p.muted) ? p.muted.filter((x) => typeof x === "string") : [],
          challengeDone: Array.isArray(p.challengeDone)
            ? p.challengeDone.filter((x) => typeof x === "string")
            : [],
          radio:
            p.radio && typeof p.radio.on === "boolean" && Number.isInteger(p.radio.channel)
              ? { on: p.radio.on, channel: Math.abs(p.radio.channel) % RADIO_CHANNELS.length }
              : current.radio,
        };
      },
    },
  ),
);
