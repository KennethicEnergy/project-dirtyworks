"use client";

import {
  MAPS,
  MATERIALS,
  type MapId,
  type MaterialId,
  type TableSettingsInput,
} from "@dirtyworks/shared";
import { useEffect, useState } from "react";
import {
  forgetSavedTable,
  keptForLabel,
  listSavedTables,
  reopenSettings,
  type SavedTable,
} from "@/net/savedTables";
import { Button } from "@/ui/common/Button";

/**
 * Tables the host kept for later (7 days). Reopen starts a fresh table with the saved terrain;
 * only the owner sees and reopens their own. Hidden while there are none.
 */
export function SavedTables({
  busy,
  onReopen,
}: {
  busy: boolean;
  onReopen: (settings: TableSettingsInput) => void;
}) {
  const [tables, setTables] = useState<SavedTable[]>([]);
  const [now, setNow] = useState(0);

  useEffect(() => {
    let live = true;
    listSavedTables()
      .then((list) => {
        if (!live) return;
        setNow(Date.now());
        setTables(list.sort((a, b) => b.savedAt - a.savedAt));
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  async function forget(t: SavedTable) {
    if (await forgetSavedTable(t.tableId).catch(() => false)) {
      setTables((list) => list.filter((x) => x.tableId !== t.tableId));
    }
  }

  if (tables.length === 0) return null;

  return (
    <section
      aria-label="Your saved tables"
      className="rounded-card bg-cream-100 p-4 text-coffee-900 shadow-card"
    >
      <p className="text-xs font-bold tracking-widest text-brick-500 uppercase">
        Your saved tables
      </p>
      <ul className="mt-2 grid gap-2">
        {tables.map((t) => {
          const settings = reopenSettings(t);
          const map = MAPS[t.mapId as MapId]?.displayName ?? t.mapId;
          const material = MATERIALS[t.materialId as MaterialId]?.displayName;
          return (
            <li
              key={t.tableId}
              className="flex items-center justify-between gap-2 rounded-xl bg-cream-200 py-2 pr-2 pl-3"
            >
              <div className="min-w-0">
                <p className="truncate font-semibold">{t.name}</p>
                <p className="truncate text-xs text-coffee-600">
                  {[map, material, keptForLabel(t.expiresAt, now)].filter(Boolean).join(" · ")}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  size="sm"
                  disabled={busy || !settings}
                  onClick={() => settings && onReopen(settings)}
                >
                  Reopen
                </Button>
                <button
                  type="button"
                  aria-label={`Forget ${t.name}`}
                  title="Forget this table"
                  onClick={() => void forget(t)}
                  className="rounded-lg px-2 py-1 text-coffee-500 hover:bg-cream-300 hover:text-coffee-800"
                >
                  ✕
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
