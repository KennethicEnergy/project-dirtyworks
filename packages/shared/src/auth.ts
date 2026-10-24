/** Game token claims shared by the web app (mints) and the game server (verifies). */
import { z } from "zod";
import { cleanText } from "./chat";

export const GAME_TOKEN_ISSUER = "dirtyworks-web";
export const GAME_TOKEN_AUDIENCE = "dirtyworks-server";

export const gameTokenClaimsSchema = z.object({
  sub: z.string().min(1).max(128),
  name: z.string().max(200),
  avatar: z.string().max(2048).nullable().optional(),
});
export type GameTokenClaims = z.infer<typeof gameTokenClaimsSchema>;

export interface GameUser {
  id: string;
  name: string;
  avatar: string | null;
}

// https, one or more subdomains of googleusercontent.com, optional :443, then a path or nothing.
const GOOGLE_AVATAR =
  /^https:\/\/(?:[a-z0-9-]+\.)+googleusercontent\.com(?::443)?(?:\/[^\s"'<>]*)?$/i;

export function isAllowedAvatarUrl(url: string): boolean {
  return GOOGLE_AVATAR.test(url);
}

export function cleanDisplayName(name: string): string {
  const cleaned = Array.from(cleanText(name)).slice(0, 32).join("").trim();
  return cleaned || "Operator";
}

export function toGameUser(claims: GameTokenClaims): GameUser {
  const avatar = claims.avatar && isAllowedAvatarUrl(claims.avatar) ? claims.avatar : null;
  return { id: claims.sub, name: cleanDisplayName(claims.name), avatar };
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const picked = parts.length > 1 ? [parts[0]!, parts[parts.length - 1]!] : parts.slice(0, 1);
  return picked.map((p) => Array.from(p)[0]!.toUpperCase()).join("") || "?";
}
