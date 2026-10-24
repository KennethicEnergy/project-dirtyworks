"use client";

import type { GameUser, VehicleId } from "@dirtyworks/shared";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { GameRuntime } from "@/game/runtime";
import { friendlyError } from "@/net/errors";
import { acquireTable, releaseTable, type TableSession } from "@/net/tableSession";
import { useProfile } from "@/state/profileStore";
import { useSession } from "@/state/sessionStore";
import { buttonClass } from "@/ui/common/Button";
import { Hud } from "@/ui/hud/Hud";

const Game = dynamic(() => import("@/game/Game"), {
  ssr: false,
  loading: () => <TableMessage title="Setting up the table…" />,
});

function TableMessage({
  title,
  body,
  action = true,
}: {
  title: string;
  body?: string;
  action?: boolean;
}) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-coffee-900 px-4">
      <div className="max-w-md rounded-card bg-cream-100 p-6 text-center text-coffee-900 shadow-card">
        <h1 className="text-xl font-bold">{title}</h1>
        {body && <p className="mt-2 text-coffee-600">{body}</p>}
        {action && (
          <Link href="/cafe" className={buttonClass("primary", "md", "mt-4")}>
            Back to the cafe
          </Link>
        )}
      </div>
    </div>
  );
}

export function TableClient({
  roomId,
  user,
  spectator,
}: {
  roomId: string;
  user: GameUser;
  spectator: boolean;
}) {
  const sessionRef = useRef<TableSession | null>(null);
  const [session, setSession] = useState<TableSession | null>(null);
  const [joinError, setJoinError] = useState("");
  const status = useSession((s) => s.status);
  const role = useSession((s) => s.role);
  const mapId = useSession((s) => s.mapId);
  const materialId = useSession((s) => s.materialId);
  const spawn = useSession((s) => s.spawn);
  const spawnSeq = useSession((s) => s.spawnSeq);
  const closedReason = useSession((s) => s.closedReason);
  const livery = useProfile((s) => s.livery);

  useEffect(() => {
    let cancelled = false;
    acquireTable(roomId, spectator ? "spectator" : "driver")
      .then((s) => {
        if (cancelled) return;
        sessionRef.current = s;
        setSession(s);
      })
      .catch((err) => !cancelled && setJoinError(friendlyError(err)));
    return () => {
      cancelled = true;
      sessionRef.current = null;
      releaseTable(roomId);
    };
  }, [roomId, spectator]);

  // Until the garage lands, drivers start in a dump truck.
  const requested = useRef(false);
  useEffect(() => {
    if (
      status === "joined" &&
      role === "driver" &&
      !spawn &&
      !requested.current &&
      sessionRef.current
    ) {
      requested.current = true;
      sessionRef.current.spawn("dump-truck", livery);
    }
  }, [status, role, spawn, livery]);

  const runtime = useMemo(
    () => (mapId && materialId ? new GameRuntime(mapId, materialId) : null),
    [mapId, materialId],
  );

  // Development-only handle for end-to-end scripts (never shipped in production builds).
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    const w = window as unknown as { __dirtyworks?: unknown };
    w.__dirtyworks = {
      runtime,
      spawn: (vehicle: VehicleId) =>
        sessionRef.current?.spawn(vehicle, useProfile.getState().livery),
    };
    return () => {
      delete w.__dirtyworks;
    };
  }, [runtime]);

  if (joinError) return <TableMessage title="Couldn't sit down" body={joinError} />;
  if (status === "closed") return <TableMessage title="Table closed" body={closedReason} />;
  if (!runtime) return <TableMessage title="Pulling up a chair…" action={false} />;

  return (
    <div className="fixed inset-0 overflow-hidden bg-coffee-950">
      <Game runtime={runtime} session={session} spawn={spawn} spawnSeq={spawnSeq} livery={livery} />
      <Hud user={user} />
    </div>
  );
}
