"use client";

import { useEffect } from "react";
import { BINDINGS, type Action } from "@/game/input/controls";
import { isTypingTarget } from "@/game/input/InputSystem";
import { useSession } from "@/state/sessionStore";
import { useUi } from "@/state/uiStore";

const codeAction = new Map<string, Action>();
for (const action of ["chat", "playerList", "garage", "photo", "perf"] as Action[]) {
  for (const code of BINDINGS[action]) codeAction.set(code, action);
}

/**
 * UI hotkeys from the shared controls map (Enter chat, Tab player list, G garage, P photo, F3 perf).
 * Driving keys are handled by the InputSystem inside the game loop.
 */
export function useTableHotkeys(extra?: (e: KeyboardEvent) => void): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const ui = useUi.getState();
      if (e.key === "Escape") {
        if (
          ui.chatOpen ||
          ui.playerListOpen ||
          ui.settingsOpen ||
          (ui.garageOpen && useSession.getState().spawn)
        ) {
          ui.set({
            chatOpen: false,
            playerListOpen: false,
            settingsOpen: false,
            garageOpen: false,
          });
        } else if (ui.photoMode) {
          ui.set({ photoMode: false });
        }
        return;
      }
      if (isTypingTarget(e.target) || e.repeat) return;
      const action = codeAction.get(e.code);
      switch (action) {
        case "chat":
          e.preventDefault();
          ui.set({ chatOpen: true });
          return;
        case "playerList":
          e.preventDefault();
          ui.set({ playerListOpen: !ui.playerListOpen });
          return;
        case "garage":
          if (useSession.getState().role === "driver") ui.set({ garageOpen: !ui.garageOpen });
          return;
        case "photo":
          ui.set({ photoMode: !ui.photoMode });
          return;
        case "perf":
          e.preventDefault();
          ui.set({ perfOpen: !ui.perfOpen });
          return;
      }
      extra?.(e);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [extra]);
}
