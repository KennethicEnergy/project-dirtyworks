import { describe, expect, it } from "vitest";
import {
  chatMsgSchema,
  emoteMsgSchema,
  reportMsgSchema,
  spawnMsgSchema,
  stateMsgSchema,
} from "../src/messages";
import { DEFAULT_LIVERY } from "../src/livery";

const state = {
  x: 1,
  y: 2,
  z: 3,
  qx: 0,
  qy: 0,
  qz: 0,
  qw: 1,
  vx: 0,
  vy: 0,
  vz: 0,
  j: [0, 0.3, -1.3, 0.5],
  v: "excavator",
  e: 0.25,
  b: 0.9,
  t: 12345,
};

describe("message schemas", () => {
  it("accepts a well-formed state update", () => {
    expect(stateMsgSchema.safeParse(state).success).toBe(true);
  });

  it.each([
    ["Infinity", { x: Number.POSITIVE_INFINITY }],
    ["NaN", { qx: Number.NaN }],
    ["more than four joints", { j: [0, 0, 0, 0, 0] }],
    ["an unknown vehicle", { v: "tank" }],
    ["an edge position above 1", { e: 1.5 }],
    ["a string number", { y: "2" }],
  ])("rejects a state update with %s", (_label, patch) => {
    expect(stateMsgSchema.safeParse({ ...state, ...patch }).success).toBe(false);
  });

  it("accepts a spawn with a valid livery and rejects one with a custom color", () => {
    expect(spawnMsgSchema.safeParse({ vehicle: "bulldozer", livery: DEFAULT_LIVERY }).success).toBe(
      true,
    );
    expect(
      spawnMsgSchema.safeParse({
        vehicle: "bulldozer",
        livery: { ...DEFAULT_LIVERY, color: "#00ff00" },
      }).success,
    ).toBe(false);
  });

  it("caps raw chat payloads before sanitizing", () => {
    expect(chatMsgSchema.safeParse({ text: "hi" }).success).toBe(true);
    expect(chatMsgSchema.safeParse({ text: "x".repeat(2000) }).success).toBe(false);
    expect(chatMsgSchema.safeParse({ text: 42 }).success).toBe(false);
  });

  it("only accepts known emotes and report reasons", () => {
    expect(emoteMsgSchema.safeParse({ id: "nice-dig" }).success).toBe(true);
    expect(emoteMsgSchema.safeParse({ id: "rude-gesture" }).success).toBe(false);
    expect(reportMsgSchema.safeParse({ target: "abc", reason: "spam" }).success).toBe(true);
    expect(reportMsgSchema.safeParse({ target: "abc", reason: "vibes" }).success).toBe(false);
  });
});
