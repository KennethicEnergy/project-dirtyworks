/** Seven static daily table challenges, rotating by UTC day. Completion is tracked client-side. */
export interface Challenge {
  id: string;
  title: string;
  hint: string;
}

export const CHALLENGES: readonly Challenge[] = [
  {
    id: "tallest-pile",
    title: "Build the tallest pile",
    hint: "Stack it high. Gravity is the referee.",
  },
  {
    id: "fill-truck",
    title: "Fill the truck in 2 minutes",
    hint: "An excavator, a truck and a stopwatch walk into a cafe…",
  },
  { id: "parking-lot", title: "Make a flat parking lot", hint: "The bulldozer's time to shine." },
  { id: "duck-pond", title: "Dig a duck pond", hint: "No ducks provided. Imagination required." },
  { id: "hill-road", title: "Build a road up the hill", hint: "Gentle slopes keep trucks happy." },
  { id: "bucket-relay", title: "Load a friend's truck", hint: "Teamwork makes the dirt work." },
  {
    id: "tidy-table",
    title: "Push every pile into one",
    hint: "Careful, that was a perfectly good pile.",
  },
];

const DAY_MS = 24 * 60 * 60 * 1000;

export function challengeForDate(date: Date): Challenge {
  const day = Math.floor(date.getTime() / DAY_MS);
  const n = CHALLENGES.length;
  return CHALLENGES[((day % n) + n) % n]!;
}

export function challengeDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}
