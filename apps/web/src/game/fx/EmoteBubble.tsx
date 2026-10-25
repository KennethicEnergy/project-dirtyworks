import { EMOTES, type EmoteId } from "@dirtyworks/shared";

/** A speech bubble with an emote glyph and its short text. */
export function EmoteBubble({ emote }: { emote: EmoteId }) {
  const e = EMOTES.find((x) => x.id === emote);
  if (!e) return null;
  return (
    <div className="mb-1 flex animate-emote-pop items-center gap-1 rounded-2xl rounded-bl-sm bg-cream-50 px-2 py-1 text-sm font-semibold whitespace-nowrap text-coffee-900 shadow-card">
      <span className="text-lg leading-none">{e.glyph}</span>
      {e.text}
    </div>
  );
}
