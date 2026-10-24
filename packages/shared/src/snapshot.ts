/**
 * Compressed terrain snapshots for late joiners and saved tables: only chunks that differ from
 * the table's base terrain, as Int32 height deltas (quanta), deflated with fflate.
 *
 * Layout (before compression, little-endian):
 *   u32 magic "DWT1" | u8 format | u8 mapLen | map ascii | u8 matLen | material ascii | u32 seq |
 *   u16 chunkCount | chunkCount × (u16 cx | u16 cz | i32 × 33·33 deltas)
 */
import { deflateSync, inflateSync } from "fflate";
import { CHUNK_VERTS, HEIGHT_Q_PER_M, type Terrain } from "./terrain";

const MAGIC = 0x31545744; // "DWT1" read as little-endian u32
const FORMAT = 1;
const CHUNK_SAMPLES = CHUNK_VERTS * CHUNK_VERTS;

export interface SnapshotChunk {
  cx: number;
  cz: number;
  deltas: Int32Array;
}

export interface TerrainSnapshot {
  mapId: string;
  materialId: string;
  seq: number;
  chunks: SnapshotChunk[];
}

function ascii(s: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < s.length && i < 255; i++) out.push(s.charCodeAt(i) & 0x7f);
  return out;
}

export function encodeSnapshot(
  t: Terrain,
  base: Terrain,
  meta: { mapId: string; materialId: string; seq: number },
): Uint8Array {
  const changed: SnapshotChunk[] = [];
  for (let k = 0; k < t.chunks.length; k++) {
    const a = t.chunks[k]!.heights;
    const b = base.chunks[k]!.heights;
    let differs = false;
    for (let s = 0; s < CHUNK_SAMPLES; s++) {
      if (a[s] !== b[s]) {
        differs = true;
        break;
      }
    }
    if (!differs) continue;
    const deltas = new Int32Array(CHUNK_SAMPLES);
    for (let s = 0; s < CHUNK_SAMPLES; s++) {
      deltas[s] = Math.round(a[s]! * HEIGHT_Q_PER_M) - Math.round(b[s]! * HEIGHT_Q_PER_M);
    }
    changed.push({ cx: t.chunks[k]!.cx, cz: t.chunks[k]!.cz, deltas });
  }

  const map = ascii(meta.mapId);
  const mat = ascii(meta.materialId);
  const size =
    4 + 1 + 1 + map.length + 1 + mat.length + 4 + 2 + changed.length * (4 + CHUNK_SAMPLES * 4);
  const raw = new Uint8Array(size);
  const view = new DataView(raw.buffer);
  let o = 0;
  view.setUint32(o, MAGIC, true);
  o += 4;
  view.setUint8(o++, FORMAT);
  view.setUint8(o++, map.length);
  for (const ch of map) view.setUint8(o++, ch);
  view.setUint8(o++, mat.length);
  for (const ch of mat) view.setUint8(o++, ch);
  view.setUint32(o, meta.seq >>> 0, true);
  o += 4;
  view.setUint16(o, changed.length, true);
  o += 2;
  for (const c of changed) {
    view.setUint16(o, c.cx, true);
    view.setUint16(o + 2, c.cz, true);
    o += 4;
    for (let s = 0; s < CHUNK_SAMPLES; s++, o += 4) view.setInt32(o, c.deltas[s]!, true);
  }
  return deflateSync(raw, { level: 6 });
}

export function decodeSnapshot(bytes: Uint8Array): TerrainSnapshot {
  let raw: Uint8Array;
  try {
    raw = inflateSync(bytes);
  } catch {
    throw new Error("snapshot: not compressed terrain data");
  }
  const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  const need = (o: number, n: number) => {
    if (o + n > raw.byteLength) throw new Error("snapshot: truncated");
  };
  let o = 0;
  need(o, 6);
  if (view.getUint32(o, true) !== MAGIC) throw new Error("snapshot: bad magic");
  o += 4;
  if (view.getUint8(o++) !== FORMAT) throw new Error("snapshot: unknown format");
  const readAscii = () => {
    need(o, 1);
    const len = view.getUint8(o++);
    need(o, len);
    let s = "";
    for (let i = 0; i < len; i++) s += String.fromCharCode(view.getUint8(o++));
    return s;
  };
  const mapId = readAscii();
  const materialId = readAscii();
  need(o, 6);
  const seq = view.getUint32(o, true);
  o += 4;
  const count = view.getUint16(o, true);
  o += 2;
  const chunks: SnapshotChunk[] = [];
  for (let k = 0; k < count; k++) {
    need(o, 4 + CHUNK_SAMPLES * 4);
    const cx = view.getUint16(o, true);
    const cz = view.getUint16(o + 2, true);
    o += 4;
    const deltas = new Int32Array(CHUNK_SAMPLES);
    for (let s = 0; s < CHUNK_SAMPLES; s++, o += 4) deltas[s] = view.getInt32(o, true);
    chunks.push({ cx, cz, deltas });
  }
  return { mapId, materialId, seq, chunks };
}

/** Applies a snapshot to `t`, which must hold the table's untouched base terrain. */
export function applySnapshot(t: Terrain, snap: TerrainSnapshot): void {
  for (const c of snap.chunks) {
    if (c.cx >= t.chunksX || c.cz >= t.chunksZ) throw new Error("snapshot: chunk outside table");
    for (let lj = 0; lj < CHUNK_VERTS; lj++) {
      for (let li = 0; li < CHUNK_VERTS; li++) {
        const d = c.deltas[lj * CHUNK_VERTS + li]!;
        if (d === 0) continue;
        const i = c.cx * (CHUNK_VERTS - 1) + li;
        const j = c.cz * (CHUNK_VERTS - 1) + lj;
        // Border vertices live in several chunks and setQ writes all copies: apply each vertex
        // once, from the chunk that owns it (the one getQ reads).
        const ownerX = i >= t.cellsX ? t.chunksX - 1 : Math.floor(i / (CHUNK_VERTS - 1));
        const ownerZ = j >= t.cellsZ ? t.chunksZ - 1 : Math.floor(j / (CHUNK_VERTS - 1));
        if (ownerX !== c.cx || ownerZ !== c.cz) continue;
        t.setQ(i, j, t.getQ(i, j) + d);
      }
    }
  }
}
