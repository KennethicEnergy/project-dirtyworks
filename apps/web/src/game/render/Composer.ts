/**
 * Miniature look: three's two-pass tilt-shift blur (sharp along a horizontal focus line, softer
 * toward the top and bottom of the screen), then OutputPass for tone mapping and sRGB.
 */
import {
  HalfFloatType,
  WebGLRenderTarget,
  type Camera,
  type Scene,
  type WebGLRenderer,
} from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { HorizontalTiltShiftShader } from "three/examples/jsm/shaders/HorizontalTiltShiftShader.js";
import { VerticalTiltShiftShader } from "three/examples/jsm/shaders/VerticalTiltShiftShader.js";

/** Blur strength: roughly the sample spread in CSS pixels halfway from the focus line to an edge. */
export const TILT_SHIFT_AMOUNT = 4;

/**
 * MSAA samples for the composer's (two, half-float) render targets. Multisampled targets are
 * memory-hungry, so high-DPI screens, where pixels are small anyway, get fewer.
 */
export function composerSamples(quality: "low" | "medium" | "high", dpr: number): number {
  if (quality === "high") return dpr > 1.5 ? 2 : 4;
  if (quality === "medium") return dpr > 1.25 ? 0 : 2;
  return 0;
}

export class TiltShiftComposer {
  /** Focus line in screen space: 0 = bottom, 1 = top. */
  focus = 0.5;
  amount = TILT_SHIFT_AMOUNT;
  private readonly composer: EffectComposer;
  private readonly horizontal = new ShaderPass(HorizontalTiltShiftShader);
  private readonly vertical = new ShaderPass(VerticalTiltShiftShader);
  private cssWidth = 1;
  private cssHeight = 1;
  private dpr = 0;

  constructor(gl: WebGLRenderer, scene: Scene, camera: Camera, samples: number) {
    const target = new WebGLRenderTarget(1, 1, { type: HalfFloatType, samples });
    this.composer = new EffectComposer(gl, target);
    this.composer.addPass(new RenderPass(scene, camera));
    this.composer.addPass(this.horizontal);
    this.composer.addPass(this.vertical);
    this.composer.addPass(new OutputPass());
  }

  setSize(cssWidth: number, cssHeight: number, dpr: number): void {
    const w = Math.max(1, Math.round(cssWidth));
    const h = Math.max(1, Math.round(cssHeight));
    if (w === this.cssWidth && h === this.cssHeight && dpr === this.dpr) return;
    this.cssWidth = w;
    this.cssHeight = h;
    this.dpr = dpr;
    this.composer.setPixelRatio(dpr);
    this.composer.setSize(this.cssWidth, this.cssHeight);
  }

  render(dt: number): void {
    const f = Math.min(0.9, Math.max(0.1, this.focus));
    this.horizontal.uniforms.h!.value = this.amount / this.cssWidth;
    this.horizontal.uniforms.r!.value = f;
    this.vertical.uniforms.v!.value = this.amount / this.cssHeight;
    this.vertical.uniforms.r!.value = f;
    this.composer.render(dt);
  }

  dispose(): void {
    this.horizontal.dispose();
    this.vertical.dispose();
    this.composer.dispose();
  }
}
