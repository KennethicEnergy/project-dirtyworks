/**
 * Sound hook layer. Game and UI code call `playSound(id)` for one-shots and `setLoop(id, level)`
 * for continuous sounds (fine to call every frame). A backend turns those into audio: by default
 * a tiny WebAudio synth, no audio files. `setSoundBackend` swaps it (tests, a future sample set).
 * Audio starts on the first user gesture, follows the volume setting and pauses in hidden tabs.
 */
import { useSettings } from "@/state/settingsStore";

export type SoundId = "horn" | "scoop" | "dump" | "charge" | "lowBattery";
export type LoopId = "engine" | "servo" | "cafe";

export interface LoopLevel {
  /** 0..1 */
  gain: number;
  /** Pitch multiplier (1 = the sound's base pitch). */
  rate: number;
}

export interface SoundBackend {
  play(id: SoundId, gain: number): void;
  loop(id: LoopId, level: LoopLevel): void;
  setVolume(volume: number): void;
  setPaused(paused: boolean): void;
}

export const SILENT: Readonly<LoopLevel> = { gain: 0, rate: 1 };

let backend: SoundBackend | null = null;
let installed = false;
const loopLevels = new Map<LoopId, LoopLevel>();

export function playSound(id: SoundId, gain = 1): void {
  ensure()?.play(id, gain);
}

/** Sets a continuous sound's level; gain 0 silences it. */
export function setLoop(id: LoopId, level: Readonly<LoopLevel>): void {
  const prev = loopLevels.get(id);
  if (prev) {
    prev.gain = level.gain;
    prev.rate = level.rate;
  } else {
    loopLevels.set(id, { gain: level.gain, rate: level.rate });
  }
  ensure()?.loop(id, level);
}

/** Replaces the audio backend (null mutes everything). */
export function setSoundBackend(next: SoundBackend | null): void {
  backend = next;
  if (!next) return;
  next.setVolume(useSettings.getState().volume);
  for (const [id, level] of loopLevels) next.loop(id, level);
}

function ensure(): SoundBackend | null {
  if (backend || installed || typeof window === "undefined") return backend;
  installed = true;
  // Browsers only allow audio after a gesture: create the synth inside the first one.
  const unlock = () => {
    window.removeEventListener("pointerdown", unlock, true);
    window.removeEventListener("keydown", unlock, true);
    if (!backend) setSoundBackend(createSynth());
  };
  window.addEventListener("pointerdown", unlock, true);
  window.addEventListener("keydown", unlock, true);
  useSettings.subscribe((s, prev) => {
    if (s.volume !== prev.volume) backend?.setVolume(s.volume);
  });
  document.addEventListener("visibilitychange", () => backend?.setPaused(document.hidden));
  return null;
}

// --- Default backend: a small oscillator/noise synth --------------------------------------

type Point = [time: number, value: number];

function envelope(param: AudioParam, t0: number, points: Point[]): void {
  param.cancelScheduledValues(t0);
  param.setValueAtTime(points[0]![1], t0 + points[0]![0]);
  for (let i = 1; i < points.length; i++) {
    param.linearRampToValueAtTime(points[i]![1], t0 + points[i]![0]);
  }
}

function noiseBuffer(ctx: AudioContext, seconds: number, brown: boolean): AudioBuffer {
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < data.length; i++) {
    const white = Math.random() * 2 - 1;
    if (brown) {
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.5;
    } else {
      data[i] = white;
    }
  }
  return buffer;
}

function createSynth(): SoundBackend | null {
  const Ctx =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  const ctx = new Ctx();
  const master = ctx.createGain();
  master.gain.value = 0;
  const limiter = ctx.createDynamicsCompressor();
  master.connect(limiter).connect(ctx.destination);
  const white = noiseBuffer(ctx, 2, false);
  const brown = noiseBuffer(ctx, 4, true);

  const osc = (type: OscillatorType, freq: number, to: AudioNode) => {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    o.connect(to);
    return o;
  };
  const filter = (type: BiquadFilterType, freq: number, q: number, to: AudioNode) => {
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    f.connect(to);
    return f;
  };
  /** A gain stage feeding a node, or an AudioParam (for LFO modulation). */
  const gainNode = (value: number, to: AudioNode | AudioParam) => {
    const g = ctx.createGain();
    g.gain.value = value;
    if (to instanceof AudioParam) g.connect(to);
    else g.connect(to);
    return g;
  };
  const noise = (buffer: AudioBuffer, to: AudioNode, loop = false) => {
    const s = ctx.createBufferSource();
    s.buffer = buffer;
    s.loop = loop;
    s.connect(to);
    return s;
  };
  /** Output stage of a one-shot; disconnected when the sound's sources end. */
  const voice = (gain: number) => gainNode(gain, master);

  const oneShots: Record<SoundId, (gain: number) => void> = {
    // Toy-car "beep beep".
    horn(gain) {
      const t = ctx.currentTime;
      const out = voice(0);
      const lp = filter("lowpass", 2400, 0.7, out);
      const v = 0.22 * gain;
      envelope(out.gain, t, [
        [0, 0],
        [0.01, v],
        [0.13, v],
        [0.15, 0],
        [0.22, 0],
        [0.23, v],
        [0.38, v],
        [0.41, 0],
      ]);
      for (const f of [523, 659]) {
        const o = osc("square", f, lp);
        o.start(t);
        o.stop(t + 0.42);
        o.onended = () => out.disconnect();
      }
    },
    // Bucket biting into the ground: short gritty burst and a soft thud.
    scoop(gain) {
      const t = ctx.currentTime;
      const out = voice(1);
      const grit = gainNode(0, out);
      envelope(grit.gain, t, [
        [0, 0],
        [0.01, 0.28 * gain],
        [0.22, 0],
      ]);
      const src = noise(white, filter("bandpass", 650, 0.8, grit));
      src.start(t, Math.random() * 1.5, 0.25);
      const thud = gainNode(0, out);
      envelope(thud.gain, t, [
        [0, 0],
        [0.01, 0.22 * gain],
        [0.16, 0],
      ]);
      const o = osc("sine", 120, thud);
      o.frequency.setValueAtTime(120, t);
      o.frequency.exponentialRampToValueAtTime(55, t + 0.15);
      o.start(t);
      o.stop(t + 0.18);
      src.onended = () => out.disconnect();
    },
    // Material sliding out of a bed or bucket: a rattling rumble.
    dump(gain) {
      const t = ctx.currentTime;
      const out = voice(0);
      envelope(out.gain, t, [
        [0, 0],
        [0.08, 0.3 * gain],
        [0.5, 0.22 * gain],
        [0.95, 0],
      ]);
      const rattle = gainNode(0.65, out);
      const lfo = osc("square", 13, gainNode(0.35, rattle.gain));
      const lp = filter("lowpass", 1300, 0.6, rattle);
      lp.frequency.setValueAtTime(1300, t);
      lp.frequency.exponentialRampToValueAtTime(380, t + 0.9);
      const src = noise(white, lp);
      src.start(t, Math.random(), 1);
      lfo.start(t);
      lfo.stop(t + 1);
      src.onended = () => out.disconnect();
    },
    // Rising chime when the charger connects.
    charge(gain) {
      const t = ctx.currentTime;
      const out = voice(1);
      [660, 880, 1320].forEach((f, i) => {
        const g = gainNode(0, out);
        const s = t + i * 0.11;
        envelope(g.gain, s, [
          [0, 0],
          [0.01, 0.14 * gain],
          [0.2, 0],
        ]);
        const o = osc("sine", f, g);
        o.start(s);
        o.stop(s + 0.22);
        if (i === 2) o.onended = () => out.disconnect();
      });
    },
    // Two falling beeps.
    lowBattery(gain) {
      const t = ctx.currentTime;
      const out = voice(1);
      [880, 587].forEach((f, i) => {
        const g = gainNode(0, out);
        const s = t + i * 0.2;
        envelope(g.gain, s, [
          [0, 0],
          [0.01, 0.12 * gain],
          [0.14, 0.12 * gain],
          [0.16, 0],
        ]);
        const o = osc("triangle", f, g);
        o.start(s);
        o.stop(s + 0.18);
        if (i === 1) o.onended = () => out.disconnect();
      });
    },
  };

  interface Loop {
    set(level: LoopLevel): void;
  }
  const smooth = (param: AudioParam, value: number, tau = 0.06) =>
    param.setTargetAtTime(value, ctx.currentTime, tau);

  const loopMakers: Record<LoopId, () => Loop> = {
    // Electric motor: sawtooth plus a sub-octave square through a speed-dependent lowpass.
    engine() {
      const out = gainNode(0, master);
      const lp = filter("lowpass", 600, 2, out);
      const main = osc("sawtooth", 140, lp);
      const sub = osc("square", 70, gainNode(0.3, lp));
      main.start();
      sub.start();
      return {
        set(l) {
          const f = 140 * l.rate;
          smooth(main.frequency, f, 0.05);
          smooth(sub.frequency, f / 2, 0.05);
          smooth(lp.frequency, 450 + 900 * l.rate, 0.08);
          smooth(out.gain, l.gain * 0.45, 0.08);
        },
      };
    },
    // Servo whine: buzzing sawtooth through a narrow band.
    servo() {
      const out = gainNode(0, master);
      const bp = filter("bandpass", 1800, 3, out);
      const main = osc("sawtooth", 900, bp);
      const wobble = osc("sine", 31, gainNode(22, main.frequency));
      main.start();
      wobble.start();
      return {
        set(l) {
          smooth(main.frequency, 900 * l.rate, 0.04);
          smooth(bp.frequency, 1800 * l.rate, 0.04);
          smooth(out.gain, l.gain * 0.4, 0.05);
        },
      };
    },
    // Cafe room tone: brown noise, gently breathing.
    cafe() {
      const out = gainNode(0, master);
      const breath = gainNode(1, out);
      const lfo = osc("sine", 0.13, gainNode(0.3, breath.gain));
      const src = noise(brown, filter("lowpass", 420, 0.5, breath), true);
      src.start();
      lfo.start();
      return { set: (l) => smooth(out.gain, l.gain * 0.5, 0.4) };
    },
  };
  const loops = new Map<LoopId, Loop>();

  void ctx.resume();
  return {
    play(id, gain) {
      if (ctx.state === "running") oneShots[id](gain);
    },
    loop(id, level) {
      let l = loops.get(id);
      if (!l) {
        if (level.gain <= 0) return;
        l = loopMakers[id]();
        loops.set(id, l);
      }
      l.set(level);
    },
    setVolume(volume) {
      smooth(master.gain, Math.min(1, Math.max(0, volume)) * 0.6, 0.05);
    },
    setPaused(paused) {
      void (paused ? ctx.suspend() : ctx.resume());
    },
  };
}
