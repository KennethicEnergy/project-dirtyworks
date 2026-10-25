/**
 * One table = one Colyseus room. This class wires Colyseus hooks and messages to the pure rules
 * in @dirtyworks/shared; it owns no game math of its own.
 */
import { generateId, Room, type AuthContext, type Client } from "@colyseus/core";
import {
  bucketFor,
  canJoinAs,
  CHAT_HISTORY,
  chatMsgSchema,
  clampJoints,
  dayNightMsgSchema,
  emoteMsgSchema,
  emptyMsgSchema,
  encodeOp,
  keepMsgSchema,
  liveryMsgSchema,
  MATERIALS,
  makeInviteCode,
  MAPS,
  mapBounds,
  MAX_SPECTATORS,
  MSG,
  nextHost,
  PATCH_INTERVAL_MS,
  pongMsgSchema,
  reportMsgSchema,
  quatFromYaw,
  restJoints,
  ROLES,
  sanitizeChat,
  spawnMsgSchema,
  stateMsgSchema,
  tableSettingsSchema,
  targetMsgSchema,
  terrainIntentSchema,
  terrainResyncSchema,
  VEHICLES,
  canCreateTable,
  type ChatEntry,
  type EmoteEvent,
  type GameUser,
  type MaterialId,
  type NoticeEvent,
  type Pose,
  type RateName,
  type Role,
  type SpawnedEvent,
  type TableListing,
  type TableMap,
  type TableSettings,
  type TokenBucket,
  type VehicleId,
  type Welcome,
} from "@dirtyworks/shared";
import { z } from "zod";
import { hashPassword, verifyPassword } from "../game/password";
import { MovementGuard } from "../game/MovementGuard";
import { TerrainAuthority, type Actor } from "../game/TerrainAuthority";
import type { Logger } from "../logger";
import { authenticate, reject, roomDeps, VERIFIED_USER, type RoomDeps } from "./auth";
import { PlayerState, TableState } from "./schema";

/** WebSocket close codes the client turns into friendly messages. */
export const CLOSE = { KICKED: 4100, BANNED: 4101, CLOSED: 4102, MISBEHAVING: 4103 } as const;

/** Invalid messages tolerated per window before a client is disconnected. */
const VIOLATION_LIMIT = 20;
const VIOLATION_WINDOW_MS = 10_000;
const PING_INTERVAL_MS = 2000;
/** How often a kept table is saved while it changes. */
const KEEP_SAVE_INTERVAL_MS = 60_000;
/** Terrain intents are rate limited by the message handler; validation needs no second bucket. */
const UNLIMITED = { take: () => true };

const joinOptionsSchema = z.object({
  role: z.enum(ROLES).default("driver"),
  password: z.string().max(64).optional(),
});

interface ClientInfo {
  user: GameUser;
  role: Role;
  guard: MovementGuard | null;
  buckets: Map<RateName, TokenBucket>;
  violations: number;
  violationWindowStart: number;
  pings: Map<number, number>;
}

export class TableRoom extends Room<{ state: TableState; metadata: TableListing }> {
  static override async onAuth(token: string, options: unknown, _context: AuthContext) {
    return authenticate(token, options as Record<string, unknown> | undefined);
  }

  inviteCode = "";
  private deps!: RoomDeps;
  private log!: Logger;
  private settings!: TableSettings;
  private map!: TableMap;
  private materialId!: MaterialId;
  private passwordHash: string | null = null;
  private terrain!: TerrainAuthority;
  private lastSavedSeq = -1;
  private creatorId = "";
  private createdAt = 0;
  private readonly bans = new Set<string>();
  private readonly info = new Map<string, ClientInfo>();
  private readonly chat: ChatEntry[] = [];
  private chatSeq = 0;
  private pingSeq = 0;
  private joinSeq = 0;
  private readonly scratchJoints: number[] = [];
  private readonly incoming: Pose = {
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
  };

  override async onCreate(options: Record<string, unknown>) {
    this.deps = roomDeps();
    this.log = this.deps.logger.child({ roomId: this.roomId });
    const creator = options?.[VERIFIED_USER] as GameUser | undefined;
    if (!creator) reject("UNAUTHORIZED");

    const parsed = tableSettingsSchema.safeParse(options?.settings);
    if (!parsed.success) {
      this.log.info("table rejected", { reason: "BAD_SETTINGS", userId: creator.id });
      reject("BAD_SETTINGS");
    }
    if (!canCreateTable(this.deps.registry.countFor(creator.id)).ok) {
      this.log.info("table rejected", { reason: "TABLE_LIMIT", userId: creator.id });
      reject("TABLE_LIMIT");
    }

    // Reserve the slot and code before any await so concurrent creates cannot both pass.
    let code = makeInviteCode();
    while (this.deps.registry.hasCode(code)) code = makeInviteCode();
    this.inviteCode = code;
    this.deps.registry.add(this.roomId, creator.id, code);

    this.settings = parsed.data;
    this.map = MAPS[this.settings.mapId];
    this.materialId = this.settings.materialId ?? this.map.defaultMaterial;
    this.creatorId = creator.id;
    this.createdAt = this.deps.now();
    if (this.settings.password) this.passwordHash = await hashPassword(this.settings.password);

    // Reopening a kept table: only its owner can, and only on the same diorama.
    let tableId = generateId(16);
    let restored: Uint8Array | null = null;
    if (this.settings.restoreId && this.deps.store) {
      const saved = await this.deps.store.load(this.settings.restoreId, creator.id);
      if (saved && saved.meta.mapId === this.settings.mapId) {
        tableId = saved.meta.tableId;
        restored = saved.data;
        if (saved.meta.materialId in MATERIALS)
          this.materialId = saved.meta.materialId as MaterialId;
      }
    }
    this.terrain = new TerrainAuthority(this.map, MATERIALS[this.materialId]);
    if (restored) {
      try {
        this.terrain.restore(restored);
        this.log.info("table restored", { tableId });
      } catch (err) {
        this.log.warn("saved table could not be restored", { tableId, err });
      }
    }
    this.lastSavedSeq = restored ? this.terrain.seq : -1;

    const state = new TableState();
    state.tableId = tableId;
    state.name = this.settings.name;
    state.mapId = this.settings.mapId;
    state.materialId = this.materialId;
    state.vibe = this.settings.vibe;
    state.rule = this.settings.rule;
    state.keepForLater = this.settings.keepForLater || restored !== null;
    this.setState(state);

    this.maxClients = this.settings.maxPlayers + MAX_SPECTATORS;
    this.maxMessagesPerSecond = 80;
    this.setPatchRate(PATCH_INTERVAL_MS);
    await this.setMetadata(this.listing());
    if (this.settings.visibility === "private") await this.setPrivate(true);

    this.registerMessages();
    this.clock.setInterval(() => this.sendPings(), PING_INTERVAL_MS);
    this.clock.setInterval(() => void this.persist(), KEEP_SAVE_INTERVAL_MS);
    this.log.info("table created", {
      userId: creator.id,
      mapId: this.settings.mapId,
      visibility: this.settings.visibility,
    });
  }

  override async onJoin(client: Client, options: unknown) {
    const user = client.auth as GameUser | undefined;
    if (!user) reject("UNAUTHORIZED");
    if (this.bans.has(user.id)) reject("BANNED");

    const opts = joinOptionsSchema.safeParse(options ?? {});
    if (!opts.success) reject("INVALID");
    const role = opts.data.role;

    if (this.passwordHash && user.id !== this.creatorId) {
      const ok = await verifyPassword(opts.data.password ?? "", this.passwordHash);
      if (!ok) {
        this.log.info("join rejected", { reason: "BAD_PASSWORD", userId: user.id });
        reject("BAD_PASSWORD");
      }
    }
    const seat = canJoinAs(role, this.counts(), this.settings.maxPlayers);
    if (!seat.ok) reject(seat.reason);

    const player = new PlayerState();
    player.sessionId = client.sessionId;
    player.userId = user.id;
    player.name = user.name;
    player.avatar = user.avatar ?? "";
    player.role = role;
    player.joinedAt = this.deps.now();
    player.edgeT = (0.08 + this.joinSeq++ * 0.137) % 1;
    this.state.players.set(client.sessionId, player);

    this.info.set(client.sessionId, {
      user,
      role,
      guard: null,
      buckets: new Map(),
      violations: 0,
      violationWindowStart: this.deps.now(),
      pings: new Map(),
    });

    if (!this.state.hostId) this.state.hostId = client.sessionId;
    await this.setMetadata(this.listing());
    this.notice({ kind: "join", name: user.name, text: `${user.name} pulled up a chair.` }, client);
    this.log.info("player joined", { userId: user.id, role });
  }

  override onDrop(client: Client) {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;
    player.connected = false;
    this.notice({
      kind: "drop",
      name: player.name,
      text: `${player.name}'s controller lost signal…`,
    });
    this.allowReconnection(client, this.deps.reconnectSeconds);
    this.log.info("player dropped", { userId: player.userId });
  }

  override onReconnect(client: Client) {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;
    player.connected = true;
    const info = this.info.get(client.sessionId);
    if (info?.guard) info.guard.reset(info.guard.lastValid, this.deps.now());
    this.notice({ kind: "back", name: player.name, text: `${player.name} is back on the sticks.` });
  }

  override async onLeave(client: Client) {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;
    this.state.players.delete(client.sessionId);
    this.info.delete(client.sessionId);
    if (this.state.hostId === client.sessionId) this.passHost(client.sessionId);
    this.notice({ kind: "leave", name: player.name, text: `${player.name} headed home.` });
    if (
      this.settings.terrainPersistence === "none" &&
      this.counts().drivers === 0 &&
      this.terrain.seq > 0
    ) {
      this.resetTerrain("Fresh sand for the next crew.");
    }
    if (this.state.players.size > 0) await this.setMetadata(this.listing());
    this.log.info("player left", { userId: player.userId });
  }

  override async onDispose() {
    this.deps?.registry.remove(this.roomId);
    if (this.terrain) await this.persist();
    this.log?.info("table disposed");
  }

  /** Current terrain op sequence number (tests and diagnostics). */
  terrainSeq(): number {
    return this.terrain.seq;
  }

  terrainHash(): number {
    return this.terrain.hash();
  }

  // ─── messages ────────────────────────────────────────────────────────────

  private registerMessages(): void {
    // Welcome is pulled, not pushed: messages sent before the client registers handlers are lost.
    this.handle(MSG.ready, "ready", emptyMsgSchema, (client, _msg, info) => {
      client.send(MSG.welcome, this.welcome(client, info.role));
    });

    this.handle(MSG.state, "state", stateMsgSchema, (client, msg, info) => {
      const player = this.state.players.get(client.sessionId);
      if (!player || !info.guard || !player.vehicle || msg.v !== player.vehicle) return;
      const spec = VEHICLES[player.vehicle as VehicleId];
      const pose = this.incoming;
      pose.x = msg.x;
      pose.y = msg.y;
      pose.z = msg.z;
      pose.qx = msg.qx;
      pose.qy = msg.qy;
      pose.qz = msg.qz;
      pose.qw = msg.qw;
      pose.vx = msg.vx;
      pose.vy = msg.vy;
      pose.vz = msg.vz;
      const now = this.deps.now();
      const result = info.guard.accept(pose, now);
      if (result.ok) {
        this.writePose(player, pose);
        const joints = clampJoints(spec, msg.j, this.scratchJoints);
        for (let i = 0; i < joints.length; i++) player.joints[i] = joints[i]!;
        player.battery = Math.round(msg.b * 255);
        player.edgeT = msg.e;
        player.t = now - this.createdAt;
        return;
      }
      this.log.debug("movement rejected", { userId: info.user.id, reason: result.reason });
      if (result.correction) {
        this.writePose(player, result.correction);
        client.send(MSG.correction, {
          x: result.correction.x,
          y: result.correction.y,
          z: result.correction.z,
          qx: result.correction.qx,
          qy: result.correction.qy,
          qz: result.correction.qz,
          qw: result.correction.qw,
        });
      }
    });

    this.handle(MSG.spawn, "spawn", spawnMsgSchema, (client, msg, info) => {
      const player = this.state.players.get(client.sessionId);
      if (!player || info.role !== "driver") return;
      const spec = VEHICLES[msg.vehicle];
      const spawnPoint = this.pickSpawn(client.sessionId);
      const y = this.terrain.heightAt(spawnPoint.x, spawnPoint.z) + 1;
      const q = quatFromYaw(spawnPoint.yaw, { x: 0, y: 0, z: 0, w: 1 });
      const pose: Pose = {
        x: spawnPoint.x,
        y,
        z: spawnPoint.z,
        qx: q.x,
        qy: q.y,
        qz: q.z,
        qw: q.w,
        vx: 0,
        vy: 0,
        vz: 0,
      };
      player.vehicle = msg.vehicle;
      player.color = msg.livery.color;
      player.decal = msg.livery.decal;
      player.number = msg.livery.number;
      player.load = 0;
      player.joints.clear();
      for (const v of restJoints(spec)) player.joints.push(v);
      this.writePose(player, pose);
      if (info.guard) info.guard.reset(pose, this.deps.now(), spec);
      else {
        info.guard = new MovementGuard(spec, mapBounds(this.map));
        info.guard.reset(pose, this.deps.now());
      }
      const spawned: SpawnedEvent = {
        vehicle: msg.vehicle,
        x: pose.x,
        y: pose.y,
        z: pose.z,
        yaw: spawnPoint.yaw,
      };
      client.send(MSG.spawned, spawned);
    });

    this.handle(MSG.terrainOp, "terrainOp", terrainIntentSchema, (client, intent, info) => {
      const player = this.state.players.get(client.sessionId);
      if (!player || info.role !== "driver" || !player.vehicle) return;
      const result = this.terrain.handle(intent, this.actorFor(player, info), this.trucks());
      if (!result.ok) {
        const level = result.reason === "rate" ? "debug" : "info";
        this.log[level]("terrain op rejected", {
          userId: info.user.id,
          kind: intent.kind,
          reason: result.reason,
        });
        return;
      }
      for (const [sessionId, load] of Object.entries(result.loads)) {
        const p = this.state.players.get(sessionId);
        if (p) p.load = Math.max(0, load);
      }
      if (result.movedQ > 0) player.moved = Math.min(0xffffffff, player.moved + result.movedQ);
      for (const op of result.ops) this.broadcast(MSG.terrainOp, encodeOp(op));
    });

    this.handle(MSG.terrainResync, "terrainResync", terrainResyncSchema, (client, msg) => {
      const ops = this.terrain.opsSince(msg.fromSeq);
      if (ops) for (const op of ops) client.send(MSG.terrainOp, encodeOp(op));
      else
        client.send(MSG.terrainSnapshot, {
          seq: this.terrain.seq,
          snapshot: this.terrain.snapshot(),
          reset: false,
        });
    });

    this.handle(MSG.terrainReset, "host", emptyMsgSchema, (client) => {
      if (!this.isHost(client)) return;
      this.resetTerrain("The host smoothed the table. Fresh start!");
    });

    this.handle(MSG.setKeepForLater, "host", keepMsgSchema, (client, msg) => {
      if (!this.isHost(client)) return;
      this.state.keepForLater = msg.keep;
      if (msg.keep) void this.persist(true);
      this.notice({
        kind: "info",
        name: "",
        text: msg.keep
          ? "This table will be kept for 7 days."
          : "This table won't be kept after it closes.",
      });
    });

    this.handle(MSG.chat, "chat", chatMsgSchema, (client, msg, info) => {
      const text = sanitizeChat(msg.text);
      if (!text) return;
      const entry: ChatEntry = {
        id: ++this.chatSeq,
        sessionId: client.sessionId,
        name: info.user.name,
        text,
        at: this.deps.now(),
      };
      this.chat.push(entry);
      if (this.chat.length > CHAT_HISTORY) this.chat.splice(0, this.chat.length - CHAT_HISTORY);
      this.broadcast(MSG.chat, entry);
    });

    // Emotes float above the sender's operator chip on every screen (spectators emote too).
    this.handle(MSG.emote, "emote", emoteMsgSchema, (client, msg) => {
      const event: EmoteEvent = { sessionId: client.sessionId, id: msg.id };
      this.broadcast(MSG.emote, event);
    });

    this.handle(MSG.livery, "livery", liveryMsgSchema, (client, msg) => {
      const player = this.state.players.get(client.sessionId);
      if (!player) return;
      player.color = msg.color;
      player.decal = msg.decal;
      player.number = msg.number;
    });

    this.handle(MSG.pong, "pong", pongMsgSchema, (client, msg, info) => {
      const sentAt = info.pings.get(msg.id);
      if (sentAt === undefined) return;
      info.pings.delete(msg.id);
      const player = this.state.players.get(client.sessionId);
      if (player) player.ping = Math.min(65535, Math.max(0, Math.round(this.deps.now() - sentAt)));
    });

    this.handle(MSG.report, "report", reportMsgSchema, (client, msg, info) => {
      const target = this.state.players.get(msg.target);
      if (!target || msg.target === client.sessionId) return;
      // Reports go to the structured log for moderators; the reported player is not told.
      this.log.warn("player reported", {
        reporter: info.user.id,
        target: target.userId,
        reason: msg.reason,
      });
      client.send(MSG.notice, {
        kind: "info",
        name: "",
        text: "Thanks for letting us know. The report was logged.",
      });
    });

    this.handle(MSG.kick, "host", targetMsgSchema, (client, msg) => {
      if (!this.isHost(client) || msg.target === client.sessionId) return;
      this.removePlayer(msg.target, false);
    });

    this.handle(MSG.ban, "host", targetMsgSchema, (client, msg) => {
      if (!this.isHost(client) || msg.target === client.sessionId) return;
      this.removePlayer(msg.target, true);
    });

    this.handle(MSG.closeTable, "host", emptyMsgSchema, (client) => {
      if (!this.isHost(client)) return;
      this.log.info("table closed by host");
      this.broadcast(MSG.tableClosed, { reason: "closed" });
      void this.disconnect(CLOSE.CLOSED);
    });

    this.handle(MSG.setDayNight, "host", dayNightMsgSchema, (client, msg) => {
      if (!this.isHost(client)) return;
      this.state.dayNight = msg.mode;
    });
  }

  /**
   * Registers a message handler with per-client rate limiting and zod validation. Invalid payloads
   * are dropped and counted; too many in a window disconnects the client.
   */
  protected handle<S extends z.ZodType>(
    type: string,
    rate: RateName,
    schema: S,
    handler: (client: Client, msg: z.output<S>, info: ClientInfo) => void,
  ): void {
    this.onMessage(type, (client: Client, raw: unknown) => {
      const info = this.info.get(client.sessionId);
      if (!info) return;
      let bucket = info.buckets.get(rate);
      if (!bucket) {
        bucket = bucketFor(rate, this.deps.now);
        info.buckets.set(rate, bucket);
      }
      if (!bucket.take()) {
        this.log.debug("rate limited", { userId: info.user.id, type });
        return;
      }
      const parsed = schema.safeParse(raw);
      if (!parsed.success) {
        this.violation(client, info, type);
        return;
      }
      handler(client, parsed.data, info);
    });
  }

  private violation(client: Client, info: ClientInfo, type: string): void {
    const now = this.deps.now();
    if (now - info.violationWindowStart > VIOLATION_WINDOW_MS) {
      info.violationWindowStart = now;
      info.violations = 0;
    }
    info.violations++;
    this.log.warn("invalid message", { userId: info.user.id, type, count: info.violations });
    if (info.violations >= VIOLATION_LIMIT) {
      this.log.warn("disconnecting misbehaving client", { userId: info.user.id });
      client.leave(CLOSE.MISBEHAVING);
    }
  }

  // ─── helpers ─────────────────────────────────────────────────────────────

  private counts(): { drivers: number; spectators: number } {
    let drivers = 0;
    let spectators = 0;
    this.state.players.forEach((p) => (p.role === "spectator" ? spectators++ : drivers++));
    return { drivers, spectators };
  }

  private listing(): TableListing {
    const counts = this.counts();
    const hostPlayer = this.state.players.get(this.state.hostId);
    return {
      tableId: this.state.tableId,
      name: this.settings.name,
      mapId: this.settings.mapId,
      materialId: this.materialId,
      vibe: this.settings.vibe,
      rule: this.settings.rule,
      hostName: hostPlayer?.name ?? "",
      locked: this.passwordHash !== null,
      drivers: counts.drivers,
      maxPlayers: this.settings.maxPlayers,
      spectators: counts.spectators,
    };
  }

  private welcome(client: Client, role: Role): Welcome {
    return {
      sessionId: client.sessionId,
      role,
      tableId: this.state.tableId,
      tableName: this.settings.name,
      mapId: this.settings.mapId,
      materialId: this.materialId,
      inviteCode: this.inviteCode,
      seq: this.terrain.seq,
      snapshot: this.terrain.snapshot(),
      chat: this.chat.slice(),
      serverTime: this.deps.now() - this.createdAt,
    };
  }

  private isHost(client: Client): boolean {
    return this.state.hostId === client.sessionId;
  }

  private passHost(leavingSessionId: string): void {
    const candidates: { sessionId: string; joinedAt: number; connected: boolean }[] = [];
    this.state.players.forEach((p) =>
      candidates.push({ sessionId: p.sessionId, joinedAt: p.joinedAt, connected: p.connected }),
    );
    const next = nextHost(candidates, leavingSessionId);
    this.state.hostId = next ?? "";
    const player = next ? this.state.players.get(next) : undefined;
    if (player) {
      this.notice({ kind: "host", name: player.name, text: `${player.name} is now hosting.` });
    }
  }

  private removePlayer(sessionId: string, ban: boolean): void {
    const player = this.state.players.get(sessionId);
    if (!player) return;
    if (ban) this.bans.add(player.userId);
    this.log.info(ban ? "player banned" : "player kicked", { userId: player.userId });
    const target = this.clients.get(sessionId);
    if (target) {
      target.send(MSG.tableClosed, { reason: ban ? "banned" : "kicked" });
      target.leave(ban ? CLOSE.BANNED : CLOSE.KICKED);
    } else {
      // Dropped and waiting to reconnect: free the seat now.
      this.state.players.delete(sessionId);
      this.info.delete(sessionId);
    }
    this.notice({
      kind: ban ? "ban" : "kick",
      name: player.name,
      text: ban ? `${player.name} was asked to leave the table.` : `${player.name} was kicked.`,
    });
  }

  private pickSpawn(sessionId: string) {
    // The spawn point furthest from every other vehicle.
    let best = this.map.spawnPoints[0]!;
    let bestDist = -1;
    for (const sp of this.map.spawnPoints) {
      let nearest = Infinity;
      this.state.players.forEach((p) => {
        if (p.sessionId === sessionId || !p.vehicle) return;
        nearest = Math.min(nearest, Math.hypot(p.x - sp.x, p.z - sp.z));
      });
      if (nearest > bestDist) {
        bestDist = nearest;
        best = sp;
      }
    }
    return best;
  }

  private actorFor(player: PlayerState, info: ClientInfo): Actor {
    return {
      sessionId: player.sessionId,
      spec: player.vehicle ? VEHICLES[player.vehicle as VehicleId] : null,
      pose: info.guard ? info.guard.lastValid : null,
      joints: Array.from(player.joints),
      loadQ: player.load,
      bucket: UNLIMITED,
    };
  }

  private trucks(): Actor[] {
    const out: Actor[] = [];
    this.state.players.forEach((p) => {
      const info = this.info.get(p.sessionId);
      if (p.vehicle === "dump-truck" && info) out.push(this.actorFor(p, info));
    });
    return out;
  }

  private resetTerrain(text: string): void {
    this.terrain.reset();
    this.state.players.forEach((p) => (p.load = 0));
    this.broadcast(MSG.terrainSnapshot, {
      seq: this.terrain.seq,
      snapshot: this.terrain.snapshot(),
      reset: true,
    });
    this.notice({ kind: "reset", name: "", text });
    this.log.info("terrain reset");
  }

  /** Saves the table if it is kept and changed since the last save. */
  private async persist(force = false): Promise<void> {
    const store = this.deps.store;
    if (!store || !this.state.keepForLater) return;
    if (!force && this.terrain.seq === this.lastSavedSeq) return;
    const seq = this.terrain.seq;
    try {
      const res = await store.save(
        {
          tableId: this.state.tableId,
          ownerId: this.creatorId,
          name: this.settings.name,
          mapId: this.settings.mapId,
          materialId: this.materialId,
        },
        this.terrain.snapshot(),
      );
      if (res.ok) {
        this.lastSavedSeq = seq;
        this.log.info("table saved", { tableId: this.state.tableId, seq });
      } else {
        this.log.warn("table not saved", { tableId: this.state.tableId, reason: res.reason });
        this.notice({
          kind: "info",
          name: "",
          text:
            res.reason === "USER_LIMIT"
              ? "The host's shelf of saved tables is full (5). Free one up in the cafe."
              : "This table got too big to save. Impressive digging!",
        });
      }
    } catch (err) {
      this.log.error("table save failed", { tableId: this.state.tableId, err });
    }
  }

  private writePose(player: PlayerState, pose: Pose): void {
    player.x = pose.x;
    player.y = pose.y;
    player.z = pose.z;
    player.qx = pose.qx;
    player.qy = pose.qy;
    player.qz = pose.qz;
    player.qw = pose.qw;
    player.vx = pose.vx;
    player.vy = pose.vy;
    player.vz = pose.vz;
  }

  private notice(event: NoticeEvent, except?: Client): void {
    this.broadcast(MSG.notice, event, except ? { except } : undefined);
  }

  private sendPings(): void {
    const now = this.deps.now();
    for (const client of this.clients) {
      const info = this.info.get(client.sessionId);
      if (!info) continue;
      for (const [id, sentAt] of info.pings) if (now - sentAt > 10_000) info.pings.delete(id);
      const id = ++this.pingSeq;
      info.pings.set(id, now);
      client.send(MSG.ping, { id, t: now });
    }
  }
}
