import { describe, expect, it } from "vitest";
import {
  canCreateTable,
  canJoinAs,
  isInviteCode,
  makeInviteCode,
  nextHost,
  normalizeInviteCode,
  tableSettingsSchema,
  type HostCandidate,
} from "../src/tables";

const valid = {
  name: "Saturday sandbox",
  mapId: "mini-quarry",
  vibe: "chill",
  rule: "free-play",
  maxPlayers: 4,
  visibility: "public",
};

describe("table settings", () => {
  it("accepts a valid table and fills defaults", () => {
    const parsed = tableSettingsSchema.parse(valid);
    expect(parsed.terrainPersistence).toBe("session");
    expect(parsed.keepForLater).toBe(false);
    expect(parsed.password).toBeUndefined();
  });

  it("trims the name", () => {
    expect(tableSettingsSchema.parse({ ...valid, name: "  Dirt club  " }).name).toBe("Dirt club");
  });

  it.each([
    ["maxPlayers 1", { maxPlayers: 1 }],
    ["maxPlayers 9", { maxPlayers: 9 }],
    ["fractional maxPlayers", { maxPlayers: 3.5 }],
    ["1-char name", { name: "x" }],
    ["33-char name", { name: "x".repeat(33) }],
    ["unknown map", { mapId: "moon-base" }],
    ["unknown vibe", { vibe: "sweaty" }],
    ["unknown rule", { rule: "battle-royale" }],
    ["3-char password", { password: "abc" }],
    ["unknown material", { materialId: "lava" }],
  ])("rejects %s", (_label, patch) => {
    expect(tableSettingsSchema.safeParse({ ...valid, ...patch }).success).toBe(false);
  });

  it("accepts a private table with a password and a material", () => {
    const parsed = tableSettingsSchema.parse({
      ...valid,
      visibility: "private",
      password: "dirt",
      materialId: "gravel",
      terrainPersistence: "none",
    });
    expect(parsed.visibility).toBe("private");
    expect(parsed.materialId).toBe("gravel");
  });
});

describe("table creation and joining", () => {
  it("lets a user host up to three tables", () => {
    expect(canCreateTable(0)).toEqual({ ok: true });
    expect(canCreateTable(2)).toEqual({ ok: true });
    expect(canCreateTable(3)).toEqual({ ok: false, reason: "TABLE_LIMIT" });
  });

  it("refuses a driver at a full table but seats a spectator", () => {
    const counts = { drivers: 8, spectators: 0 };
    expect(canJoinAs("driver", counts, 8)).toEqual({ ok: false, reason: "TABLE_FULL" });
    expect(canJoinAs("spectator", counts, 8)).toEqual({ ok: true });
  });

  it("respects the table's own driver limit", () => {
    expect(canJoinAs("driver", { drivers: 2, spectators: 0 }, 2).ok).toBe(false);
    expect(canJoinAs("driver", { drivers: 1, spectators: 5 }, 2).ok).toBe(true);
  });

  it("caps spectators at eight", () => {
    expect(canJoinAs("spectator", { drivers: 1, spectators: 8 }, 8)).toEqual({
      ok: false,
      reason: "SPECTATORS_FULL",
    });
  });
});

describe("host succession", () => {
  const players: HostCandidate[] = [
    { sessionId: "host", joinedAt: 1, connected: true },
    { sessionId: "late", joinedAt: 30, connected: true },
    { sessionId: "watcher", joinedAt: 10, connected: true },
    { sessionId: "dropped", joinedAt: 5, connected: false },
  ];

  it("picks the earliest-joined connected player, spectators included", () => {
    expect(nextHost(players, "host")).toBe("watcher");
  });

  it("falls back to a disconnected player when nobody connected is left", () => {
    expect(nextHost([players[0]!, players[3]!], "host")).toBe("dropped");
  });

  it("returns null when the host was alone", () => {
    expect(nextHost([players[0]!], "host")).toBeNull();
  });
});

describe("invite codes", () => {
  it("are six characters from the unambiguous alphabet", () => {
    let i = 0;
    const seq = [0, 0.999, 0.5, 0.25, 0.75, 0.1];
    const code = makeInviteCode(() => seq[i++ % seq.length]!);
    expect(code).toHaveLength(6);
    expect(code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
    expect(isInviteCode(code)).toBe(true);
  });

  it("normalizes case and whitespace when checking", () => {
    expect(normalizeInviteCode("  abc234 ")).toBe("ABC234");
    expect(isInviteCode(normalizeInviteCode("abc234"))).toBe(true);
  });

  it("rejects ambiguous characters and wrong lengths", () => {
    expect(isInviteCode("ABC10O")).toBe(false);
    expect(isInviteCode("ABC23")).toBe(false);
    expect(isInviteCode("ABC2345")).toBe(false);
  });
});
