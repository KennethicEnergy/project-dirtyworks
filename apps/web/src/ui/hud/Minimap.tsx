"use client";

import { LIVERY_COLORS, type LiveryColor } from "@dirtyworks/shared";
import { useEffect, useRef } from "react";
import { useTableUi } from "./TableUiContext";

const SIZE = 132;
const TERRAIN_EVERY_MS = 500;
const DOTS_EVERY_MS = 100;

interface DotPlayer {
  x: number;
  z: number;
  vehicle: string;
  color: string;
}

/**
 * Top-down table map: terrain height shading (redrawn twice a second when it changed) and player
 * dots (ten times a second). Plain 2D canvas, outside React's render loop.
 */
export function Minimap() {
  const { runtime, session } = useTableUi();
  const terrainRef = useRef<HTMLCanvasElement>(null);
  const dotsRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const t = runtime.terrain;
    const canvas = terrainRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const w = t.cellsX / 2;
    const h = t.cellsZ / 2;
    canvas.width = w;
    canvas.height = h;
    const image = ctx.createImageData(w, h);
    const ground = runtime.map.baseTerrain.groundHeight;
    const lo = runtime.material.colors.dirt;
    const hi = runtime.material.colors.sand;
    const mix = (shift: number, f: number) =>
      ((lo >> shift) & 255) * (1 - f) + ((hi >> shift) & 255) * f;
    let lastVersion = -1;
    const draw = () => {
      let version = 0;
      for (const c of t.chunks) version += c.version;
      if (version === lastVersion) return;
      lastVersion = version;
      for (let z = 0; z < h; z++) {
        for (let x = 0; x < w; x++) {
          const height = t.heightAt(x * 2 + 1 - t.cellsX / 2, z * 2 + 1 - t.cellsZ / 2);
          const f = Math.min(1, Math.max(0, (height - (ground - 5)) / 7));
          const shade = 0.55 + 0.45 * f;
          const o = (z * w + x) * 4;
          image.data[o] = mix(16, f) * shade;
          image.data[o + 1] = mix(8, f) * shade;
          image.data[o + 2] = mix(0, f) * shade;
          image.data[o + 3] = 255;
        }
      }
      ctx.putImageData(image, 0, 0);
    };
    draw();
    const timer = window.setInterval(draw, TERRAIN_EVERY_MS);
    return () => window.clearInterval(timer);
  }, [runtime]);

  useEffect(() => {
    const canvas = dotsRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    canvas.width = SIZE * 2;
    canvas.height = SIZE * 2;
    const t = runtime.terrain;
    const toPx = (v: number, cells: number) => ((v + cells / 2) / cells) * SIZE * 2;
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const players = (
        session?.room.state as
          { players?: { forEach(cb: (p: DotPlayer, key: string) => void): void } } | undefined
      )?.players;
      players?.forEach((p, key) => {
        if (!p.vehicle || key === session?.room.sessionId) return;
        ctx.beginPath();
        ctx.arc(toPx(p.x, t.cellsX), toPx(p.z, t.cellsZ), 6, 0, Math.PI * 2);
        ctx.fillStyle = LIVERY_COLORS[p.color as LiveryColor]?.hex ?? "#f6ecd9";
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = "#1d1b19";
        ctx.stroke();
      });
      const me = runtime.local?.pose;
      if (me) {
        ctx.beginPath();
        ctx.arc(toPx(me.x, t.cellsX), toPx(me.z, t.cellsZ), 8, 0, Math.PI * 2);
        ctx.fillStyle = "#f5c518";
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = "#1d1b19";
        ctx.stroke();
      }
    };
    const timer = window.setInterval(draw, DOTS_EVERY_MS);
    return () => window.clearInterval(timer);
  }, [runtime, session]);

  return (
    <div
      className="hazard-border relative overflow-hidden rounded-lg bg-hud"
      style={{ width: SIZE, height: SIZE }}
      aria-label="Table minimap"
      role="img"
    >
      <canvas ref={terrainRef} className="absolute inset-0 h-full w-full" />
      <canvas ref={dotsRef} className="absolute inset-0 h-full w-full" />
    </div>
  );
}
