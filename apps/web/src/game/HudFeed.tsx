"use client";

import { useEffect } from "react";
import { useHud, useTransmitter } from "@/state/hudStore";
import { useSession } from "@/state/sessionStore";
import { useUi } from "@/state/uiStore";
import { useRuntime } from "./runtime";

const HUD_INTERVAL = 0.1;
const TRANSMITTER_INTERVAL = 1 / 15;

const q2 = (v: number) => Math.round(v * 50) / 50;

/** Copies local-vehicle numbers into the HUD store (10 Hz) and input into the transmitter (15 Hz). */
export function HudFeed() {
  const rt = useRuntime();
  useEffect(() => {
    let acc = 0;
    let txAcc = 0;
    let fell = false;
    return rt.loop.register("visuals", {
      name: "hud-feed",
      update(ctx) {
        txAcc += ctx.dt;
        if (txAcc >= TRANSMITTER_INTERVAL) {
          txAcc = 0;
          const s = rt.input.state;
          const tx = useTransmitter.getState();
          const next = {
            lx: q2(s.drive.x),
            ly: q2(s.drive.y),
            rx: q2(s.tool[3]),
            ry: q2(s.tool[1]),
            r0: Math.sign(q2(s.tool[0])),
            r2: Math.sign(q2(s.tool[2])),
            horn: s.horn,
            brake: s.handbrake,
            device: s.device,
          };
          if (
            next.lx !== tx.lx ||
            next.ly !== tx.ly ||
            next.rx !== tx.rx ||
            next.ry !== tx.ry ||
            next.r0 !== tx.r0 ||
            next.r2 !== tx.r2 ||
            next.horn !== tx.horn ||
            next.brake !== tx.brake ||
            next.device !== tx.device
          ) {
            tx.set(next);
          }
        }
        acc += ctx.dt;
        if (acc < HUD_INTERVAL) return;
        acc = 0;
        const local = rt.local;
        const hud = useHud.getState();
        const speedKmh = local ? Math.round(Math.abs(local.speed) * 3.6) : 0;
        const vehicle = local?.spec.displayName ?? "";
        const vehicleId = local?.id ?? "";
        const battery = local ? Math.round(local.battery * 100) / 100 : 1;
        const charging = local?.charging ?? false;
        const capacityQ = local ? local.spec.tool.capacityM3 * 1024 : 0;
        const loadFraction =
          capacityQ > 0 ? Math.round((rt.localLoadQ / capacityQ) * 100) / 100 : 0;
        const movedM3 = Math.round((rt.localMovedQ / 1024) * 10) / 10;
        if (
          speedKmh !== hud.speedKmh ||
          vehicle !== hud.vehicle ||
          battery !== hud.battery ||
          charging !== hud.charging ||
          loadFraction !== hud.loadFraction ||
          movedM3 !== hud.movedM3
        ) {
          hud.set({ speedKmh, vehicle, vehicleId, battery, charging, loadFraction, movedM3 });
        }
        // Rolled off the table: back to the garage for a fresh start.
        if (local && local.pose.y < -5 && !fell) {
          fell = true;
          useUi.getState().set({ garageOpen: true });
          useSession.getState().pushToast("Whoops, that one rolled off the table!", "info");
        } else if (local && local.pose.y > 0) {
          fell = false;
        }
      },
    });
  }, [rt]);
  return null;
}
