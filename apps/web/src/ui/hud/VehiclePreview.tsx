"use client";

import type { Livery, VehicleId } from "@dirtyworks/shared";
import { OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { createVehicleModel } from "@/game/vehicles/models";

function PreviewModel({ vehicle, livery }: { vehicle: VehicleId; livery: Livery }) {
  // Built once per vehicle; livery changes repaint the same model.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const model = useMemo(() => createVehicleModel(vehicle, livery), [vehicle]);
  useEffect(() => () => model.dispose(), [model]);
  useEffect(() => model.setLivery(livery), [model, livery]);
  return <primitive object={model.root} />;
}

/**
 * Small turntable in the garage. It is UI, not game: it has its own canvas and lets drei's
 * auto-rotating OrbitControls drive it instead of the game loop.
 */
export default function VehiclePreview({
  vehicle,
  livery,
}: {
  vehicle: VehicleId;
  livery: Livery;
}) {
  return (
    <Canvas camera={{ position: [10, 6.5, 12], fov: 34 }} dpr={[1, 1.5]} shadows={false}>
      <color attach="background" args={["#2c1d13"]} />
      <hemisphereLight args={["#fff1dd", "#3b2a20", 1.1]} />
      <directionalLight position={[6, 10, 6]} intensity={2.2} color="#ffe2b8" />
      <mesh rotation-x={-Math.PI / 2} position={[0, 0, 0]}>
        <circleGeometry args={[7, 48]} />
        <meshStandardMaterial color="#6e4428" roughness={0.9} />
      </mesh>
      <PreviewModel vehicle={vehicle} livery={livery} />
      <OrbitControls
        autoRotate
        autoRotateSpeed={1.4}
        enablePan={false}
        enableZoom={false}
        target={[0, 2, 0]}
        minPolarAngle={0.6}
        maxPolarAngle={1.35}
      />
    </Canvas>
  );
}
