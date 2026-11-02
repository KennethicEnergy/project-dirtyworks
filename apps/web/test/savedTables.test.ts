import { tableSettingsSchema } from "@dirtyworks/shared";
import { describe, expect, it } from "vitest";
import { keptForLabel, reopenSettings, type SavedTable } from "@/net/savedTables";

const DAY = 24 * 60 * 60 * 1000;

const saved = (patch: Partial<SavedTable> = {}): SavedTable => ({
  tableId: "Xk3_9fQa2LmZ0pRt",
  ownerId: "google:123",
  name: "Ken's pit",
  mapId: "mini-quarry",
  materialId: "gravel",
  savedAt: 0,
  expiresAt: 7 * DAY,
  bytes: 2048,
  ...patch,
});

describe("reopenSettings", () => {
  it("reopens on the same diorama and material, still kept for later", () => {
    const settings = reopenSettings(saved());
    expect(settings).toEqual({
      name: "Ken's pit",
      mapId: "mini-quarry",
      materialId: "gravel",
      keepForLater: true,
      restoreId: "Xk3_9fQa2LmZ0pRt",
    });
    expect(tableSettingsSchema.safeParse(settings).success).toBe(true);
  });

  it("cannot reopen a table on a diorama this build does not have", () => {
    expect(reopenSettings(saved({ mapId: "moon-base" }))).toBeNull();
  });

  it("falls back to the diorama's own material when the saved one is unknown", () => {
    const settings = reopenSettings(saved({ materialId: "lava" }));
    expect(settings?.materialId).toBeUndefined();
    expect(tableSettingsSchema.safeParse(settings).success).toBe(true);
  });
});

describe("keptForLabel", () => {
  it("counts whole days left", () => {
    expect(keptForLabel(6.4 * DAY, 0)).toBe("Kept 6 more days");
    expect(keptForLabel(1.5 * DAY, 0)).toBe("Kept 1 more day");
  });

  it("calls the final day out", () => {
    expect(keptForLabel(0.3 * DAY, 0)).toBe("Last day");
    expect(keptForLabel(-1, 0)).toBe("Last day");
  });
});
