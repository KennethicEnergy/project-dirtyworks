"use client";

import { createEmoteLimiter, EMOTES, MSG, type EmoteId } from "@dirtyworks/shared";
import { useEffect, useRef, useState } from "react";
import type { Action } from "@/game/input/controls";
import { useSession } from "@/state/sessionStore";
import { useTableUi } from "./TableUiContext";

const EMOTE_ACTIONS: Action[] = ["emote1", "emote2", "emote3", "emote4", "emote5"];

/**
 * Quick emotes: keys 1–5 (d-pad on a gamepad) or the 😊 button. Limited locally with the same
 * bucket the server uses, so a burst gets a friendly toast instead of silently vanishing.
 */
export function EmoteBar() {
  const { runtime, session } = useTableUi();
  const [open, setOpen] = useState(false);
  const send = useRef<(id: EmoteId) => void>(() => {});

  useEffect(() => {
    const limiter = createEmoteLimiter();
    send.current = (id) => {
      if (!session) return;
      if (!limiter.take()) {
        useSession.getState().pushToast("Easy there! One emote at a time.", "info");
        return;
      }
      session.send(MSG.emote, { id });
    };
  }, [session]);

  useEffect(
    () =>
      runtime.loop.register(
        "inputs",
        {
          name: "emotes",
          update() {
            if (!runtime.input.enabled) return;
            for (let i = 0; i < EMOTE_ACTIONS.length; i++) {
              if (runtime.input.pressed(EMOTE_ACTIONS[i]!)) send.current(EMOTES[i]!.id);
            }
          },
        },
        1,
      ),
    [runtime],
  );

  return (
    <div className="pointer-events-auto flex items-center gap-1.5">
      {open && (
        <ul className="flex gap-1 rounded-full bg-hud/85 p-1" aria-label="Emotes">
          {EMOTES.map((e) => (
            <li key={e.id}>
              <button
                type="button"
                aria-label={e.text}
                title={`${e.text} (${e.key})`}
                onClick={() => send.current(e.id)}
                className="relative flex h-9 w-9 items-center justify-center rounded-full text-lg hover:bg-cream-100/15"
              >
                {e.glyph}
                <span className="absolute -right-0.5 -bottom-0.5 rounded bg-safety px-1 font-mono text-[9px] leading-tight font-bold text-hud">
                  {e.key}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        aria-label="Emotes"
        aria-expanded={open}
        title="Emotes (1–5)"
        onClick={() => setOpen((o) => !o)}
        className={`flex h-10 w-10 items-center justify-center rounded-full text-xl ${open ? "bg-safety" : "bg-hud/80 hover:bg-hud"}`}
      >
        😊
      </button>
    </div>
  );
}
