"use client";

import { useRapier } from "@react-three/rapier";
import { useEffect } from "react";
import { useRuntime } from "../runtime";

/** Physics substep length the frame is split into (seconds). */
const SUBSTEP = 1 / 60;
const MAX_SUBSTEPS = 4;

/**
 * Steps Rapier in the `physics` phase. <Physics paused> keeps @react-three/rapier from stepping
 * on its own; we split the frame into ~60 Hz substeps and run vehicle pre-step hooks before each.
 */
export function PhysicsStepper() {
  const rt = useRuntime();
  const { world, rapier } = useRapier();

  useEffect(() => {
    rt.physics = { world, rapier };
    const off = rt.loop.register("physics", {
      name: "rapier-step",
      update(ctx) {
        if (ctx.dt <= 0) return;
        const n = Math.min(MAX_SUBSTEPS, Math.max(1, Math.round(ctx.dt / SUBSTEP)));
        const sub = ctx.dt / n;
        world.timestep = sub;
        for (let i = 0; i < n; i++) {
          for (const hook of rt.preStep) hook(sub);
          world.step();
        }
      },
    });
    return () => {
      off();
      rt.physics = null;
    };
  }, [rt, world, rapier]);

  return null;
}
