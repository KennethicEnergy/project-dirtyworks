"use client";

import { VEHICLES, type VehicleId } from "@dirtyworks/shared";
import { toolHintRows } from "@/game/input/controls";
import { useHud } from "@/state/hudStore";

function Key({ k }: { k: string }) {
  return (
    <kbd className="inline-flex min-w-6 items-center justify-center rounded-md border-b-2 border-safety-dark bg-safety px-1.5 font-mono text-xs font-bold text-hud">
      {k}
    </kbd>
  );
}

/** Context-sensitive tool controls for the current vehicle, bottom center. */
export function ToolHints() {
  const vehicleId = useHud((s) => s.vehicleId);
  if (!vehicleId || !(vehicleId in VEHICLES)) return null;
  const rows = toolHintRows(VEHICLES[vehicleId as VehicleId]);
  return (
    <ul className="flex flex-wrap justify-center gap-1.5 text-xs text-cream-100">
      {rows.map((r) => (
        <li
          key={r.axis}
          className="flex items-center gap-1 rounded-full bg-hud/80 py-1 pr-3 pl-1.5"
        >
          <Key k={r.posKey} />
          <Key k={r.negKey} />
          <span>
            {r.posLabel} / {r.negLabel.toLowerCase()}
          </span>
        </li>
      ))}
      <li className="flex items-center gap-1 rounded-full bg-hud/80 py-1 pr-3 pl-1.5">
        <Key k="G" />
        <span>Garage</span>
      </li>
    </ul>
  );
}
