import { describe, expect, it } from "vitest";
import { liverySendDelay, LIVERY_DEBOUNCE_MS, LIVERY_MIN_GAP_MS } from "@/net/liverySync";
import { photoFileName, photoFrame } from "@/ui/hud/photo";

describe("photoFileName", () => {
  it("slugs the table name and stamps the local date and time", () => {
    expect(photoFileName("Ken's Quarry!", new Date(2026, 10, 2, 9, 5))).toBe(
      "dirtyworks-ken-s-quarry-20261102-0905.png",
    );
  });

  it("falls back to 'table' when nothing printable is left", () => {
    expect(photoFileName("🚜🚜", new Date(2026, 0, 31, 23, 59))).toBe(
      "dirtyworks-table-20260131-2359.png",
    );
  });

  it("keeps long names to 40 characters without a trailing dash", () => {
    const name = photoFileName("a".repeat(39) + " b", new Date(2026, 0, 1, 0, 0));
    expect(name).toBe(`dirtyworks-${"a".repeat(39)}-20260101-0000.png`);
  });
});

describe("photoFrame", () => {
  it("puts the shot inside an even border with a caption band below", () => {
    const f = photoFrame(1600, 900);
    expect(f.border).toBe(32);
    expect(f.caption).toBe(81);
    expect(f.width).toBe(1600 + 2 * 32);
    expect(f.height).toBe(900 + 32 + 81);
    expect([f.imageX, f.imageY]).toEqual([32, 32]);
    expect(f.captionY).toBe(32 + 900 + 81 / 2);
  });

  it("scales from the short side, so portrait shots get the same proportions", () => {
    const f = photoFrame(390, 844);
    expect(f.border).toBe(14);
    expect(f.caption).toBe(35);
  });

  it("never lets the caption text get unreadably small", () => {
    expect(photoFrame(200, 100).fontSize).toBeGreaterThanOrEqual(12);
  });
});

describe("liverySendDelay", () => {
  it("waits for the picker to settle", () => {
    expect(liverySendDelay(10_000, 0)).toBe(LIVERY_DEBOUNCE_MS);
  });

  it("stays clear of the server's 1/s livery limit after a recent send", () => {
    expect(liverySendDelay(10_000, 9_800)).toBe(9_800 + LIVERY_MIN_GAP_MS - 10_000);
    expect(LIVERY_MIN_GAP_MS).toBeGreaterThan(1000);
  });
});
