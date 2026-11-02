/** "Your saved tables": kept tables the server stored for this player, and reopening them. */
import {
  MAP_IDS,
  MATERIAL_IDS,
  type MapId,
  type MaterialId,
  type TableSettingsInput,
} from "@dirtyworks/shared";
import { authHeaders, gameServerUrl } from "./gameClient";

/** One entry of the server's saved-table index (owner only). */
export interface SavedTable {
  tableId: string;
  ownerId: string;
  name: string;
  mapId: string;
  materialId: string;
  savedAt: number;
  expiresAt: number;
  bytes: number;
}

export async function listSavedTables(): Promise<SavedTable[]> {
  const res = await fetch(`${gameServerUrl()}/tables/saved`, { headers: await authHeaders() });
  if (!res.ok) throw new Error(`saved tables request failed (${res.status})`);
  return ((await res.json()) as { tables: SavedTable[] }).tables;
}

export async function forgetSavedTable(tableId: string): Promise<boolean> {
  const res = await fetch(`${gameServerUrl()}/tables/saved/${encodeURIComponent(tableId)}`, {
    method: "DELETE",
    headers: await authHeaders(),
  });
  return res.ok;
}

/**
 * Settings that reopen a kept table: same name, diorama and material, still kept for later.
 * Null when this build has no such diorama (the server would refuse the snapshot anyway).
 */
export function reopenSettings(t: SavedTable): TableSettingsInput | null {
  if (!(MAP_IDS as readonly string[]).includes(t.mapId)) return null;
  const material = (MATERIAL_IDS as readonly string[]).includes(t.materialId)
    ? (t.materialId as MaterialId)
    : undefined;
  return {
    name: t.name,
    mapId: t.mapId as MapId,
    ...(material && { materialId: material }),
    keepForLater: true,
    restoreId: t.tableId,
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function keptForLabel(expiresAt: number, now: number): string {
  const days = Math.floor((expiresAt - now) / DAY_MS);
  if (days <= 0) return "Last day";
  return days === 1 ? "Kept 1 more day" : `Kept ${days} more days`;
}
