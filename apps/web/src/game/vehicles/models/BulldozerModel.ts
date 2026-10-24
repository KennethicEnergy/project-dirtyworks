/** Placeholder bulldozer: tracks, body, rear cab, and a blade that slides up/down and tilts. */
import type { Livery } from "@dirtyworks/shared";
import { COLORS, PrimitiveVehicleModel } from "./PrimitiveVehicleModel";

export class BulldozerModel extends PrimitiveVehicleModel {
  constructor(livery: Livery) {
    super("bulldozer", livery);
  }

  protected build(): void {
    const spec = this.spec;
    const tracks = spec.tracks!;
    const dark = this.material(COLORS.dark);
    const steel = this.material(COLORS.steel, { metalness: 0.4 });
    const glass = this.material(COLORS.glass, { roughness: 0.2, metalness: 0.3 });
    const paint = this.paintMaterial;

    this.tracks(this.root, tracks.width, tracks.length, tracks.gauge);
    this.box(this.root, 2.4, 1.3, 3.4, paint, 0, 1.45, 0.1);
    this.box(this.root, 1.8, 0.5, 1.6, dark, 0, 2.3, 0.9);
    this.box(this.root, 1.8, 1.4, 1.5, paint, 0, 2.8, -0.9);
    this.box(this.root, 1.82, 0.85, 1.3, glass, 0, 2.95, -0.85);
    this.cylinder(this.root, 0.12, 0.12, 0.9, dark, 8).position.set(0.6, 2.9, 1.2);
    this.decalPlate(this.root, 2.8, 0.9, -1.22, 1.45, 0.1, -1);
    this.decalPlate(this.root, 2.8, 0.9, 1.22, 1.45, 0.1, 1);

    // Blade: slide joint at the rig base, tilt nested inside it.
    const blade = this.pivot(this.root, "blade", 0, spec.rig.base.y, spec.rig.base.z);
    const tilt = this.pivot(blade, "bladeTilt");
    const width = spec.tool.blade!.width;
    this.box(tilt, width, 1.3, 0.25, paint, 0, 0.65, 0.1);
    this.box(tilt, width, 0.12, 0.2, steel, 0, 0.06, 0.25);
    for (const side of [-1, 1]) {
      const arm = this.box(blade, 0.2, 0.25, 2.3, dark, side * (width / 2 - 0.5), 0.55, -1.1);
      arm.rotation.x = 0.12;
    }
  }
}
