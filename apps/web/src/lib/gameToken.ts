/** Short-lived HS256 game tokens, minted for signed-in users and verified by the game server. */
import {
  cleanDisplayName,
  GAME_TOKEN_AUDIENCE,
  GAME_TOKEN_ISSUER,
  GAME_TOKEN_TTL_SEC,
  isAllowedAvatarUrl,
  type GameUser,
} from "@dirtyworks/shared";
import { SignJWT } from "jose";

export async function mintGameToken(
  user: GameUser,
  secret: string,
  nowSec: number = Math.floor(Date.now() / 1000),
): Promise<string> {
  const avatar = user.avatar && isAllowedAvatarUrl(user.avatar) ? user.avatar : null;
  return new SignJWT({ name: user.name, avatar })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(user.id)
    .setIssuer(GAME_TOKEN_ISSUER)
    .setAudience(GAME_TOKEN_AUDIENCE)
    .setIssuedAt(nowSec)
    .setExpirationTime(nowSec + GAME_TOKEN_TTL_SEC)
    .sign(new TextEncoder().encode(secret));
}

interface SessionLike {
  user?: { id?: string | null; name?: string | null; image?: string | null; email?: string | null };
}

/** The only fields of a session that ever leave the web app. */
export function sessionToGameUser(session: SessionLike | null | undefined): GameUser | null {
  const user = session?.user;
  if (!user?.id) return null;
  const avatar = user.image && isAllowedAvatarUrl(user.image) ? user.image : null;
  return { id: user.id, name: cleanDisplayName(user.name ?? ""), avatar };
}
