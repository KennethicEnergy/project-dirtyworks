"use client";

import { MSG, REPORT_REASONS, VEHICLES, type VehicleId } from "@dirtyworks/shared";
import { useState } from "react";
import { useProfile } from "@/state/profileStore";
import { useSession, type PlayerSummary } from "@/state/sessionStore";
import { useUi } from "@/state/uiStore";
import { Avatar } from "@/ui/common/Avatar";
import { useTableUi } from "./TableUiContext";

export const VEHICLE_ICON: Record<VehicleId, string> = {
  excavator: "⛏️",
  "dump-truck": "🚚",
  bulldozer: "🚜",
  "wheel-loader": "🪣",
};

function PlayerRow({ p, amHost }: { p: PlayerSummary; amHost: boolean }) {
  const { session } = useTableUi();
  const muted = useProfile((s) => s.muted.includes(p.userId));
  const toggleMute = useProfile((s) => s.toggleMute);
  const [reporting, setReporting] = useState(false);
  const [confirm, setConfirm] = useState<"kick" | "ban" | null>(null);
  const vehicle = p.vehicle in VEHICLES ? (p.vehicle as VehicleId) : null;

  return (
    <li className="flex flex-wrap items-center gap-2 py-2">
      <Avatar name={p.name} src={p.avatar} size={34} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">
          {p.name}
          {p.isMe && <span className="ml-1 text-xs text-coffee-500">(you)</span>}
          {p.isHost && (
            <span className="ml-2 rounded-full bg-safety px-2 py-0.5 text-xs font-bold text-hud">
              Host
            </span>
          )}
        </p>
        <p className="text-xs text-coffee-600">
          {p.role === "spectator"
            ? "👀 Spectating"
            : vehicle
              ? `${VEHICLE_ICON[vehicle]} ${VEHICLES[vehicle].displayName}`
              : "In the garage"}
          {" · "}
          {p.connected ? `${p.ping} ms` : "reconnecting…"}
        </p>
      </div>
      {!p.isMe && (
        <div className="flex flex-wrap gap-1 text-xs font-semibold">
          <button
            type="button"
            onClick={() => toggleMute(p.userId)}
            className="rounded-lg bg-cream-200 px-2 py-1 hover:bg-cream-300"
          >
            {muted ? "Unmute" : "Mute"}
          </button>
          <button
            type="button"
            onClick={() => setReporting((r) => !r)}
            className="rounded-lg bg-cream-200 px-2 py-1 hover:bg-cream-300"
          >
            Report
          </button>
          {amHost && (
            <>
              <button
                type="button"
                onClick={() => setConfirm("kick")}
                className="rounded-lg bg-brick-500/15 px-2 py-1 text-brick-600 hover:bg-brick-500/25"
              >
                Kick
              </button>
              <button
                type="button"
                onClick={() => setConfirm("ban")}
                className="rounded-lg bg-brick-500/15 px-2 py-1 text-brick-600 hover:bg-brick-500/25"
              >
                Ban
              </button>
            </>
          )}
        </div>
      )}
      {reporting && (
        <div className="flex w-full flex-wrap items-center gap-1 rounded-xl bg-cream-200 p-2 text-xs">
          <span className="mr-1 font-semibold">Report {p.name} for:</span>
          {REPORT_REASONS.map((reason) => (
            <button
              key={reason}
              type="button"
              onClick={() => {
                session?.send(MSG.report, { target: p.sessionId, reason });
                setReporting(false);
              }}
              className="rounded-lg bg-cream-50 px-2 py-1 capitalize hover:bg-white"
            >
              {reason}
            </button>
          ))}
        </div>
      )}
      {confirm && (
        <div className="flex w-full items-center justify-between gap-2 rounded-xl bg-brick-500/10 p-2 text-xs">
          <span>
            {confirm === "kick"
              ? `Kick ${p.name} from the table?`
              : `Ban ${p.name} for the rest of this session?`}
          </span>
          <span className="flex gap-1">
            <button type="button" onClick={() => setConfirm(null)} className="rounded-lg px-2 py-1">
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                session?.send(confirm === "kick" ? MSG.kick : MSG.ban, { target: p.sessionId });
                setConfirm(null);
              }}
              className="rounded-lg bg-brick-500 px-2 py-1 font-bold text-cream-50"
            >
              {confirm === "kick" ? "Kick" : "Ban"}
            </button>
          </span>
        </div>
      )}
    </li>
  );
}

/** Tab: everyone at the table, with mute/report for all and kick/ban for the host. */
export function PlayerList() {
  const open = useUi((s) => s.playerListOpen);
  const setUi = useUi((s) => s.set);
  const players = useSession((s) => s.players);
  const amHost = players.some((p) => p.isMe && p.isHost);
  if (!open) return null;
  const drivers = players.filter((p) => p.role === "driver").length;
  return (
    <section
      aria-label="Players at this table"
      className="pointer-events-auto absolute top-16 left-1/2 w-[calc(100%-1.5rem)] max-w-lg -translate-x-1/2 rounded-card bg-cream-100 p-4 text-coffee-900 shadow-card"
    >
      <header className="mb-1 flex items-center justify-between">
        <h2 className="text-lg font-bold">At the table</h2>
        <span className="text-sm text-coffee-500">
          {drivers} driving · {players.length - drivers} watching
        </span>
        <button
          type="button"
          aria-label="Close"
          onClick={() => setUi({ playerListOpen: false })}
          className="text-2xl leading-none text-coffee-500"
        >
          ×
        </button>
      </header>
      <ul className="max-h-[60vh] divide-y divide-coffee-400/20 overflow-y-auto">
        {players.map((p) => (
          <PlayerRow key={p.sessionId} p={p} amHost={amHost} />
        ))}
      </ul>
      <p className="mt-2 text-xs text-coffee-500">
        Muting only hides chat and emotes on your screen.
      </p>
    </section>
  );
}
