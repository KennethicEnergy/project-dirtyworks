import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config";
import { hashPassword, verifyPassword } from "../src/game/password";
import { TableRegistry } from "../src/game/tableRegistry";
import { createLogger } from "../src/logger";

const SECRET = "s".repeat(32);

describe("loadConfig", () => {
  it("applies defaults", () => {
    expect(loadConfig({ GAME_JWT_SECRET: SECRET })).toEqual({
      port: 2567,
      jwtSecret: SECRET,
      allowedOrigins: ["http://localhost:3000"],
      dataDir: "./data",
      logLevel: "info",
    });
  });

  it("parses a comma-separated origin list and a custom port", () => {
    const cfg = loadConfig({
      GAME_JWT_SECRET: SECRET,
      PORT: "8080",
      ALLOWED_ORIGINS: "https://dirtyworks.app, https://www.dirtyworks.app",
    });
    expect(cfg.port).toBe(8080);
    expect(cfg.allowedOrigins).toEqual(["https://dirtyworks.app", "https://www.dirtyworks.app"]);
  });

  it("refuses to start with a short or missing secret", () => {
    expect(() => loadConfig({})).toThrow(/GAME_JWT_SECRET/);
    expect(() => loadConfig({ GAME_JWT_SECRET: "short" })).toThrow(/GAME_JWT_SECRET/);
  });
});

describe("logger", () => {
  it("writes one JSON object per line with bindings and fields", () => {
    const lines: string[] = [];
    const log = createLogger("info", { service: "test" }, (l) => lines.push(l));
    log.info("table created", { roomId: "r1" });
    const entry = JSON.parse(lines[0]!);
    expect(entry).toMatchObject({
      level: "info",
      msg: "table created",
      service: "test",
      roomId: "r1",
    });
    expect(typeof entry.ts).toBe("string");
  });

  it("drops entries below the configured level", () => {
    const lines: string[] = [];
    const log = createLogger("warn", {}, (l) => lines.push(l));
    log.debug("noise");
    log.info("noise");
    log.warn("careful");
    log.error("oops");
    expect(lines.map((l) => JSON.parse(l).level)).toEqual(["warn", "error"]);
  });

  it("merges child bindings", () => {
    const lines: string[] = [];
    const log = createLogger("debug", { service: "s" }, (l) => lines.push(l)).child({
      roomId: "r",
    });
    log.debug("hi");
    expect(JSON.parse(lines[0]!)).toMatchObject({ service: "s", roomId: "r" });
  });

  it("serializes errors with their message", () => {
    const lines: string[] = [];
    const log = createLogger("info", {}, (l) => lines.push(l));
    log.error("boom", { err: new Error("kaput") });
    expect(JSON.parse(lines[0]!).err).toMatchObject({ message: "kaput" });
  });
});

describe("table passwords", () => {
  it("verifies the right password and rejects a wrong one", async () => {
    const hash = await hashPassword("dirt4life");
    expect(hash).not.toContain("dirt4life");
    await expect(verifyPassword("dirt4life", hash)).resolves.toBe(true);
    await expect(verifyPassword("dirt4lyfe", hash)).resolves.toBe(false);
  });

  it("salts every hash", async () => {
    expect(await hashPassword("same")).not.toBe(await hashPassword("same"));
  });

  it("rejects a malformed stored hash instead of throwing", async () => {
    await expect(verifyPassword("x", "garbage")).resolves.toBe(false);
  });
});

describe("TableRegistry", () => {
  it("counts live tables per user", () => {
    const reg = new TableRegistry();
    reg.add("r1", "alice", "ABC234");
    reg.add("r2", "alice", "DEF567");
    reg.add("r3", "bob", "GHJ892");
    expect(reg.countFor("alice")).toBe(2);
    reg.remove("r1");
    expect(reg.countFor("alice")).toBe(1);
    expect(reg.countFor("carol")).toBe(0);
  });

  it("resolves invite codes case-insensitively and forgets removed tables", () => {
    const reg = new TableRegistry();
    reg.add("r1", "alice", "ABC234");
    expect(reg.roomForCode("abc234")).toBe("r1");
    expect(reg.roomForCode(" ABC234 ")).toBe("r1");
    reg.remove("r1");
    expect(reg.roomForCode("ABC234")).toBeNull();
  });

  it("reports whether an invite code is taken", () => {
    const reg = new TableRegistry();
    reg.add("r1", "alice", "ABC234");
    expect(reg.hasCode("ABC234")).toBe(true);
    expect(reg.hasCode("ZZZ999")).toBe(false);
  });
});
