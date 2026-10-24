"use client";

import { MSG } from "@dirtyworks/shared";
import { useState } from "react";
import { useSession } from "@/state/sessionStore";
import { useTableUi } from "./TableUiContext";

/** Table name + invite code for everyone; day/night and closing the table for the host. */
export function TableMenu() {
  const { session } = useTableUi();
  const tableName = useSession((s) => s.tableName);
  const inviteCode = useSession((s) => s.inviteCode);
  const dayNight = useSession((s) => s.dayNight);
  const amHost = useSession((s) => s.players.some((p) => p.isMe && p.isHost));
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(inviteCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="pointer-events-auto relative">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="rounded-2xl bg-hud/80 px-3 py-2 text-left hover:bg-hud"
      >
        <p className="text-[10px] tracking-widest text-safety uppercase">
          Table {amHost && "· you're hosting"}
        </p>
        <p className="max-w-[11rem] truncate font-semibold sm:max-w-xs">{tableName}</p>
      </button>
      {open && (
        <div className="absolute top-full left-0 z-10 mt-2 w-64 rounded-2xl bg-cream-100 p-3 text-coffee-900 shadow-card">
          <p className="text-xs font-bold tracking-widest text-coffee-500 uppercase">Invite code</p>
          <div className="mb-3 flex items-center justify-between gap-2">
            <span className="font-mono text-2xl tracking-[0.25em]">{inviteCode}</span>
            <button
              type="button"
              onClick={copy}
              className="rounded-lg bg-cream-200 px-2 py-1 text-xs font-semibold"
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
          {amHost ? (
            <div className="grid gap-2">
              <button
                type="button"
                onClick={() =>
                  session?.send(MSG.setDayNight, { mode: dayNight === "day" ? "night" : "day" })
                }
                className="rounded-xl bg-cream-200 px-3 py-2 text-left text-sm font-semibold hover:bg-cream-300"
              >
                {dayNight === "day" ? "🌙 Dim the lights" : "☀️ Lights up"}
              </button>
              {confirmClose ? (
                <div className="rounded-xl bg-brick-500/10 p-2 text-sm">
                  <p className="mb-2">Close the table for everyone?</p>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setConfirmClose(false)}
                      className="px-2 py-1"
                    >
                      Keep digging
                    </button>
                    <button
                      type="button"
                      onClick={() => session?.send(MSG.closeTable)}
                      className="rounded-lg bg-brick-500 px-3 py-1 font-bold text-cream-50"
                    >
                      Close it
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmClose(true)}
                  className="rounded-xl bg-brick-500/15 px-3 py-2 text-left text-sm font-semibold text-brick-600 hover:bg-brick-500/25"
                >
                  Close the table
                </button>
              )}
            </div>
          ) : (
            <p className="text-xs text-coffee-500">
              Share the code so friends can pull up a chair.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
