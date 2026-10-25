"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import type { PerspectiveCamera } from "three";
import { useSettings } from "@/state/settingsStore";
import { composerSamples, TiltShiftComposer } from "../render/Composer";
import { useRuntime } from "../runtime";

/**
 * The only useFrame in game code. Priority 1 tells R3F we render ourselves: the `render` phase
 * of the loop draws the frame, through the tilt-shift composer when it is on.
 */
export function LoopDriver() {
  const rt = useRuntime();
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const dpr = useThree((s) => s.viewport.dpr);
  const tiltShift = useSettings((s) => s.tiltShift);
  const quality = useSettings((s) => s.quality);
  const composer = useRef<TiltShiftComposer | null>(null);

  useEffect(() => {
    if (!tiltShift) return;
    const c = new TiltShiftComposer(gl, scene, camera, composerSamples(quality, dpr));
    composer.current = c;
    return () => {
      c.dispose();
      if (composer.current === c) composer.current = null;
    };
  }, [gl, scene, camera, tiltShift, quality, dpr]);

  // After (re)creating the composer and on every resize; setSize skips unchanged sizes.
  useEffect(() => composer.current?.setSize(size.width, size.height, dpr));

  useEffect(() => {
    rt.three = { gl, scene, camera: camera as PerspectiveCamera };
    // Several passes per frame: count draw calls for the whole frame (perf overlay).
    gl.info.autoReset = false;
    const off = rt.loop.register(
      "render",
      {
        name: "default-render",
        update(ctx) {
          gl.info.reset();
          const c = composer.current;
          if (c) {
            c.focus = rt.focusY;
            c.render(ctx.dt);
          } else {
            gl.render(scene, camera);
          }
          // Read the canvas in the same task as the render (no preserveDrawingBuffer needed).
          const capture = rt.captureRequest;
          if (capture) {
            rt.captureRequest = null;
            capture(gl.domElement.toDataURL("image/png"));
          }
        },
      },
      100,
    );
    return () => {
      off();
      gl.info.autoReset = true;
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
