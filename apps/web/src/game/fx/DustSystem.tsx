"use client";

import { useThree } from "@react-three/fiber";
import { useEffect } from "react";
import { QUALITY, useSettings } from "@/state/settingsStore";
import { useRuntime } from "../runtime";
import { Dust } from "./Dust";

/** Particles kicked up per metre driven at speed. */
const TRAIL_PER_METRE = 0.6;
const TRAIL_MIN_SPEED = 2.5;

/** Owns the dust pool (sized by quality) and the local vehicle's driving trail. */
export function DustSystem() {
  const rt = useRuntime();
  const scene = useThree((s) => s.scene);
  const quality = useSettings((s) => s.quality);

  useEffect(() => {
    const dust = new Dust(QUALITY[quality].particles, scene);
    rt.dust = dust;
    const color = rt.material.particleColor;
    const off = rt.loop.register("visuals", {
      name: "dust",
      update(ctx) {
        const local = rt.local;
        if (local && Math.abs(local.speed) > TRAIL_MIN_SPEED) {
          if (Math.random() < Math.abs(local.speed) * ctx.dt * TRAIL_PER_METRE) {
            const p = local.pose;
            dust.emit(p.x, p.y + 0.2, p.z, 1, color, 1.5, 0.8);
          }
        }
        dust.update(ctx.dt);
      },
    });
    return () => {
      off();
      dust.dispose();
      if (rt.dust === dust) rt.dust = null;
    };
  }, [rt, scene, quality]);

  return null;
}
