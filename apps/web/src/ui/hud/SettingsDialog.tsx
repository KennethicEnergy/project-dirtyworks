"use client";

import { useSettings, type Quality } from "@/state/settingsStore";
import { useUi } from "@/state/uiStore";
import { Dialog } from "@/ui/common/Dialog";

const QUALITIES: { id: Quality; label: string; hint: string }[] = [
  { id: "low", label: "Low", hint: "No shadows, short draw distance. Toaster-friendly." },
  { id: "medium", label: "Medium", hint: "Soft shadows, balanced." },
  { id: "high", label: "High", hint: "Crisp shadows, everything in view." },
];

export function SettingsDialog() {
  const open = useUi((s) => s.settingsOpen);
  const setUi = useUi((s) => s.set);
  const settings = useSettings();
  return (
    <Dialog open={open} onClose={() => setUi({ settingsOpen: false })} title="Settings">
      <div className="grid gap-5">
        <fieldset>
          <legend className="mb-2 text-sm font-semibold text-coffee-700">Graphics quality</legend>
          <div className="grid grid-cols-3 gap-2">
            {QUALITIES.map((q) => (
              <button
                key={q.id}
                type="button"
                aria-pressed={settings.quality === q.id}
                onClick={() => settings.set({ quality: q.id })}
                className={`rounded-xl px-3 py-2 font-semibold ${settings.quality === q.id ? "bg-brick-500 text-cream-50" : "bg-cream-200 hover:bg-cream-300"}`}
              >
                {q.label}
              </button>
            ))}
          </div>
          <p className="mt-1 text-xs text-coffee-500">
            {QUALITIES.find((q) => q.id === settings.quality)?.hint}
          </p>
        </fieldset>
        <label className="flex items-center justify-between gap-3 text-sm font-semibold text-coffee-700">
          Miniature focus (tilt-shift)
          <input
            type="checkbox"
            checked={settings.tiltShift}
            onChange={(e) => settings.set({ tiltShift: e.target.checked })}
            className="size-5 accent-brick-500"
          />
        </label>
        <label className="grid gap-1 text-sm font-semibold text-coffee-700">
          Sound volume
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={settings.volume}
            onChange={(e) => settings.set({ volume: Number(e.target.value) })}
            className="accent-brick-500"
          />
        </label>
        <label className="grid gap-1 text-sm font-semibold text-coffee-700">
          Camera drag sensitivity
          <input
            type="range"
            min={0.25}
            max={3}
            step={0.05}
            value={settings.cameraSensitivity}
            onChange={(e) => settings.set({ cameraSensitivity: Number(e.target.value) })}
            className="accent-brick-500"
          />
        </label>
        <p className="text-xs text-coffee-500">Saved on this device.</p>
      </div>
    </Dialog>
  );
}
