"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useHud } from "@/state/hudStore";
import { useSession } from "@/state/sessionStore";
import { useUi } from "@/state/uiStore";
import { Avatar } from "@/ui/common/Avatar";
import { ChatPanel } from "./ChatPanel";
import { Garage } from "./Garage";
import { PlayerList } from "./PlayerList";
import { SettingsDialog } from "./SettingsDialog";
import { TableMenu } from "./TableMenu";
import { useTableUi } from "./TableUiContext";
import { Toasts } from "./Toasts";
import { ToolHints } from "./ToolHints";
import { useTableHotkeys } from "./useTableHotkeys";

function VehicleCard() {
  const speed = useHud((s) => s.speedKmh);
  const vehicle = useHud((s) => s.vehicle);
  const battery = useHud((s) => s.battery);
  if (!vehicle) return null;
  const pct = Math.round(battery * 100);
  return (
    <div className="hazard-border w-40 rounded-lg bg-hud/85 px-3 py-2">
      <p className="text-[10px] tracking-widest text-safety uppercase">{vehicle}</p>
      <p className="font-mono text-3xl font-bold text-safety tabular-nums">
        {speed}
        <span className="ml-1 text-sm text-cream-200">km/h</span>
      </p>
      <div className="mt-1 flex items-center gap-2 text-[10px] text-cream-200" title="Battery">
        <span>🔋</span>
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-cream-100/20">
          <div
            className={`h-full rounded-full ${pct > 20 ? "bg-safety" : "bg-brick-400"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="w-7 text-right tabular-nums">{pct}%</span>
      </div>
    </div>
  );
}

function TopRight() {
  const players = useSession((s) => s.players);
  const setUi = useUi((s) => s.set);
  const me = players.find((p) => p.isMe);
  return (
    <div className="pointer-events-auto flex items-center gap-2">
      <button
        type="button"
        onClick={() => setUi({ playerListOpen: !useUi.getState().playerListOpen })}
        className="flex items-center gap-1 rounded-full bg-hud/80 py-1 pr-3 pl-1 hover:bg-hud"
        title="Players (Tab)"
      >
        <span className="flex -space-x-2">
          {players.slice(0, 4).map((p) => (
            <Avatar key={p.sessionId} name={p.name} src={p.avatar} size={26} />
          ))}
        </span>
        <span className="ml-1 text-sm font-semibold">{players.length}</span>
      </button>
      {me && (
        <span
          className="hidden rounded-full bg-hud/80 px-3 py-1.5 font-mono text-xs sm:inline"
          title="Ping"
        >
          {me.ping} ms
        </span>
      )}
      <button
        type="button"
        aria-label="Settings"
        onClick={() => setUi({ settingsOpen: true })}
        className="rounded-full bg-hud/80 px-3 py-1.5 hover:bg-hud"
      >
        ⚙️
      </button>
      <Link
        href="/cafe"
        className="rounded-full bg-hud/80 px-3 py-1.5 text-sm font-semibold hover:bg-hud"
      >
        Leave
      </Link>
    </div>
  );
}

/** In-table HUD: safety-yellow on charcoal, readable over any terrain. */
export function Hud() {
  const { runtime } = useTableUi();
  const status = useSession((s) => s.status);
  const chatOpen = useUi((s) => s.chatOpen);
  const garageOpen = useUi((s) => s.garageOpen);
  const settingsOpen = useUi((s) => s.settingsOpen);
  const spawn = useSession((s) => s.spawn);
  const role = useSession((s) => s.role);
  useTableHotkeys();

  // Driving input pauses while typing or browsing menus.
  const inGarage = garageOpen || (role === "driver" && !spawn);
  useEffect(() => {
    runtime.input.enabled = !(chatOpen || inGarage || settingsOpen);
  }, [runtime, chatOpen, inGarage, settingsOpen]);

  return (
    <div className="pointer-events-none absolute inset-0 text-cream-50 select-none">
      <div className="flex items-start justify-between gap-2 p-3">
        <TableMenu />
        <TopRight />
      </div>
      <div className="absolute top-3 left-1/2 w-full max-w-md -translate-x-1/2 px-3">
        {status === "reconnecting" && (
          <p className="mx-auto mb-1 w-fit rounded-full bg-brick-500 px-4 py-1 text-sm">
            Controller lost signal. Reconnecting…
          </p>
        )}
        <Toasts />
      </div>
      <div className="absolute bottom-3 left-3 flex flex-col gap-2">
        <ChatPanel />
        <VehicleCard />
      </div>
      <div className="absolute right-48 bottom-3 left-56 hidden justify-center lg:flex">
        <ToolHints />
      </div>
      <PlayerList />
      <SettingsDialog />
      <Garage />
    </div>
  );
}
