"use client";

import { MSG, TERRAIN_OPS_PER_SEC, TokenBucket } from "@dirtyworks/shared";
import { useEffect } from "react";
import type { TableSession } from "@/net/tableSession";
import { useSession } from "@/state/sessionStore";
import { playSound } from "../audio/sound";
import { useRuntime } from "../runtime";
import { detectToolIntent, type ToolFrame } from "./toolIntent";

/** Stay a little under the server's limit so legitimate ops are never dropped. */
const LOCAL_OPS_PER_SEC = TERRAIN_OPS_PER_SEC - 2;
/** A release empties the bucket; wait for the server's load update before trying again. */
const RELEASE_COOLDOWN_MS = 600;
/** Digging sends ops several times a second; tool sounds play at most this often. */
const TOOL_SOUND_MS = 280;

/**
 * Watches the local vehicle's tool after physics and sends terrain intents (`network:send`).
 * The terrain itself changes when the server's op comes back; dust gives instant feedback.
 */
export function ToolSystem({ session }: { session: TableSession }) {
  const rt = useRuntime();

  useEffect(() => {
    const bucket = new TokenBucket(LOCAL_OPS_PER_SEC, LOCAL_OPS_PER_SEC);
    const prev: number[] = [];
    let releaseReadyAt = 0;
    let nextSoundAt = 0;
    const groundAt = (x: number, z: number) => rt.terrain.heightAt(x, z);
    const frame: Partial<ToolFrame> = { groundAt, prevJoints: prev };

    return rt.loop.register(
      "network:send",
      {
        name: "tool-intents",
        update(ctx) {
          const local = rt.local;
          if (!local || useSession.getState().status !== "joined") {
            prev.length = 0;
            return;
          }
          if (prev.length !== local.joints.length) {
            prev.length = 0;
            prev.push(...local.joints);
            return;
          }
          frame.spec = local.spec;
          frame.pose = local.pose;
          frame.joints = local.joints;
          frame.dt = ctx.dt;
          frame.loadQ = rt.localLoadQ;
          frame.speed = local.speed;
          const intent = detectToolIntent(frame as ToolFrame);
          for (let i = 0; i < prev.length; i++) prev[i] = local.joints[i]!;
          if (!intent) return;
          const now = performance.now();
          if (intent.kind === "release") {
            if (now < releaseReadyAt) return;
            releaseReadyAt = now + RELEASE_COOLDOWN_MS;
          }
          if (!bucket.take()) return;
          session.send(MSG.terrainOp, intent);
          if (intent.kind === "release" || intent.kind === "dump") {
            if (intent.kind === "release" || now >= nextSoundAt) playSound("dump", 0.8);
            nextSoundAt = now + 900;
          } else if (now >= nextSoundAt) {
            playSound("scoop", intent.kind === "push" ? 0.45 : 0.8);
            nextSoundAt = now + TOOL_SOUND_MS;
          }
          if (intent.kind === "dig" || intent.kind === "push") {
            const x = intent.x / 100;
            const z = intent.z / 100;
            rt.dust?.emit(
              x,
              rt.terrain.heightAt(x, z) + 0.1,
              z,
              2,
              rt.material.particleColor,
              0.8,
              1.2,
            );
          }
        },
      },
      -1,
    );
  }, [rt, session]);

  return null;
}
