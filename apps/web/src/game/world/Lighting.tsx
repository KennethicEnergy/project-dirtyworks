"use client";

import { useThree } from "@react-three/fiber";
import { useEffect } from "react";
import { Color, Fog } from "three";
import { useSession } from "@/state/sessionStore";
import { QUALITY, useSettings } from "@/state/settingsStore";
import { useRuntime } from "../runtime";

/** Warm cafe light: hemisphere fill, one shadow-casting "sun" (lamp), fog and backdrop color. */
export function Lighting() {
  const { map } = useRuntime();
  const dayNight = useSession((s) => s.dayNight);
  const preset = QUALITY[useSettings((s) => s.quality)];
  const scene = useThree((s) => s.scene);
  const light = map.ambience[dayNight];

  useEffect(() => {
    scene.background = new Color(light.backdrop);
    scene.fog = new Fog(light.fog, map.ambience.fogNear, map.ambience.fogFar);
    return () => {
      scene.background = null;
      scene.fog = null;
    };
  }, [scene, light, map]);

  const half = Math.max(map.cellsX, map.cellsZ) / 2 + 14;
  const d = light.sunDir;
  const len = Math.hypot(d.x, d.y, d.z);
  const dist = 160;

  return (
    <>
      <hemisphereLight args={[light.skyColor, light.groundColor, light.ambientIntensity]} />
      <directionalLight
        key={`${preset.shadowMapSize}-${preset.shadows}`}
        position={[(d.x / len) * dist, (d.y / len) * dist, (d.z / len) * dist]}
        color={light.sunColor}
        intensity={light.sunIntensity}
        castShadow={preset.shadows}
        shadow-mapSize-width={preset.shadowMapSize}
        shadow-mapSize-height={preset.shadowMapSize}
        shadow-camera-left={-half}
        shadow-camera-right={half}
        shadow-camera-top={half}
        shadow-camera-bottom={-half}
        shadow-camera-near={10}
        shadow-camera-far={dist * 2}
        shadow-bias={-0.0005}
        shadow-normalBias={0.04}
      />
    </>
  );
}
