import { ERROR_CODES, ERROR_COPY, type ErrorCode } from "@dirtyworks/shared";

const KNOWN = new Set<string>(ERROR_CODES);

/** The server puts the app error code in the message of matchmaking/join errors. */
export function errorCodeOf(err: unknown): ErrorCode | null {
  const message =
    typeof err === "object" && err !== null && "message" in err
      ? String((err as { message: unknown }).message)
      : typeof err === "string"
        ? err
        : "";
  const trimmed = message.trim();
  return KNOWN.has(trimmed) ? (trimmed as ErrorCode) : null;
}

export function friendlyError(err: unknown): string {
  const code = errorCodeOf(err);
  return code
    ? ERROR_COPY[code]
    : "Couldn't reach the game server. Is the coffee machine (and the server) on?";
}
