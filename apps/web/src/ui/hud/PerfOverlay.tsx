"use client";

import { useEffect, useState } from "react";
import { useUi } from "@/state/uiStore";
import { useTableUi } from "./TableUiContext";

interface PerfSample {
  fps: number;
  frameMs: number;
  meshRebuilds: number;
  colliderRebuilds: number;
  worstColliderMs: number;
  lastColliderMs: number;
  opQueue: number;
  meshQueue: number;
  seq: number;
  drawCalls: number;
  remotes: number;
  dust: number;
}

const EMPTY: PerfSample = {
  fps: 0,
  frameMs: 0,
  meshRebuilds: 0,
  colliderRebuilds: 0,
  worstColliderMs: 0,
  lastColliderMs: 0,
  opQueue: 0,
  meshQueue: 0,
  seq: 0,
  drawCalls: 0,
  remotes: 0,
  dust: 0,
};

/** F3: frame rate, terrain rebuild rates and queues. Sampled twice a second. */
export function PerfOverlay() {
  const { runtime } = useTableUi();
  const open = useUi((s) => s.perfOpen);
  const [sample, setSample] = useState<PerfSample>(EMPTY);

  useEffect(() => {
    if (!open) return;
    let lastAt = performance.now();
    let lastFrame = runtime.loop.frame;
    let lastMesh = runtime.terrainView?.meshes.stats.rebuilds ?? 0;
    let lastCollider = runtime.terrainView?.colliders.stats.rebuilds ?? 0;
    const timer = window.setInterval(() => {
      const now = performance.now();
      const secs = (now - lastAt) / 1000;
      const view = runtime.terrainView;
      const mesh = view?.meshes.stats.rebuilds ?? 0;
      const collider = view?.colliders.stats.rebuilds ?? 0;
      setSample({
        fps: Math.round((runtime.loop.frame - lastFrame) / secs),
        frameMs: Math.round(runtime.loop.lastTickMs * 10) / 10,
        meshRebuilds: Math.round((mesh - lastMesh) / secs),
        colliderRebuilds: Math.round((collider - lastCollider) / secs),
        worstColliderMs: Math.round((view?.colliders.stats.worstMs ?? 0) * 100) / 100,
        lastColliderMs: Math.round((view?.colliders.stats.lastMs ?? 0) * 100) / 100,
        opQueue: runtime.terrainSync?.queueLength ?? 0,
        meshQueue: view?.meshes.stats.queue ?? 0,
        seq: runtime.terrainSync?.seq ?? 0,
        drawCalls: runtime.three?.gl.info.render.calls ?? 0,
        remotes: runtime.remoteCount(),
        dust: runtime.dust?.alive ?? 0,
      });
      lastAt = now;
      lastFrame = runtime.loop.frame;
      lastMesh = mesh;
      lastCollider = collider;
    }, 500);
    return () => window.clearInterval(timer);
  }, [open, runtime]);

  if (!open) return null;
  const rows: [string, string][] = [
    ["fps", `${sample.fps}`],
    ["frame", `${sample.frameMs} ms`],
    ["chunk meshes", `${sample.meshRebuilds}/s · queue ${sample.meshQueue}`],
    ["colliders", `${sample.colliderRebuilds}/s`],
    ["collider ms", `last ${sample.lastColliderMs} · worst ${sample.worstColliderMs}`],
    ["op queue", `${sample.opQueue}`],
    ["terrain seq", `${sample.seq}`],
    ["draw calls", `${sample.drawCalls}`],
    ["remotes", `${sample.remotes}`],
    ["dust", `${sample.dust}`],
  ];
  return (
    <dl
      aria-label="Performance"
      className="pointer-events-none absolute top-16 right-3 grid grid-cols-[auto_auto] gap-x-3 rounded-lg bg-hud/85 px-3 py-2 font-mono text-[11px] text-cream-100"
    >
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-safety">{k}</dt>
          <dd className="text-right tabular-nums">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
