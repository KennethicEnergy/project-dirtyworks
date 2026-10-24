/** Placeholder dump truck: frame, cab, tipping bed hinged at the rear, six wheels. */
import type { Livery } from "@dirtyworks/shared";
import { COLORS, PrimitiveVehicleModel } from "./PrimitiveVehicleModel";

export class DumpTruckModel extends PrimitiveVehicleModel {
  constructor(livery: Livery) {
    super("dump-truck", livery);
  }

  protected build(): void {
    const spec = this.spec;
    const dark = this.material(COLORS.dark);
    const steel = this.material(COLORS.steel, { metalness: 0.4 });
    const glass = this.material(COLORS.glass, { roughness: 0.2, metalness: 0.3 });
    const paint = this.paintMaterial;

    const chassis = this.pivot(this.root, "chassis");
    this.box(chassis, 2.2, 0.45, 7, dark, 0, 1.05, -0.2);
    // Cab
    this.box(chassis, 2.7, 1.7, 1.9, paint, 0, 2.15, 2.55);
    this.box(chassis, 2.72, 0.7, 1.2, glass, 0, 2.55, 2.85);
    this.box(chassis, 2.75, 0.35, 0.4, steel, 0, 1.4, 3.55);
    this.box(
      chassis,
      0.5,
      0.25,
      0.1,
      this.material(0xfff3c4, { emissive: 0xfff3c4, emissiveIntensity: 0.6 }),
      -0.9,
      1.75,
      3.52,
    );
    this.box(
      chassis,
      0.5,
      0.25,
      0.1,
      this.material(0xfff3c4, { emissive: 0xfff3c4, emissiveIntensity: 0.6 }),
      0.9,
      1.75,
      3.52,
    );

    // Bed hinged at its rear edge; geometry extends forward (+Z) from the hinge.
    const box = spec.tool.bedBox!;
    const hingeZ = box.center.z - box.size.z / 2;
    const floorY = box.center.y - box.size.y / 2;
    const bed = this.pivot(chassis, "bed", 0, floorY, hingeZ);
    const len = box.size.z;
    const w = box.size.x;
    const h = box.size.y;
    this.box(bed, w, 0.2, len, paint, 0, 0.1, len / 2);
    this.box(bed, 0.15, h, len, paint, -w / 2, h / 2, len / 2);
    this.box(bed, 0.15, h, len, paint, w / 2, h / 2, len / 2);
    this.box(bed, w, h + 0.3, 0.15, paint, 0, (h + 0.3) / 2, len);
    this.box(bed, w * 0.9, 0.18, 1.1, paint, 0, h + 0.35, len + 0.45);
    this.decalPlate(bed, len * 0.7, h * 0.7, -w / 2 - 0.08, h / 2, len / 2, -1);
    this.decalPlate(bed, len * 0.7, h * 0.7, w / 2 + 0.08, h / 2, len / 2, 1);
    this.loadHeap(bed, Math.min(w, len) * 0.55, h * 1.2, 0, 0.2, len / 2, len / w);

    for (const wheel of spec.wheels!) {
      this.wheel(chassis, wheel.x, wheel.y, wheel.z, wheel.radius, 0.6);
    }
  }
}
