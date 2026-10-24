import { GAME_TOKEN_AUDIENCE, GAME_TOKEN_ISSUER } from "@dirtyworks/shared";
import { decodeJwt, jwtVerify } from "jose";
import { describe, expect, it } from "vitest";
import { mintGameToken, sessionToGameUser } from "@/lib/gameToken";

const SECRET = "web-test-secret-that-is-at-least-32-chars";

describe("mintGameToken", () => {
  it("mints a token the game server can verify with the shared issuer and audience", async () => {
    const token = await mintGameToken(
      { id: "google:123", name: "Pat", avatar: "https://lh3.googleusercontent.com/a/x" },
      SECRET,
    );
    const { payload } = await jwtVerify(token, new TextEncoder().encode(SECRET), {
      issuer: GAME_TOKEN_ISSUER,
      audience: GAME_TOKEN_AUDIENCE,
    });
    expect(payload).toMatchObject({
      sub: "google:123",
      name: "Pat",
      avatar: "https://lh3.googleusercontent.com/a/x",
    });
  });

  it("expires five minutes after it is issued", async () => {
    const token = await mintGameToken({ id: "u", name: "A", avatar: null }, SECRET, 1_000_000);
    const claims = decodeJwt(token);
    expect(claims.iat).toBe(1_000_000);
    expect(claims.exp).toBe(1_000_300);
  });

  it("never puts an email or a non-Google avatar in the token", async () => {
    const token = await mintGameToken(
      { id: "u", name: "A", avatar: "https://evil.example/a.png" },
      SECRET,
    );
    const claims = decodeJwt(token);
    expect(claims.avatar).toBeNull();
    expect(JSON.stringify(claims)).not.toMatch(/@/);
  });
});

describe("sessionToGameUser", () => {
  it("maps a signed-in session to a game user, dropping the email", () => {
    expect(
      sessionToGameUser({
        user: {
          id: "google:9",
          name: "  Sam  ",
          email: "sam@example.com",
          image: "https://lh3.googleusercontent.com/a/s",
        },
      }),
    ).toEqual({ id: "google:9", name: "Sam", avatar: "https://lh3.googleusercontent.com/a/s" });
  });

  it("returns null without a user id", () => {
    expect(sessionToGameUser(null)).toBeNull();
    expect(sessionToGameUser({ user: { name: "x" } })).toBeNull();
  });
});
