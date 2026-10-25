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
import { AudioSystem } from "./audio/AudioSystem";
import { HudFeed } from "./HudFeed";
import { NetSync } from "./NetSync";
import type { TableSession } from "@/net/tableSession";
import { DustSystem } from "./fx/DustSystem";
import { TerrainNet } from "./terrain/TerrainNet";
import { TerrainView } from "./terrain/TerrainView";
import { ToolSystem } from "./vehicles/ToolSystem";
import { LocalVehicle } from "./vehicles/LocalVehicle";
import { Lighting } from "./world/Lighting";
import { Props } from "./world/Props";
import { Tabletop } from "./world/Tabletop";

/** The 3D table. Client-only: loaded with next/dynamic and ssr: false. */
export default function Game({
  runtime,
  session,
  spawn,
  spawnSeq,
  livery,
}: {
  runtime: GameRuntime;
  session: TableSession | null;
  spawn: SpawnedEvent | null;
  spawnSeq: number;
  livery: Livery;
}) {
  const preset = QUALITY[useSettings((s) => s.quality)];
  return (
    <Canvas
      shadows={preset.shadows ? "percentage" : false}
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
        <AudioSystem />
        <Suspense fallback={null}>
          <Physics paused gravity={[0, -GRAVITY, 0]}>
            <PhysicsStepper />
            <Tabletop />
            <TerrainView />
            <Props />
            {spawn && <LocalVehicle key={spawnSeq} spawn={spawn} livery={livery} />}
            {session && <NetSync session={session} />}
            {session && <TerrainNet session={session} />}
            {session && <ToolSystem session={session} />}
            <DustSystem />
          </Physics>
        </Suspense>
      </RuntimeContext.Provider>
    </Canvas>
  );
}
