/** Chat text cleanup shared by server (authoritative) and client (preview). */
import { CHAT_MAX_LEN } from "./constants";

// C0/C1 controls (except whitespace), zero-width characters, bidi marks/embeddings/overrides/
// isolates, word joiners and the BOM. Built from code points so the source stays plain ASCII.
const INVISIBLE_RANGES: [number, number][] = [
  [0x00, 0x08],
  [0x0b, 0x0c],
  [0x0e, 0x1f],
  [0x7f, 0x9f],
  [0x200b, 0x200f],
  [0x202a, 0x202e],
  [0x2060, 0x2069],
  [0xfeff, 0xfeff],
];
const hex = (n: number) => "\\u" + n.toString(16).padStart(4, "0");
const INVISIBLE = new RegExp(
  `[${INVISIBLE_RANGES.map(([a, b]) => (a === b ? hex(a) : `${hex(a)}-${hex(b)}`)).join("")}]`,
  "g",
);
const WHITESPACE = /\s+/g;

/** Strips invisible/control characters and collapses whitespace. */
export function cleanText(raw: string): string {
  return raw.replace(INVISIBLE, "").replace(WHITESPACE, " ").trim();
}

let profanityFilter: (text: string) => string = (text) => text;

/** Hook for a real profanity filter; the default passes text through unchanged. */
export function setProfanityFilter(fn: (text: string) => string): void {
  profanityFilter = fn;
}

export function filterProfanity(text: string): string {
  return profanityFilter(text);
}

/** Returns the message to broadcast, or null when nothing printable is left. */
export function sanitizeChat(raw: string): string | null {
  const cleaned = cleanText(raw);
  if (!cleaned) return null;
  const chars = Array.from(cleaned);
  const cut =
    chars.length > CHAT_MAX_LEN ? chars.slice(0, CHAT_MAX_LEN).join("").trimEnd() : cleaned;
  return filterProfanity(cut);
}
