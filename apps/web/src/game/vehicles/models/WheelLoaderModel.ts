/**
 * Placeholder wheel loader: rear frame (engine, cab) and a front frame (arm, bucket) that bends at
 * the articulation joint. Physics counter-steers both axles; visually only the front frame turns.
 */
import type { Livery } from "@dirtyworks/shared";
import type { Group } from "three";
import { COLORS, PrimitiveVehicleModel } from "./PrimitiveVehicleModel";

export class WheelLoaderModel extends PrimitiveVehicleModel {
  // build() runs inside the base constructor, before subclass fields initialize, so nodes are
  // looked up from `this.nodes` rather than stored in subclass fields.
  constructor(livery: Livery) {
    super("wheel-loader", livery);
  }

  protected build(): void {
    const spec = this.spec;
    const dark = this.material(COLORS.dark);
    const steel = this.material(COLORS.steel, { metalness: 0.4 });
    const glass = this.material(COLORS.glass, { roughness: 0.2, metalness: 0.3 });
    const paint = this.paintMaterial;

    // Rear frame: engine and cab.
    this.box(this.root, 2.3, 1.4, 2.6, paint, 0, 1.6, -1.9);
    this.box(this.root, 2.1, 0.4, 0.3, dark, 0, 1.2, -3.25);
    this.box(this.root, 1.6, 1.6, 1.6, paint, 0, 2.95, -0.65);
    this.box(this.root, 1.62, 1, 1.4, glass, 0, 3.1, -0.6);
    this.decalPlate(this.root, 2, 1, -1.16, 1.6, -1.9, -1);
    this.decalPlate(this.root, 2, 1, 1.16, 1.6, -1.9, 1);

    // Front frame pivots at the articulation hinge (origin).
    const front: Group = this.pivot(this.root, "frontFrame");
    this.box(front, 1.7, 0.8, 2.6, paint, 0, 1.25, 1.2);
    this.cylinder(front, 0.25, 0.25, 0.9, steel, 10).position.set(0, 1.3, 0);

    const rig = spec.rig;
    const [armLink, tiltLink] = rig.chain;
    const arm = this.pivot(front, "arm", rig.base.x, rig.base.y, rig.base.z);
    for (const side of [-1, 1]) {
      this.box(arm, 0.22, 0.4, armLink!.length, paint, side * 0.7, 0, armLink!.length / 2);
    }
    this.box(arm, 1.6, 0.25, 0.25, dark, 0, 0, armLink!.length * 0.55);
    const tilt = this.pivot(arm, "tilt", 0, 0, armLink!.length);
    // The rig's fixed link offset is part of the bucket's rest geometry.
    const bucketFrame = this.pivot(tilt, "tiltOffset");
    bucketFrame.rotation.x = -(tiltLink!.offset ?? 0);
    const len = tiltLink!.length;
    this.box(bucketFrame, 2.8, 0.1, len, dark, 0, -0.45, len / 2);
    this.box(bucketFrame, 2.8, 1, 0.1, dark, 0, 0.05, 0.05);
    this.box(bucketFrame, 0.08, 1, len, dark, -1.36, 0, len / 2);
    this.box(bucketFrame, 0.08, 1, len, dark, 1.36, 0, len / 2);
    this.box(bucketFrame, 2.8, 0.06, 0.14, steel, 0, -0.48, len);
    this.loadHeap(bucketFrame, 0.7, 0.8, 0, -0.4, len / 2, 2);

    for (const wheel of spec.wheels!) {
      const parent = wheel.z > 0 ? front : this.root;
      this.wheel(parent, wheel.x, wheel.y, wheel.z, wheel.radius, 0.7);
    }
  }

  override setWheel(i: number, _steer: number, spin: number, suspension: number): void {
    // Articulation turns the whole front frame; individual wheels never steer.
    super.setWheel(i, 0, spin, suspension);
  }

  override setArticulation(angle: number): void {
    const front = this.nodes.frontFrame;
    if (front) front.rotation.y = angle;
  }
}
