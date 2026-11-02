/**
 * Paint changes made in the garage while driving reach the other players as `livery` messages.
 * Picker clicks are debounced, and sends stay further apart than the server's limit (1/s), so the
 * last choice is never the one that gets dropped.
 */
export const LIVERY_DEBOUNCE_MS = 500;
export const LIVERY_MIN_GAP_MS = 1100;

/** How long to wait before sending the latest livery (ms). */
export function liverySendDelay(now: number, lastSentAt: number): number {
  return Math.max(LIVERY_DEBOUNCE_MS, lastSentAt + LIVERY_MIN_GAP_MS - now);
}
