/**
 * In-process index of live tables: who hosts what (for the 3-table limit) and invite codes.
 * A multi-process deployment would move this into Colyseus presence (Redis).
 */
import { normalizeInviteCode } from "@dirtyworks/shared";

interface Entry {
  userId: string;
  code: string;
}

export class TableRegistry {
  private readonly rooms = new Map<string, Entry>();
  private readonly codes = new Map<string, string>();

  add(roomId: string, userId: string, inviteCode: string): void {
    this.remove(roomId);
    const code = normalizeInviteCode(inviteCode);
    this.rooms.set(roomId, { userId, code });
    this.codes.set(code, roomId);
  }

  remove(roomId: string): void {
    const entry = this.rooms.get(roomId);
    if (!entry) return;
    this.rooms.delete(roomId);
    if (this.codes.get(entry.code) === roomId) this.codes.delete(entry.code);
  }

  countFor(userId: string): number {
    let n = 0;
    for (const entry of this.rooms.values()) if (entry.userId === userId) n++;
    return n;
  }

  roomForCode(code: string): string | null {
    return this.codes.get(normalizeInviteCode(code)) ?? null;
  }

  hasCode(code: string): boolean {
    return this.codes.has(normalizeInviteCode(code));
  }
}
