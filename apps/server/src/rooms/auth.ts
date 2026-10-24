/**
 * Shared room wiring: dependency injection for room classes and the static `onAuth` used by
 * every room type. Colyseus calls static `onAuth` during the HTTP matchmaking request; the
 * verified user becomes `client.auth`, and is also stamped onto the options object so
 * `onCreate` (which receives no auth data) knows who created the table.
 */
import { ErrorCode, ServerError } from "@colyseus/core";
import type { ErrorCode as AppErrorCode, GameUser } from "@dirtyworks/shared";
import { AuthError, verifyGameToken } from "../auth";
import type { ServerConfig } from "../config";
import type { TableRegistry } from "../game/tableRegistry";
import type { Logger } from "../logger";

export interface RoomDeps {
  config: ServerConfig;
  logger: Logger;
  registry: TableRegistry;
  reconnectSeconds: number;
  now: () => number;
}

let deps: RoomDeps | undefined;

export function configureRooms(next: RoomDeps): void {
  deps = next;
}

export function roomDeps(): RoomDeps {
  if (!deps) throw new Error("rooms used before configureRooms()");
  return deps;
}

/** Options key carrying the verified creator into `onCreate`. Always overwritten by onAuth. */
export const VERIFIED_USER = "__verifiedUser";

/** Throws a ServerError whose message is one of the shared app error codes. */
export function reject(code: AppErrorCode): never {
  throw new ServerError(
    code === "UNAUTHORIZED" ? ErrorCode.AUTH_FAILED : ErrorCode.APPLICATION_ERROR,
    code,
  );
}

export async function authenticate(
  token: string | undefined,
  options: Record<string, unknown> | undefined,
): Promise<GameUser> {
  const d = roomDeps();
  try {
    const user = await verifyGameToken(token, d.config.jwtSecret);
    if (options && typeof options === "object") options[VERIFIED_USER] = user;
    return user;
  } catch (err) {
    if (options && typeof options === "object") delete options[VERIFIED_USER];
    d.logger.info("auth rejected", { reason: err instanceof AuthError ? err.code : "error" });
    reject("UNAUTHORIZED");
  }
}
