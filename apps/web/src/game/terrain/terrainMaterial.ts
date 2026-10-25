/**
 * Terrain shading: blends the material preset's rock / dirt / sand colors by slope and height,
 * darkens freshly dug ground for a while (per-vertex timestamp vs. a time uniform) and darkens
 * track wear. MeshStandardMaterial keeps lighting and shadows; only the base color is replaced.
 */
import type { MaterialPreset } from "@dirtyworks/shared";
import { Color, MeshStandardMaterial } from "three";

export interface TerrainMaterial {
  material: MeshStandardMaterial;
  uniforms: {
    uTime: { value: number };
  };
  setPreset(preset: MaterialPreset, groundHeight: number): void;
  dispose(): void;
}

/** Seconds a fresh dig stays darker. */
export const FRESH_FADE_SECONDS = 20;

export function createTerrainMaterial(
  preset: MaterialPreset,
  groundHeight: number,
): TerrainMaterial {
  const uniforms = {
    uTime: { value: 0 },
    uFreshFade: { value: FRESH_FADE_SECONDS },
    uRock: { value: new Color() },
    uDirt: { value: new Color() },
    uSand: { value: new Color() },
    uFresh: { value: new Color() },
    uGround: { value: groundHeight },
  };
  const material = new MeshStandardMaterial({ roughness: 0.95, metalness: 0 });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
attribute float aFresh;
attribute float aWear;
varying vec3 vTerrainNormal;
varying float vTerrainY;
varying float vFresh;
varying float vWear;`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
vTerrainNormal = objectNormal;
vTerrainY = transformed.y;
vFresh = aFresh;
vWear = aWear;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
uniform float uTime;
uniform float uFreshFade;
uniform vec3 uRock;
uniform vec3 uDirt;
uniform vec3 uSand;
uniform vec3 uFresh;
uniform float uGround;
varying vec3 vTerrainNormal;
varying float vTerrainY;
varying float vFresh;
varying float vWear;`,
      )
      .replace(
        "vec4 diffuseColor = vec4( diffuse, opacity );",
        `float slope = 1.0 - clamp(normalize(vTerrainNormal).y, 0.0, 1.0);
float rockMix = smoothstep(0.32, 0.55, slope);
float sandMix = smoothstep(uGround - 1.2, uGround + 0.6, vTerrainY) * (1.0 - rockMix);
vec3 terrainColor = mix(mix(uDirt, uSand, sandMix), uRock, rockMix);
float fresh = 1.0 - clamp((uTime - vFresh) / uFreshFade, 0.0, 1.0);
terrainColor = mix(terrainColor, uFresh, fresh * 0.85);
terrainColor *= 1.0 - 0.35 * clamp(vWear, 0.0, 1.0);
vec4 diffuseColor = vec4( terrainColor, opacity );`,
      );
  };

  const api: TerrainMaterial = {
    material,
    uniforms,
    setPreset(p, ground) {
      uniforms.uRock.value.setHex(p.colors.rock);
      uniforms.uDirt.value.setHex(p.colors.dirt);
      uniforms.uSand.value.setHex(p.colors.sand);
      uniforms.uFresh.value.setHex(p.fresh);
      uniforms.uGround.value = ground;
    },
    dispose() {
      material.dispose();
    },
  };
  api.setPreset(preset, groundHeight);
  return api;
}
