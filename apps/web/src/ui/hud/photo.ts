/** Photo mode: the frame around a saved shot and its file name. Drawing lives in PhotoMode. */

export interface PhotoFrame {
  /** Output canvas size (px). */
  width: number;
  height: number;
  /** Border on the left, top and right (px). */
  border: number;
  /** Caption band below the shot (px). */
  caption: number;
  imageX: number;
  imageY: number;
  /** Vertical middle of the caption band. */
  captionY: number;
  fontSize: number;
}

/** Border and caption scale with the shot's short side, like a print mat. */
export function photoFrame(width: number, height: number): PhotoFrame {
  const short = Math.min(width, height);
  const border = Math.round(short * 0.035);
  const caption = Math.round(short * 0.09);
  return {
    width: width + 2 * border,
    height: height + border + caption,
    border,
    caption,
    imageX: border,
    imageY: border,
    captionY: border + height + caption / 2,
    fontSize: Math.max(12, Math.round(caption * 0.36)),
  };
}

const pad = (n: number) => String(n).padStart(2, "0");

/** `dirtyworks-<table>-YYYYMMDD-HHMM.png`, in local time. */
export function photoFileName(tableName: string, at: Date): string {
  const slug =
    tableName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40)
      .replace(/-+$/, "") || "table";
  const date = `${at.getFullYear()}${pad(at.getMonth() + 1)}${pad(at.getDate())}`;
  return `dirtyworks-${slug}-${date}-${pad(at.getHours())}${pad(at.getMinutes())}.png`;
}
