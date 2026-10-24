/** The cafe's live table listing. Same as Colyseus' LobbyRoom, but only for signed-in players. */
import { LobbyRoom, type AuthContext } from "@colyseus/core";
import { authenticate } from "./auth";

export class AuthedLobbyRoom extends LobbyRoom {
  static override async onAuth(token: string, options: unknown, _context: AuthContext) {
    return authenticate(token, options as Record<string, unknown> | undefined);
  }
}
