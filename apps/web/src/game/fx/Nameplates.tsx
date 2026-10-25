"use client";

import { LIVERY_COLORS, VEHICLES, type LiveryColor } from "@dirtyworks/shared";
import { useEffect, useRef } from "react";
import type { TableSession } from "@/net/tableSession";
import { useSession } from "@/state/sessionStore";
import { useUi } from "@/state/uiStore";
import { useRuntime } from "../runtime";
import { nameplateOpacity, placeElement, projectToScreen, type ScreenPoint } from "./overlay";

/** Plates float this far above the top of the chassis (m). */
const ABOVE_CHASSIS = 2.2;

interface SyncedColors {
  players?: { get(id: string): { color: string } | undefined };
}

/**
 * Billboarded name tags above other drivers' vehicles, fading out with distance. Positioned by
 * the `visuals` phase from the interpolated remote poses; hidden in photo mode.
 */
export function Nameplates({ session }: { session: TableSession }) {
  const rt = useRuntime();
  const players = useSession((s) => s.players);
  const photo = useUi((s) => s.photoMode);
  const plates = useRef(new Map<string, HTMLDivElement>());

  useEffect(() => {
    const pt: ScreenPoint = { x: 0, y: 0, distance: 0 };
    return rt.loop.register("visuals", {
      name: "nameplates",
      update() {
        const three = rt.three;
        if (!three) return;
        const { camera, gl } = three;
        const w = gl.domElement.clientWidth;
        const h = gl.domElement.clientHeight;
        const state = session.room.state as SyncedColors;
        for (const [id, el] of plates.current) {
          const r = rt.remotes?.get(id);
          if (!r || !r.visible) {
            placeElement(el, null);
            continue;
          }
          const top = r.pose.y + VEHICLES[r.vehicle].chassis.size.y + ABOVE_CHASSIS;
          const ok = projectToScreen(camera, r.pose.x, top, r.pose.z, w, h, pt);
          placeElement(el, ok ? pt : null, ok ? nameplateOpacity(pt.distance) : 0);
          const color = state.players?.get(id)?.color as LiveryColor | undefined;
          const hex = (color && LIVERY_COLORS[color]?.hex) || "#F5C518";
          if (el.dataset.color !== hex) {
            el.dataset.color = hex;
            el.style.setProperty("--plate-color", hex);
          }
        }
      },
    });
  }, [rt, session]);

  const drivers = players.filter((p) => !p.isMe && p.role === "driver" && p.vehicle);

  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute inset-0 overflow-hidden ${photo ? "hidden" : ""}`}
    >
      {drivers.map((p) => (
        <div
          key={p.sessionId}
          ref={(el) => {
            if (!el) return;
            plates.current.set(p.sessionId, el);
            return () => void plates.current.delete(p.sessionId);
          }}
          data-nameplate={p.name}
          className="absolute top-0 left-0 flex items-center gap-1 rounded-full bg-hud/80 py-0.5 pr-2 pl-1 text-xs font-semibold whitespace-nowrap text-cream-50"
          style={{ visibility: "hidden" }}
        >
          <span
            className="h-2.5 w-2.5 rounded-full ring-1 ring-black/40"
            style={{ background: "var(--plate-color, #F5C518)" }}
          />
          {p.name}
        </div>
      ))}
    </div>
  );
}
