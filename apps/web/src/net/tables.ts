/** Creating, joining and finding tables. UI copy says "table"; Colyseus calls them rooms. */
import type { Room } from "@colyseus/sdk";
import type { Role, TableSettingsInput } from "@dirtyworks/shared";
import { authHeaders, gameServerUrl, getGameClient } from "./gameClient";

export const TABLE_ROOM = "table";
export const LOBBY_ROOM = "lobby";

export async function createTable(settings: TableSettingsInput): Promise<Room> {
  const client = await getGameClient();
  return client.create(TABLE_ROOM, { settings, role: "driver" });
}

export async function joinTable(
  roomId: string,
  opts: { role: Role; password?: string },
): Promise<Room> {
  const client = await getGameClient();
  return client.joinById(roomId, opts);
}

export async function reconnectTable(reconnectionToken: string): Promise<Room> {
  const client = await getGameClient();
  return client.reconnect(reconnectionToken);
}

export async function lookupInviteCode(
  code: string,
): Promise<{ roomId: string; locked: boolean } | null> {
  const res = await fetch(`${gameServerUrl()}/tables/code/${encodeURIComponent(code)}`, {
    headers: await authHeaders(),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`invite lookup failed (${res.status})`);
  return (await res.json()) as { roomId: string; locked: boolean };
}

/** Hands an already-joined room from the cafe to the table page without rejoining. */
const handoff = new Map<string, Room>();

export function stashRoom(room: Room): void {
  handoff.set(room.roomId, room);
}

export function takeStashedRoom(roomId: string): Room | null {
  const room = handoff.get(roomId) ?? null;
  handoff.delete(roomId);
  return room;
}
