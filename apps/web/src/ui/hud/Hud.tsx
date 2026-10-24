"use client";

import type { GameUser } from "@dirtyworks/shared";
import Link from "next/link";
import { useHud } from "@/state/hudStore";
import { useSession } from "@/state/sessionStore";

/** In-table HUD. Safety-yellow on charcoal, readable over any terrain. */
export function Hud({ user: _user }: { user: GameUser }) {
  const speed = useHud((s) => s.speedKmh);
  const vehicle = useHud((s) => s.vehicle);
  const tableName = useSession((s) => s.tableName);
  const status = useSession((s) => s.status);

  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-3 text-cream-50">
      <div className="flex items-start justify-between gap-2">
        <div className="pointer-events-auto rounded-2xl bg-hud/80 px-3 py-2">
          <p className="text-xs tracking-widest text-safety uppercase">Table</p>
          <p className="font-semibold">{tableName}</p>
        </div>
        <Link
          href="/cafe"
          className="pointer-events-auto rounded-full bg-hud/80 px-4 py-2 text-sm font-semibold hover:bg-hud"
        >
          Back to the cafe
        </Link>
      </div>
      {status === "reconnecting" && (
        <p className="mx-auto rounded-full bg-brick-500 px-4 py-1 text-sm">Reconnecting…</p>
      )}
      <div className="flex items-end justify-between">
        <div className="hazard-border rounded-lg bg-hud/85 px-4 py-2">
          <p className="text-xs tracking-widest text-safety uppercase">{vehicle || "No vehicle"}</p>
          <p className="font-mono text-3xl font-bold text-safety tabular-nums">
            {speed}
            <span className="ml-1 text-sm text-cream-200">km/h</span>
          </p>
        </div>
      </div>
    </div>
  );
}
