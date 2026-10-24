/** One Colyseus SDK client per tab, always carrying a fresh game token. */
import { Client } from "@colyseus/sdk";
import type { GameUser } from "@dirtyworks/shared";

export class SignedOutError extends Error {
  constructor() {
    super("UNAUTHORIZED");
    this.name = "SignedOutError";
  }
}

interface TokenResponse {
  token: string;
  user: GameUser;
  expiresIn: number;
}

const REFRESH_MARGIN_MS = 60_000;

let client: Client | null = null;
let tokenExpiresAt = 0;
let me: GameUser | null = null;
let pending: Promise<void> | null = null;

export function gameServerUrl(): string {
  return process.env.NEXT_PUBLIC_GAME_SERVER_URL || "http://localhost:2567";
}

async function refreshToken(c: Client): Promise<void> {
  const res = await fetch("/api/game-token", { cache: "no-store" });
  if (res.status === 401) throw new SignedOutError();
  if (!res.ok) throw new Error(`game token request failed (${res.status})`);
  const body = (await res.json()) as TokenResponse;
  c.auth.token = body.token;
  tokenExpiresAt = Date.now() + body.expiresIn * 1000;
  me = body.user;
}

/** Returns the shared client with a token valid for at least another minute. */
export async function getGameClient(): Promise<Client> {
  if (!client) client = new Client(gameServerUrl());
  const c = client;
  if (Date.now() > tokenExpiresAt - REFRESH_MARGIN_MS) {
    pending ??= refreshToken(c).finally(() => (pending = null));
    await pending;
  }
  return c;
}

/** The signed-in player as the game server sees them (no email). */
export function currentUser(): GameUser | null {
  return me;
}

/** Bearer header for the game server's HTTP routes. */
export async function authHeaders(): Promise<Record<string, string>> {
  const c = await getGameClient();
  return { authorization: `Bearer ${c.auth.token}` };
}
