import { Client, type Room as ClientRoom } from "@colyseus/sdk";
import { boot, type ColyseusTestServer } from "@colyseus/testing";
import {
  DEFAULT_LIVERY,
  GAME_TOKEN_AUDIENCE,
  GAME_TOKEN_ISSUER,
  MSG,
  type SpawnedEvent,
  type TableSettingsInput,
} from "@dirtyworks/shared";
import { SignJWT } from "jose";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createLogger } from "../src/logger";
import type { TableRoom } from "../src/rooms/TableRoom";
import { createGameServer } from "../src/server";

const SECRET = "integration-secret-at-least-32-characters";
const URL = "http://localhost:2568";
const RECONNECT_SECONDS = 1;

const SETTINGS: TableSettingsInput = {
  name: "Test table",
  mapId: "mini-quarry",
  maxPlayers: 4,
};

let colyseus: ColyseusTestServer;
/** Warn+ log lines from the server, for assertions on structured logging. */
const logLines: string[] = [];
const open: ClientRoom[] = [];

beforeAll(async () => {
  const server = createGameServer({
    config: {
      port: 2568,
      jwtSecret: SECRET,
      allowedOrigins: ["http://localhost:3000"],
      dataDir: "./data-test",
      logLevel: "error",
    },
    logger: createLogger("warn", {}, (line) => logLines.push(line)),
    reconnectSeconds: RECONNECT_SECONDS,
  });
  colyseus = await boot(server);
});

afterEach(async () => {
  // Rooms that were kicked or dropped never resolve leave(); cap the wait.
  await Promise.all(
    open.splice(0).map((r) => Promise.race([r.leave().catch(() => {}), sleep(500)])),
  );
  await colyseus.cleanup();
});

afterAll(async () => {
  await colyseus.shutdown();
});

async function clientAs(id: string, name = id): Promise<Client> {
  const client = new Client(URL);
  client.auth.token = await new SignJWT({ sub: id, name })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(GAME_TOKEN_ISSUER)
    .setAudience(GAME_TOKEN_AUDIENCE)
    .setExpirationTime("5m")
    .sign(new TextEncoder().encode(SECRET));
  return client;
}

function track<T extends ClientRoom>(room: T): T {
  room.reconnection.enabled = false;
  open.push(room);
  return room;
}

async function host(settings: TableSettingsInput = SETTINGS, id = "alice") {
  const client = await clientAs(id, id.toUpperCase());
  const room = track(await client.create("table", { settings, role: "driver" }));
  return { client, room, server: colyseus.getRoomById(room.roomId) as unknown as TableRoom };
}

async function joinAs(roomId: string, id: string, options: Record<string, unknown> = {}) {
  const client = await clientAs(id);
  const room = track(await client.joinById(roomId, { role: "driver", ...options }));
  return { client, room };
}

async function rejection(p: Promise<unknown>): Promise<string> {
  try {
    const room = await p;
    track(room as ClientRoom);
    return "joined";
  } catch (err) {
    return (err as Error).message;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function until(check: () => boolean, timeoutMs = 2000) {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeoutMs) throw new Error("condition not met in time");
    await sleep(20);
  }
}

async function spawn(room: ClientRoom, vehicle = "dump-truck"): Promise<SpawnedEvent> {
  const spawned = room.waitForMessage(MSG.spawned);
  room.send(MSG.spawn, { vehicle, livery: DEFAULT_LIVERY });
  return (await spawned) as SpawnedEvent;
}

function stateAt(s: SpawnedEvent, dx: number, vz = 0) {
  return {
    x: s.x + dx,
    y: s.y,
    z: s.z,
    qx: 0,
    qy: 0,
    qz: 0,
    qw: 1,
    vx: 0,
    vy: 0,
    vz,
    j: [0],
    v: s.vehicle,
    e: 0.5,
    b: 1,
    t: 1,
  };
}

describe("table auth and creation", () => {
  it("rejects creating a table without a game token", async () => {
    const anonymous = new Client(URL);
    expect(await rejection(anonymous.create("table", { settings: SETTINGS }))).not.toBe("joined");
  });

  it("rejects joining the lobby without a game token", async () => {
    const anonymous = new Client(URL);
    expect(await rejection(anonymous.joinOrCreate("lobby"))).not.toBe("joined");
  });

  it("lists a new table with its metadata and the host's name", async () => {
    const { server } = await host();
    expect(server.metadata).toMatchObject({
      name: "Test table",
      mapId: "mini-quarry",
      hostName: "ALICE",
      locked: false,
      drivers: 1,
      spectators: 0,
      maxPlayers: 4,
    });
  });

  it("rejects invalid table settings", async () => {
    const client = await clientAs("alice");
    const msg = await rejection(
      client.create("table", { settings: { ...SETTINGS, maxPlayers: 12 } }),
    );
    expect(msg).toContain("BAD_SETTINGS");
  });

  it("refuses a fourth live table for the same user", async () => {
    await host(SETTINGS, "dave");
    await host(SETTINGS, "dave");
    await host(SETTINGS, "dave");
    const client = await clientAs("dave");
    expect(await rejection(client.create("table", { settings: SETTINGS }))).toContain(
      "TABLE_LIMIT",
    );
  });

  it("checks the password of a locked table", async () => {
    const { server } = await host({ ...SETTINGS, password: "dirt" });
    expect(server.metadata.locked).toBe(true);
    const bob = await clientAs("bob");
    expect(await rejection(bob.joinById(server.roomId, { password: "mud" }))).toContain(
      "BAD_PASSWORD",
    );
    expect(await rejection(bob.joinById(server.roomId, { password: "dirt" }))).toBe("joined");
  });

  it("turns away a driver at a full table but seats a spectator", async () => {
    const { server } = await host({ ...SETTINGS, maxPlayers: 2 });
    await joinAs(server.roomId, "bob");
    const carol = await clientAs("carol");
    expect(await rejection(carol.joinById(server.roomId, { role: "driver" }))).toContain(
      "TABLE_FULL",
    );
    expect(await rejection(carol.joinById(server.roomId, { role: "spectator" }))).toBe("joined");
    await until(() => server.metadata.spectators === 1);
  });

  it("resolves invite codes over HTTP for signed-in players only", async () => {
    const { server } = await host({ ...SETTINGS, visibility: "private" });
    const code = server.inviteCode;
    const anonymous = await fetch(`${URL}/tables/code/${code}`);
    expect(anonymous.status).toBe(401);
    const bob = await clientAs("bob");
    const res = await fetch(`${URL}/tables/code/${code.toLowerCase()}`, {
      headers: { authorization: `Bearer ${bob.auth.token}` },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ roomId: server.roomId, locked: false });
    const missing = await fetch(`${URL}/tables/code/ZZZZZZ`, {
      headers: { authorization: `Bearer ${bob.auth.token}` },
    });
    expect(missing.status).toBe(404);
  });
});

describe("handshake", () => {
  it("sends the welcome only after the client says it is ready", async () => {
    const { room, server } = await host();
    let early = false;
    room.onMessage(MSG.welcome, () => (early = true));
    await sleep(150);
    expect(early).toBe(false);
    const welcome = room.waitForMessage(MSG.welcome);
    room.send(MSG.ready);
    expect(await welcome).toMatchObject({
      sessionId: room.sessionId,
      role: "driver",
      tableName: "Test table",
      mapId: "mini-quarry",
      inviteCode: server.inviteCode,
    });
  });
});

describe("driving", () => {
  it("accepts a legal state update after spawning", async () => {
    const { room, server } = await host();
    const spawned = await spawn(room);
    room.send(MSG.state, stateAt(spawned, 0.3));
    await until(
      () => Math.abs(server.state.players.get(room.sessionId)!.x - (spawned.x + 0.3)) < 1e-3,
    );
  });

  it("ignores state updates before the player has a vehicle", async () => {
    const { room, server } = await host();
    room.send(MSG.state, stateAt({ vehicle: "dump-truck", x: 5, y: 5, z: 5, yaw: 0 }, 0));
    await sleep(150);
    expect(server.state.players.get(room.sessionId)!.vehicle).toBe("");
  });

  it("corrects a player who teleports three times in a row", async () => {
    const { room } = await host();
    const spawned = await spawn(room);
    const correction = room.waitForMessage(MSG.correction);
    for (let i = 0; i < 3; i++) room.send(MSG.state, stateAt(spawned, 30 + i));
    expect(await correction).toMatchObject({ x: spawned.x, z: spawned.z });
  });

  it("drops malformed payloads without disconnecting the player", async () => {
    const { room, server } = await host();
    const bob = await joinAs(server.roomId, "bob");
    room.send(MSG.state, { x: "garbage" });
    room.send(MSG.chat, { text: 42 });
    room.send(MSG.spawn, { vehicle: "tank" });
    const chat = bob.room.waitForMessage(MSG.chat);
    room.send(MSG.chat, { text: "still here" });
    expect(await chat).toMatchObject({ text: "still here" });
  });

  it("disconnects a client that keeps sending garbage", async () => {
    const { room } = await host();
    const left = new Promise<number>((resolve) => room.onLeave((code) => resolve(code)));
    for (let i = 0; i < 25; i++) room.send(MSG.state, { nope: i });
    await left;
  });
});

describe("chat", () => {
  it("broadcasts sanitized chat and rate limits bursts", async () => {
    const { room, server } = await host();
    const bob = await joinAs(server.roomId, "bob");
    const received: { text: string; name: string }[] = [];
    bob.room.onMessage(MSG.chat, (m: { text: string; name: string }) => received.push(m));
    room.send(MSG.chat, { text: "  hello\u0000   there  " });
    room.send(MSG.chat, { text: "two" });
    room.send(MSG.chat, { text: "three" });
    room.send(MSG.chat, { text: "four" });
    await sleep(300);
    expect(received.map((m) => m.text)).toEqual(["hello there", "two", "three"]);
    expect(received[0]!.name).toBe("ALICE");
  });
});

describe("hosting and moderation", () => {
  it("lets the host kick a player", async () => {
    const { room, server } = await host();
    const bob = await joinAs(server.roomId, "bob");
    const left = new Promise<number>((resolve) => bob.room.onLeave((code) => resolve(code)));
    room.send(MSG.kick, { target: bob.room.sessionId });
    await left;
    await until(() => !server.state.players.has(bob.room.sessionId));
  });

  it("keeps a banned player out for the rest of the session", async () => {
    const { room, server } = await host();
    const bob = await joinAs(server.roomId, "bob");
    room.send(MSG.ban, { target: bob.room.sessionId });
    await until(() => !server.state.players.has(bob.room.sessionId));
    const again = await clientAs("bob");
    expect(await rejection(again.joinById(server.roomId))).toContain("BANNED");
  });

  it("ignores host-only messages from other players", async () => {
    const { room, server } = await host();
    const bob = await joinAs(server.roomId, "bob");
    bob.room.send(MSG.kick, { target: room.sessionId });
    await sleep(200);
    expect(server.state.players.has(room.sessionId)).toBe(true);
  });

  it("hands hosting to the earliest remaining player when the host leaves", async () => {
    const { room, server } = await host();
    const bob = await joinAs(server.roomId, "bob");
    await joinAs(server.roomId, "carol");
    await room.leave();
    await until(() => server.state.hostId === bob.room.sessionId);
    expect(server.metadata.hostName).toBe("bob");
  });

  it("logs a structured line when a player is reported, without telling the target", async () => {
    const { room, server } = await host();
    const bob = await joinAs(server.roomId, "bob");
    let bobHeard = false;
    await sleep(150); // let the join notice pass first
    bob.room.onMessage(MSG.notice, () => (bobHeard = true));
    const ack = room.waitForMessage(MSG.notice);
    room.send(MSG.report, { target: bob.room.sessionId, reason: "spam" });
    expect(await ack).toMatchObject({ kind: "info" });
    const entry = logLines.map((l) => JSON.parse(l)).find((e) => e.msg === "player reported");
    expect(entry).toMatchObject({ reporter: "alice", target: "bob", reason: "spam" });
    expect(bobHeard).toBe(false);
  });

  it("shares the host's day/night choice", async () => {
    const { room, server } = await host();
    room.send(MSG.setDayNight, { mode: "night" });
    await until(() => server.state.dayNight === "night");
  });

  it("closes the table for everyone when the host asks", async () => {
    const { room, server } = await host();
    const bob = await joinAs(server.roomId, "bob");
    const closed = bob.room.waitForMessage(MSG.tableClosed);
    room.send(MSG.closeTable);
    expect(await closed).toMatchObject({ reason: "closed" });
  });
});

describe("reconnection", () => {
  it("holds a dropped player's seat and vehicle until they come back", async () => {
    const { server } = await host();
    const bob = await joinAs(server.roomId, "bob");
    await spawn(bob.room, "bulldozer");
    const sessionId = bob.room.sessionId;
    const token = bob.room.reconnectionToken;
    bob.room.leave(false);
    await until(() => server.state.players.get(sessionId)?.connected === false);
    const back = track(await bob.client.reconnect(token));
    expect(back.sessionId).toBe(sessionId);
    await until(() => server.state.players.get(sessionId)?.connected === true);
    expect(server.state.players.get(sessionId)!.vehicle).toBe("bulldozer");
  });

  it("frees the seat once the hold expires", async () => {
    const { server } = await host();
    const bob = await joinAs(server.roomId, "bob");
    const sessionId = bob.room.sessionId;
    bob.room.leave(false);
    await until(() => !server.state.players.has(sessionId), (RECONNECT_SECONDS + 1) * 1000);
    expect(server.metadata.drivers).toBe(1);
  });

  it("disposes the table when the last player leaves", async () => {
    const { room, server } = await host();
    const roomId = server.roomId;
    await room.leave();
    await until(() => {
      try {
        return colyseus.getRoomById(roomId) === undefined;
      } catch {
        return true;
      }
    });
  });
});
