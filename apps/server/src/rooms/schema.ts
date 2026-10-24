/** Synced table state. Field order is the wire format; append new fields at the end. */
import { schema, t, type SchemaType } from "@colyseus/schema";

export const PlayerState = schema(
  {
    sessionId: t.string().default(""),
    userId: t.string().default(""),
    name: t.string().default(""),
    avatar: t.string().default(""),
    role: t.string().default("driver"),
    connected: t.boolean().default(true),
    /** Empty until the player picks a vehicle in the garage. */
    vehicle: t.string().default(""),
    color: t.string().default("safety-yellow"),
    decal: t.string().default("stripes"),
    number: t.uint8().default(7),
    x: t.float32().default(0),
    y: t.float32().default(0),
    z: t.float32().default(0),
    qx: t.float32().default(0),
    qy: t.float32().default(0),
    qz: t.float32().default(0),
    qw: t.float32().default(1),
    vx: t.float32().default(0),
    vy: t.float32().default(0),
    vz: t.float32().default(0),
    joints: t.array("float32"),
    /** Carried material in 1/1024 m³ quanta. */
    load: t.uint32().default(0),
    /** Total material this player has moved, in quanta. */
    moved: t.uint32().default(0),
    /** Battery 0..255. */
    battery: t.uint8().default(255),
    /** Operator spot along the table rim, 0..1. */
    edgeT: t.float32().default(0),
    ping: t.uint16().default(0),
    /** Server ms (since table start) of the last accepted state update. */
    t: t.uint32().default(0),
    joinedAt: t.float64().default(0),
  },
  "Player",
);
export type PlayerState = SchemaType<typeof PlayerState>;

export const TableState = schema(
  {
    tableId: t.string().default(""),
    name: t.string().default(""),
    mapId: t.string().default(""),
    materialId: t.string().default(""),
    vibe: t.string().default("chill"),
    rule: t.string().default("free-play"),
    /** Session id of the current host. */
    hostId: t.string().default(""),
    dayNight: t.string().default("day"),
    keepForLater: t.boolean().default(false),
    players: t.map(PlayerState),
  },
  "TableState",
);
export type TableState = SchemaType<typeof TableState>;
