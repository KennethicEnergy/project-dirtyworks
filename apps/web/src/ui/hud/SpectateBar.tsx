"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cycleSpectate, keepSpectate } from "@/game/camera/spectate";
import { useSession } from "@/state/sessionStore";
import { Avatar } from "@/ui/common/Avatar";
import { buttonClass } from "@/ui/common/Button";
import { useTableUi } from "./TableUiContext";

/**
 * Spectators' bar in place of the transmitter: who you are watching, ←/→ (LB/RB) or the arrow
 * buttons to switch drivers, and "Try for a seat" (rejoins as a driver; a full table offers to
 * wait). Owns `runtime.spectateId`, which the camera follows.
 */
export function SpectateBar() {
  const { runtime } = useTableUi();
  const players = useSession((s) => s.players);
  const roomId = useSession((s) => s.roomId);
  const [watching, setWatching] = useState<string | null>(null);

  const drivers = useMemo(
    () => players.filter((p) => p.role === "driver" && p.vehicle && !p.isMe),
    [players],
  );
  const key = drivers.map((p) => p.sessionId).join(",");
  const ids = useRef<string[]>([]);

  useEffect(() => {
    ids.current = key ? key.split(",") : [];
    const next = keepSpectate(ids.current, runtime.spectateId);
    runtime.spectateId = next;
    setWatching(next);
  }, [runtime, key]);

  useEffect(() => () => void (runtime.spectateId = null), [runtime]);

  const cycle = useCallback(
    (dir: 1 | -1) => {
      const next = cycleSpectate(ids.current, runtime.spectateId, dir);
      runtime.spectateId = next;
      setWatching(next);
    },
    [runtime],
  );

  useEffect(
    () =>
      runtime.loop.register(
        "inputs",
        {
          name: "spectate",
          update() {
            if (!runtime.input.enabled) return;
            if (runtime.input.pressed("specPrev")) cycle(-1);
            else if (runtime.input.pressed("specNext")) cycle(1);
          },
        },
        1,
      ),
    [runtime, cycle],
  );

  const target = drivers.find((p) => p.sessionId === watching);
  const arrow =
    "flex h-9 w-9 items-center justify-center rounded-full bg-cream-100/10 text-lg font-bold hover:bg-cream-100/20 disabled:opacity-40";

  return (
    <div
      role="group"
      aria-label="Spectating"
      className="pointer-events-auto flex items-center gap-2 rounded-full bg-hud/85 py-1.5 pr-1.5 pl-2 shadow-[0_6px_16px_rgb(0_0_0/0.35)]"
    >
      <button
        type="button"
        aria-label="Previous driver"
        title="Previous driver (←)"
        className={arrow}
        disabled={drivers.length < 2}
        onClick={() => cycle(-1)}
      >
        ‹
      </button>
      <div className="flex min-w-36 items-center gap-2" aria-live="polite">
        {target ? (
          <>
            <Avatar name={target.name} src={target.avatar} size={28} />
            <span className="leading-tight">
              <span className="block text-[10px] tracking-widest text-safety uppercase">
                Watching
              </span>
              <span className="block max-w-36 truncate text-sm font-semibold">{target.name}</span>
            </span>
          </>
        ) : (
          <span className="px-1 text-sm text-cream-200">Nobody is driving yet.</span>
        )}
      </div>
      <button
        type="button"
        aria-label="Next driver"
        title="Next driver (→)"
        className={arrow}
        disabled={drivers.length < 2}
        onClick={() => cycle(1)}
      >
        ›
      </button>
      <Link href={`/table/${roomId}`} className={buttonClass("safety", "sm", "rounded-full")}>
        Try for a seat
      </Link>
    </div>
  );
}
