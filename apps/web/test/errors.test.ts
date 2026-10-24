import { ERROR_COPY } from "@dirtyworks/shared";
import { describe, expect, it } from "vitest";
import { errorCodeOf, friendlyError } from "@/net/errors";

describe("server error mapping", () => {
  it("reads the app error code from a matchmaking error message", () => {
    expect(errorCodeOf(new Error("TABLE_FULL"))).toBe("TABLE_FULL");
    expect(errorCodeOf({ code: 526, message: "BAD_PASSWORD" })).toBe("BAD_PASSWORD");
  });

  it("returns null for errors that carry no app code", () => {
    expect(errorCodeOf(new Error("socket hang up"))).toBeNull();
    expect(errorCodeOf(undefined)).toBeNull();
    expect(errorCodeOf("TABLE_FULL_ISH")).toBeNull();
  });

  it("turns a known code into friendly cafe copy", () => {
    expect(friendlyError(new Error("BANNED"))).toBe(ERROR_COPY.BANNED);
  });

  it("falls back to a generic line for unknown failures", () => {
    expect(friendlyError(new Error("ECONNREFUSED"))).toMatch(/game server/i);
  });
});
