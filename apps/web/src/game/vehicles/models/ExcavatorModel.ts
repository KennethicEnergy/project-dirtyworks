/** Placeholder excavator: tracks, swinging cab, boom → stick → bucket chain matching the spec rig. */
import type { Livery } from "@dirtyworks/shared";
import { COLORS, PrimitiveVehicleModel } from "./PrimitiveVehicleModel";

const CAB_Y = 1;

export class ExcavatorModel extends PrimitiveVehicleModel {
  constructor(livery: Livery) {
    super("excavator", livery);
  }

  protected build(): void {
    const spec = this.spec;
    const tracks = spec.tracks!;
    const dark = this.material(COLORS.dark);
    const steel = this.material(COLORS.steel, { metalness: 0.4 });
    const glass = this.material(COLORS.glass, { roughness: 0.2, metalness: 0.3 });
    const paint = this.paintMaterial;

    this.tracks(this.root, tracks.width, tracks.length, tracks.gauge);
    this.box(this.root, tracks.gauge - tracks.width, 0.5, tracks.length * 0.7, dark, 0, 0.65, 0);
    this.cylinder(this.root, 0.9, 0.9, 0.2, steel, 20).position.set(0, CAB_Y - 0.08, 0);

    // Upper structure swings around the vertical axis through the origin.
    const cab = this.pivot(this.root, "cab", 0, CAB_Y, 0);
    this.box(cab, 2.9, 1, 3.4, paint, 0, 0.55, -0.2);
    this.box(cab, 2.9, 0.9, 0.8, dark, 0, 0.6, -2.2);
    this.box(cab, 1.1, 1.4, 1.5, paint, -0.85, 1.75, 0.55);
    this.box(cab, 1.12, 0.8, 1.2, glass, -0.85, 1.9, 0.62);
    this.decalPlate(cab, 2.2, 0.7, -1.47, 0.55, -0.6, -1);
    this.decalPlate(cab, 2.2, 0.7, 1.47, 0.55, -0.6, 1);

    // Boom → stick → bucket. Pivot positions follow spec.rig so visuals match the tool kinematics.
    const rig = spec.rig;
    const [boomLink, stickLink, bucketLink] = rig.chain;
    const boom = this.pivot(cab, "boom", rig.base.x, rig.base.y - CAB_Y, rig.base.z);
    this.box(boom, 0.55, 0.65, boomLink!.length, paint, 0, 0, boomLink!.length / 2);
    this.cylinder(boom, 0.13, 0.13, boomLink!.length * 0.6, steel, 8).rotation.x = Math.PI / 2;
    const stick = this.pivot(boom, "stick", 0, 0, boomLink!.length);
    this.box(stick, 0.45, 0.5, stickLink!.length, paint, 0, 0, stickLink!.length / 2);
    const bucket = this.pivot(stick, "bucket", 0, 0, stickLink!.length);
    const len = bucketLink!.length;
    this.box(bucket, 1.4, 0.1, len, dark, 0, -0.35, len / 2);
    this.box(bucket, 1.4, 0.8, 0.1, dark, 0, 0.05, 0.05);
    this.box(bucket, 0.08, 0.8, len, dark, -0.68, 0, len / 2);
    this.box(bucket, 0.08, 0.8, len, dark, 0.68, 0, len / 2);
    this.box(bucket, 1.4, 0.06, 0.12, steel, 0, -0.38, len);
    this.loadHeap(bucket, 0.55, 0.7, 0, -0.3, len / 2, 1.2);
  }
}
