"use client";

import {
  INTERP_DELAY_MS,
  MSG,
  NET_SEND_HZ,
  type Correction,
  type DayNight,
  type Role,
  type StateMsg,
} from "@dirtyworks/shared";
import { useThree } from "@react-three/fiber";
import { useRapier } from "@react-three/rapier";
import { useEffect } from "react";
import type { TableSession } from "@/net/tableSession";
import { ServerClock } from "@/net/ServerClock";
import { useSession, type PlayerSummary } from "@/state/sessionStore";
import { QUALITY, useSettings } from "@/state/settingsStore";
import { useRuntime } from "./runtime";
import { RemoteVehicles, type RemotePlayerState } from "./vehicles/RemoteVehicles";

const SEND_INTERVAL = 1 / NET_SEND_HZ;
const SUMMARY_INTERVAL = 0.5;

interface SyncedTableState {
  hostId: string;
  dayNight: string;
  keepForLater: boolean;
  players: {
    forEach(cb: (player: SyncedPlayer, key: string) => void): void;
    get(key: string): SyncedPlayer | undefined;
  };
}

interface SyncedPlayer extends RemotePlayerState {
  userId: string;
  moved: number;
  name: string;
  avatar: string;
  ping: number;
}

/**
 * Bridges the table room and the game loop: sends the local vehicle at 20 Hz (`network:send`),
 * and renders everyone else from interpolated snapshots (`network:interpolate`).
 */
export function NetSync({ session }: { session: TableSession }) {
  const rt = useRuntime();
  const { world, rapier } = useRapier();
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);

  useEffect(() => {
    const room = session.room;
    const clock = new ServerClock();
    const remotes = new RemoteVehicles(world, rapier, scene, rt.map);
    rt.remoteCount = () => remotes.count;

    const offCorrection = room.onMessage(MSG.correction, (c: Correction) => {
      const body = rt.local?.body;
      if (!body) return;
      body.setTranslation({ x: c.x, y: c.y, z: c.z }, true);
      body.setRotation({ x: c.qx, y: c.qy, z: c.qz, w: c.qw }, true);
      body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    });

    const msg: StateMsg = {
      x: 0,
      y: 0,
      z: 0,
      qx: 0,
      qy: 0,
      qz: 0,
      qw: 1,
      vx: 0,
      vy: 0,
      vz: 0,
      j: [],
      v: "dump-truck",
      e: 0,
      b: 1,
      t: 0,
    };
    let sendAcc = 0;
    const offSend = rt.loop.register("network:send", {
      name: "net-send",
      update(ctx) {
        sendAcc += ctx.dt;
        if (sendAcc < SEND_INTERVAL) return;
        sendAcc %= SEND_INTERVAL;
        const local = rt.local;
        if (!local || useSession.getState().status !== "joined") return;
        const p = local.pose;
        msg.x = p.x;
        msg.y = p.y;
        msg.z = p.z;
        msg.qx = p.qx;
        msg.qy = p.qy;
        msg.qz = p.qz;
        msg.qw = p.qw;
        msg.vx = p.vx;
        msg.vy = p.vy;
        msg.vz = p.vz;
        msg.j = local.joints;
        msg.v = local.id;
        msg.e = rt.edgeT;
        msg.b = local.battery;
        msg.t = Math.round(performance.now());
        room.send(MSG.state, msg);
      },
    });

    let now = 0;
    const visit = (player: SyncedPlayer, key: string) => {
      if (player.t > 0) clock.observe(player.t, now);
      if (key !== room.sessionId) remotes.observe(player);
    };
    let summaryAcc = SUMMARY_INTERVAL;
    const offInterp = rt.loop.register("network:interpolate", {
      name: "net-interpolate",
      update(ctx) {
        const state = room.state as SyncedTableState | undefined;
        if (!state?.players) return;
        now = performance.now();
        remotes.beginFrame();
        state.players.forEach(visit);
        remotes.endFrame();
        const me = state.players.get(room.sessionId);
        rt.localLoadQ = me?.load ?? 0;
        rt.localMovedQ = me?.moved ?? 0;
        if (clock.ready) {
          const view = rt.local?.pose ?? camera.position;
          const preset = QUALITY[useSettings.getState().quality];
          remotes.update(
            clock.toServer(now) - INTERP_DELAY_MS,
            ctx.dt,
            view.x,
            view.z,
            preset.drawDistance,
            rt.dust,
            rt.material.particleColor,
          );
        }
        summaryAcc += ctx.dt;
        if (summaryAcc >= SUMMARY_INTERVAL) {
          summaryAcc = 0;
          publishSummary(state, room.sessionId);
        }
      },
    });

    return () => {
      offCorrection();
      offSend();
      offInterp();
      remotes.dispose();
      rt.remoteCount = () => 0;
    };
  }, [rt, session, world, rapier, scene, camera]);

  return null;
}

/** Low-rate copy of the synced roster into the UI store (only when something changed). */
function publishSummary(state: SyncedTableState, mySessionId: string): void {
  const players: PlayerSummary[] = [];
  state.players.forEach((p, key) =>
    players.push({
      sessionId: key,
      userId: p.userId,
      name: p.name,
      avatar: p.avatar,
      role: p.role as Role,
      vehicle: p.vehicle,
      connected: p.connected,
      ping: p.ping,
      isHost: key === state.hostId,
      isMe: key === mySessionId,
    }),
  );
  const store = useSession.getState();
  const patch: Parameters<typeof store.set>[0] = {};
  if (JSON.stringify(players) !== JSON.stringify(store.players)) patch.players = players;
  if (state.hostId !== store.hostId) patch.hostId = state.hostId;
  if (state.dayNight !== store.dayNight) patch.dayNight = state.dayNight as DayNight;
  if (state.keepForLater !== store.keepForLater) patch.keepForLater = state.keepForLater;
  if (Object.keys(patch).length) store.set(patch);
}
