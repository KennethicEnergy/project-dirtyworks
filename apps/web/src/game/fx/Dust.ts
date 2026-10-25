/**
 * Cheap dust and debris: one point cloud with a fixed pool of particles (ring buffer), soft round
 * sprites, light gravity and fade-out. No allocation after construction.
 */
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  NormalBlending,
  Points,
  ShaderMaterial,
  type Object3D,
} from "three";

const VERT = `
attribute float aAlpha;
attribute float aSize;
attribute vec3 aColor;
varying float vAlpha;
varying vec3 vColor;
void main() {
  vAlpha = aAlpha;
  vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * (320.0 / max(1.0, -mv.z));
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = `
varying float vAlpha;
varying vec3 vColor;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float r = dot(d, d) * 4.0;
  if (r > 1.0) discard;
  gl_FragColor = vec4(vColor, vAlpha * (1.0 - r));
}`;

const tmp = new Color();

export class Dust {
  readonly points: Points;
  private readonly geometry = new BufferGeometry();
  private readonly material: ShaderMaterial;
  private readonly pos: Float32Array;
  private readonly vel: Float32Array;
  private readonly col: Float32Array;
  private readonly life: Float32Array;
  private readonly maxLife: Float32Array;
  private readonly size: Float32Array;
  private readonly alpha: Float32Array;
  private next = 0;
  /** Particles currently alive (perf overlay). */
  alive = 0;

  constructor(
    readonly capacity: number,
    private readonly parent: Object3D,
  ) {
    this.pos = new Float32Array(capacity * 3);
    this.vel = new Float32Array(capacity * 3);
    this.col = new Float32Array(capacity * 3);
    this.life = new Float32Array(capacity);
    this.maxLife = new Float32Array(capacity).fill(1);
    this.size = new Float32Array(capacity);
    this.alpha = new Float32Array(capacity);
    this.geometry.setAttribute("position", new BufferAttribute(this.pos, 3));
    this.geometry.setAttribute("aColor", new BufferAttribute(this.col, 3));
    this.geometry.setAttribute("aSize", new BufferAttribute(this.size, 1));
    this.geometry.setAttribute("aAlpha", new BufferAttribute(this.alpha, 1));
    this.material = new ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: NormalBlending,
    });
    this.points = new Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 2;
    parent.add(this.points);
  }

  /** Puffs `count` particles at (x, y, z). */
  emit(x: number, y: number, z: number, count: number, color: number, spread = 1, up = 2): void {
    tmp.setHex(color);
    for (let n = 0; n < count; n++) {
      const i = this.next;
      this.next = (this.next + 1) % this.capacity;
      const o = i * 3;
      this.pos[o] = x + (Math.random() - 0.5) * spread;
      this.pos[o + 1] = y + Math.random() * 0.3;
      this.pos[o + 2] = z + (Math.random() - 0.5) * spread;
      this.vel[o] = (Math.random() - 0.5) * spread * 2;
      this.vel[o + 1] = up * (0.5 + Math.random());
      this.vel[o + 2] = (Math.random() - 0.5) * spread * 2;
      const shade = 0.85 + Math.random() * 0.3;
      this.col[o] = tmp.r * shade;
      this.col[o + 1] = tmp.g * shade;
      this.col[o + 2] = tmp.b * shade;
      const life = 0.8 + Math.random() * 1.2;
      this.life[i] = life;
      this.maxLife[i] = life;
      this.size[i] = 0.6 + Math.random() * 0.9;
    }
  }

  update(dt: number): void {
    let alive = 0;
    const drag = Math.max(0, 1 - 1.6 * dt);
    for (let i = 0; i < this.capacity; i++) {
      if (this.life[i]! <= 0) {
        this.alpha[i] = 0;
        continue;
      }
      alive++;
      const o = i * 3;
      this.vel[o]! *= drag;
      this.vel[o + 1] = this.vel[o + 1]! * drag - 2.5 * dt;
      this.vel[o + 2]! *= drag;
      this.pos[o]! += this.vel[o]! * dt;
      this.pos[o + 1]! += this.vel[o + 1]! * dt;
      this.pos[o + 2]! += this.vel[o + 2]! * dt;
      this.life[i]! -= dt;
      const t = Math.max(0, this.life[i]! / this.maxLife[i]!);
      this.alpha[i] = 0.55 * t;
      this.size[i]! += dt * 0.8;
    }
    this.alive = alive;
    const attrs = this.geometry.attributes;
    attrs.position!.needsUpdate = true;
    attrs.aAlpha!.needsUpdate = true;
    attrs.aSize!.needsUpdate = true;
    attrs.aColor!.needsUpdate = true;
  }

  dispose(): void {
    this.parent.remove(this.points);
    this.geometry.dispose();
    this.material.dispose();
  }
}
