/**
 * The client side of one table: owns the Colyseus room, turns server messages into store updates,
 * and survives React Strict Mode double-mounts (ref-counted, delayed leave).
 */
import type { Room } from "@colyseus/sdk";
import {
  ERROR_COPY,
  MSG,
  type ChatEntry,
  type ErrorEvent,
  type Livery,
  type NoticeEvent,
  type Role,
  type SpawnedEvent,
  type VehicleId,
  type Welcome,
} from "@dirtyworks/shared";
import { initialSession, useSession } from "@/state/sessionStore";
import { joinTable, takeStashedRoom } from "./tables";

const CLOSE_REASONS: Record<number, string> = {
  4100: "The host kicked you from the table.",
  4101: "The host asked you to sit this one out.",
  4102: "The host packed up the table. Thanks for digging!",
  4103: "Your controller sent too many garbled signals.",
};

/** Receives terrain traffic once the game is mounted. */
export interface TerrainSink {
  welcome(w: Welcome): void;
  snapshot(m: TerrainSnapshotMessage): void;
  op(wire: unknown): void;
}

export interface TerrainSnapshotMessage {
  seq: number;
  snapshot: Uint8Array;
  reset: boolean;
}

/** Terrain messages kept while no game is mounted (bounded; a gap triggers a resync anyway). */
const MAX_BUFFERED_TERRAIN = 2048;

export class TableSession {
  /** Latest welcome (carries the terrain snapshot for whoever mounts next). */
  lastWelcome: Welcome | null = null;
  private terrainSink: TerrainSink | null = null;
  private readonly terrainBuffer: ({ op: unknown } | { snapshot: TerrainSnapshotMessage })[] = [];

  constructor(readonly room: Room) {
    const store = useSession.getState();
    store.set({ ...initialSession, roomId: room.roomId, sessionId: room.sessionId });

    room.onMessage(MSG.welcome, (w: Welcome) => {
      this.lastWelcome = w;
      this.terrainSink?.welcome(w);
      useSession.getState().set({
        status: "joined",
        sessionId: w.sessionId,
        role: w.role,
        tableName: w.tableName,
        mapId: w.mapId,
        materialId: w.materialId,
        inviteCode: w.inviteCode,
        chat: w.chat,
      });
    });
    room.onMessage(MSG.spawned, (s: SpawnedEvent) =>
      useSession.setState((st) => ({ spawn: s, spawnSeq: st.spawnSeq + 1 })),
    );
    room.onMessage(MSG.chat, (entry: ChatEntry) =>
      useSession.setState((s) => ({ chat: [...s.chat.slice(-49), entry] })),
    );
    room.onMessage(MSG.notice, (n: NoticeEvent) => useSession.getState().pushToast(n.text, n.kind));
    room.onMessage(MSG.error, (e: ErrorEvent) =>
      useSession.getState().pushToast(ERROR_COPY[e.code] ?? e.message, "error"),
    );
    room.onMessage(MSG.tableClosed, (m: { reason: string }) =>
      useSession.getState().set({ closedReason: m.reason }),
    );
    room.onMessage(MSG.ping, (p: { id: number }) => room.send(MSG.pong, { id: p.id }));
    room.onMessage(MSG.terrainOp, (wire: unknown) => {
      if (this.terrainSink) this.terrainSink.op(wire);
      else this.buffer({ op: wire });
    });
    room.onMessage(MSG.terrainSnapshot, (m: TerrainSnapshotMessage) => {
      if (this.terrainSink) this.terrainSink.snapshot(m);
      else this.buffer({ snapshot: m });
    });
    room.onDrop(() => useSession.getState().set({ status: "reconnecting" }));
    room.onReconnect(() => {
      useSession.getState().set({ status: "joined" });
      room.send(MSG.ready);
    });
    room.onLeave((code) => {
      const reason = CLOSE_REASONS[code] ?? "You left the table.";
      useSession.getState().set({ status: "closed", closedReason: reason });
    });
    // Handlers are in place: ask for the welcome (anything sent earlier was dropped).
    room.send(MSG.ready);
  }

  spawn(vehicle: VehicleId, livery: Livery): void {
    this.room.send(MSG.spawn, { vehicle, livery });
  }

  send(type: string, payload?: unknown): void {
    this.room.send(type, payload);
  }

  /** Hands terrain traffic to the game: the last welcome, then everything buffered, then live. */
  attachTerrain(sink: TerrainSink): () => void {
    this.terrainSink = sink;
    if (this.lastWelcome) sink.welcome(this.lastWelcome);
    for (const item of this.terrainBuffer.splice(0)) {
      if ("op" in item) sink.op(item.op);
      else sink.snapshot(item.snapshot);
    }
    return () => {
      if (this.terrainSink === sink) this.terrainSink = null;
    };
  }

  private buffer(item: { op: unknown } | { snapshot: TerrainSnapshotMessage }): void {
    if ("snapshot" in item) this.terrainBuffer.length = 0;
    this.terrainBuffer.push(item);
    if (this.terrainBuffer.length > MAX_BUFFERED_TERRAIN) this.terrainBuffer.shift();
  }
}

interface Entry {
  promise: Promise<TableSession>;
  refs: number;
  leaveTimer: ReturnType<typeof setTimeout> | null;
}

const sessions = new Map<string, Entry>();
const LEAVE_DELAY_MS = 300;

/** Joins (or reuses) the table session for `roomId`. Pair every call with releaseTable(). */
export function acquireTable(roomId: string, role: Role, password?: string): Promise<TableSession> {
  const existing = sessions.get(roomId);
  if (existing) {
    existing.refs++;
    if (existing.leaveTimer) clearTimeout(existing.leaveTimer);
    existing.leaveTimer = null;
    return existing.promise;
  }
  const promise = (async () => {
    const room = takeStashedRoom(roomId) ?? (await joinTable(roomId, { role, password }));
    return new TableSession(room);
  })();
  const entry: Entry = { promise, refs: 1, leaveTimer: null };
  sessions.set(roomId, entry);
  promise.catch(() => sessions.delete(roomId));
  return promise;
}

export function releaseTable(roomId: string): void {
  const entry = sessions.get(roomId);
  if (!entry) return;
  entry.refs--;
  if (entry.refs > 0) return;
  entry.leaveTimer = setTimeout(() => {
    sessions.delete(roomId);
    void entry.promise.then((s) => s.room.leave()).catch(() => {});
  }, LEAVE_DELAY_MS);
}
