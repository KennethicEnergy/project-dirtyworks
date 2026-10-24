"use client";

import { GRAVITY, type Livery, type SpawnedEvent } from "@dirtyworks/shared";
import { Canvas } from "@react-three/fiber";
import { Physics } from "@react-three/rapier";
import { Suspense } from "react";
import { QUALITY, useSettings } from "@/state/settingsStore";
import { CameraRig } from "./camera/CameraRig";
import { LoopDriver } from "./loop/LoopDriver";
import { PhysicsStepper } from "./physics/PhysicsStepper";
import { RuntimeContext, type GameRuntime } from "./runtime";
import { HudFeed } from "./HudFeed";
import { LocalVehicle } from "./vehicles/LocalVehicle";
import { FlatGround } from "./world/FlatGround";
import { Lighting } from "./world/Lighting";
import { Props } from "./world/Props";
import { Tabletop } from "./world/Tabletop";

/** The 3D table. Client-only: loaded with next/dynamic and ssr: false. */
export default function Game({
  runtime,
  spawn,
  livery,
}: {
  runtime: GameRuntime;
  spawn: SpawnedEvent | null;
  livery: Livery;
}) {
  const preset = QUALITY[useSettings((s) => s.quality)];
  return (
    <Canvas
      shadows={preset.shadows}
      dpr={[1, preset.dprCap]}
      camera={{ fov: 45, near: 0.5, far: 2500, position: [0, 70, -100] }}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      className="touch-none"
    >
      <RuntimeContext.Provider value={runtime}>
        <Lighting />
        <LoopDriver />
        <CameraRig />
        <HudFeed />
        <Suspense fallback={null}>
          <Physics paused gravity={[0, -GRAVITY, 0]}>
            <PhysicsStepper />
            <Tabletop />
            <FlatGround />
            <Props />
            {spawn && (
              <LocalVehicle
                key={`${spawn.vehicle}-${spawn.x}-${spawn.z}`}
                spawn={spawn}
                livery={livery}
              />
            )}
          </Physics>
        </Suspense>
      </RuntimeContext.Provider>
    </Canvas>
  );
}
