"use client";

import { useState } from "react";
import { useSession } from "@/state/sessionStore";
import { useUi } from "@/state/uiStore";
import { Button } from "@/ui/common/Button";
import { photoFileName, photoFrame } from "./photo";
import { useTableUi } from "./TableUiContext";

/** Frame colors (cream-50 mat, coffee-900 ink, safety-yellow rule). */
const MAT = "#fffaf0";
const INK = "#26190f";
const RULE = "#f5c518";

function cssFont(variable: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
  return v ? `${v}, ${fallback}` : fallback;
}

/** Puts the rendered frame on a cream mat with the logo and the table name underneath. */
async function framePhoto(shot: string, tableName: string, at: Date): Promise<Blob | null> {
  const img = new Image();
  img.src = shot;
  await img.decode();
  const f = photoFrame(img.naturalWidth, img.naturalHeight);
  const canvas = document.createElement("canvas");
  canvas.width = f.width;
  canvas.height = f.height;
  const g = canvas.getContext("2d");
  if (!g) return null;
  g.fillStyle = MAT;
  g.fillRect(0, 0, f.width, f.height);
  g.drawImage(img, f.imageX, f.imageY);
  g.fillStyle = RULE;
  g.fillRect(f.imageX, f.imageY + img.naturalHeight, img.naturalWidth, Math.max(2, f.border / 6));
  g.fillStyle = INK;
  g.textBaseline = "middle";
  g.textAlign = "left";
  g.font = `${f.fontSize}px ${cssFont("--font-saira-stencil", "Impact, sans-serif")}`;
  g.fillText("PROJECT-DIRTYWORKS", f.border, f.captionY);
  g.textAlign = "right";
  g.font = `600 ${Math.round(f.fontSize * 0.8)}px ${cssFont("--font-fredoka", "system-ui, sans-serif")}`;
  const when = at.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  g.fillText(`${tableName} · ${when}`, f.width - f.border, f.captionY);
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * Photo mode (P): the HUD is hidden and the camera flies free. "Save photo" grabs the next
 * rendered frame and downloads it framed as a PNG.
 */
export function PhotoMode() {
  const { runtime } = useTableUi();
  const tableName = useSession((s) => s.tableName);
  const [saving, setSaving] = useState(false);

  function save() {
    setSaving(true);
    runtime.captureRequest = (shot) => {
      const at = new Date();
      framePhoto(shot, tableName || "A table", at)
        .then((blob) => {
          if (!blob) throw new Error("no canvas");
          download(blob, photoFileName(tableName, at));
          useSession.getState().pushToast("Photo saved to your downloads.", "info");
        })
        .catch(() => useSession.getState().pushToast("Couldn't save that photo.", "error"))
        .finally(() => setSaving(false));
    };
  }

  return (
    <div
      role="group"
      aria-label="Photo mode"
      className="pointer-events-auto flex flex-wrap items-center justify-center gap-2 rounded-full bg-hud/85 py-1.5 pr-1.5 pl-4 text-sm"
    >
      <span className="text-cream-100">
        📷 <span className="hidden sm:inline">Photo mode: drag to look, scroll to zoom</span>
      </span>
      <Button variant="safety" size="sm" className="rounded-full" onClick={save} disabled={saving}>
        {saving ? "Saving…" : "Save photo"}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="rounded-full"
        onClick={() => useUi.getState().set({ photoMode: false })}
      >
        Done (P)
      </Button>
    </div>
  );
}
