import { describe, expect, it } from "vitest";
import { batterySpeedFactor, chargeBattery, drainBattery } from "../src/battery";
import { challengeDateKey, challengeForDate, CHALLENGES } from "../src/challenges";
import { filterProfanity, sanitizeChat, setProfanityFilter } from "../src/chat";
import { createEmoteLimiter, emoteForKey } from "../src/emotes";
import { DEFAULT_LIVERY, liverySchema } from "../src/livery";
import { isAllowedAvatarUrl, toGameUser } from "../src/auth";

describe("livery", () => {
  it("accepts an allowed color, decal and number", () => {
    expect(
      liverySchema.safeParse({ color: "brick-red", decal: "number", number: 42 }).success,
    ).toBe(true);
    expect(liverySchema.safeParse(DEFAULT_LIVERY).success).toBe(true);
  });

  it.each([
    ["a raw hex color", { color: "#ff0000" }],
    ["an unknown decal", { decal: "flames" }],
    ["number 100", { number: 100 }],
    ["a negative number", { number: -1 }],
    ["a fractional number", { number: 1.5 }],
  ])("rejects %s", (_label, patch) => {
    expect(liverySchema.safeParse({ ...DEFAULT_LIVERY, ...patch }).success).toBe(false);
  });
});

describe("emotes", () => {
  it("maps number keys 1-5 to emotes", () => {
    expect(["1", "2", "3", "4", "5"].map((k) => emoteForKey(k))).toEqual([
      "thumbs-up",
      "laugh",
      "nice-dig",
      "my-turn",
      "horn",
    ]);
    expect(emoteForKey("6")).toBeNull();
  });

  it("allows three quick emotes, blocks the fourth, and allows one more after 2 s", () => {
    let t = 0;
    const limiter = createEmoteLimiter(() => t);
    const burst = [limiter.take(), limiter.take(), limiter.take(), limiter.take()];
    expect(burst).toEqual([true, true, true, false]);
    t += 1000;
    expect(limiter.take()).toBe(false);
    t += 1000;
    expect(limiter.take()).toBe(true);
  });
});

describe("chat sanitizing", () => {
  it("trims and collapses whitespace", () => {
    expect(sanitizeChat("   nice   pile \n\t mate  ")).toBe("nice pile mate");
  });

  it("strips control, zero-width and bidi override characters", () => {
    expect(sanitizeChat("a\u0000b\u0007c​d‮e⁦f")).toBe("abcdef");
  });

  it("cuts messages to 200 characters without splitting emoji", () => {
    const long = "😀".repeat(250);
    const out = sanitizeChat(long)!;
    expect(Array.from(out)).toHaveLength(200);
    expect(out.endsWith("😀")).toBe(true);
  });

  it("returns null for empty or whitespace-only messages", () => {
    expect(sanitizeChat("   \n ")).toBeNull();
    expect(sanitizeChat("")).toBeNull();
  });

  it("keeps markup as plain text (rendering escapes it)", () => {
    expect(sanitizeChat("<b>hi</b>")).toBe("<b>hi</b>");
  });

  it("runs the registered profanity filter", () => {
    setProfanityFilter((text) => text.replace(/darn/gi, "d**n"));
    try {
      expect(sanitizeChat("well darn")).toBe("well d**n");
    } finally {
      setProfanityFilter((text) => text);
    }
    expect(filterProfanity("darn")).toBe("darn");
  });
});

describe("daily challenges", () => {
  it("has seven challenges and rotates through all of them on consecutive UTC days", () => {
    expect(CHALLENGES).toHaveLength(7);
    const seen = new Set<string>();
    for (let day = 0; day < 7; day++) {
      seen.add(challengeForDate(new Date(Date.UTC(2026, 9, 24 + day, 12))).id);
    }
    expect(seen.size).toBe(7);
  });

  it("keeps the same challenge for the whole UTC day", () => {
    const morning = challengeForDate(new Date(Date.UTC(2026, 9, 24, 0, 1)));
    const night = challengeForDate(new Date(Date.UTC(2026, 9, 24, 23, 59)));
    expect(morning.id).toBe(night.id);
  });

  it("formats a UTC date key", () => {
    expect(challengeDateKey(new Date(Date.UTC(2026, 0, 5, 23)))).toBe("2026-01-05");
  });
});

describe("game user claims", () => {
  it.each([
    ["https://lh3.googleusercontent.com/a/ACg8ocK=s96-c", true],
    ["https://lh5.googleusercontent.com/x.png", true],
    ["http://lh3.googleusercontent.com/a/x", false],
    ["https://evil.com/googleusercontent.com", false],
    ["https://googleusercontent.com.evil.com/a", false],
    ["https://user@lh3.googleusercontent.com/a", false],
    ["javascript:alert(1)", false],
  ])("avatar %s allowed: %s", (url, allowed) => {
    expect(isAllowedAvatarUrl(url)).toBe(allowed);
  });

  it("drops a disallowed avatar and cleans the name", () => {
    expect(toGameUser({ sub: "u1", name: " Dad‮ ", avatar: "https://evil.com/a.png" })).toEqual({
      id: "u1",
      name: "Dad",
      avatar: null,
    });
  });
});

describe("battery", () => {
  it("keeps full speed above 20% and scales down to 45% when empty", () => {
    expect(batterySpeedFactor(1)).toBe(1);
    expect(batterySpeedFactor(0.2)).toBe(1);
    expect(batterySpeedFactor(0.1)).toBeCloseTo(0.725);
    expect(batterySpeedFactor(0)).toBeCloseTo(0.45);
  });

  it("drains to nearly empty after about ten minutes of full-throttle driving", () => {
    let level = 1;
    for (let s = 0; s < 540; s++) level = drainBattery(level, 1, 0, 1);
    expect(level).toBeGreaterThan(0);
    for (let s = 0; s < 120; s++) level = drainBattery(level, 1, 0, 1);
    expect(level).toBe(0);
  });

  it("recharges to full at the charging station and never above 1", () => {
    expect(chargeBattery(0.5, 1000)).toBe(1);
    expect(chargeBattery(0, 1)).toBeGreaterThan(0);
  });
});
