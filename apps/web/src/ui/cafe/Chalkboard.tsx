"use client";

import { MAPS, TABLE_RULE_LABELS, VIBE_LABELS, type Vibe } from "@dirtyworks/shared";
import type { LobbyStatus, TableRow } from "@/net/useLobby";

const VIBE_COLOR: Record<Vibe, string> = {
  chill: "text-sage",
  contest: "text-chalk-pink",
  beginners: "text-chalk-yellow",
};

function Players({ row }: { row: TableRow }) {
  const full = row.drivers >= row.maxPlayers;
  return (
    <span className={full ? "text-chalk-pink" : ""}>
      {row.drivers}/{row.maxPlayers}
      {row.spectators > 0 && <span className="text-chalk-dim"> +{row.spectators} 👀</span>}
    </span>
  );
}

export function Chalkboard({
  tables,
  status,
  error,
  ping,
  onPick,
  onCreate,
}: {
  tables: TableRow[];
  status: LobbyStatus;
  error: string;
  ping: number | null;
  onPick: (row: TableRow) => void;
  onCreate: () => void;
}) {
  return (
    <section
      aria-labelledby="chalkboard-title"
      className="wood-frame relative overflow-hidden bg-chalk-board"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_30%_20%,rgba(255,255,255,0.06),transparent_60%)]" />
      <div className="relative p-4 sm:p-6">
        <header className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="chalkboard-title" className="chalk-text text-2xl font-semibold sm:text-3xl">
            On the tables tonight
          </h2>
          <span className="chalk-text flex items-center gap-2 text-sm text-chalk-dim">
            <span
              className={`inline-block size-2 rounded-full ${status === "live" ? "bg-sage" : status === "error" ? "bg-brick-400" : "bg-chalk-yellow animate-pulse"}`}
            />
            {status === "live" ? "live" : status === "error" ? "offline" : "warming up…"}
            {ping !== null && <span>· {ping} ms</span>}
          </span>
        </header>

        {status === "error" && (
          <p className="chalk-text mb-4 rounded-lg border border-dashed border-chalk-dim/50 p-3 text-chalk-pink">
            {error || "Lost the line to the game server. Refresh to try again."}
          </p>
        )}

        <div className="chalk-text hidden grid-cols-[minmax(0,2.2fr)_1fr_1.3fr_0.8fr_0.6fr_1.2fr] gap-3 border-b border-dashed border-chalk-dim/40 pb-2 text-xs uppercase tracking-wider text-chalk-dim md:grid">
          <span>Table</span>
          <span>Vibe</span>
          <span>Diorama</span>
          <span>Players</span>
          <span>Ping</span>
          <span>Host</span>
        </div>

        {tables.length === 0 && status !== "error" ? (
          <div className="chalk-text py-10 text-center">
            <p className="text-xl">No tables yet.</p>
            <p className="mt-1 text-chalk-dim">Be the first to pull up a chair.</p>
            <button
              type="button"
              onClick={onCreate}
              className="mt-4 rounded-full border-2 border-dashed border-chalk px-5 py-2 text-lg hover:bg-chalk/10"
            >
              + Open a table
            </button>
          </div>
        ) : (
          <ul className="divide-y divide-dashed divide-chalk-dim/30">
            {tables.map((row) => (
              <li key={row.roomId}>
                <button
                  type="button"
                  onClick={() => onPick(row)}
                  className="chalk-text grid w-full grid-cols-2 gap-x-3 gap-y-1 py-3 text-left hover:bg-chalk/5 md:grid-cols-[minmax(0,2.2fr)_1fr_1.3fr_0.8fr_0.6fr_1.2fr] md:items-center"
                >
                  <span className="col-span-2 truncate text-lg md:col-span-1">
                    {row.locked && (
                      <span aria-label="Password required" title="Password required">
                        🔒{" "}
                      </span>
                    )}
                    {row.name}
                    <span className="ml-2 text-xs text-chalk-dim">
                      {TABLE_RULE_LABELS[row.rule]}
                    </span>
                  </span>
                  <span className={`text-sm ${VIBE_COLOR[row.vibe]}`}>{VIBE_LABELS[row.vibe]}</span>
                  <span className="text-sm text-chalk-dim md:text-chalk">
                    {MAPS[row.mapId]?.displayName ?? row.mapId}
                  </span>
                  <span className="text-sm">
                    <Players row={row} />
                  </span>
                  <span className="text-sm text-chalk-dim">
                    {ping !== null ? `${ping} ms` : "–"}
                  </span>
                  <span className="truncate text-sm text-chalk-dim">{row.hostName}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
