/** Game token verification (HS256, shared secret with the web app). */
import {
  GAME_TOKEN_AUDIENCE,
  GAME_TOKEN_ISSUER,
  gameTokenClaimsSchema,
  toGameUser,
  type GameUser,
} from "@dirtyworks/shared";
import { errors, jwtVerify } from "jose";

export type AuthErrorCode = "missing" | "invalid" | "expired";

export class AuthError extends Error {
  constructor(readonly code: AuthErrorCode) {
    super(`game token ${code}`);
    this.name = "AuthError";
  }
}

const keys = new Map<string, Uint8Array>();
function keyFor(secret: string): Uint8Array {
  let key = keys.get(secret);
  if (!key) {
    key = new TextEncoder().encode(secret);
    keys.set(secret, key);
  }
  return key;
}

export async function verifyGameToken(
  token: string | undefined,
  secret: string,
): Promise<GameUser> {
  if (!token) throw new AuthError("missing");
  let payload: unknown;
  try {
    ({ payload } = await jwtVerify(token, keyFor(secret), {
      issuer: GAME_TOKEN_ISSUER,
      audience: GAME_TOKEN_AUDIENCE,
      algorithms: ["HS256"],
      requiredClaims: ["exp", "sub"],
    }));
  } catch (err) {
    throw new AuthError(err instanceof errors.JWTExpired ? "expired" : "invalid");
  }
  const claims = gameTokenClaimsSchema.safeParse(payload);
  if (!claims.success) throw new AuthError("invalid");
  return toGameUser(claims.data);
}
