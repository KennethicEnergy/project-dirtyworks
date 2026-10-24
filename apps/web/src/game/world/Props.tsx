"use client";

import type { Collider } from "@dimforge/rapier3d-compat";
import type { PropKind, PropSpec } from "@dirtyworks/shared";
import { useRapier } from "@react-three/rapier";
import { useEffect, useMemo } from "react";
import {
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
  type BufferGeometry,
} from "three";
import { isSameWorld, worldToken } from "../physics/worldToken";
import { useRuntime } from "../runtime";

type Shape = "box" | "cylinder" | "cone" | "ball" | "rock" | "roof";
type V3 = [number, number, number];

interface Part {
  shape: Shape;
  size: V3;
  offset: V3;
  color: number;
  emissive?: number;
}

/** Toy-like props built from a few primitives each; every part kind is one InstancedMesh. */
const PARTS: Record<PropKind, Part[]> = {
  cone: [
    { shape: "cone", size: [0.9, 1.3, 0.9], offset: [0, 0.75, 0], color: 0xf26b1d },
    { shape: "box", size: [1.1, 0.1, 1.1], offset: [0, 0.05, 0], color: 0xf26b1d },
    { shape: "cylinder", size: [0.62, 0.18, 0.62], offset: [0, 0.75, 0], color: 0xf2efe8 },
  ],
  pallet: [
    { shape: "box", size: [2.4, 0.12, 2], offset: [0, 0.38, 0], color: 0xc29a62 },
    { shape: "box", size: [2.4, 0.32, 0.25], offset: [0, 0.16, -0.85], color: 0xa57e4b },
    { shape: "box", size: [2.4, 0.32, 0.25], offset: [0, 0.16, 0], color: 0xa57e4b },
    { shape: "box", size: [2.4, 0.32, 0.25], offset: [0, 0.16, 0.85], color: 0xa57e4b },
  ],
  "toy-house": [
    { shape: "box", size: [6, 4, 6], offset: [0, 2, 0], color: 0xf2e6cf },
    { shape: "roof", size: [8.4, 3, 8.4], offset: [0, 5.5, 0], color: 0xb5452f },
    { shape: "box", size: [1.3, 2.2, 0.12], offset: [0, 1.1, 3.02], color: 0x6e4428 },
    { shape: "box", size: [1.2, 1.1, 0.12], offset: [-1.8, 2.4, 3.02], color: 0x9bc7d6 },
  ],
  tree: [
    { shape: "cylinder", size: [0.9, 3.2, 0.9], offset: [0, 1.6, 0], color: 0x6e4428 },
    { shape: "ball", size: [5, 4.6, 5], offset: [0, 5, 0], color: 0x4f7a52 },
    { shape: "ball", size: [3.4, 3.2, 3.4], offset: [0.8, 7, -0.4], color: 0x5d8a5d },
  ],
  rock: [{ shape: "rock", size: [2.8, 1.8, 2.4], offset: [0, 0.6, 0], color: 0x8b8178 }],
  barrier: [
    { shape: "box", size: [4, 0.9, 0.6], offset: [0, 0.45, 0], color: 0xd9d4cb },
    { shape: "box", size: [4.02, 0.18, 0.62], offset: [0, 0.72, 0], color: 0xb5452f },
  ],
  shed: [
    { shape: "box", size: [8, 4.5, 6], offset: [0, 2.25, 0], color: 0x8d8a84 },
    { shape: "box", size: [8.8, 0.4, 6.8], offset: [0, 4.7, 0], color: 0x4a3323 },
    { shape: "box", size: [3, 3.2, 0.12], offset: [0, 1.6, 3.02], color: 0x3a3a3a },
  ],
  "charging-station": [
    { shape: "box", size: [5, 0.12, 5], offset: [0, 0.06, 0], color: 0x2d6a3e, emissive: 0x1f9c52 },
    { shape: "box", size: [0.6, 2.6, 0.6], offset: [2.1, 1.3, -2.1], color: 0x3a3a3a },
    {
      shape: "box",
      size: [1, 0.8, 0.4],
      offset: [2.1, 2.4, -1.85],
      color: 0xf5c518,
      emissive: 0x9c7a00,
    },
  ],
};

/** Static collider per prop (half extents and center offset); flat pads have none. */
const COLLIDERS: Record<PropKind, { half: V3; offset: V3 }> = {
  cone: { half: [0.4, 0.7, 0.4], offset: [0, 0.7, 0] },
  pallet: { half: [1.2, 0.22, 1], offset: [0, 0.22, 0] },
  "toy-house": { half: [3, 3.5, 3], offset: [0, 3.5, 0] },
  tree: { half: [0.5, 1.6, 0.5], offset: [0, 1.6, 0] },
  rock: { half: [1.2, 0.85, 1.05], offset: [0, 0.6, 0] },
  barrier: { half: [2, 0.45, 0.3], offset: [0, 0.45, 0] },
  shed: { half: [4, 2.4, 3], offset: [0, 2.4, 0] },
  "charging-station": { half: [0.3, 1.3, 0.3], offset: [2.1, 1.3, -2.1] },
};

function unitGeometry(shape: Shape): BufferGeometry {
  switch (shape) {
    case "box":
      return new BoxGeometry(1, 1, 1);
    case "cylinder":
      return new CylinderGeometry(0.5, 0.5, 1, 12);
    case "cone":
      return new ConeGeometry(0.5, 1, 14);
    case "ball":
      return new IcosahedronGeometry(0.5, 1);
    case "rock":
      return new DodecahedronGeometry(0.5, 0);
    case "roof": {
      const g = new ConeGeometry(Math.SQRT1_2, 1, 4);
      g.rotateY(Math.PI / 4);
      return g;
    }
  }
}

const scratch = {
  m: new Matrix4(),
  q: new Quaternion(),
  p: new Vector3(),
  s: new Vector3(),
  off: new Vector3(),
  up: new Vector3(0, 1, 0),
};

function partMatrix(prop: PropSpec, y: number, part: Part, out: Matrix4): Matrix4 {
  const { q, p, s, off, up } = scratch;
  q.setFromAxisAngle(up, prop.yaw);
  off
    .set(part.offset[0], part.offset[1], part.offset[2])
    .multiplyScalar(prop.scale)
    .applyQuaternion(q);
  p.set(prop.x, y, prop.z).add(off);
  s.set(part.size[0], part.size[1], part.size[2]).multiplyScalar(prop.scale);
  return out.compose(p, q, s);
}

export function Props() {
  const rt = useRuntime();
  const { world, rapier } = useRapier();
  const props = rt.map.props;

  const meshes = useMemo(() => {
    const list: InstancedMesh[] = [];
    const byKind = new Map<PropKind, PropSpec[]>();
    for (const p of props) byKind.set(p.kind, [...(byKind.get(p.kind) ?? []), p]);
    for (const [kind, items] of byKind) {
      for (const part of PARTS[kind]) {
        const material = new MeshStandardMaterial({
          color: part.color,
          roughness: 0.8,
          flatShading: part.shape === "rock" || part.shape === "ball",
          emissive: part.emissive ?? 0x000000,
          emissiveIntensity: part.emissive ? 0.6 : 0,
        });
        const mesh = new InstancedMesh(unitGeometry(part.shape), material, items.length);
        items.forEach((item, i) =>
          mesh.setMatrixAt(i, partMatrix(item, rt.groundHeightAt(item.x, item.z), part, scratch.m)),
        );
        mesh.instanceMatrix.needsUpdate = true;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.computeBoundingSphere();
        list.push(mesh);
      }
    }
    return list;
  }, [props, rt]);

  useEffect(
    () => () => {
      for (const m of meshes) {
        m.geometry.dispose();
        (m.material as MeshStandardMaterial).dispose();
        m.dispose();
      }
    },
    [meshes],
  );

  useEffect(() => {
    const colliders: Collider[] = [];
    const token = worldToken(world);
    const q = new Quaternion();
    const off = new Vector3();
    for (const p of props) {
      const c = COLLIDERS[p.kind];
      q.setFromAxisAngle(scratch.up, p.yaw);
      off.set(c.offset[0], c.offset[1], c.offset[2]).multiplyScalar(p.scale).applyQuaternion(q);
      const desc = rapier.ColliderDesc.cuboid(
        c.half[0] * p.scale,
        c.half[1] * p.scale,
        c.half[2] * p.scale,
      )
        .setTranslation(p.x + off.x, rt.groundHeightAt(p.x, p.z) + off.y, p.z + off.z)
        .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
      colliders.push(world.createCollider(desc));
    }
    return () => {
      if (!isSameWorld(world, token)) return;
      for (const c of colliders) world.removeCollider(c, false);
    };
  }, [props, world, rapier, rt]);

  return (
    <group>
      {meshes.map((m) => (
        <primitive key={m.uuid} object={m} />
      ))}
    </group>
  );
}
