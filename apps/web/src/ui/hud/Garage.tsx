"use client";

import { VEHICLE_IDS, VEHICLES, type VehicleId } from "@dirtyworks/shared";
import dynamic from "next/dynamic";
import { useState } from "react";
import { useProfile } from "@/state/profileStore";
import { useSession } from "@/state/sessionStore";
import { useUi } from "@/state/uiStore";
import { Button } from "@/ui/common/Button";
import { LiveryPicker } from "@/ui/common/LiveryPicker";
import { VEHICLE_ICON } from "./PlayerList";
import { useTableUi } from "./TableUiContext";

const VehiclePreview = dynamic(() => import("./VehiclePreview"), { ssr: false });

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-cream-200 px-3 py-1.5">
      <p className="text-[10px] font-bold tracking-widest text-coffee-500 uppercase">{label}</p>
      <p className="font-bold">{value}</p>
    </div>
  );
}

/** Pick a vehicle and paint, preview it, press Drive. G reopens it any time (respawns). */
export function Garage() {
  const { session } = useTableUi();
  const open = useUi((s) => s.garageOpen);
  const setUi = useUi((s) => s.set);
  const spawn = useSession((s) => s.spawn);
  const role = useSession((s) => s.role);
  const status = useSession((s) => s.status);
  const livery = useProfile((s) => s.livery);
  const setLivery = useProfile((s) => s.setLivery);
  const [vehicle, setVehicle] = useState<VehicleId>(spawn?.vehicle ?? "excavator");

  const firstVisit = role === "driver" && status === "joined" && !spawn;
  if (!open && !firstVisit) return null;
  const spec = VEHICLES[vehicle];

  function drive() {
    session?.spawn(vehicle, livery);
    setUi({ garageOpen: false });
  }

  return (
    <div className="pointer-events-auto absolute inset-0 z-20 flex items-center justify-center bg-coffee-950/60 p-3 backdrop-blur-[2px]">
      <section
        aria-label="Garage"
        className="grid max-h-full w-full max-w-4xl gap-4 overflow-y-auto rounded-card bg-cream-100 p-4 text-coffee-900 shadow-card sm:p-5 md:grid-cols-[14rem_1fr]"
      >
        <div>
          <h2 className="mb-1 text-2xl font-bold">The garage</h2>
          <p className="mb-3 text-sm text-coffee-600">Pick a ride. Fresh batteries included.</p>
          <ul className="grid grid-cols-2 gap-2 md:grid-cols-1">
            {VEHICLE_IDS.map((id) => (
              <li key={id}>
                <button
                  type="button"
                  aria-pressed={vehicle === id}
                  onClick={() => setVehicle(id)}
                  className={`w-full rounded-2xl px-3 py-2 text-left transition ${vehicle === id ? "bg-hud text-safety" : "bg-cream-200 hover:bg-cream-300"}`}
                >
                  <span className="mr-2">{VEHICLE_ICON[id]}</span>
                  <span className="font-bold">{VEHICLES[id].displayName}</span>
                  <span
                    className={`block text-xs ${vehicle === id ? "text-cream-200" : "text-coffee-600"}`}
                  >
                    {VEHICLES[id].capability}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="grid gap-3">
          <div className="hazard-border h-56 overflow-hidden rounded-xl sm:h-72">
            <VehiclePreview vehicle={vehicle} livery={livery} />
          </div>
          <p className="text-sm text-coffee-700 italic">{spec.blurb}</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Top speed" value={`${Math.round(spec.maxSpeed * 3.6)} km/h`} />
            <Stat label="Mass" value={`${(spec.mass / 1000).toFixed(0)} t`} />
            <Stat
              label="Drive"
              value={
                spec.drive === "tracked" ? "Tracks" : spec.articulated ? "Articulated" : "Wheels"
              }
            />
            <Stat
              label={spec.tool.kind === "blade" ? "Blade" : "Holds"}
              value={
                spec.tool.kind === "blade"
                  ? `${spec.tool.blade!.width} m`
                  : `${spec.tool.capacityM3} m³`
              }
            />
          </div>
          <LiveryPicker value={livery} onChange={setLivery} />
          <div className="flex justify-end gap-2">
            {spawn && (
              <Button
                variant="ghost"
                className="!text-coffee-700"
                onClick={() => setUi({ garageOpen: false })}
              >
                Back to driving
              </Button>
            )}
            <Button size="lg" onClick={drive} disabled={!session}>
              Drive {spec.displayName.toLowerCase()}
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
