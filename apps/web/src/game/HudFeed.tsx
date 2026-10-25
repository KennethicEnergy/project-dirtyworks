"use client";

import { useEffect } from "react";
import { useHud } from "@/state/hudStore";
import { useSession } from "@/state/sessionStore";
import { useUi } from "@/state/uiStore";
import { useRuntime } from "./runtime";

const HUD_INTERVAL = 0.1;

/** Copies local-vehicle numbers into the HUD store ten times a second. */
export function HudFeed() {
  const rt = useRuntime();
  useEffect(() => {
    let acc = 0;
    let fell = false;
    return rt.loop.register("visuals", {
      name: "hud-feed",
      update(ctx) {
        acc += ctx.dt;
        if (acc < HUD_INTERVAL) return;
        acc = 0;
        const local = rt.local;
        const hud = useHud.getState();
        const speedKmh = local ? Math.round(Math.abs(local.speed) * 3.6) : 0;
        const vehicle = local?.spec.displayName ?? "";
        const vehicleId = local?.id ?? "";
        const battery = local ? Math.round(local.battery * 100) / 100 : 1;
        const capacityQ = local ? local.spec.tool.capacityM3 * 1024 : 0;
        const loadFraction =
          capacityQ > 0 ? Math.round((rt.localLoadQ / capacityQ) * 100) / 100 : 0;
        const movedM3 = Math.round((rt.localMovedQ / 1024) * 10) / 10;
        if (
          speedKmh !== hud.speedKmh ||
          vehicle !== hud.vehicle ||
          battery !== hud.battery ||
          loadFraction !== hud.loadFraction ||
          movedM3 !== hud.movedM3
        ) {
          hud.set({ speedKmh, vehicle, vehicleId, battery, loadFraction, movedM3 });
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
