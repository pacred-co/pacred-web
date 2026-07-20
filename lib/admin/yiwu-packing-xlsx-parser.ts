/**
 * Yiwu (อี้อู) packing-list .xlsx parser (pure · no network · Buffer/Uint8Array in).
 *
 * The Yiwu warehouse's "packing list" is a real WPS/Excel workbook WITH sharedStrings
 * (unlike the MOMO export, which uses inline strings and needs manual unzip). So we read
 * it with SheetJS (`xlsx`) — the sheet is named `收货` ("receiving") and carries CHINESE
 * headers. We map every column BY HEADER NAME (never fixed index) and aggregate per 单号.
 *
 * Shape (from the real file GZS260625-5T - PL.xlsx):
 *  - R0/C2 = container name (e.g. "GZS260625-5T" · GZS = sea).
 *  - a header row carrying 编号|日期|单号|唛头|件数|单件数量|单件重量|总重量|长|宽|高|材积|
 *    类别+材质|品名|英文|备注|… — detected by having BOTH 单号 AND 总重量.
 *  - one row per BOX-GROUP; a 单号 (order) can span several rows with DIFFERENT dims
 *    (编号 present on the first row, blank on continuation, but 单号 repeated on every row).
 *    We aggregate per 单号 (总重量 / 材积 / 件数 summed) → the SELL basis.
 *  - a GRAND-TOTAL row (601 / 15075.90 / 75.88) with no 单号 + a DISPIMG stamp/signature
 *    row → both skipped by the "no 单号 → skip" rule.
 *
 * Output is the SAME `MomoPackingParse` shape so the packing reconcile
 * (actions/admin/momo-packing-reconcile.ts) consumes it unchanged — a format dispatcher
 * (lib/admin/packing-xlsx-dispatch.ts) picks this parser vs the MOMO one.
 *
 * Money note: `totalWeight`/`totalCbm` here are the SELL measurement basis when the
 * reconcile writes them — this parser only READS; the money guards live in the action
 * (non-billed-only · re-parse-on-apply).
 */

import * as XLSX from "xlsx";
import {
  aggregatePackingRowsByBase,
  deriveTransportHint,
  type MomoPackingParse,
  type MomoPackingRow,
} from "@/lib/admin/momo-packing-xlsx-parser";

const YIWU_SHEET = "收货";
const IMAGE_SHEET = "WpsReserved_CellImgList";

type Cell = string | number | null;

const cellStr = (c: Cell): string => (c == null ? "" : String(c)).trim();
const toNum = (c: Cell): number | null => {
  if (c == null || c === "") return null;
  const n = Number(c);
  return Number.isFinite(n) ? n : null;
};
/** Chinese headers have no spaces; normalise away whitespace + full-width variants. */
const norm = (s: string) => s.replace(/[\s　]/g, "").trim();

/** A container-code cell like "GZS260625-5T" (2-4 letters then 5+ digits). */
const CONTAINER_RE = /^[A-Z]{2,4}\d{5,}/i;

function readWorkbook(buf: Uint8Array | Buffer): XLSX.WorkBook {
  return XLSX.read(buf, { type: Buffer.isBuffer(buf) ? "buffer" : "array" });
}

/** Pick the data sheet: prefer 收货, else the first non-image sheet. */
function pickSheet(wb: XLSX.WorkBook): XLSX.WorkSheet | null {
  if (wb.SheetNames.includes(YIWU_SHEET)) return wb.Sheets[YIWU_SHEET] ?? null;
  const name = wb.SheetNames.find((n) => n !== IMAGE_SHEET) ?? wb.SheetNames[0];
  return name ? (wb.Sheets[name] ?? null) : null;
}

function sheetGrid(sheet: XLSX.WorkSheet): Cell[][] {
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true }) as Cell[][];
}

/** Is this a Yiwu packing workbook? (has 收货 sheet, or a header row with 单号+总重量) */
export function isYiwuPackingWorkbook(buf: Uint8Array | Buffer): boolean {
  let wb: XLSX.WorkBook;
  try {
    wb = readWorkbook(buf);
  } catch {
    return false; // MOMO inline-string files can throw / return garbage under SheetJS
  }
  if (wb.SheetNames.includes(YIWU_SHEET)) return true;
  for (const name of wb.SheetNames) {
    if (name === IMAGE_SHEET) continue;
    let grid: Cell[][];
    try {
      grid = sheetGrid(wb.Sheets[name]!);
    } catch {
      continue;
    }
    for (const row of grid.slice(0, 12)) {
      const cells = (row ?? []).map((c) => norm(cellStr(c)));
      if (cells.includes("单号") && cells.some((c) => c.includes("总重量"))) return true;
    }
  }
  return false;
}

export function parseYiwuPackingXlsx(buf: Uint8Array | Buffer): MomoPackingParse {
  const warnings: string[] = [];
  const empty: MomoPackingParse = {
    listTitle: null, container: null, containerCode: null,
    totals: { trackingCount: null, qty: null, totalWeight: null, totalCbm: null },
    transportHint: null, rows: [], aggregated: [], warnings,
  };

  let wb: XLSX.WorkBook;
  try {
    wb = readWorkbook(buf);
  } catch (e) {
    warnings.push("อ่านไฟล์ .xlsx ไม่สำเร็จ (อี้อู)");
    console.error("[yiwu-packing-parser] read failed", e);
    return empty;
  }
  const sheet = pickSheet(wb);
  if (!sheet) {
    warnings.push("ไม่พบชีตข้อมูลในไฟล์ (อี้อู)");
    return empty;
  }
  const grid = sheetGrid(sheet);

  // Container — TWO title shapes (owner 2026-07-20 "เอาตามแพทเทิน อี้อู ที่ TTW ส่งมา"):
  //   1. ใบปิดตู้: a title cell "เลขที่ตู้ 0717-7072 YW SEA  อี้อู" → take the id VERBATIM
  //      (strip the "เลขที่ตู้" label + a trailing "อี้อู" region word). TTW's own
  //      pattern IS the เลขตู้ — never normalise/relabel it.
  //   2. legacy packing list: a container-like cell (GZS260625-5T at R0/C2).
  let container: string | null = null;
  outer1: for (let r = 0; r < Math.min(grid.length, 6); r++) {
    for (const c of grid[r] ?? []) {
      const s = cellStr(c);
      const m = /เลขที่ตู้\s*(.+)$/.exec(s);
      if (m) {
        const id = m[1].replace(/อี้อู\s*$/, "").trim();
        if (id) { container = id; break outer1; }
      }
    }
  }
  if (!container) {
    outer2: for (let r = 0; r < Math.min(grid.length, 6); r++) {
      for (const c of grid[r] ?? []) {
        const s = cellStr(c);
        if (CONTAINER_RE.test(s)) { container = s; break outer2; }
      }
    }
  }

  // Locate the DATA-HEADER row (carries BOTH 单号 AND 总重量).
  let headerRowIdx = -1;
  for (let r = 0; r < grid.length; r++) {
    const cells = (grid[r] ?? []).map((c) => norm(cellStr(c)));
    if (cells.includes("单号") && cells.some((c) => c.includes("总重量"))) { headerRowIdx = r; break; }
  }
  if (headerRowIdx < 0) {
    warnings.push("ไม่พบหัวตาราง 单号/总重量 (ไฟล์อี้อูผิดรูปแบบ?)");
    return { ...empty, container };
  }

  const headerRow = (grid[headerRowIdx] ?? []).map((c) => cellStr(c));
  const headerNorm = headerRow.map((h) => norm(h));
  /** first column whose header equals one of `exact`, or (fallback) contains one of `has`. */
  const col = (exact: string[], has: string[] = []): number => {
    const ex = exact.map(norm);
    for (let c = 0; c < headerNorm.length; c++) if (ex.includes(headerNorm[c])) return c;
    if (has.length) {
      const hs = has.map(norm);
      for (let c = 0; c < headerNorm.length; c++) if (hs.some((h) => headerNorm[c].includes(h))) return c;
    }
    return -1;
  };

  const cOrder = col(["单号"]);           // ORDER NO → tracking (key)
  const cMark = col(["唛头"]);            // mark → code
  const cBoxes = col(["件数"]);           // box count → parcelCount
  const cWtBox = col(["单件重量", "单件重"]); // per-box weight → weightKg (ref · ใบปิดตู้ header = 单件重)
  const cTotalWt = col(["总重量"], ["总重"]); // 💰 row total weight → totalWeight
  const cLen = col(["长"]);              // length
  const cWid = col(["宽"]);              // width
  const cHei = col(["高"]);              // height
  const cCbm = col(["材积"]);            // 💰 row total cbm → totalCbm
  const cType = col(["类别+材质", "类别"], ["类别"]); // type+material → productType
  const cNameZh = col(["品名"]);          // Chinese product name
  const cNameTh = col(["英文"]);          // Thai/English product name
  const cRemark = col(["备注"]);          // remark
  const cDate = col(["日期"]);            // date → smDate
  const cPipe = col(["管道"]);            // SEA/EK → trans

  if (cOrder < 0 || cTotalWt < 0) {
    warnings.push("หัวตารางอี้อูขาดคอลัมน์ 单号/总重量");
    return { ...empty, container };
  }

  const rows: MomoPackingRow[] = [];
  const rawRows: (string | number | null)[][] = [];
  const width = headerRow.length;
  let totalsRow: Cell[] | null = null;

  for (let r = headerRowIdx + 1; r < grid.length; r++) {
    const row = grid[r] ?? [];
    const order = cellStr(row[cOrder]);
    if (!order) {
      // GRAND-TOTAL row = no 单号 but a numeric 总重量; capture it, keep scanning.
      if (totalsRow == null && toNum(row[cTotalWt]) != null) totalsRow = row;
      continue; // footer / DISPIMG / blank
    }
    // ใบปิดตู้ (owner 2026-07-20) carries merged footer lines starting at col 0
    // ("ประมาณการตู้เข้า 04 - 10 สิงหาคม 2569" · disclaimer text) — those land in the
    // 单号 column but have NO numbers in 件数/总重量/材积 → not data rows.
    const hasAnyMetric =
      (cBoxes >= 0 && toNum(row[cBoxes]) != null) ||
      toNum(row[cTotalWt]) != null ||
      (cCbm >= 0 && toNum(row[cCbm]) != null);
    if (!hasAnyMetric) continue;
    const thai = cNameTh >= 0 ? cellStr(row[cNameTh]) : "";
    const zh = cNameZh >= 0 ? cellStr(row[cNameZh]) : "";
    rows.push({
      tracking: order,
      baseTracking: order, // Yiwu 单号 has no "-N" split suffix → base IS the raw 单号
      code: cMark >= 0 ? cellStr(row[cMark]) || null : null,
      productType: cType >= 0 ? cellStr(row[cType]) || null : null,
      width: cWid >= 0 ? toNum(row[cWid]) : null,
      length: cLen >= 0 ? toNum(row[cLen]) : null,
      height: cHei >= 0 ? toNum(row[cHei]) : null,
      parcelCount: cBoxes >= 0 ? toNum(row[cBoxes]) : null,
      weightKg: cWtBox >= 0 ? toNum(row[cWtBox]) : null,
      cbm: null, // Yiwu carries 材积 = TOTAL cbm only (no per-box cbm column)
      totalWeight: cTotalWt >= 0 ? toNum(row[cTotalWt]) : null,
      totalCbm: cCbm >= 0 ? toNum(row[cCbm]) : null,
      cg: null, // Yiwu has no CG/HS column
      trans: cPipe >= 0 ? cellStr(row[cPipe]) || null : null,
      smDate: cDate >= 0 ? cellStr(row[cDate]) || null : null,
      branch: "อี้อู",
      product: thai || zh || null, // Thai preferred (staff-facing), Chinese fallback
      dum: null,
      remark: cRemark >= 0 ? cellStr(row[cRemark]) || null : null,
    });
    rawRows.push(Array.from({ length: width }, (_, c) => (row[c] ?? null)));
  }

  if (rows.length === 0) warnings.push("ไฟล์ packing อี้อูว่าง/ไม่มีแถวข้อมูล");

  const aggregated = aggregatePackingRowsByBase(rows);

  // Totals: prefer the explicit GRAND-TOTAL row, else Σ from the aggregated shipments.
  const sumAgg = (pick: (a: (typeof aggregated)[number]) => number | null): number | null => {
    let acc: number | null = null;
    for (const a of aggregated) { const v = pick(a); if (v != null) acc = (acc ?? 0) + v; }
    return acc;
  };
  const totals = {
    trackingCount: aggregated.length || null,
    qty: (totalsRow && cBoxes >= 0 ? toNum(totalsRow[cBoxes]) : null) ?? sumAgg((a) => a.parcelCount),
    totalWeight: (totalsRow ? toNum(totalsRow[cTotalWt]) : null) ?? sumAgg((a) => a.totalWeight),
    totalCbm: (totalsRow && cCbm >= 0 ? toNum(totalsRow[cCbm]) : null) ?? sumAgg((a) => a.totalCbm),
  };

  return {
    listTitle: container ? `PACKING LIST (อี้อู): ${container}` : "PACKING LIST (อี้อู)",
    container,
    containerCode: null,
    totals,
    transportHint: deriveTransportHint(container, rows),
    rows,
    aggregated,
    warnings,
    rawGrid: { header: headerRow, rows: rawRows },
  };
}
