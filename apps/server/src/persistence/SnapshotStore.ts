/**
 * "Keep table for later": compressed terrain snapshots keyed by table id, owner-scoped, with a
 * per-snapshot size cap, a per-user count cap and a 7-day expiry. Storage is a tiny backend
 * interface so the rules are tested once against memory and files alike.
 */
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  SAVED_TABLE_MAX_BYTES,
  SAVED_TABLE_TTL_MS,
  SAVED_TABLES_PER_USER,
} from "@dirtyworks/shared";

export interface SavedTableInput {
  tableId: string;
  ownerId: string;
  name: string;
  mapId: string;
  materialId: string;
}

export interface SavedTableMeta extends SavedTableInput {
  savedAt: number;
  expiresAt: number;
  bytes: number;
}

export type SaveResult = { ok: true } | { ok: false; reason: "TOO_LARGE" | "USER_LIMIT" };

export interface SnapshotStore {
  save(meta: SavedTableInput, data: Uint8Array): Promise<SaveResult>;
  load(tableId: string, userId: string): Promise<{ meta: SavedTableMeta; data: Uint8Array } | null>;
  list(userId: string): Promise<SavedTableMeta[]>;
  remove(tableId: string, userId: string): Promise<boolean>;
  /** Deletes expired tables; returns how many. */
  sweep(): Promise<number>;
}

interface Backend {
  readIndex(): Promise<SavedTableMeta[]>;
  writeIndex(entries: SavedTableMeta[]): Promise<void>;
  readBlob(tableId: string): Promise<Uint8Array | null>;
  writeBlob(tableId: string, data: Uint8Array): Promise<void>;
  deleteBlob(tableId: string): Promise<void>;
}

const TABLE_ID = /^[A-Za-z0-9_-]{6,64}$/;

function assertTableId(id: string): void {
  if (!TABLE_ID.test(id)) throw new Error(`invalid table id: ${JSON.stringify(id)}`);
}

function createStore(backend: Backend, now: () => number): SnapshotStore {
  // Serialize every operation so concurrent saves never clobber the index.
  let queue: Promise<unknown> = Promise.resolve();
  const serial = <T>(fn: () => Promise<T>): Promise<T> => {
    const next = queue.then(fn, fn);
    queue = next.catch(() => {});
    return next;
  };
  const live = (m: SavedTableMeta) => m.expiresAt > now();

  return {
    save: (input, data) =>
      serial(async () => {
        assertTableId(input.tableId);
        if (data.byteLength > SAVED_TABLE_MAX_BYTES) return { ok: false, reason: "TOO_LARGE" };
        const index = await backend.readIndex();
        const existing = index.find((m) => m.tableId === input.tableId);
        if (existing && existing.ownerId !== input.ownerId)
          return { ok: false, reason: "USER_LIMIT" };
        const mine = index.filter(
          (m) => m.ownerId === input.ownerId && live(m) && m.tableId !== input.tableId,
        );
        if (mine.length >= SAVED_TABLES_PER_USER) return { ok: false, reason: "USER_LIMIT" };
        const t = now();
        const meta: SavedTableMeta = {
          ...input,
          savedAt: t,
          expiresAt: t + SAVED_TABLE_TTL_MS,
          bytes: data.byteLength,
        };
        await backend.writeBlob(input.tableId, data);
        await backend.writeIndex([...index.filter((m) => m.tableId !== input.tableId), meta]);
        return { ok: true };
      }),

    load: (tableId, userId) =>
      serial(async () => {
        if (!TABLE_ID.test(tableId)) return null;
        const meta = (await backend.readIndex()).find((m) => m.tableId === tableId);
        if (!meta || meta.ownerId !== userId || !live(meta)) return null;
        const data = await backend.readBlob(tableId);
        return data ? { meta, data } : null;
      }),

    list: (userId) =>
      serial(async () =>
        (await backend.readIndex())
          .filter((m) => m.ownerId === userId && live(m))
          .sort((a, b) => b.savedAt - a.savedAt),
      ),

    remove: (tableId, userId) =>
      serial(async () => {
        const index = await backend.readIndex();
        const meta = index.find((m) => m.tableId === tableId);
        if (!meta || meta.ownerId !== userId) return false;
        await backend.deleteBlob(tableId);
        await backend.writeIndex(index.filter((m) => m.tableId !== tableId));
        return true;
      }),

    sweep: () =>
      serial(async () => {
        const index = await backend.readIndex();
        const expired = index.filter((m) => !live(m));
        for (const m of expired) await backend.deleteBlob(m.tableId);
        if (expired.length) await backend.writeIndex(index.filter(live));
        return expired.length;
      }),
  };
}

export function createMemorySnapshotStore(now: () => number = Date.now): SnapshotStore {
  let index: SavedTableMeta[] = [];
  const blobs = new Map<string, Uint8Array>();
  return createStore(
    {
      readIndex: async () => index.map((m) => ({ ...m })),
      writeIndex: async (entries) => {
        index = entries.map((m) => ({ ...m }));
      },
      readBlob: async (id) => blobs.get(id)?.slice() ?? null,
      writeBlob: async (id, data) => void blobs.set(id, data.slice()),
      deleteBlob: async (id) => void blobs.delete(id),
    },
    now,
  );
}

/** `dir/index.json` plus `dir/tables/<tableId>.bin`, written atomically (temp file + rename). */
export function createFileSnapshotStore(dir: string, now: () => number = Date.now): SnapshotStore {
  const indexPath = join(dir, "index.json");
  const blobDir = join(dir, "tables");
  const blobPath = (id: string) => {
    assertTableId(id);
    return join(blobDir, `${id}.bin`);
  };
  const atomicWrite = async (path: string, data: string | Uint8Array) => {
    const tmp = `${path}.${process.pid}.tmp`;
    await writeFile(tmp, data);
    await rename(tmp, path);
  };
  return createStore(
    {
      readIndex: async () => {
        try {
          const parsed: unknown = JSON.parse(await readFile(indexPath, "utf8"));
          return Array.isArray(parsed) ? (parsed as SavedTableMeta[]) : [];
        } catch {
          return [];
        }
      },
      writeIndex: async (entries) => {
        await mkdir(dir, { recursive: true });
        await atomicWrite(indexPath, JSON.stringify(entries));
      },
      readBlob: async (id) => {
        try {
          return new Uint8Array(await readFile(blobPath(id)));
        } catch {
          return null;
        }
      },
      writeBlob: async (id, data) => {
        await mkdir(blobDir, { recursive: true });
        await atomicWrite(blobPath(id), data);
      },
      deleteBlob: async (id) => {
        await rm(blobPath(id), { force: true });
      },
    },
    now,
  );
}
