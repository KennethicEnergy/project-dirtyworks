/** Server-only environment access. Never import this from client components. */
import "server-only";

export function devLoginEnabled(): boolean {
  return process.env.AUTH_DEV_LOGIN === "true" && process.env.NODE_ENV !== "production";
}

export function googleConfigured(): boolean {
  return Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);
}

export function gameJwtSecret(): string {
  const secret = process.env.GAME_JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("GAME_JWT_SECRET must be set to at least 32 characters");
  }
  return secret;
}
