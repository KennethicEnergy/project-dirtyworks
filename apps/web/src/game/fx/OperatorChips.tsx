"use client";

import { MSG, rimPoint, vec3, type EmoteEvent, type EmoteId } from "@dirtyworks/shared";
import { useEffect, useRef, useState } from "react";
import type { TableSession } from "@/net/tableSession";
import { useProfile } from "@/state/profileStore";
import { useSession } from "@/state/sessionStore";
import { useUi } from "@/state/uiStore";
import { Avatar } from "@/ui/common/Avatar";
import { playSound } from "../audio/sound";
import { useRuntime } from "../runtime";
import { EmoteBubble } from "./EmoteBubble";
import { placeElement, projectToScreen, type ScreenPoint } from "./overlay";

/** How long an emote bubble stays up (ms). */
const BUBBLE_MS = 3200;
/** Chips float at about the operators' head height above the rim walkway (m). */
const CHIP_HEIGHT = 9;
/** Your own bubble floats this far above your vehicle (m). */
const SELF_BUBBLE_HEIGHT = 6;
/** A honk is quieter the further away it comes from (m). */
const HORN_FALLOFF = 220;

interface Bubble {
  key: number;
  sessionId: string;
  emote: EmoteId;
}

interface SyncedPlayers {
  players?: {
    get(
      id: string,
    ): { edgeT: number; vehicle: string; x: number; y: number; z: number } | undefined;
  };
}

/**
 * Everyone's operator spot on the table rim: an avatar chip (Google photo or initials) with their
 * name, and emote bubbles above it. A DOM overlay over the canvas; the `visuals` phase moves the
 * chips, React only re-renders when the roster or the bubbles change. Drivers' own chips are left
 * out (that is where your camera stands); your own emotes pop up above your vehicle instead.
 */
export function OperatorChips({ session }: { session: TableSession }) {
  const rt = useRuntime();
  const players = useSession((s) => s.players);
  const role = useSession((s) => s.role);
  const photo = useUi((s) => s.photoMode);
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const chips = useRef(new Map<string, HTMLDivElement>());
  const selfBubble = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let seq = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const spot = vec3();
    const off = session.room.onMessage(MSG.emote, (e: EmoteEvent) => {
      const sender = useSession.getState().players.find((p) => p.sessionId === e.sessionId);
      if (sender && useProfile.getState().muted.includes(sender.userId)) return;
      const key = ++seq;
      setBubbles((list) => [
        ...list.filter((b) => b.sessionId !== e.sessionId),
        { key, sessionId: e.sessionId, emote: e.id },
      ]);
      const timer = setTimeout(() => {
        timers.delete(timer);
        setBubbles((list) => list.filter((b) => b.key !== key));
      }, BUBBLE_MS);
      timers.add(timer);
      if (e.id === "horn") {
        const p = (session.room.state as SyncedPlayers).players?.get(e.sessionId);
        const camera = rt.three?.camera.position;
        let gain = 1;
        if (p && camera && e.sessionId !== session.room.sessionId) {
          // From their vehicle when driving, else from their rim spot.
          if (p.vehicle) {
            spot.x = p.x;
            spot.y = p.y;
            spot.z = p.z;
          } else {
            rimPoint(rt.map, p.edgeT, spot);
          }
          const d = Math.hypot(spot.x - camera.x, spot.y - camera.y, spot.z - camera.z);
          gain = Math.max(0.25, 1 - d / HORN_FALLOFF);
        }
        playSound("horn", gain);
      }
    });
    return () => {
      off();
      for (const t of timers) clearTimeout(t);
    };
  }, [rt, session]);

  useEffect(() => {
    const spot = vec3();
    const pt: ScreenPoint = { x: 0, y: 0, distance: 0 };
    return rt.loop.register("visuals", {
      name: "operator-chips",
      update() {
        const three = rt.three;
        if (!three) return;
        const { camera, gl } = three;
        const w = gl.domElement.clientWidth;
        const h = gl.domElement.clientHeight;
        const state = session.room.state as SyncedPlayers;
        for (const [id, el] of chips.current) {
          const mine = id === session.room.sessionId;
          const edgeT = mine && rt.local ? rt.edgeT : state.players?.get(id)?.edgeT;
          if (edgeT === undefined) {
            placeElement(el, null);
            continue;
          }
          rimPoint(rt.map, edgeT, spot);
          const ok = projectToScreen(camera, spot.x, spot.y + CHIP_HEIGHT, spot.z, w, h, pt);
          placeElement(el, ok ? pt : null);
        }
        const self = selfBubble.current;
        const local = rt.local;
        if (self) {
          const ok =
            !!local &&
            projectToScreen(
              camera,
              local.pose.x,
              local.pose.y + SELF_BUBBLE_HEIGHT,
              local.pose.z,
              w,
              h,
              pt,
            );
          placeElement(self, ok ? pt : null);
        }
      },
    });
  }, [rt, session]);

  // Spectators have no vehicle: their own chip carries their bubbles.
  const shown = players.filter((p) => !p.isMe || role === "spectator");
  const mine = bubbles.find((b) => b.sessionId === session.room.sessionId);

  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute inset-0 overflow-hidden ${photo ? "hidden" : ""}`}
    >
      {shown.map((p) => {
        const bubble = bubbles.find((b) => b.sessionId === p.sessionId);
        return (
          <div
            key={p.sessionId}
            ref={(el) => {
              if (!el) return;
              chips.current.set(p.sessionId, el);
              return () => void chips.current.delete(p.sessionId);
            }}
            data-operator={p.name}
            className="absolute top-0 left-0 flex flex-col items-center"
            style={{ visibility: "hidden" }}
          >
            {bubble && <EmoteBubble key={bubble.key} emote={bubble.emote} />}
            <Avatar name={p.name} src={p.avatar} size={30} />
            <span className="mt-0.5 max-w-24 truncate rounded-full bg-hud/75 px-1.5 text-[10px] font-semibold text-cream-50">
              {p.name}
            </span>
          </div>
        );
      })}
      {mine && role === "driver" && (
        <div
          ref={selfBubble}
          className="absolute top-0 left-0"
          style={{ visibility: "hidden" }}
          data-emote="mine"
        >
          <EmoteBubble key={mine.key} emote={mine.emote} />
        </div>
      )}
    </div>
  );
}
