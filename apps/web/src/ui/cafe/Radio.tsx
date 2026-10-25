"use client";

import { useEffect } from "react";
import { setLoop, SILENT } from "@/game/audio/sound";
import { RADIO_CHANNELS, useProfile } from "@/state/profileStore";

const ROOM_TONE = { gain: 0.35, rate: 1 };

/**
 * Cafe radio stub: channel names only, no music files yet. While it is on, the synth plays the
 * cafe's room tone (starts after your first click or key press, as browsers require).
 */
export function Radio() {
  const radio = useProfile((s) => s.radio);
  const setRadio = useProfile((s) => s.setRadio);
  useEffect(() => {
    setLoop("cafe", radio.on ? ROOM_TONE : SILENT);
    return () => setLoop("cafe", SILENT);
  }, [radio.on]);
  const channel = RADIO_CHANNELS[radio.channel] ?? RADIO_CHANNELS[0];
  return (
    <section className="rounded-card bg-coffee-700/90 p-4 shadow-card">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold tracking-widest text-latte uppercase">Cafe radio</p>
          <p className="font-semibold text-cream-50">{radio.on ? channel.name : "Off"}</p>
          <p className="text-xs text-cream-300">
            {radio.on ? channel.tagline : "Silence is golden too."}
          </p>
        </div>
        <button
          type="button"
          aria-pressed={radio.on}
          onClick={() => setRadio({ ...radio, on: !radio.on })}
          className={`rounded-full px-3 py-1 text-sm font-bold ${radio.on ? "bg-sage text-coffee-900" : "bg-coffee-900 text-cream-200"}`}
        >
          {radio.on ? "On" : "Off"}
        </button>
      </div>
      <div className="mt-3 flex gap-1" role="group" aria-label="Radio channel">
        {RADIO_CHANNELS.map((c, i) => (
          <button
            key={c.name}
            type="button"
            aria-pressed={radio.channel === i}
            onClick={() => setRadio({ on: true, channel: i })}
            className={`flex-1 truncate rounded-lg px-2 py-1 text-xs ${radio.channel === i && radio.on ? "bg-cream-100 text-coffee-900" : "bg-coffee-900/60 text-cream-200 hover:bg-coffee-900"}`}
          >
            {c.name}
          </button>
        ))}
      </div>
    </section>
  );
}
