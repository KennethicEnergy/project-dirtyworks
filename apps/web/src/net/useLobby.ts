"use client";

import type { Room } from "@colyseus/sdk";
import type { TableListing } from "@dirtyworks/shared";
import { useEffect, useState } from "react";
import { friendlyError } from "./errors";
import { getGameClient } from "./gameClient";
import { LOBBY_ROOM, TABLE_ROOM } from "./tables";

export interface TableRow extends TableListing {
  roomId: string;
}

interface RoomListing {
  roomId: string;
  name: string;
  metadata?: TableListing;
}

export type LobbyStatus = "connecting" | "live" | "error";

function toRow(listing: RoomListing): TableRow | null {
  if (listing.name !== TABLE_ROOM || !listing.metadata) return null;
  return { ...listing.metadata, roomId: listing.roomId };
}

const PING_EVERY_MS = 10_000;

/** Live chalkboard data: the Colyseus lobby's realtime listing plus a ping to the server. */
export function useLobby(): {
  tables: TableRow[];
  status: LobbyStatus;
  error: string;
  ping: number | null;
} {
  const [tables, setTables] = useState<TableRow[]>([]);
  const [status, setStatus] = useState<LobbyStatus>("connecting");
  const [error, setError] = useState("");
  const [ping, setPing] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    let room: Room | null = null;

    const upsert = (row: TableRow) =>
      setTables((prev) => {
        const i = prev.findIndex((t) => t.roomId === row.roomId);
        if (i === -1) return [...prev, row];
        const next = prev.slice();
        next[i] = row;
        return next;
      });

    getGameClient()
      .then((client) => client.joinOrCreate(LOBBY_ROOM))
      .then((joined) => {
        if (cancelled) {
          void joined.leave();
          return;
        }
        room = joined;
        setStatus("live");
        joined.onMessage("rooms", (list: RoomListing[]) =>
          setTables(list.map(toRow).filter((r): r is TableRow => r !== null)),
        );
        joined.onMessage("+", ([, listing]: [string, RoomListing]) => {
          const row = toRow(listing);
          if (row) upsert(row);
        });
        joined.onMessage("-", (roomId: string) =>
          setTables((prev) => prev.filter((t) => t.roomId !== roomId)),
        );
        joined.onLeave(() => !cancelled && setStatus("error"));
      })
      .catch((err) => {
        if (cancelled) return;
        setStatus("error");
        setError(friendlyError(err));
      });

    const measure = () =>
      getGameClient()
        .then((c) => c.getLatency())
        .then((ms) => !cancelled && setPing(Math.round(ms)))
        .catch(() => !cancelled && setPing(null));
    void measure();
    const timer = window.setInterval(measure, PING_EVERY_MS);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      if (room) void room.leave();
    };
  }, []);

  return { tables, status, error, ping };
}
