"use client";

import { VEHICLES, type VehicleId } from "@dirtyworks/shared";
import {
  useCallback,
  useEffect,
  useState,
  useSyncExternalStore,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { resetTouch, touchInput } from "@/game/input/touchInput";
import { useHud, useTransmitter } from "@/state/hudStore";
import { useSession } from "@/state/sessionStore";
import { useUi } from "@/state/uiStore";
import { useTableUi } from "./TableUiContext";

// --- Touch detection: a coarse pointer, or the first real touch on the page. -----------------

let touchSeen = false;

function subscribeTouch(onChange: () => void): () => void {
  const mq = window.matchMedia("(pointer: coarse)");
  const onPointer = (e: PointerEvent) => {
    if (e.pointerType !== "touch" || touchSeen) return;
    touchSeen = true;
    onChange();
  };
  mq.addEventListener("change", onChange);
  window.addEventListener("pointerdown", onPointer, true);
  return () => {
    mq.removeEventListener("change", onChange);
    window.removeEventListener("pointerdown", onPointer, true);
  };
}

/** True on touch devices: the transmitter becomes the on-screen controller. */
export function useTouchMode(): boolean {
  return useSyncExternalStore(
    subscribeTouch,
    () => touchSeen || window.matchMedia("(pointer: coarse)").matches,
    () => false,
  );
}

function useMedia(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mq = window.matchMedia(query);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}

// --- Parts ----------------------------------------------------------------------------------

function axisLabel(vehicleId: string, axis: number): string {
  if (!(vehicleId in VEHICLES)) return "";
  return VEHICLES[vehicleId as VehicleId].joints.find((j) => j.input === axis)?.label ?? "";
}

const clampUnit = (x: number, y: number): [number, number] => {
  const len = Math.hypot(x, y);
  return len > 1 ? [x / len, y / len] : [x, y];
};

/** A gimbal stick. Shows (x, y); when `onMove` is given it is draggable and self-centers. */
function Stick({
  x,
  y,
  size,
  label,
  onMove,
}: {
  x: number;
  y: number;
  size: number;
  label: string;
  onMove?: (x: number, y: number) => void;
}) {
  const [drag, setDrag] = useState<[number, number] | null>(null);
  const travel = size * 0.31;
  const knob = size * 0.4;
  const [kx, ky] = drag ?? [x, y];

  const handle = (e: ReactPointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const p = clampUnit(
      (e.clientX - (r.left + r.width / 2)) / travel,
      -(e.clientY - (r.top + r.height / 2)) / travel,
    );
    setDrag(p);
    onMove!(p[0], p[1]);
  };
  const release = () => {
    setDrag(null);
    onMove?.(0, 0);
  };

  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className="relative touch-none rounded-full bg-gradient-to-b from-[#121110] to-[#2a2724] shadow-[inset_0_2px_6px_rgb(0_0_0/0.7)] ring-2 ring-cream-100/15"
        style={{ width: size, height: size }}
        aria-label={onMove ? `${label} stick` : undefined}
        role={onMove ? "application" : undefined}
        onPointerDown={
          onMove
            ? (e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                handle(e);
              }
            : undefined
        }
        onPointerMove={onMove ? (e) => drag && handle(e) : undefined}
        onPointerUp={onMove ? release : undefined}
        onPointerCancel={onMove ? release : undefined}
      >
        <span className="absolute top-1/2 right-[18%] left-[18%] h-px bg-cream-100/15" />
        <span className="absolute top-[18%] bottom-[18%] left-1/2 w-px bg-cream-100/15" />
        <span
          className="absolute rounded-full bg-gradient-to-b from-[#f9d94a] to-safety-dark shadow-[0_2px_4px_rgb(0_0_0/0.6)] ring-1 ring-black/40"
          style={{
            width: knob,
            height: knob,
            left: (size - knob) / 2,
            top: (size - knob) / 2,
            transform: `translate(${kx * travel}px, ${-ky * travel}px)`,
            transition: drag ? "none" : "transform 70ms linear",
          }}
        />
      </div>
      <span className="max-w-full truncate text-[9px] font-semibold tracking-wider text-cream-200 uppercase">
        {label}
      </span>
    </div>
  );
}

/** A three-position rocker (tool axes 0 and 2): two press-and-hold halves on touch. */
function Rocker({
  value,
  label,
  big,
  idle,
  onChange,
}: {
  value: number;
  label: string;
  big: boolean;
  /** No joint on this axis for the current vehicle: shown dimmed. */
  idle: boolean;
  onChange?: (v: number) => void;
}) {
  const half = (dir: 1 | -1) => {
    const lit = value === dir;
    const cls = `flex flex-1 items-center justify-center text-[10px] font-bold ${lit ? "bg-safety text-hud" : "bg-[#2a2724] text-cream-200"}`;
    if (!onChange) return <span className={cls}>{dir > 0 ? "▲" : "▼"}</span>;
    return (
      <button
        type="button"
        aria-label={`${label} ${dir > 0 ? "up" : "down"}`}
        className={`${cls} touch-none`}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          onChange(dir);
        }}
        onPointerUp={() => onChange(0)}
        onPointerCancel={() => onChange(0)}
      >
        {dir > 0 ? "▲" : "▼"}
      </button>
    );
  };
  return (
    <div className={`flex flex-col items-center gap-1 ${idle ? "opacity-40" : ""}`}>
      <div
        className={`flex flex-col overflow-hidden rounded-md ring-2 ring-cream-100/15 ${big ? "h-16 w-10" : "h-11 w-6"}`}
      >
        {half(1)}
        <span className="h-px bg-black/60" />
        {half(-1)}
      </div>
      <span className="max-w-16 truncate text-[9px] font-semibold tracking-wider text-cream-200 uppercase">
        {label}
      </span>
    </div>
  );
}

/** A labelled push button for the touch transmitter. */
function HoldButton({
  label,
  lit,
  onDown,
  onUp,
}: {
  label: string;
  lit: boolean;
  onDown: () => void;
  onUp?: () => void;
}) {
  return (
    <button
      type="button"
      className={`h-8 min-w-15 touch-none rounded-full px-2 text-[10px] font-bold tracking-wider uppercase shadow-[0_2px_3px_rgb(0_0_0/0.6)] ring-2 ring-black/40 ${lit ? "bg-safety text-hud" : "bg-[#3a3632] text-cream-100"}`}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        onDown();
      }}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      {label}
    </button>
  );
}

// --- The transmitter -------------------------------------------------------------------------

/**
 * The RC transmitter overlay: sticks and switches mirror what you are pressing (keyboard, gamepad
 * or touch), read from a 15 Hz store. On touch devices it is the controller itself and writes
 * straight into `touchInput`.
 */
export function Transmitter() {
  const { runtime } = useTableUi();
  const touch = useTouchMode();
  // Portrait phones: smaller sticks, switches stacked. Short landscape screens: smaller sticks.
  const narrow = useMedia("(max-width: 560px)");
  const short = useMedia("(max-height: 430px)");
  const tx = useTransmitter();
  const vehicleId = useHud((s) => s.vehicleId);
  const status = useSession((s) => s.status);
  const role = useSession((s) => s.role);

  useEffect(() => {
    if (!touch) return;
    touchInput.active = true;
    return () => {
      touchInput.active = false;
      resetTouch();
    };
  }, [touch]);

  if (role !== "driver" || !vehicleId) return null;
  const linked = status === "joined";
  const stick = touch ? (narrow ? 84 : short ? 92 : 104) : 54;
  const caption = (axis: number) => axisLabel(vehicleId, axis);
  const rightLabel = [caption(1), caption(3)].filter(Boolean).join(" · ") || "Tool";

  return (
    <div
      className={`relative rounded-[28px] border-2 border-black/50 bg-gradient-to-b from-[#3b3733] to-[#1f1d1b] shadow-[0_6px_16px_rgb(0_0_0/0.45)] ${touch ? "pointer-events-auto px-5 pt-3 pb-2" : "px-3 pt-2 pb-1.5"}`}
      aria-label="RC transmitter"
      role="group"
    >
      <span
        aria-hidden
        className="absolute -top-9 left-6 h-10 w-1 origin-bottom -rotate-12 rounded-full bg-gradient-to-t from-[#1a1a1a] to-[#555]"
      />
      <div className="mb-1 flex items-center justify-between gap-3">
        <span className="flex items-center gap-1.5">
          <span
            title={linked ? "Linked" : "Signal lost"}
            className={`h-2 w-2 rounded-full ${linked ? "bg-[#4cd964] shadow-[0_0_6px_#4cd964]" : "animate-pulse bg-[#ffa21a]"}`}
          />
          <span className="font-stencil text-[10px] tracking-[0.2em] text-safety">
            DIRTYWORKS TX-4
          </span>
        </span>
        <span className="font-mono text-[9px] text-cream-300 uppercase">{tx.device}</span>
      </div>
      <div className={`flex items-end ${touch ? "gap-4" : "gap-3"}`}>
        <Stick
          x={tx.lx}
          y={tx.ly}
          size={stick}
          label="Drive"
          onMove={
            touch
              ? (x, y) => {
                  touchInput.left.x = x;
                  touchInput.left.y = y;
                }
              : undefined
          }
        />
        <div
          className={`flex flex-1 items-center justify-center gap-2 ${touch && !narrow ? "flex-row" : "flex-col"}`}
        >
          <div className="flex gap-2">
            <Rocker
              value={tx.r0}
              label={caption(0) || "Aux 1"}
              big={touch}
              idle={!caption(0)}
              onChange={touch ? (v) => (touchInput.rocker0 = v) : undefined}
            />
            <Rocker
              value={tx.r2}
              label={caption(2) || "Aux 2"}
              big={touch}
              idle={!caption(2)}
              onChange={touch ? (v) => (touchInput.rocker2 = v) : undefined}
            />
          </div>
          {touch ? (
            <div className="grid grid-cols-2 gap-1.5">
              <HoldButton
                label="Horn"
                lit={tx.horn}
                onDown={() => {
                  touchInput.horn = true;
                  runtime.input.trigger("horn");
                }}
                onUp={() => (touchInput.horn = false)}
              />
              <HoldButton
                label="Brake"
                lit={tx.brake}
                onDown={() => (touchInput.handbrake = true)}
                onUp={() => (touchInput.handbrake = false)}
              />
              <HoldButton label="Cam" lit={false} onDown={() => runtime.input.trigger("camera")} />
              <HoldButton
                label="Garage"
                lit={false}
                onDown={() => useUi.getState().set({ garageOpen: true })}
              />
            </div>
          ) : (
            <div className="flex gap-1.5 text-[9px] font-bold">
              <span
                className={`rounded px-1.5 py-0.5 ${tx.horn ? "bg-safety text-hud" : "bg-[#2a2724] text-cream-300"}`}
              >
                HORN
              </span>
              <span
                className={`rounded px-1.5 py-0.5 ${tx.brake ? "bg-brick-400 text-cream-50" : "bg-[#2a2724] text-cream-300"}`}
              >
                BRAKE
              </span>
            </div>
          )}
        </div>
        <Stick
          x={tx.rx}
          y={tx.ry}
          size={stick}
          label={rightLabel}
          onMove={
            touch
              ? (x, y) => {
                  touchInput.right.x = x;
                  touchInput.right.y = y;
                }
              : undefined
          }
        />
      </div>
    </div>
  );
}
