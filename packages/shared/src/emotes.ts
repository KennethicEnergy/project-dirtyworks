/** Quick emotes on the number keys; shown as bubbles above the operator chip. */
import { RATES, TokenBucket } from "./rateLimit";

export const EMOTES = [
  { id: "thumbs-up", key: "1", glyph: "👍", text: "Thumbs up" },
  { id: "laugh", key: "2", glyph: "😂", text: "Ha!" },
  { id: "nice-dig", key: "3", glyph: "⛏️", text: "Nice dig!" },
  { id: "my-turn", key: "4", glyph: "🙋", text: "My turn?" },
  { id: "horn", key: "5", glyph: "📯", text: "Honk!" },
] as const;
export type EmoteId = (typeof EMOTES)[number]["id"];
export const EMOTE_IDS = EMOTES.map((e) => e.id) as [EmoteId, ...EmoteId[]];

export const EMOTE_RATE = RATES.emote;

export function emoteForKey(key: string): EmoteId | null {
  return EMOTES.find((e) => e.key === key)?.id ?? null;
}

export function createEmoteLimiter(now?: () => number): TokenBucket {
  return new TokenBucket(EMOTE_RATE.capacity, EMOTE_RATE.refillPerSec, now);
}
