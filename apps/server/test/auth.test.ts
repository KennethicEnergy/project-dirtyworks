import { GAME_TOKEN_AUDIENCE, GAME_TOKEN_ISSUER } from "@dirtyworks/shared";
import { SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import { AuthError, verifyGameToken } from "../src/auth";

const SECRET = "test-secret-that-is-at-least-32-characters-long";
const key = (s: string) => new TextEncoder().encode(s);

async function mint(
  claims: Record<string, unknown>,
  opts: { secret?: string; exp?: number | string; iss?: string; aud?: string } = {},
) {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(opts.iss ?? GAME_TOKEN_ISSUER)
    .setAudience(opts.aud ?? GAME_TOKEN_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(opts.exp ?? "5m")
    .sign(key(opts.secret ?? SECRET));
}

async function codeOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return "resolved";
  } catch (err) {
    return err instanceof AuthError ? err.code : `unexpected: ${String(err)}`;
  }
}

describe("verifyGameToken", () => {
  it("returns the user for a valid token", async () => {
    const token = await mint({
      sub: "google-123",
      name: "Pat Dirtsworth",
      avatar: "https://lh3.googleusercontent.com/a/abc=s96-c",
    });
    await expect(verifyGameToken(token, SECRET)).resolves.toEqual({
      id: "google-123",
      name: "Pat Dirtsworth",
      avatar: "https://lh3.googleusercontent.com/a/abc=s96-c",
    });
  });

  it("rejects an expired token", async () => {
    const token = await mint({ sub: "u", name: "A" }, { exp: Math.floor(Date.now() / 1000) - 10 });
    expect(await codeOf(verifyGameToken(token, SECRET))).toBe("expired");
  });

  it("rejects a token signed with another secret", async () => {
    const token = await mint({ sub: "u", name: "A" }, { secret: "x".repeat(40) });
    expect(await codeOf(verifyGameToken(token, SECRET))).toBe("invalid");
  });

  it("rejects a token for another audience or issuer", async () => {
    const wrongAud = await mint({ sub: "u", name: "A" }, { aud: "someone-else" });
    const wrongIss = await mint({ sub: "u", name: "A" }, { iss: "someone-else" });
    expect(await codeOf(verifyGameToken(wrongAud, SECRET))).toBe("invalid");
    expect(await codeOf(verifyGameToken(wrongIss, SECRET))).toBe("invalid");
  });

  it("rejects a token without a subject", async () => {
    const token = await mint({ name: "Nobody" });
    expect(await codeOf(verifyGameToken(token, SECRET))).toBe("invalid");
  });

  it("rejects a missing or garbage token", async () => {
    expect(await codeOf(verifyGameToken("", SECRET))).toBe("missing");
    expect(await codeOf(verifyGameToken("not.a.jwt", SECRET))).toBe("invalid");
  });

  it("drops an avatar that is not hosted by Google", async () => {
    const token = await mint({ sub: "u", name: "A", avatar: "https://evil.example/x.png" });
    const user = await verifyGameToken(token, SECRET);
    expect(user.avatar).toBeNull();
  });
});
