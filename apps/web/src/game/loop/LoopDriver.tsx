"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect } from "react";
import type { PerspectiveCamera } from "three";
import { useRuntime } from "../runtime";

/**
 * The only useFrame in game code. Priority 1 tells R3F we render ourselves: the `render` phase
 * of the loop draws the frame.
 */
export function LoopDriver() {
  const rt = useRuntime();
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);

  useEffect(() => {
    rt.three = { gl, scene, camera: camera as PerspectiveCamera };
    const off = rt.loop.register(
      "render",
      {
        name: "default-render",
        update: () => gl.render(scene, camera),
      },
      100,
    );
    return () => {
      off();
      rt.three = null;
    };
  }, [rt, gl, scene, camera]);

  useEffect(() => rt.input.attach(window), [rt]);
  useEffect(
    () => rt.loop.register("inputs", { name: "input", update: () => rt.input.update() }),
    [rt],
  );

  useFrame((_, delta) => rt.loop.tick(delta), 1);
  return null;
}
