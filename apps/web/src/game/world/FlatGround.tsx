"use client";

import { CuboidCollider, RigidBody } from "@react-three/rapier";
import { useRuntime } from "../runtime";

/**
 * Placeholder ground: a flat slab at the table's ground height. Replaced by the chunked,
 * diggable terrain once it lands.
 */
export function FlatGround() {
  const { map, material } = useRuntime();
  const hx = map.cellsX / 2;
  const hz = map.cellsZ / 2;
  const h = map.baseTerrain.groundHeight;
  return (
    <group>
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[hx, h / 2, hz]} position={[0, h / 2, 0]} friction={1} />
      </RigidBody>
      <mesh position={[0, h / 2, 0]} receiveShadow>
        <boxGeometry args={[hx * 2, h, hz * 2]} />
        <meshStandardMaterial color={material.colors.sand} roughness={0.95} />
      </mesh>
    </group>
  );
}
