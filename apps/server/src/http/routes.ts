/** Plain HTTP endpoints next to Colyseus matchmaking. All but /health require a game token. */
import { createEndpoint, createRouter, getBearerToken, matchMaker } from "@colyseus/core";
import { isInviteCode, normalizeInviteCode, type GameUser } from "@dirtyworks/shared";
import { AuthError, verifyGameToken } from "../auth";
import type { ServerConfig } from "../config";
import type { TableRegistry } from "../game/tableRegistry";
import type { SnapshotStore } from "../persistence/SnapshotStore";

export interface RouteDeps {
  config: ServerConfig;
  registry: TableRegistry;
  store: SnapshotStore | null;
}

export function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export async function requireUser(
  request: Request | undefined,
  secret: string,
): Promise<GameUser | Response> {
  const token = getBearerToken(request?.headers.get("authorization") ?? "");
  try {
    return await verifyGameToken(token ?? undefined, secret);
  } catch (err) {
    return json(401, { error: err instanceof AuthError ? err.code : "invalid" });
  }
}

export function createRoutes({ config, registry, store }: RouteDeps) {
  return createRouter({
    health: createEndpoint("/health", { method: "GET" }, async () => json(200, { ok: true })),

    tableByCode: createEndpoint("/tables/code/:code", { method: "GET" }, async (ctx) => {
      const user = await requireUser(ctx.request, config.jwtSecret);
      if (user instanceof Response) return user;
      const code = normalizeInviteCode(String(ctx.params?.code ?? ""));
      if (!isInviteCode(code)) return json(404, { error: "NOT_FOUND" });
      const roomId = registry.roomForCode(code);
      if (!roomId) return json(404, { error: "NOT_FOUND" });
      // The local driver returns a thenable without .catch(), so await inside try instead.
      let room;
      try {
        room = await matchMaker.getRoomById(roomId);
      } catch {
        room = undefined;
      }
      if (!room) return json(404, { error: "NOT_FOUND" });
      return json(200, { roomId, locked: Boolean(room.metadata?.locked) });
    }),

    savedTables: createEndpoint("/tables/saved", { method: "GET" }, async (ctx) => {
      const user = await requireUser(ctx.request, config.jwtSecret);
      if (user instanceof Response) return user;
      return json(200, { tables: store ? await store.list(user.id) : [] });
    }),

    deleteSavedTable: createEndpoint("/tables/saved/:id", { method: "DELETE" }, async (ctx) => {
      const user = await requireUser(ctx.request, config.jwtSecret);
      if (user instanceof Response) return user;
      const removed = store ? await store.remove(String(ctx.params?.id ?? ""), user.id) : false;
      return json(removed ? 200 : 404, { removed });
    }),
  });
}
