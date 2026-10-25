import { PerspectiveCamera } from "three";
import { describe, expect, it } from "vitest";
import { cycleSpectate, keepSpectate } from "@/game/camera/spectate";
import { nameplateOpacity, projectToScreen, type ScreenPoint } from "@/game/fx/overlay";

function camera() {
  const c = new PerspectiveCamera(45, 800 / 600, 0.5, 1000);
  c.position.set(0, 0, 10);
  c.lookAt(0, 0, 0);
  c.updateMatrixWorld();
  return c;
}

describe("projectToScreen", () => {
  const out: ScreenPoint = { x: 0, y: 0, distance: 0 };

  it("puts a point straight ahead in the middle of the canvas", () => {
    expect(projectToScreen(camera(), 0, 0, 0, 800, 600, out)).toBe(true);
    expect(out.x).toBeCloseTo(400);
    expect(out.y).toBeCloseTo(300);
    expect(out.distance).toBeCloseTo(10);
  });

  it("uses CSS pixel axes: up in the world is up the screen (smaller y)", () => {
    projectToScreen(camera(), 0, 2, 0, 800, 600, out);
    expect(out.y).toBeLessThan(300);
    projectToScreen(camera(), 2, 0, 0, 800, 600, out);
    expect(out.x).toBeGreaterThan(400);
  });

  it("reports points behind the camera as not visible", () => {
    expect(projectToScreen(camera(), 0, 0, 20, 800, 600, out)).toBe(false);
  });
});

describe("nameplate fade", () => {
  it("is fully visible nearby, gone far away, and fades in between", () => {
    expect(nameplateOpacity(10)).toBe(1);
    expect(nameplateOpacity(200)).toBe(0);
    const mid = nameplateOpacity(60);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
    expect(nameplateOpacity(50)).toBeGreaterThan(nameplateOpacity(70));
  });
});

describe("spectate target", () => {
  const drivers = ["a", "b", "c"];

  it("cycles forward and backward with wrap-around", () => {
    expect(cycleSpectate(drivers, "a", 1)).toBe("b");
    expect(cycleSpectate(drivers, "c", 1)).toBe("a");
    expect(cycleSpectate(drivers, "a", -1)).toBe("c");
  });

  it("starts from the first driver when nobody is selected", () => {
    expect(cycleSpectate(drivers, null, 1)).toBe("a");
    expect(cycleSpectate([], null, 1)).toBeNull();
  });

  it("keeps the current target while it is still driving, else falls back", () => {
    expect(keepSpectate(drivers, "b")).toBe("b");
    expect(keepSpectate(drivers, "gone")).toBe("a");
    expect(keepSpectate([], "b")).toBeNull();
  });
});
