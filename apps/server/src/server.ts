/** Builds the Colyseus server (rooms, routes, origin checks) without listening. */
import { matchMaker, Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { RECONNECT_SECONDS } from "@dirtyworks/shared";
import type { ServerConfig } from "./config";
import { TableRegistry } from "./game/tableRegistry";
import { createRoutes } from "./http/routes";
import type { Logger } from "./logger";
import { configureRooms } from "./rooms/auth";
import { AuthedLobbyRoom } from "./rooms/AuthedLobbyRoom";
import { TableRoom } from "./rooms/TableRoom";

export interface GameServerOptions {
  config: ServerConfig;
  logger: Logger;
  registry?: TableRegistry;
  reconnectSeconds?: number;
  now?: () => number;
  gracefullyShutdown?: boolean;
}

export function isAllowedOrigin(origin: string | null, allowed: readonly string[]): boolean {
  // Non-browser clients (tests, tools) send no Origin header; browsers always do.
  if (!origin) return true;
  return allowed.includes(origin);
}

export function createGameServer(opts: GameServerOptions): Server {
  const { config, logger } = opts;
  const registry = opts.registry ?? new TableRegistry();
  configureRooms({
    config,
    logger,
    registry,
    reconnectSeconds: opts.reconnectSeconds ?? RECONNECT_SECONDS,
    now: opts.now ?? Date.now,
  });

  // CORS for matchmaking and our routes: echo the origin only when it is allowed.
  matchMaker.controller.getCorsHeaders = (headers: Headers) => {
    const origin = headers.get("origin");
    return isAllowedOrigin(origin, config.allowedOrigins) && origin
      ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" }
      : { "Access-Control-Allow-Origin": config.allowedOrigins[0] ?? "null", Vary: "Origin" };
  };

  const transport = new WebSocketTransport({
    maxPayload: 16 * 1024,
    beforeUpgrade: (request) => {
      const origin = request.headers.get("origin");
      if (!isAllowedOrigin(origin, config.allowedOrigins)) {
        logger.warn("websocket origin rejected", { origin });
        return new Response("origin not allowed", { status: 403 });
      }
    },
  });

  const server = new Server({
    transport,
    greet: false,
    gracefullyShutdown: opts.gracefullyShutdown ?? false,
  });
  server.router = createRoutes({ config, registry });
  server.define("lobby", AuthedLobbyRoom);
  server.define("table", TableRoom).enableRealtimeListing();
  return server;
}
