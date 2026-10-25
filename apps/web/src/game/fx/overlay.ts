/**
 * Helpers for DOM overlays that follow points in the 3D world (operator chips, nameplates,
 * emote bubbles). The loop positions elements with transforms; React only renders the roster.
 */
import { Vector3, type Camera } from "three";

export interface ScreenPoint {
  /** CSS pixels from the canvas' left/top edge. */
  x: number;
  y: number;
  /** Distance from the camera (m). */
  distance: number;
}

const v = new Vector3();

/** Projects a world point into canvas CSS pixels. False when it is behind the camera. */
export function projectToScreen(
  camera: Camera,
  x: number,
  y: number,
  z: number,
  width: number,
  height: number,
  out: ScreenPoint,
): boolean {
  v.set(x, y, z);
  out.distance = v.distanceTo(camera.position);
  v.project(camera);
  if (v.z > 1 || v.z < -1) return false;
  out.x = (v.x + 1) * 0.5 * width;
  out.y = (1 - v.y) * 0.5 * height;
  return true;
}

/** Nameplates: fully visible up to 35 m, fading out by 95 m. */
const FADE_START = 35;
const FADE_END = 95;

export function nameplateOpacity(distance: number): number {
  if (distance <= FADE_START) return 1;
  if (distance >= FADE_END) return 0;
  return 1 - (distance - FADE_START) / (FADE_END - FADE_START);
}

/** Places an overlay element centered above (x, y), or hides it. */
export function placeElement(el: HTMLElement, p: ScreenPoint | null, opacity = 1): void {
  if (!p || opacity <= 0.01) {
    if (el.style.visibility !== "hidden") el.style.visibility = "hidden";
    return;
  }
  el.style.visibility = "visible";
  el.style.opacity = opacity.toFixed(2);
  el.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px) translate(-50%, -100%)`;
}
