/** Mints a 5-minute game token for the signed-in user. */
import { auth } from "@/auth";
import { gameJwtSecret } from "@/lib/env";
import { mintGameToken, sessionToGameUser } from "@/lib/gameToken";
import { GAME_TOKEN_TTL_SEC } from "@dirtyworks/shared";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = sessionToGameUser(await auth());
  if (!user) {
    return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  const token = await mintGameToken(user, gameJwtSecret());
  return Response.json(
    { token, user, expiresIn: GAME_TOKEN_TTL_SEC },
    { headers: { "Cache-Control": "no-store" } },
  );
}
