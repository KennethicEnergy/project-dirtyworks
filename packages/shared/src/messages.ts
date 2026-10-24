/** Message names, payload schemas (client → server) and payload types (server → client). */
import { z } from "zod";
import { EMOTE_IDS, type EmoteId } from "./emotes";
import { liverySchema } from "./livery";
import type { Role } from "./tables";
import { vehicleIdSchema, type VehicleId } from "./vehicles";

export const MSG = {
  // client → server
  state: "state",
  spawn: "spawn",
  terrainOp: "terrainOp",
  terrainResync: "terrainResync",
  chat: "chat",
  emote: "emote",
  livery: "livery",
  report: "report",
  pong: "pong",
  kick: "kick",
  ban: "ban",
  closeTable: "closeTable",
  setDayNight: "setDayNight",
  terrainReset: "terrainReset",
  setKeepForLater: "setKeepForLater",
  // server → client
  welcome: "welcome",
  spawned: "spawned",
  terrainSnapshot: "terrainSnapshot",
  correction: "correction",
  notice: "notice",
  ping: "ping",
  tableClosed: "tableClosed",
  error: "error",
} as const;

/** Vehicle state, 20 Hz. Short keys keep the msgpack payload small. */
export const stateMsgSchema = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number(),
  qx: z.number(),
  qy: z.number(),
  qz: z.number(),
  qw: z.number(),
  vx: z.number(),
  vy: z.number(),
  vz: z.number(),
  /** Joint values in spec order. */
  j: z.array(z.number()).max(4),
  v: vehicleIdSchema,
  /** Operator rim position (0..1). */
  e: z.number().min(0).max(1),
  /** Battery level (0..1). */
  b: z.number().min(0).max(1),
  /** Client clock (ms), echoed for diagnostics. */
  t: z.number().int().nonnegative(),
});
export type StateMsg = z.infer<typeof stateMsgSchema>;

export const spawnMsgSchema = z.object({ vehicle: vehicleIdSchema, livery: liverySchema });
export const chatMsgSchema = z.object({ text: z.string().max(1000) });
export const emoteMsgSchema = z.object({ id: z.enum(EMOTE_IDS) });
export const liveryMsgSchema = liverySchema;
export const REPORT_REASONS = ["rude", "spam", "griefing", "other"] as const;
export const reportMsgSchema = z.object({
  target: z.string().min(1).max(64),
  reason: z.enum(REPORT_REASONS),
});
export const targetMsgSchema = z.object({ target: z.string().min(1).max(64) });
export const dayNightMsgSchema = z.object({ mode: z.enum(["day", "night"]) });
export const keepMsgSchema = z.object({ keep: z.boolean() });
export const pongMsgSchema = z.object({ id: z.number().int().nonnegative() });
export const terrainResyncSchema = z.object({ fromSeq: z.number().int().nonnegative() });
/** For messages that carry no payload. */
export const emptyMsgSchema = z.union([z.undefined(), z.null(), z.object({}).strict()]);

export type DayNight = "day" | "night";

export interface ChatEntry {
  id: number;
  sessionId: string;
  name: string;
  text: string;
  at: number;
}

export interface Welcome {
  sessionId: string;
  role: Role;
  tableId: string;
  inviteCode: string;
  /** Terrain op sequence number the snapshot is at. */
  seq: number;
  snapshot: Uint8Array;
  chat: ChatEntry[];
  serverTime: number;
}

export interface SpawnedEvent {
  vehicle: VehicleId;
  x: number;
  y: number;
  z: number;
  yaw: number;
}

export type NoticeKind =
  "join" | "leave" | "drop" | "back" | "kick" | "ban" | "host" | "reset" | "info";

export interface NoticeEvent {
  kind: NoticeKind;
  name: string;
  text: string;
}

export interface EmoteEvent {
  sessionId: string;
  id: EmoteId;
}

export interface Correction {
  x: number;
  y: number;
  z: number;
  qx: number;
  qy: number;
  qz: number;
  qw: number;
}

export interface PingEvent {
  id: number;
  t: number;
}

export const ERROR_CODES = [
  "UNAUTHORIZED",
  "TABLE_LIMIT",
  "BAD_SETTINGS",
  "BAD_PASSWORD",
  "BANNED",
  "TABLE_FULL",
  "SPECTATORS_FULL",
  "NOT_FOUND",
  "RATE_LIMITED",
  "INVALID",
  "NOT_HOST",
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ErrorEvent {
  code: ErrorCode;
  message: string;
}

/** Friendly copy for every error the server can send. */
export const ERROR_COPY: Record<ErrorCode, string> = {
  UNAUTHORIZED: "Your cafe pass expired. Sign in again and grab a seat.",
  TABLE_LIMIT: "You're already hosting three tables. Even dads need a break.",
  BAD_SETTINGS: "Those table settings don't quite add up.",
  BAD_PASSWORD: "That password didn't dig it. Try again?",
  BANNED: "The host asked you to sit this one out.",
  TABLE_FULL: "Table is full. Spectate, or wait for a seat to open up.",
  SPECTATORS_FULL: "Even the spectator benches are packed.",
  NOT_FOUND: "That table packed up and went home.",
  RATE_LIMITED: "Whoa there, easy on the levers.",
  INVALID: "That move didn't quite make sense to the table.",
  NOT_HOST: "Only the host can do that.",
};
