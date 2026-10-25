"use client";

import {
  nearestEdgeT,
  rimExtents,
  rimPoint,
  vec3,
  walkEdgeT,
  yawOf,
  type Pose,
} from "@dirtyworks/shared";
import { useThree } from "@react-three/fiber";
import { useEffect } from "react";
import { Vector3, type PerspectiveCamera } from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { useSession } from "@/state/sessionStore";
import { useSettings } from "@/state/settingsStore";
import { useUi, type CameraMode } from "@/state/uiStore";
import { useRuntime, type LocalVehicle } from "../runtime";

const MODES: CameraMode[] = ["operator", "chase", "free"];
const MODE_LABEL: Record<CameraMode, string> = {
  operator: "Operator view: you, standing at the table",
  chase: "Chase cam",
  free: "Free orbit: drag to look around",
};
const BASE_FOV = 45;

/** Position and orientation of whatever the camera follows (local pose or interpolated remote). */
type Followed = Pick<Pose, "x" | "y" | "z" | "qx" | "qy" | "qz" | "qw">;

/** The operator walks the rim toward their vehicle: proportional, capped, with a dead zone. */
const WALK_MAX = 9;
const WALK_GAIN = 0.9;
const WALK_DEADZONE = 1.5;
/** Operator eye above the rim and step back from it (m) at zoom 1. */
const EYE_HEIGHT = 15;
const PULLBACK = 7;
/** The lens narrows for far-off vehicles so they stay readable: full FOV up to this distance. */
const LENS_NEAR = 38;
const LENS_MIN_FOV = 20;

/**
 * Registers the `camera` phase system. Operator (default): eye height at your spot on the rim,
 * looking at your vehicle. Chase: drag to orbit, wheel to zoom. Free: orbit controls. V cycles.
 * Also walks the operator spot (`edgeT`, synced to others) and aims the tilt-shift focus line.
 */
export function CameraRig() {
  const rt = useRuntime();
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const gl = useThree((s) => s.gl);

  useEffect(() => {
    const el = gl.domElement;
    const map = rt.map;
    const rim = rimExtents(map);
    const controls = new OrbitControls(camera, el);
    controls.enabled = false;
    controls.enableDamping = true;
    controls.maxPolarAngle = Math.PI * 0.48;
    controls.minDistance = 6;
    controls.maxDistance = 260;

    const orbit = { yaw: 0, pitch: 0.42, distance: 20 };
    let operatorZoom = 1;
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    let lastLocal: LocalVehicle | null = null;
    const desired = new Vector3();
    const look = new Vector3(0, 0, 0);
    const lookTarget = new Vector3();
    const projected = new Vector3();
    const spot = vec3();

    /** Photo mode always flies the free camera. */
    const mode = (): CameraMode => {
      const ui = useUi.getState();
      return ui.photoMode ? "free" : ui.cameraMode;
    };
    controls.enabled = mode() === "free";
    let lastMode = mode();
    const onDown = (e: PointerEvent) => {
      if (mode() !== "chase" || e.pointerType === "touch") return;
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
      const m = mode();
      if (m === "chase") {
        orbit.distance = Math.min(70, Math.max(8, orbit.distance * (1 + e.deltaY * 0.001)));
      } else if (m === "operator") {
        operatorZoom = Math.min(2.2, Math.max(0.45, operatorZoom * (1 + e.deltaY * 0.001)));
      }
    };
    el.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    el.addEventListener("wheel", onWheel, { passive: true });

    camera.position.set(0, 70, -100);
    camera.lookAt(0, 0, 0);

    /** Walks the operator spot along the rim toward the point nearest the vehicle. */
    const walk = (local: LocalVehicle, dt: number) => {
      const p = local.pose;
      const target = nearestEdgeT(map, p.x, p.z);
      if (local !== lastLocal) {
        lastLocal = local;
        rt.edgeT = target;
        return;
      }
      let gap = target - rt.edgeT;
      gap = Math.abs(gap - Math.round(gap)) * rim.perimeter;
      if (gap > WALK_DEADZONE) {
        rt.edgeT = walkEdgeT(map, rt.edgeT, target, Math.min(WALK_MAX, gap * WALK_GAIN) * dt);
      }
    };

    const setFov = (fov: number, dt: number) => {
      const next = camera.fov + (fov - camera.fov) * (1 - Math.exp(-3 * dt));
      if (Math.abs(next - camera.fov) < 0.01) return;
      camera.fov = next;
      camera.updateProjectionMatrix();
    };

    /** Keeps the tilt-shift focus line on the followed vehicle's screen height. */
    const aimFocus = (p: Followed | null, dt: number) => {
      let target = 0.5;
      if (p) {
        camera.updateMatrixWorld();
        projected.set(p.x, p.y + 1, p.z).project(camera);
        if (projected.z < 1) target = (projected.y + 1) / 2;
      }
      rt.focusY += (target - rt.focusY) * (1 - Math.exp(-4 * dt));
    };

    const off = rt.loop.register("camera", {
      name: "camera-rig",
      update(ctx) {
        if (rt.input.pressed("camera") && !useUi.getState().photoMode) {
          const next = MODES[(MODES.indexOf(mode()) + 1) % MODES.length]!;
          useUi.getState().set({ cameraMode: next });
          useSession.getState().pushToast(MODE_LABEL[next], "info");
        }
        const m = mode();
        if (m !== lastMode) {
          lastMode = m;
          if (m === "free") controls.target.copy(look);
          controls.enabled = m === "free";
        }
        const local = rt.local;
        if (local) walk(local, ctx.dt);
        else lastLocal = null;

        // Follow your own vehicle, or the driver you are spectating (from their rim spot).
        let p: Followed | null = local?.pose ?? null;
        let edgeT = rt.edgeT;
        if (!p && rt.spectateId) {
          const watched = rt.remotes?.get(rt.spectateId);
          if (watched) {
            p = watched.pose;
            edgeT = watched.edgeT;
          }
        }

        if (m === "free") {
          setFov(BASE_FOV, ctx.dt);
          controls.update(ctx.dt);
          aimFocus(p, ctx.dt);
          return;
        }
        let posRate = 4;
        let lookRate = 8;
        if (p && m === "operator") {
          rimPoint(map, edgeT, spot);
          // Step back outward from the table (smooth around the corners).
          let ox = Math.sign(spot.x) * (spot.x / rim.hx) ** 4;
          let oz = Math.sign(spot.z) * (spot.z / rim.hz) ** 4;
          const len = Math.hypot(ox, oz) || 1;
          ox /= len;
          oz /= len;
          desired.set(
            spot.x + ox * PULLBACK * operatorZoom,
            spot.y + EYE_HEIGHT * operatorZoom,
            spot.z + oz * PULLBACK * operatorZoom,
          );
          lookTarget.set(p.x, p.y + 1, p.z);
          posRate = 2.5;
          lookRate = 3;
          const d = camera.position.distanceTo(lookTarget);
          setFov(Math.max(LENS_MIN_FOV, Math.min(BASE_FOV, (BASE_FOV * LENS_NEAR) / d)), ctx.dt);
        } else if (p) {
          const yaw = yawOf(p.qx, p.qy, p.qz, p.qw) + orbit.yaw;
          const flat = Math.cos(orbit.pitch) * orbit.distance;
          desired.set(
            p.x - Math.sin(yaw) * flat,
            p.y + 2 + Math.sin(orbit.pitch) * orbit.distance,
            p.z - Math.cos(yaw) * flat,
          );
          lookTarget.set(p.x, p.y + 2, p.z);
          setFov(BASE_FOV, ctx.dt);
        } else {
          const t = ctx.time * 0.05;
          desired.set(Math.sin(t) * 110, 75, Math.cos(t) * 110);
          lookTarget.set(0, 0, 0);
          setFov(BASE_FOV, ctx.dt);
        }
        camera.position.lerp(desired, 1 - Math.exp(-posRate * ctx.dt));
        look.lerp(lookTarget, 1 - Math.exp(-lookRate * ctx.dt));
        camera.lookAt(look);
        aimFocus(p, ctx.dt);
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
