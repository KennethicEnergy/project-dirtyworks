import { describe, expect, it } from "vitest";
import { GameLoop, PHASES, type Phase } from "@/game/loop/GameLoop";

function recorder() {
  const calls: string[] = [];
  const system = (name: string) => ({ name, update: () => void calls.push(name) });
  return { calls, system };
}

describe("GameLoop", () => {
  it("runs systems in phase order no matter the registration order", () => {
    const loop = new GameLoop();
    const { calls, system } = recorder();
    for (const phase of [...PHASES].reverse()) loop.register(phase, system(phase));
    loop.tick(1 / 60);
    expect(calls).toEqual([...PHASES]);
  });

  it("documents the order the game relies on", () => {
    expect(PHASES).toEqual([
      "inputs",
      "player:pre-physics",
      "vehicle:pre-physics",
      "terrain:colliders",
      "physics",
      "vehicle:post-physics",
      "network:send",
      "network:interpolate",
      "terrain:apply",
      "camera",
      "visuals",
      "audio",
      "render",
    ] satisfies Phase[]);
  });

  it("sorts systems within a phase by order, then by registration", () => {
    const loop = new GameLoop();
    const { calls, system } = recorder();
    loop.register("visuals", system("late"), 10);
    loop.register("visuals", system("first"), -1);
    loop.register("visuals", system("a"));
    loop.register("visuals", system("b"));
    loop.tick(0.016);
    expect(calls).toEqual(["first", "a", "b", "late"]);
  });

  it("stops calling a system once it unregisters", () => {
    const loop = new GameLoop();
    const { calls, system } = recorder();
    const off = loop.register("camera", system("cam"));
    loop.tick(0.016);
    off();
    loop.tick(0.016);
    expect(calls).toEqual(["cam"]);
  });

  it("passes dt, elapsed time and a frame counter in one reused context", () => {
    const loop = new GameLoop();
    const seen: { dt: number; time: number; frame: number }[] = [];
    let ctxRef: object | null = null;
    loop.register("inputs", {
      name: "spy",
      update(ctx) {
        if (ctxRef && ctxRef !== ctx) throw new Error("context reallocated");
        ctxRef = ctx;
        seen.push({ dt: ctx.dt, time: ctx.time, frame: ctx.frame });
      },
    });
    loop.tick(0.0625);
    loop.tick(0.03125);
    expect(seen).toEqual([
      { dt: 0.0625, time: 0.0625, frame: 1 },
      { dt: 0.03125, time: 0.09375, frame: 2 },
    ]);
  });

  it("clamps huge frame gaps (tab switches) so physics does not explode", () => {
    const loop = new GameLoop();
    let dt = 0;
    loop.register("physics", { name: "p", update: (ctx) => void (dt = ctx.dt) });
    loop.tick(5);
    expect(dt).toBeLessThanOrEqual(0.1);
  });

  it("keeps running other systems when one throws, and reports the failure", () => {
    const errors: string[] = [];
    const loop = new GameLoop((name) => errors.push(name));
    const { calls, system } = recorder();
    loop.register("inputs", {
      name: "broken",
      update: () => {
        throw new Error("boom");
      },
    });
    loop.register("camera", system("cam"));
    loop.tick(0.016);
    expect(calls).toEqual(["cam"]);
    expect(errors).toEqual(["broken"]);
  });
});
