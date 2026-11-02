"use client";

import { challengeDateKey, challengeForDate } from "@dirtyworks/shared";
import { useEffect, useState } from "react";
import { useProfile } from "@/state/profileStore";

/**
 * Today's table challenge. Completion is a local check-off; leaderboards come later. `compact` is
 * the small card in the table menu (the same check-off, so it stays in sync with the cafe).
 */
export function ChallengeBanner({ compact = false }: { compact?: boolean }) {
  // Date-dependent content renders after mount so server and client markup match.
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => setNow(new Date()), []);
  const done = useProfile((s) => s.challengeDone);
  const setDone = useProfile((s) => s.setChallengeDone);
  if (!now) return <div className={compact ? "h-10" : "h-28"} />;

  const challenge = challengeForDate(now);
  const key = `${challengeDateKey(now)}:${challenge.id}`;
  const isDone = done.includes(key);

  return (
    <section
      aria-label="Today's table challenge"
      className={
        compact
          ? "rounded-xl bg-cream-200 p-3 text-coffee-900"
          : "rounded-card bg-cream-100 p-4 text-coffee-900 shadow-card"
      }
    >
      <p className="text-xs font-bold tracking-widest text-brick-500 uppercase">
        Today&apos;s table challenge
      </p>
      <h3 className={`font-bold ${compact ? "text-base" : "text-xl"}`}>{challenge.title}</h3>
      {!compact && <p className="text-sm text-coffee-600">{challenge.hint}</p>}
      <label
        className={`flex items-center gap-2 text-sm font-semibold ${compact ? "mt-2" : "mt-3"}`}
      >
        <input
          type="checkbox"
          checked={isDone}
          onChange={(e) => setDone(key, e.target.checked)}
          className="size-4 accent-brick-500"
        />
        {isDone ? "Done! Well dug." : "I did it!"}
      </label>
    </section>
  );
}
