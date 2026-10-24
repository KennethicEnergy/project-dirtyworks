"use client";

import { CHAT_MAX_LEN, MSG, RATES, TokenBucket } from "@dirtyworks/shared";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useProfile } from "@/state/profileStore";
import { useSession } from "@/state/sessionStore";
import { useUi } from "@/state/uiStore";
import { useTableUi } from "./TableUiContext";

const VISIBLE = 6;

/** Chat log (always visible, fades) plus the input that Enter opens. */
export function ChatPanel() {
  const { session } = useTableUi();
  const chat = useSession((s) => s.chat);
  const players = useSession((s) => s.players);
  const muted = useProfile((s) => s.muted);
  const open = useUi((s) => s.chatOpen);
  const setUi = useUi((s) => s.set);
  const [text, setText] = useState("");
  const [hint, setHint] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const limiter = useMemo(() => new TokenBucket(RATES.chat.capacity, RATES.chat.refillPerSec), []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const mutedSessions = useMemo(() => {
    const set = new Set<string>();
    for (const p of players) if (muted.includes(p.userId)) set.add(p.sessionId);
    return set;
  }, [players, muted]);

  const visible = chat.filter((m) => !mutedSessions.has(m.sessionId)).slice(open ? -14 : -VISIBLE);

  function submit(e: FormEvent) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) {
      setUi({ chatOpen: false });
      return;
    }
    if (!limiter.take()) {
      setHint("Easy there. One message at a time.");
      return;
    }
    session?.send(MSG.chat, { text: trimmed });
    setText("");
    setHint("");
    setUi({ chatOpen: false });
  }

  return (
    <div className="pointer-events-none flex w-full max-w-sm flex-col gap-1">
      <ul aria-live="polite" className="flex flex-col gap-0.5 text-sm">
        {visible.map((m, i) => (
          <li
            key={m.id}
            className={`w-fit max-w-full rounded-lg bg-hud/70 px-2 py-0.5 break-words text-cream-100 transition-opacity ${!open && i < visible.length - 3 ? "opacity-60" : ""}`}
          >
            <span className="font-semibold text-safety">{m.name}:</span> {m.text}
          </li>
        ))}
      </ul>
      {open ? (
        <form onSubmit={submit} className="pointer-events-auto flex gap-1">
          <input
            ref={inputRef}
            value={text}
            maxLength={CHAT_MAX_LEN}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setUi({ chatOpen: false });
            }}
            onBlur={() => !text && setUi({ chatOpen: false })}
            aria-label="Chat message"
            placeholder="Say something nice about that pile…"
            className="min-w-0 flex-1 rounded-xl border-2 border-safety/60 bg-hud/90 px-3 py-1.5 text-cream-50 placeholder:text-cream-300/60 focus:outline-none"
          />
        </form>
      ) : (
        <p className="text-xs text-cream-200/70">Press Enter to chat</p>
      )}
      {hint && <p className="text-xs text-brick-400">{hint}</p>}
    </div>
  );
}
