import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SAVED_TABLE_MAX_BYTES, SAVED_TABLE_TTL_MS } from "@dirtyworks/shared";
import { afterAll, describe, expect, it } from "vitest";
import {
  createFileSnapshotStore,
  createMemorySnapshotStore,
  type SnapshotStore,
} from "../src/persistence/SnapshotStore";

const DAY = 24 * 60 * 60 * 1000;

function meta(tableId: string, ownerId = "alice") {
  return { tableId, ownerId, name: `Table ${tableId}`, mapId: "mini-quarry", materialId: "gravel" };
}

function clock(start = 1_700_000_000_000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

const bytes = (n: number) => new Uint8Array(n).fill(7);

function contract(name: string, make: (now: () => number) => SnapshotStore) {
  describe(name, () => {
    it("saves and loads a table for its owner only", async () => {
      const store = make(clock().now);
      await expect(store.save(meta("abc123"), bytes(10))).resolves.toEqual({ ok: true });
      const loaded = await store.load("abc123", "alice");
      expect(loaded?.data).toEqual(bytes(10));
      expect(loaded?.meta.name).toBe("Table abc123");
      expect(await store.load("abc123", "mallory")).toBeNull();
    });

    it("rejects snapshots over 1 MB", async () => {
      const store = make(clock().now);
      expect(await store.save(meta("big123"), bytes(SAVED_TABLE_MAX_BYTES + 1))).toEqual({
        ok: false,
        reason: "TOO_LARGE",
      });
    });

    it("allows five saved tables per user and rejects the sixth, but re-saving is fine", async () => {
      const store = make(clock().now);
      for (let i = 0; i < 5; i++) await store.save(meta(`table${i}x`), bytes(4));
      expect(await store.save(meta("table6x"), bytes(4))).toEqual({
        ok: false,
        reason: "USER_LIMIT",
      });
      expect(await store.save(meta("table2x"), bytes(8))).toEqual({ ok: true });
      expect(await store.save(meta("bobs01", "bob"), bytes(4))).toEqual({ ok: true });
    });

    it("lists a user's saved tables, newest first", async () => {
      const c = clock();
      const store = make(c.now);
      await store.save(meta("first1"), bytes(4));
      c.advance(1000);
      await store.save(meta("second"), bytes(4));
      await store.save(meta("bobs01", "bob"), bytes(4));
      expect((await store.list("alice")).map((m) => m.tableId)).toEqual(["second", "first1"]);
    });

    it("expires tables after seven days and sweeps them away", async () => {
      const c = clock();
      const store = make(c.now);
      await store.save(meta("old123"), bytes(4));
      c.advance(SAVED_TABLE_TTL_MS - 1);
      expect(await store.load("old123", "alice")).not.toBeNull();
      c.advance(2);
      expect(await store.load("old123", "alice")).toBeNull();
      expect(await store.list("alice")).toEqual([]);
      expect(await store.sweep()).toBe(1);
      expect(await store.sweep()).toBe(0);
    });

    it("lets the owner delete a table, and nobody else", async () => {
      const store = make(clock().now);
      await store.save(meta("gone12"), bytes(4));
      expect(await store.remove("gone12", "mallory")).toBe(false);
      expect(await store.remove("gone12", "alice")).toBe(true);
      expect(await store.load("gone12", "alice")).toBeNull();
    });

    it("refuses table ids that could escape the data directory", async () => {
      const store = make(clock().now);
      await expect(store.save(meta("../../etc/passwd"), bytes(4))).rejects.toThrow();
    });
  });
}

contract("memory snapshot store", (now) => createMemorySnapshotStore(now));

const dirs: string[] = [];
contract("file snapshot store", (now) => {
  const dir = mkdtempSync(join(tmpdir(), "dirtyworks-store-"));
  dirs.push(dir);
  return createFileSnapshotStore(dir, now);
});

afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

it("keeps file-store data across instances (server restarts)", async () => {
  const dir = mkdtempSync(join(tmpdir(), "dirtyworks-store-"));
  dirs.push(dir);
  const c = clock();
  await createFileSnapshotStore(dir, c.now).save(meta("keep01"), bytes(12));
  const reopened = createFileSnapshotStore(dir, c.now);
  expect((await reopened.load("keep01", "alice"))?.data).toEqual(bytes(12));
  c.advance(DAY);
  expect((await reopened.list("alice")).length).toBe(1);
});
