import { VEHICLES } from "@dirtyworks/shared";
import { describe, expect, it } from "vitest";
import {
  ACTIONS,
  BINDINGS,
  SPECTATOR_ACTIONS,
  keyLabel,
  toolHintRows,
} from "@/game/input/controls";

describe("controls map", () => {
  it("binds every action to at least one key", () => {
    for (const action of ACTIONS) expect(BINDINGS[action].length, action).toBeGreaterThan(0);
  });

  it("never binds one key to two actions, except spectator-only camera cycling", () => {
    const owner = new Map<string, string>();
    for (const action of ACTIONS) {
      if (SPECTATOR_ACTIONS.includes(action)) continue;
      for (const code of BINDINGS[action]) {
        expect(
          owner.get(code),
          `${code} bound to ${owner.get(code)} and ${action}`,
        ).toBeUndefined();
        owner.set(code, action);
      }
    }
  });

  it("keeps G for the garage and H for the horn", () => {
    expect(BINDINGS.garage).toContain("KeyG");
    expect(BINDINGS.horn).toContain("KeyH");
  });

  it("formats key codes for on-screen hints", () => {
    expect(keyLabel("KeyQ")).toBe("Q");
    expect(keyLabel("Space")).toBe("Space");
    expect(keyLabel("ArrowLeft")).toBe("←");
    expect(keyLabel("Digit3")).toBe("3");
  });

  it("builds tool hints from the vehicle spec", () => {
    const rows = toolHintRows(VEHICLES.excavator);
    expect(rows[0]).toEqual({
      axis: 0,
      negKey: "Q",
      posKey: "E",
      negLabel: "Swing left",
      posLabel: "Swing right",
    });
    expect(rows.map((r) => `${r.posKey}/${r.negKey}`)).toEqual(["E/Q", "R/F", "I/K", "L/J"]);
  });

  it("shows only the bed control for the dump truck", () => {
    expect(toolHintRows(VEHICLES["dump-truck"])).toEqual([
      { axis: 1, negKey: "F", posKey: "R", negLabel: "Lower bed", posLabel: "Raise bed" },
    ]);
  });
});
