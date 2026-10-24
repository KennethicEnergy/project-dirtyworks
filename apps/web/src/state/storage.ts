/**
 * localStorage that never throws (private windows, blocked storage) — persisted stores fall back
 * to in-memory defaults instead of breaking the app.
 */
import { createJSONStorage, type StateStorage } from "zustand/middleware";

const memory = new Map<string, string>();

const safe: StateStorage = {
  getItem(name) {
    try {
      return window.localStorage.getItem(name);
    } catch {
      return memory.get(name) ?? null;
    }
  },
  setItem(name, value) {
    try {
      window.localStorage.setItem(name, value);
    } catch {
      memory.set(name, value);
    }
  },
  removeItem(name) {
    try {
      window.localStorage.removeItem(name);
    } catch {
      memory.delete(name);
    }
  },
};

export const safeJSONStorage = createJSONStorage(() => safe);
