"use client";

import { createTerrainForMap, MSG, OP } from "@dirtyworks/shared";
import { useEffect } from "react";
import { TerrainSync } from "@/net/TerrainSync";
import type { TableSession } from "@/net/tableSession";
import { useRuntime } from "../runtime";

/** Ops applied per frame at most (a resync burst spreads over a few frames). */
const OPS_PER_FRAME = 200;

/**
 * Feeds the terrain replica from the table: the welcome/resync snapshots and every broadcast op,
 * applied in the `terrain:apply` phase in sequence order. Applied ops puff dust where they land.
 */
export function TerrainNet({ session }: { session: TableSession }) {
  const rt = useRuntime();

  useEffect(() => {
    const sync = new TerrainSync(rt.terrain, createTerrainForMap(rt.map), rt.material, {
      requestResync: (fromSeq) => session.send(MSG.terrainResync, { fromSeq }),
    });
    rt.terrainSync = sync;
    const color = rt.material.particleColor;
    sync.onApplied = (op) => {
      if (op.resultQ <= 0) return;
      const x = op.x / 100;
      const z = op.z / 100;
      const count = Math.min(24, 4 + Math.round(op.resultQ / 120));
      rt.dust?.emit(
        x,
        rt.terrain.heightAt(x, z) + 0.2,
        z,
        count,
        color,
        op.code === OP.FILL ? 1.6 : 1.1,
        2.2,
      );
    };
    const load = (bytes: Uint8Array, seq: number) => {
      sync.loadSnapshot(new Uint8Array(bytes), seq);
      rt.suppressFresh = true;
    };
    const detach = session.attachTerrain({
      welcome: (w) => load(w.snapshot, w.seq),
      snapshot: (m) => load(m.snapshot, m.seq),
      op: (wire) => sync.receive(wire),
    });
    const off = rt.loop.register("terrain:apply", {
      name: "terrain-sync",
      update: () => void sync.flush(OPS_PER_FRAME),
    });
    return () => {
      off();
      detach();
      if (rt.terrainSync === sync) rt.terrainSync = null;
    };
  }, [rt, session]);

  return null;
}
