"use client";

import {
  DECALS,
  LIVERY_COLOR_IDS,
  LIVERY_COLORS,
  type Decal,
  type Livery,
} from "@dirtyworks/shared";

const DECAL_LABELS: Record<Decal, string> = {
  none: "Plain",
  stripes: "Racing stripes",
  number: "Number",
  checker: "Checkers",
};

export function LiveryPicker({
  value,
  onChange,
}: {
  value: Livery;
  onChange: (livery: Livery) => void;
}) {
  return (
    <div className="grid gap-4">
      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-coffee-700">Paint</legend>
        <div className="flex flex-wrap gap-2">
          {LIVERY_COLOR_IDS.map((id) => (
            <button
              key={id}
              type="button"
              aria-label={LIVERY_COLORS[id].name}
              aria-pressed={value.color === id}
              title={LIVERY_COLORS[id].name}
              onClick={() => onChange({ ...value, color: id })}
              className={`size-9 rounded-full ring-offset-2 ring-offset-cream-100 transition ${value.color === id ? "ring-4 ring-brick-500" : "ring-2 ring-coffee-400/40 hover:ring-coffee-500"}`}
              style={{ background: LIVERY_COLORS[id].hex }}
            />
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-coffee-700">Decal</legend>
        <div className="flex flex-wrap gap-2">
          {DECALS.map((d) => (
            <button
              key={d}
              type="button"
              aria-pressed={value.decal === d}
              onClick={() => onChange({ ...value, decal: d })}
              className={`rounded-xl px-3 py-1.5 text-sm font-semibold ${value.decal === d ? "bg-brick-500 text-cream-50" : "bg-cream-200 text-coffee-800 hover:bg-cream-300"}`}
            >
              {DECAL_LABELS[d]}
            </button>
          ))}
        </div>
      </fieldset>
      <label className="flex items-center gap-3 text-sm font-semibold text-coffee-700">
        Number
        <input
          type="number"
          min={0}
          max={99}
          value={value.number}
          onChange={(e) => {
            const n = Math.max(0, Math.min(99, Math.trunc(Number(e.target.value) || 0)));
            onChange({ ...value, number: n });
          }}
          className="w-20 rounded-xl border-2 border-coffee-400/40 bg-cream-50 px-3 py-1.5 text-coffee-900"
        />
      </label>
    </div>
  );
}
