"use client";

import { yawOf } from "@dirtyworks/shared";
import { useThree } from "@react-three/fiber";
import { useEffect } from "react";
import { Vector3, type PerspectiveCamera } from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { useSettings } from "@/state/settingsStore";
import { useUi, type CameraMode } from "@/state/uiStore";
import { useRuntime } from "../runtime";

const MODES: CameraMode[] = ["chase", "free"];

/** Registers the `camera` phase system: chase (drag to orbit, wheel to zoom) or free orbit (V). */
export function CameraRig() {
  const rt = useRuntime();
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const gl = useThree((s) => s.gl);

  useEffect(() => {
    const el = gl.domElement;
    const controls = new OrbitControls(camera, el);
    controls.enabled = false;
    controls.enableDamping = true;
    controls.maxPolarAngle = Math.PI * 0.48;
    controls.minDistance = 6;
    controls.maxDistance = 260;

    const orbit = { yaw: 0, pitch: 0.42, distance: 20 };
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    const desired = new Vector3();
    const look = new Vector3(0, 0, 0);
    const lookTarget = new Vector3();

    const mode = () => useUi.getState().cameraMode;
    const onDown = (e: PointerEvent) => {
      if (mode() === "free" || e.pointerType === "touch") return;
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      const s = 0.005 * useSettings.getState().cameraSensitivity;
      orbit.yaw -= (e.clientX - lastX) * s;
      orbit.pitch = Math.min(1.3, Math.max(0.08, orbit.pitch + (e.clientY - lastY) * s));
      lastX = e.clientX;
      lastY = e.clientY;
    };
    const onUp = () => (dragging = false);
    const onWheel = (e: WheelEvent) => {
      if (mode() === "free") return;
      orbit.distance = Math.min(70, Math.max(8, orbit.distance * (1 + e.deltaY * 0.001)));
    };
    el.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    el.addEventListener("wheel", onWheel, { passive: true });

    camera.position.set(0, 70, -100);
    camera.lookAt(0, 0, 0);

    const off = rt.loop.register("camera", {
      name: "camera-rig",
      update(ctx) {
        if (rt.input.pressed("camera")) {
          const next = MODES[(MODES.indexOf(mode()) + 1) % MODES.length]!;
          useUi.getState().set({ cameraMode: next });
          if (next === "free") controls.target.copy(look);
          controls.enabled = next === "free";
        }
        if (mode() === "free") {
          controls.update(ctx.dt);
          return;
        }
        const local = rt.local;
        if (local) {
          const p = local.pose;
          const yaw = yawOf(p.qx, p.qy, p.qz, p.qw) + orbit.yaw;
          const flat = Math.cos(orbit.pitch) * orbit.distance;
          desired.set(
            p.x - Math.sin(yaw) * flat,
            p.y + 2 + Math.sin(orbit.pitch) * orbit.distance,
            p.z - Math.cos(yaw) * flat,
          );
          lookTarget.set(p.x, p.y + 2, p.z);
        } else {
          const t = ctx.time * 0.05;
          desired.set(Math.sin(t) * 110, 75, Math.cos(t) * 110);
          lookTarget.set(0, 0, 0);
        }
        camera.position.lerp(desired, 1 - Math.exp(-4 * ctx.dt));
        look.lerp(lookTarget, 1 - Math.exp(-8 * ctx.dt));
        camera.lookAt(look);
      },
    });

    return () => {
      off();
      controls.dispose();
      el.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      el.removeEventListener("wheel", onWheel);
    };
  }, [rt, camera, gl]);

  return null;
}
