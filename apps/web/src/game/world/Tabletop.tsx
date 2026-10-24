"use client";

import { CuboidCollider, RigidBody } from "@react-three/rapier";
import { useRuntime } from "../runtime";

/** Floor of the cafe, far below the table (only visible through the fog). */
const FLOOR_Y = -70;
const BOARD_THICKNESS = 1.6;

/**
 * The diorama tray: tabletop board, rim walls the operators stand on, and table legs.
 * Rim walls are solid so vehicles cannot drive off the table.
 */
export function Tabletop() {
  const { map } = useRuntime();
  const hx = map.cellsX / 2;
  const hz = map.cellsZ / 2;
  const { rimWidth: rw, rimHeight: rh, color, rimColor, kind } = map.tabletop;
  const boardHalfX = hx + rw + 8;
  const boardHalfZ = hz + rw + 8;
  const legX = boardHalfX - 4;
  const legZ = boardHalfZ - 4;
  const legH = -BOARD_THICKNESS - FLOOR_Y;
  const roughness = kind === "wood" ? 0.75 : 0.9;

  const walls: [number, number, number, number][] = [
    // centerX, centerZ, halfX, halfZ
    [0, -hz - rw / 2, hx + rw, rw / 2],
    [0, hz + rw / 2, hx + rw, rw / 2],
    [-hx - rw / 2, 0, rw / 2, hz],
    [hx + rw / 2, 0, rw / 2, hz],
  ];

  return (
    <group>
      <mesh position={[0, -BOARD_THICKNESS / 2, 0]} receiveShadow castShadow>
        <boxGeometry args={[boardHalfX * 2, BOARD_THICKNESS, boardHalfZ * 2]} />
        <meshStandardMaterial color={color} roughness={roughness} />
      </mesh>

      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider
          args={[boardHalfX, BOARD_THICKNESS / 2, boardHalfZ]}
          position={[0, -BOARD_THICKNESS / 2, 0]}
        />
        {walls.map(([x, z, wx, wz], i) => (
          <CuboidCollider key={i} args={[wx, rh / 2 + 4, wz]} position={[x, rh / 2 + 4, z]} />
        ))}
      </RigidBody>

      {walls.map(([x, z, wx, wz], i) => (
        <mesh key={i} position={[x, rh / 2, z]} castShadow receiveShadow>
          <boxGeometry args={[wx * 2, rh, wz * 2]} />
          <meshStandardMaterial color={rimColor} roughness={roughness} />
        </mesh>
      ))}

      {[-1, 1].flatMap((sx) =>
        [-1, 1].map((sz) => (
          <mesh key={`${sx}${sz}`} position={[sx * legX, FLOOR_Y + legH / 2, sz * legZ]}>
            <cylinderGeometry args={[2.4, 2.8, legH, 16]} />
            <meshStandardMaterial color={rimColor} roughness={roughness} />
          </mesh>
        )),
      )}

      <mesh position={[0, FLOOR_Y, 0]} rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[2400, 2400]} />
        <meshStandardMaterial color="#3b2516" roughness={0.95} />
      </mesh>
    </group>
  );
}
