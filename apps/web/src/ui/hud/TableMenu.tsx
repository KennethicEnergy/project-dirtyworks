"use client";

import { MSG } from "@dirtyworks/shared";
import { useState } from "react";
import { useSession } from "@/state/sessionStore";
import { ChallengeBanner } from "@/ui/cafe/ChallengeBanner";
import { useTableUi } from "./TableUiContext";

const ROW =
  "rounded-xl bg-cream-200 px-3 py-2 text-left text-sm font-semibold hover:bg-cream-300 aria-pressed:bg-sage/40";

function Confirm({
  question,
  keep,
  go,
  onCancel,
  onConfirm,
}: {
  question: string;
  keep: string;
  go: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="rounded-xl bg-brick-500/10 p-2 text-sm">
      <p className="mb-2">{question}</p>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="px-2 py-1">
          {keep}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className="rounded-lg bg-brick-500 px-3 py-1 font-bold text-cream-50"
        >
          {go}
        </button>
      </div>
    </div>
  );
}

/**
 * Table name, invite code and today's challenge for everyone; day/night, keep for later,
 * smoothing the terrain and closing the table for the host.
 */
export function TableMenu() {
  const { session } = useTableUi();
  const tableName = useSession((s) => s.tableName);
  const inviteCode = useSession((s) => s.inviteCode);
  const dayNight = useSession((s) => s.dayNight);
  const kept = useSession((s) => s.keepForLater);
  const amHost = useSession((s) => s.players.some((p) => p.isMe && p.isHost));
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirm, setConfirm] = useState<"reset" | "close" | null>(null);

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
        <p className="max-w-[11rem] truncate font-semibold sm:max-w-xs">
          {kept && <span title="Kept for later">📌 </span>}
          {tableName}
        </p>
      </button>
      {open && (
        <div className="absolute top-full left-0 z-10 mt-2 grid max-h-[calc(100dvh-6rem)] w-72 gap-3 overflow-y-auto rounded-2xl bg-cream-100 p-3 text-coffee-900 shadow-card">
          <div>
            <p className="text-xs font-bold tracking-widest text-coffee-500 uppercase">
              Invite code
            </p>
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-2xl tracking-[0.25em]">{inviteCode}</span>
              <button
                type="button"
                onClick={copy}
                className="rounded-lg bg-cream-200 px-2 py-1 text-xs font-semibold"
              >
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
          </div>
          {amHost ? (
            <div className="grid gap-2">
              <button
                type="button"
                onClick={() =>
                  session?.send(MSG.setDayNight, { mode: dayNight === "day" ? "night" : "day" })
                }
                className={ROW}
              >
                {dayNight === "day" ? "🌙 Dim the lights" : "☀️ Lights up"}
              </button>
              <button
                type="button"
                aria-pressed={kept}
                onClick={() => session?.send(MSG.setKeepForLater, { keep: !kept })}
                className={ROW}
              >
                📌 {kept ? "Kept for later (7 days)" : "Keep this table for later"}
                <span className="block text-xs font-normal text-coffee-600">
                  {kept
                    ? "Reopen it from the cafe. Tap to stop keeping it."
                    : "Saves the terrain so you can reopen it from the cafe."}
                </span>
              </button>
              {confirm === "reset" ? (
                <Confirm
                  question="Smooth the whole table back to the start for everyone?"
                  keep="Keep it"
                  go="Smooth it"
                  onCancel={() => setConfirm(null)}
                  onConfirm={() => {
                    session?.send(MSG.terrainReset);
                    setConfirm(null);
                  }}
                />
              ) : (
                <button type="button" onClick={() => setConfirm("reset")} className={ROW}>
                  🧹 Smooth the table
                </button>
              )}
              {confirm === "close" ? (
                <Confirm
                  question="Close the table for everyone?"
                  keep="Keep digging"
                  go="Close it"
                  onCancel={() => setConfirm(null)}
                  onConfirm={() => session?.send(MSG.closeTable)}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirm("close")}
                  className="rounded-xl bg-brick-500/15 px-3 py-2 text-left text-sm font-semibold text-brick-600 hover:bg-brick-500/25"
                >
                  Close the table
                </button>
              )}
            </div>
          ) : (
            <p className="text-xs text-coffee-500">
              Share the code so friends can pull up a chair.
              {kept && " The host is keeping this table for later."}
            </p>
          )}
          <ChallengeBanner compact />
        </div>
      )}
    </div>
  );
}
