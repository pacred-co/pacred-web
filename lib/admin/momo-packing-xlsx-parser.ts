/**
 * MOMO packing-list .xlsx parser (pure · no network · Buffer/Uint8Array in).
 *
 * The MOMO warehouse exports a per-container "PACKING LIST" .xlsx whose sheet uses
 * INLINE / formula strings (t="str" / t="inlineStr" · no sharedStrings.xml) — SheetJS
 * (the `xlsx` lib) chokes on that shape and returns raw ZIP-XML. So we unzip the .xlsx
 * ourselves with node:zlib (an .xlsx IS a ZIP) and walk `xl/worksheets/sheet1.xml`.
 *
 * TWO real shapes (both committed as fixtures):
 *  - Format A (has data · 18 cols A-R) — a real closed container. Meta row carries
 *    COMPANY NAME / TRACKING / QUANTITY / TOTAL WEIGHT / TOTAL CBM / CONTAINER NAME /
 *    CONTAINER CODE; a data-header row (Trans.|…|Type|Code|Tracking|…|Total Weight|
 *    Total CBM|Remark Number|CG) is followed by ONE row per tracking, already summed
 *    (Total Weight = Weight×ParcelCount, Total CBM = CBM×ParcelCount).
 *  - Format B (empty/"คิวมั่ว" · 21 cols · only a GRAND TOTAL row, no data header) →
 *    rows:[] + a warning.
 *
 * ⚠️ COLUMN COUNT VARIES (18 vs 21) → we detect every needed column BY HEADER NAME,
 *    never by fixed index (the brief's positional listing was off: Code=G, Tracking=H).
 *    Meta values are read from the cell one row BELOW each label cell.
 *
 * Money note: `totalWeight`/`totalCbm` here become the SELL measurement basis when the
 * reconcile action writes them — this parser only READS; the money-guard lives in the
 * action (non-billed-only · re-parse-on-apply).
 */

import zlib from "node:zlib";
import { baseTrackingOf } from "@/lib/admin/momo-raw-helpers";

export type MomoPackingRow = {
  tracking: string;
  baseTracking: string;       // tracking stripped of the "-N"/"-N/M" split suffix
  code: string | null;
  productType: string | null; // raw "Type" cell (e.g. 普通货物/ทั่วไป/A)
  width: number | null;
  length: number | null;
  height: number | null;
  parcelCount: number | null;
  weightKg: number | null;    // per-parcel weight (Weight(KG))
  cbm: number | null;         // per-parcel CBM
  totalWeight: number | null; // aggregate (Total Weight) — the SELL basis
  totalCbm: number | null;    // aggregate (Total CBM) — the SELL basis
  cg: string | null;          // CG column (CG…)
};

/**
 * One AGGREGATED shipment — every "-N" split sub-row of the same BASE tracking
 * summed into a single row. MOMO/tb_forwarder keys a shipment on the base
 * tracking (SF1567683726553), while the packing list lists box-suffixed sub-rows
 * (SF1567683726553-1/2 · SF1567683726553-2/2). The reconcile matches on the base
 * and compares against the SYSTEM aggregate → this is the packing-side aggregate.
 */
export type MomoPackingAggRow = {
  baseTracking: string;
  code: string | null;          // first sub
  productType: string | null;   // first sub
  width: number | null;         // first sub (dims for display only)
  length: number | null;        // first sub
  height: number | null;        // first sub
  cg: string | null;            // first sub
  parcelCount: number | null;   // Σ sub.parcelCount = box count
  totalWeight: number | null;   // Σ sub.totalWeight — the SELL weight basis
  totalCbm: number | null;      // Σ sub.totalCbm — the SELL CBM basis
  subTrackings: string[];       // every raw sub tracking under this base
};

/**
 * Group parsed rows by their BASE tracking (strip "-N"/"-N/M"), summing the
 * money-basis fields. A numeric field stays `null` ONLY when EVERY sub was null
 * (so a partial file never zeroes a real weight); otherwise it's the Σ of the
 * non-null subs. dims/cg/code/productType come from the FIRST sub. Insertion
 * order is preserved. PURE — no DB, no side effects.
 */
export function aggregatePackingRowsByBase(rows: MomoPackingRow[]): MomoPackingAggRow[] {
  const byBase = new Map<string, MomoPackingAggRow>();
  // track, per base + field, whether we ever saw a non-null value (else keep null)
  const seen = new Map<string, { parcel: boolean; wt: boolean; cbm: boolean }>();
  for (const r of rows) {
    const base = r.baseTracking || baseTrackingOf(r.tracking);
    let agg = byBase.get(base);
    if (!agg) {
      agg = {
        baseTracking: base,
        code: r.code,
        productType: r.productType,
        width: r.width,
        length: r.length,
        height: r.height,
        cg: r.cg,
        parcelCount: null,
        totalWeight: null,
        totalCbm: null,
        subTrackings: [],
      };
      byBase.set(base, agg);
      seen.set(base, { parcel: false, wt: false, cbm: false });
    }
    const s = seen.get(base)!;
    agg.subTrackings.push(r.tracking);
    if (r.parcelCount != null) { agg.parcelCount = (agg.parcelCount ?? 0) + r.parcelCount; s.parcel = true; }
    if (r.totalWeight != null) { agg.totalWeight = (agg.totalWeight ?? 0) + r.totalWeight; s.wt = true; }
    if (r.totalCbm != null) { agg.totalCbm = (agg.totalCbm ?? 0) + r.totalCbm; s.cbm = true; }
  }
  return Array.from(byBase.values());
}

export type MomoPackingParse = {
  listTitle: string | null;
  container: string | null;      // CONTAINER NAME meta → fcabinetnumber
  containerCode: string | null;  // CONTAINER CODE meta (often "-")
  totals: {
    trackingCount: number | null;
    qty: number | null;
    totalWeight: number | null;
    totalCbm: number | null;
  };
  transportHint: "SEA" | "EK" | null; // informational; ftransporttype derives from the container name
  rows: MomoPackingRow[];              // raw one-row-per-sub (for the Excel grid)
  aggregated: MomoPackingAggRow[];     // one-row-per-base (for reconcile — Σ over subs)
  warnings: string[];
  /** Excel-like raw view (data-header + data rows) for the preview UI. */
  rawGrid?: { header: string[]; rows: (string | number | null)[][] };
};

// ── XML entity decode (Thai text is UTF-8 inside <t>/<v>) ───────────────────────
function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&amp;/g, "&"); // last, so a literal &amp;lt; doesn't double-decode
}

// ── ZIP extraction via the central directory (robust vs data-descriptor zips) ───
function readZipEntry(buf: Buffer, name: string): Buffer | null {
  // Find End Of Central Directory (0x06054b50) by scanning backward.
  const EOCD = 0x06054b50;
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i >= buf.length - 22 - 0x10000; i--) {
    if (buf.readUInt32LE(i) === EOCD) { eocd = i; break; }
  }
  if (eocd < 0) return readZipEntryByLocalScan(buf, name); // fallback
  const cdCount = buf.readUInt16LE(eocd + 10);
  const cdOffset = buf.readUInt32LE(eocd + 16);
  const target = Buffer.from(name);
  let p = cdOffset;
  for (let n = 0; n < cdCount && p + 46 <= buf.length; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break; // central dir header sig
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOff = buf.readUInt32LE(p + 42);
    const fname = buf.subarray(p + 46, p + 46 + nameLen);
    if (fname.equals(target)) {
      return inflateAtLocalHeader(buf, localOff, method, compSize);
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  return null;
}

function inflateAtLocalHeader(buf: Buffer, localOff: number, method: number, compSize: number): Buffer | null {
  if (buf.readUInt32LE(localOff) !== 0x04034b50) return null;
  const nameLen = buf.readUInt16LE(localOff + 26);
  const extraLen = buf.readUInt16LE(localOff + 28);
  const dataStart = localOff + 30 + nameLen + extraLen;
  const comp = buf.subarray(dataStart, dataStart + compSize);
  return method === 8 ? zlib.inflateRawSync(comp) : Buffer.from(comp);
}

// Fallback: walk local file headers (works when compSize is present in the local header).
function readZipEntryByLocalScan(buf: Buffer, name: string): Buffer | null {
  let o = 0;
  const target = Buffer.from(name);
  while (o + 30 <= buf.length && buf.readUInt32LE(o) === 0x04034b50) {
    const method = buf.readUInt16LE(o + 8);
    const compSize = buf.readUInt32LE(o + 18);
    const nameLen = buf.readUInt16LE(o + 26);
    const extraLen = buf.readUInt16LE(o + 28);
    const fname = buf.subarray(o + 30, o + 30 + nameLen);
    const dataStart = o + 30 + nameLen + extraLen;
    if (fname.equals(target)) {
      const comp = buf.subarray(dataStart, dataStart + compSize);
      return method === 8 ? zlib.inflateRawSync(comp) : Buffer.from(comp);
    }
    o = dataStart + compSize;
  }
  return null;
}

// ── Sheet XML → 2D grid (row-major · col index from A1-style ref) ───────────────
type Cell = string | number | null;

function colRefToIndex(ref: string): number {
  // "A"→0, "B"→1, … "AA"→26. ref = leading letters of a cell ref like "AB12".
  let n = 0;
  for (const ch of ref) {
    const c = ch.charCodeAt(0);
    if (c < 65 || c > 90) break;
    n = n * 26 + (c - 64);
  }
  return n - 1;
}

function parseSheetGrid(xml: string): Cell[][] {
  const grid: Cell[][] = [];
  const rowRe = /<row\b[^>]*\br="(\d+)"[^>]*>([\s\S]*?)<\/row>/g;
  let rm: RegExpExecArray | null;
  while ((rm = rowRe.exec(xml)) !== null) {
    const rowIdx = parseInt(rm[1], 10) - 1;
    const cellsXml = rm[2];
    const row: Cell[] = [];
    const cellRe = /<c\b[^>]*\br="([A-Z]+)\d+"([^>]*)>([\s\S]*?)<\/c>|<c\b[^>]*\br="([A-Z]+)\d+"([^>]*)\/>/g;
    let cm: RegExpExecArray | null;
    while ((cm = cellRe.exec(cellsXml)) !== null) {
      const refCol = cm[1] ?? cm[4];
      const attrs = (cm[2] ?? cm[5] ?? "");
      const inner = cm[3] ?? "";
      const ci = colRefToIndex(refCol);
      if (ci < 0) continue;
      const tMatch = attrs.match(/\bt="([^"]+)"/);
      const t = tMatch ? tMatch[1] : "";
      let value: Cell = null;
      if (t === "inlineStr") {
        // <is>…<t>text</t>…</is> — join all <t> runs
        const texts = [...inner.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => decodeXml(x[1]));
        const s = texts.join("");
        value = s === "" ? null : s;
      } else if (t === "s") {
        // shared-string index — no sharedStrings.xml in these files → best-effort empty
        value = null;
      } else {
        // t="str" (formula string) or number (no t): value in <v>
        const vMatch = inner.match(/<v[^>]*>([\s\S]*?)<\/v>/);
        if (vMatch) {
          const raw = decodeXml(vMatch[1]);
          if (t === "str") value = raw === "" ? null : raw;
          else value = raw === "" ? null : Number.isFinite(Number(raw)) ? Number(raw) : raw;
        }
      }
      row[ci] = value;
    }
    grid[rowIdx] = row;
  }
  // normalise sparse → dense-ish (fill holes with null; keep row length by max col)
  return grid.map((r) => (r ? Array.from(r, (c) => (c === undefined ? null : c)) : []));
}

const cellStr = (c: Cell): string => (c == null ? "" : String(c)).trim();
const toNum = (c: Cell): number | null => {
  if (c == null || c === "") return null;
  const n = Number(c);
  return Number.isFinite(n) ? n : null;
};

/** Find a meta label cell and read the value cell directly below it (same column). */
function metaBelow(grid: Cell[][], label: string): Cell {
  const want = label.trim().toUpperCase();
  for (let r = 0; r < grid.length; r++) {
    const row = grid[r] ?? [];
    for (let c = 0; c < row.length; c++) {
      if (cellStr(row[c]).toUpperCase() === want) {
        return grid[r + 1]?.[c] ?? null;
      }
    }
  }
  return null;
}

export function parseMomoPackingXlsx(buf: Uint8Array | Buffer): MomoPackingParse {
  const warnings: string[] = [];
  const empty: MomoPackingParse = {
    listTitle: null, container: null, containerCode: null,
    totals: { trackingCount: null, qty: null, totalWeight: null, totalCbm: null },
    transportHint: null, rows: [], aggregated: [], warnings,
  };

  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  let xml: Buffer | null = null;
  try {
    xml = readZipEntry(b, "xl/worksheets/sheet1.xml");
  } catch (e) {
    warnings.push("อ่านไฟล์ .xlsx ไม่สำเร็จ (แตกไฟล์ ZIP ไม่ได้)");
    console.error("[momo-packing-parser] unzip failed", e);
    return empty;
  }
  if (!xml) {
    warnings.push("ไม่พบชีตในไฟล์ (xl/worksheets/sheet1.xml)");
    return empty;
  }

  const grid = parseSheetGrid(xml.toString("utf8"));

  // Title (row containing "PACKING LIST:")
  let listTitle: string | null = null;
  for (const row of grid) {
    const first = cellStr(row?.[0]);
    if (/^PACKING LIST/i.test(first)) { listTitle = first; break; }
  }

  // Meta
  const container = cellStr(metaBelow(grid, "CONTAINER NAME:")) || null;
  const containerCode = cellStr(metaBelow(grid, "CONTAINER CODE:")) || null;
  const totals = {
    trackingCount: toNum(metaBelow(grid, "TRACKING:")),
    qty: toNum(metaBelow(grid, "QUANTITY:")),
    totalWeight: toNum(metaBelow(grid, "TOTAL WEIGHT:")),
    totalCbm: toNum(metaBelow(grid, "TOTAL CBM:")),
  };

  // ── Locate the DATA-HEADER row (the one carrying both "Tracking" AND "Code") ──
  let headerRowIdx = -1;
  for (let r = 0; r < grid.length; r++) {
    const cells = (grid[r] ?? []).map((c) => cellStr(c).toLowerCase());
    const hasTracking = cells.some((c) => c === "tracking");
    const hasCode = cells.some((c) => c === "code");
    if (hasTracking && hasCode) { headerRowIdx = r; break; }
  }
  if (headerRowIdx < 0) {
    warnings.push("MOMO export ว่าง/ไม่มีข้อมูลพัสดุ (คิวมั่ว)");
    return { ...empty, listTitle, container, containerCode, totals };
  }

  const headerRow = grid[headerRowIdx] ?? [];
  const headerText = headerRow.map((c) => cellStr(c));
  // Column index by header name (case/space-insensitive · handles "Weight(KG)" etc.)
  const norm = (s: string) => s.toLowerCase().replace(/[\s.()_-]/g, "");
  const col = (...names: string[]): number => {
    const wanted = names.map(norm);
    for (let c = 0; c < headerText.length; c++) {
      if (wanted.includes(norm(headerText[c]))) return c;
    }
    return -1;
  };
  const cType = col("type");
  const cCode = col("code");
  const cTracking = col("tracking");
  const cWidth = col("width");
  const cLength = col("length");
  const cHeight = col("height");
  const cParcel = col("parcelcount", "parcel count");
  const cWeight = col("weightkg", "weight(kg)", "weight");
  const cCbm = col("cbm");
  const cTotalWt = col("totalweight", "total weight");
  const cTotalCbm = col("totalcbm", "total cbm");
  const cCg = col("cg");

  // ── Data rows: below the header, until the sheet ends. Skip GRAND TOTAL + blanks. ──
  const rows: MomoPackingRow[] = [];
  const rawRows: (string | number | null)[][] = [];
  const width = headerText.length;
  for (let r = headerRowIdx + 1; r < grid.length; r++) {
    const row = grid[r] ?? [];
    const firstCell = cellStr(row.find((c) => cellStr(c) !== "") ?? "");
    if (/^GRAND\s*TOTAL/i.test(firstCell)) continue; // footer total row
    const tracking = cTracking >= 0 ? cellStr(row[cTracking]) : "";
    if (!tracking) continue; // not a parcel row
    rows.push({
      tracking,
      baseTracking: baseTrackingOf(tracking),
      code: cCode >= 0 ? cellStr(row[cCode]) || null : null,
      productType: cType >= 0 ? cellStr(row[cType]) || null : null,
      width: cWidth >= 0 ? toNum(row[cWidth]) : null,
      length: cLength >= 0 ? toNum(row[cLength]) : null,
      height: cHeight >= 0 ? toNum(row[cHeight]) : null,
      parcelCount: cParcel >= 0 ? toNum(row[cParcel]) : null,
      weightKg: cWeight >= 0 ? toNum(row[cWeight]) : null,
      cbm: cCbm >= 0 ? toNum(row[cCbm]) : null,
      totalWeight: cTotalWt >= 0 ? toNum(row[cTotalWt]) : null,
      totalCbm: cTotalCbm >= 0 ? toNum(row[cTotalCbm]) : null,
      cg: cCg >= 0 ? cellStr(row[cCg]) || null : null,
    });
    rawRows.push(Array.from({ length: width }, (_, c) => (row[c] ?? null)));
  }

  if (rows.length === 0) warnings.push("MOMO export ว่าง/ไม่มีข้อมูลพัสดุ (คิวมั่ว)");

  // Transport hint: from the container name / first data-row Type token.
  const transportHint = deriveTransportHint(container, rows);

  return {
    listTitle,
    container,
    containerCode,
    totals,
    transportHint,
    rows,
    aggregated: aggregatePackingRowsByBase(rows),
    warnings,
    rawGrid: { header: headerText, rows: rawRows },
  };
}

/** "SEA" | "EK" | null from the container code / a data-row Type token. */
function deriveTransportHint(
  container: string | null,
  rows: MomoPackingRow[],
): "SEA" | "EK" | null {
  const hay = [
    (container ?? "").toUpperCase(),
    ...rows.slice(0, 3).flatMap((r) => [
      (r.productType ?? "").toUpperCase(),
      (r.tracking ?? "").toUpperCase(),
    ]),
  ].join(" ");
  // Substring match (same convention as transportModeFromCabinetName): a container
  // code like "GZS260617-1" has GZS glued to digits, so word boundaries don't apply.
  if (hay.includes("GZS") || hay.includes("SEA")) return "SEA";
  if (hay.includes("GZE") || hay.includes("EK")) return "EK";
  return null;
}
