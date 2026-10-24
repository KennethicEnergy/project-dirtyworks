/** Table (Colyseus room) settings, seating and host rules. */
import { z } from "zod";
import { MAX_PLAYERS, MAX_SPECTATORS, MAX_TABLES_PER_USER, MIN_PLAYERS } from "./constants";
import { MAP_IDS, MATERIAL_IDS, type MapId, type MaterialId } from "./ids";

export const VIBES = ["chill", "contest", "beginners"] as const;
export type Vibe = (typeof VIBES)[number];
export const VIBE_LABELS: Record<Vibe, string> = {
  chill: "Chill",
  contest: "Contest",
  beginners: "Beginners welcome",
};

export const TABLE_RULES = ["free-play", "pile-contest", "build-the-road"] as const;
export type TableRule = (typeof TABLE_RULES)[number];
export const TABLE_RULE_LABELS: Record<TableRule, string> = {
  "free-play": "Free play",
  "pile-contest": "Pile contest",
  "build-the-road": "Build the road",
};

export const ROLES = ["driver", "spectator"] as const;
export type Role = (typeof ROLES)[number];

export const tableSettingsSchema = z.object({
  name: z.string().trim().min(2).max(32),
  mapId: z.enum(MAP_IDS),
  vibe: z.enum(VIBES).default("chill"),
  rule: z.enum(TABLE_RULES).default("free-play"),
  maxPlayers: z.number().int().min(MIN_PLAYERS).max(MAX_PLAYERS).default(4),
  visibility: z.enum(["public", "private"]).default("public"),
  password: z.string().min(4).max(32).optional(),
  materialId: z.enum(MATERIAL_IDS).optional(),
  terrainPersistence: z.enum(["session", "none"]).default("session"),
  keepForLater: z.boolean().default(false),
  /** Saved table to reopen (owner only). */
  restoreId: z
    .string()
    .regex(/^[A-Za-z0-9_-]{6,64}$/)
    .optional(),
});
export type TableSettings = z.output<typeof tableSettingsSchema>;
export type TableSettingsInput = z.input<typeof tableSettingsSchema>;

/** What the cafe chalkboard shows for each table (Colyseus room metadata). */
export interface TableListing {
  tableId: string;
  name: string;
  mapId: MapId;
  materialId: MaterialId;
  vibe: Vibe;
  rule: TableRule;
  hostName: string;
  locked: boolean;
  drivers: number;
  maxPlayers: number;
  spectators: number;
}

export type Check<R extends string> = { ok: true } | { ok: false; reason: R };

export function canCreateTable(liveTablesForUser: number): Check<"TABLE_LIMIT"> {
  return liveTablesForUser >= MAX_TABLES_PER_USER
    ? { ok: false, reason: "TABLE_LIMIT" }
    : { ok: true };
}

export function canJoinAs(
  role: Role,
  counts: { drivers: number; spectators: number },
  maxPlayers: number,
): Check<"TABLE_FULL" | "SPECTATORS_FULL"> {
  if (role === "driver" && counts.drivers >= maxPlayers) {
    return { ok: false, reason: "TABLE_FULL" };
  }
  if (role === "spectator" && counts.spectators >= MAX_SPECTATORS) {
    return { ok: false, reason: "SPECTATORS_FULL" };
  }
  return { ok: true };
}

export interface HostCandidate {
  sessionId: string;
  joinedAt: number;
  connected: boolean;
}

function outranks(a: HostCandidate, b: HostCandidate): boolean {
  if (a.connected !== b.connected) return a.connected;
  if (a.joinedAt !== b.joinedAt) return a.joinedAt < b.joinedAt;
  return a.sessionId < b.sessionId;
}

/** Earliest-joined remaining player becomes host; connected players win over dropped ones. */
export function nextHost(
  players: readonly HostCandidate[],
  leavingSessionId: string,
): string | null {
  let best: HostCandidate | null = null;
  for (const p of players) {
    if (p.sessionId === leavingSessionId) continue;
    if (best === null || outranks(p, best)) best = p;
  }
  return best?.sessionId ?? null;
}

/** No I, L, O, 0 or 1, so codes survive being read aloud across a cafe. */
export const INVITE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const INVITE_CODE_LENGTH = 6;
const INVITE_RE = new RegExp(`^[${INVITE_ALPHABET}]{${INVITE_CODE_LENGTH}}$`);

export function makeInviteCode(rand: () => number = Math.random): string {
  let code = "";
  for (let i = 0; i < INVITE_CODE_LENGTH; i++) {
    const idx = Math.min(INVITE_ALPHABET.length - 1, Math.floor(rand() * INVITE_ALPHABET.length));
    code += INVITE_ALPHABET[idx];
  }
  return code;
}

export function normalizeInviteCode(input: string): string {
  return input.trim().toUpperCase();
}

export function isInviteCode(code: string): boolean {
  return INVITE_RE.test(code);
}
