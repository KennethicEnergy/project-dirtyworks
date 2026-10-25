"use client";

import { useState } from "react";
import { useLobby } from "@/net/useLobby";
import { Button } from "@/ui/common/Button";
import { Dialog } from "@/ui/common/Dialog";

/** Friendly turn-taking prompt when every driver seat is taken. */
export function TableFullDialog({
  open,
  tableName,
  waiting,
  seatOpen,
  onClose,
  onSpectate,
  onWait,
  onJoin,
}: {
  open: boolean;
  tableName: string;
  waiting: boolean;
  seatOpen: boolean;
  onClose: () => void;
  onSpectate: () => void;
  onWait: () => void;
  onJoin: () => void;
}) {
  return (
    <Dialog open={open} onClose={onClose} title="Table is full">
      <p className="mb-4 text-coffee-700">
        Every driver seat at <strong>{tableName}</strong> is taken. Grab a coffee and watch, or wait
        for a seat to open up.
      </p>
      {seatOpen ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-sage/25 p-3">
          <span className="font-semibold text-coffee-800">A seat just opened up!</span>
          <Button onClick={onJoin}>Take the seat</Button>
        </div>
      ) : (
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={onWait} disabled={waiting}>
            {waiting ? "Waiting for a seat…" : "Wait for a seat"}
          </Button>
          <Button onClick={onSpectate}>Spectate</Button>
        </div>
      )}
    </Dialog>
  );
}

/**
 * The table page version, for invite links and reloads that land on a full table: spectate
 * (rejoins with ?as=spectator), wait (watches the lobby listing for a free seat), or go back.
 */
export function TableFullPrompt({
  roomId,
  onSpectate,
  onRetry,
  onClose,
}: {
  roomId: string;
  onSpectate: () => void;
  onRetry: () => void;
  onClose: () => void;
}) {
  const lobby = useLobby();
  const [waiting, setWaiting] = useState(false);
  const row = lobby.tables.find((t) => t.roomId === roomId);
  const seatOpen = waiting && !!row && row.drivers < row.maxPlayers;
  return (
    <TableFullDialog
      open
      tableName={row?.name ?? "this table"}
      waiting={waiting}
      seatOpen={seatOpen}
      onClose={onClose}
      onWait={() => setWaiting(true)}
      onSpectate={onSpectate}
      onJoin={onRetry}
    />
  );
}
