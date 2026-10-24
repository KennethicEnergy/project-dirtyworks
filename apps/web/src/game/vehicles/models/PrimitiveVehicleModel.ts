/**
 * Base for placeholder vehicles built from boxes and cylinders. Subclasses build the hierarchy;
 * this class owns joints, wheels, livery, load heap, LED and disposal.
 */
import {
  LIVERY_COLORS,
  type Livery,
  type VehicleId,
  type VehicleSpec,
  VEHICLES,
} from "@dirtyworks/shared";
import {
  BoxGeometry,
  CanvasTexture,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  type BufferGeometry,
  type Material,
  type Object3D,
  PlaneGeometry,
  SphereGeometry,
  SRGBColorSpace,
} from "three";
import type { LedState, VehicleModel } from "./VehicleModel";

export const COLORS = {
  dark: 0x2b2622,
  steel: 0x6b625a,
  rubber: 0x1f1c1a,
  glass: 0x6f97a8,
  load: 0x9a7b55,
  white: 0xf2efe8,
};

const LED_COLORS: Record<LedState, number> = { ok: 0x4cd964, low: 0xffa21a, busy: 0x4fc3ff };

interface WheelRig {
  mount: Group;
  steer: Group;
  spin: Object3D;
  baseY: number;
}

export abstract class PrimitiveVehicleModel implements VehicleModel {
  readonly root = new Group();
  readonly nodes: Partial<Record<string, Object3D>> = {};
  readonly spec: VehicleSpec;
  protected readonly wheels: WheelRig[] = [];
  protected readonly roadWheels: Object3D[] = [];
  protected trackPhase = 0;
  private readonly disposables: { dispose(): void }[] = [];
  private readonly paint: MeshStandardMaterial;
  private readonly decalPlates: Mesh[] = [];
  private decalTexture: CanvasTexture | null = null;
  private readonly ledMaterial: MeshStandardMaterial;
  private readonly jointBase = new Map<string, number>();

  constructor(
    readonly id: VehicleId,
    livery: Livery,
  ) {
    this.spec = VEHICLES[id];
    this.root.name = id;
    this.paint = this.material(LIVERY_COLORS[livery.color].hex, { roughness: 0.55 });
    this.ledMaterial = this.material(LED_COLORS.ok, {
      emissive: LED_COLORS.ok,
      emissiveIntensity: 2,
    });
    this.build();
    this.addAntenna();
    this.setLivery(livery);
    this.root.traverse((o) => {
      if ((o as Mesh).isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
  }

  /** Subclasses add chassis, tool nodes, wheels or tracks, and decal plates. */
  protected abstract build(): void;

  // ─── building helpers ───────────────────────────────────────────────────

  protected material(
    color: number | string,
    opts: Partial<{
      roughness: number;
      metalness: number;
      emissive: number;
      emissiveIntensity: number;
    }> = {},
  ): MeshStandardMaterial {
    const m = new MeshStandardMaterial({
      color,
      roughness: opts.roughness ?? 0.7,
      metalness: opts.metalness ?? 0.1,
      emissive: opts.emissive ?? 0x000000,
      emissiveIntensity: opts.emissiveIntensity ?? 1,
    });
    this.disposables.push(m);
    return m;
  }

  protected get paintMaterial(): MeshStandardMaterial {
    return this.paint;
  }

  private track<T extends { dispose(): void }>(item: T): T {
    this.disposables.push(item);
    return item;
  }

  protected box(
    parent: Object3D,
    w: number,
    h: number,
    d: number,
    material: Material,
    x = 0,
    y = 0,
    z = 0,
  ): Mesh {
    const mesh = new Mesh(this.track(new BoxGeometry(w, h, d)), material);
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  }

  protected cylinder(
    parent: Object3D,
    radiusTop: number,
    radiusBottom: number,
    height: number,
    material: Material,
    segments = 16,
  ): Mesh {
    const mesh = new Mesh(
      this.track(new CylinderGeometry(radiusTop, radiusBottom, height, segments)),
      material,
    );
    parent.add(mesh);
    return mesh;
  }

  protected geometry<T extends BufferGeometry>(geometry: T): T {
    return this.track(geometry);
  }

  /** A named group placed at a pivot; joint nodes are groups so geometry can hang off them. */
  protected pivot(parent: Object3D, name: string, x = 0, y = 0, z = 0): Group {
    const g = new Group();
    g.name = name;
    g.position.set(x, y, z);
    parent.add(g);
    this.nodes[name] = g;
    this.jointBase.set(name, y);
    return g;
  }

  /** Wheel with a steering pivot and a spinning tire, mounted at the spec's suspension point. */
  protected wheel(
    parent: Object3D,
    x: number,
    y: number,
    z: number,
    radius: number,
    width: number,
  ): void {
    const mount = new Group();
    mount.position.set(x, y, z);
    parent.add(mount);
    const steer = new Group();
    mount.add(steer);
    const spin = new Group();
    steer.add(spin);
    const tire = this.cylinder(
      spin,
      radius,
      radius,
      width,
      this.material(COLORS.rubber, { roughness: 0.95 }),
      20,
    );
    tire.rotation.z = Math.PI / 2;
    const hub = this.cylinder(
      spin,
      radius * 0.5,
      radius * 0.5,
      width + 0.04,
      this.material(COLORS.steel),
      12,
    );
    hub.rotation.z = Math.PI / 2;
    this.box(spin, width + 0.06, radius * 0.25, radius * 0.9, this.material(COLORS.dark));
    this.wheels.push({ mount, steer, spin, baseY: y });
  }

  /** Track pair with road wheels that spin with ground speed. */
  protected tracks(
    parent: Object3D,
    width: number,
    length: number,
    gauge: number,
    height = 0.9,
  ): void {
    const rubber = this.material(COLORS.rubber, { roughness: 0.95 });
    const steel = this.material(COLORS.steel);
    for (const side of [-1, 1]) {
      const x = (side * gauge) / 2;
      this.box(parent, width, height, length - height, rubber, x, height / 2, 0);
      for (const end of [-1, 1]) {
        const cap = this.cylinder(parent, height / 2, height / 2, width, rubber, 16);
        cap.rotation.z = Math.PI / 2;
        cap.position.set(x, height / 2, (end * (length - height)) / 2);
      }
      const wheels = 4;
      for (let i = 0; i < wheels; i++) {
        const g = new Group();
        g.position.set(
          x + side * (width / 2 + 0.02),
          height / 2,
          -length / 2 + height / 2 + (i * (length - height)) / (wheels - 1),
        );
        parent.add(g);
        const w = this.cylinder(g, height * 0.32, height * 0.32, 0.06, steel, 10);
        w.rotation.z = Math.PI / 2;
        this.box(g, 0.08, height * 0.5, 0.1, this.material(COLORS.dark));
        g.userData.side = side;
        this.roadWheels.push(g);
      }
    }
  }

  /** Side plates that carry the livery decal (stripes, number, checkers). */
  protected decalPlate(
    parent: Object3D,
    width: number,
    height: number,
    x: number,
    y: number,
    z: number,
    facing: 1 | -1,
  ): void {
    const plate = new Mesh(this.track(new PlaneGeometry(width, height)), this.material(0xffffff));
    plate.position.set(x, y, z);
    plate.rotation.y = (facing * Math.PI) / 2;
    plate.receiveShadow = true;
    parent.add(plate);
    this.decalPlates.push(plate);
  }

  /** Heap of carried material; scaled by setLoad(). */
  protected loadHeap(
    parent: Object3D,
    radius: number,
    height: number,
    x: number,
    y: number,
    z: number,
    squash = 1,
  ): void {
    const heap = new Mesh(
      this.track(new ConeGeometry(radius, height, 10, 1)),
      this.material(COLORS.load, { roughness: 1 }),
    );
    heap.position.set(x, y + height / 2, z);
    heap.scale.set(1, 1, squash);
    heap.userData.squash = squash;
    heap.visible = false;
    heap.name = "load";
    parent.add(heap);
    this.nodes.load = heap;
  }

  private addAntenna(): void {
    const a = this.spec.antenna;
    // Ride on a swinging cab when there is one, so the antenna never pokes through it.
    const parent = this.nodes.cab ?? this.root;
    const mount = new Group();
    mount.position.set(a.x - parent.position.x, a.y - parent.position.y, a.z - parent.position.z);
    parent.add(mount);
    const led = new Mesh(this.track(new SphereGeometry(0.14, 10, 8)), this.ledMaterial);
    mount.add(led);
    const antenna = new Group();
    antenna.name = "antenna";
    mount.add(antenna);
    const rod = this.cylinder(antenna, 0.025, 0.04, 1.8, this.material(COLORS.dark), 6);
    rod.position.y = 0.9;
    const tip = new Mesh(this.track(new SphereGeometry(0.08, 8, 6)), this.material(0xb5452f));
    tip.position.y = 1.82;
    antenna.add(tip);
    this.nodes.antenna = antenna;
    this.nodes.led = led;
  }

  // ─── VehicleModel ───────────────────────────────────────────────────────

  setJoints(values: ArrayLike<number>): void {
    const joints = this.spec.joints;
    for (let i = 0; i < joints.length; i++) {
      const j = joints[i]!;
      const node = this.nodes[j.node];
      if (!node) continue;
      const v = values[i] ?? j.rest;
      switch (j.motion) {
        case "yaw":
          node.rotation.y = v;
          break;
        case "pitch":
          // Positive pitch raises the link: rotating about +X tilts +Z downward, so negate.
          node.rotation.x = -v;
          break;
        case "roll":
          node.rotation.z = v;
          break;
        case "slide":
          node.position.y = (this.jointBase.get(j.node) ?? 0) + v;
          break;
      }
    }
  }

  setWheel(i: number, steer: number, spin: number, suspension: number): void {
    const w = this.wheels[i];
    if (!w) return;
    w.steer.rotation.y = steer;
    w.spin.rotation.x = spin;
    w.mount.position.y = w.baseY - suspension;
  }

  setTracks(left: number, right: number, dt: number): void {
    for (const g of this.roadWheels) {
      const v = g.userData.side < 0 ? right : left;
      g.rotation.x += (v * dt) / 0.3;
    }
    this.trackPhase += ((left + right) / 2) * dt;
  }

  setArticulation(_angle: number): void {}

  setLivery(livery: Livery): void {
    this.paint.color.set(LIVERY_COLORS[livery.color].hex);
    if (this.decalPlates.length === 0) return;
    const texture = drawDecal(livery);
    if (!texture) return;
    for (const plate of this.decalPlates) {
      const m = plate.material as MeshStandardMaterial;
      m.map = texture;
      m.needsUpdate = true;
    }
    this.decalTexture?.dispose();
    this.decalTexture = texture;
  }

  setLoad(fraction: number): void {
    const heap = this.nodes.load;
    if (!heap) return;
    const f = fraction < 0 ? 0 : fraction > 1 ? 1 : fraction;
    heap.visible = f > 0.01;
    const s = 0.35 + 0.65 * Math.cbrt(f);
    heap.scale.x = s;
    heap.scale.y = f;
    heap.scale.z = s * (heap.userData.squash ?? 1);
  }

  setLed(state: LedState, on: boolean): void {
    const c = LED_COLORS[state];
    this.ledMaterial.color.setHex(c);
    this.ledMaterial.emissive.setHex(on ? c : 0x000000);
  }

  dispose(): void {
    this.root.removeFromParent();
    this.decalTexture?.dispose();
    for (const d of this.disposables) d.dispose();
    this.disposables.length = 0;
  }
}

const decalColor = new Color();

/** Livery decal drawn on a small canvas: paint background plus stripes, number or checkers. */
function drawDecal(livery: Livery): CanvasTexture | null {
  // No DOM (server render, unit tests): plates keep their plain material.
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  const paint = LIVERY_COLORS[livery.color].hex;
  decalColor.set(paint);
  const dark = decalColor.getHSL({ h: 0, s: 0, l: 0 }).l > 0.5;
  const ink = dark ? "#1d1b19" : "#f6ecd9";
  ctx.fillStyle = paint;
  ctx.fillRect(0, 0, 256, 128);
  if (livery.decal === "stripes") {
    ctx.fillStyle = ink;
    ctx.fillRect(0, 38, 256, 16);
    ctx.fillRect(0, 74, 256, 16);
  } else if (livery.decal === "number") {
    ctx.fillStyle = ink;
    ctx.beginPath();
    ctx.arc(128, 64, 52, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = paint;
    ctx.font = "bold 72px Impact, 'Arial Black', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(livery.number), 128, 68);
  } else if (livery.decal === "checker") {
    ctx.fillStyle = ink;
    const s = 32;
    for (let y = 0; y < 128; y += s) {
      for (let x = 0; x < 256; x += s) if (((x + y) / s) % 2 === 0) ctx.fillRect(x, y, s, s);
    }
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}
