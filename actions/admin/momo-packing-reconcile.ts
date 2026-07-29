"use server";

/**
 * MOMO packing-list (.xlsx) → tb_forwarder reconcile.
 *
 * The MOMO warehouse exports a per-container "PACKING LIST" .xlsx when it CLOSES a
 * container (ปิดตู้ = goods now shipping to Thailand). The list breaks a shipment into
 * box-suffixed sub-rows (SF1567683726553 · SF1567683726553-2) — MOMO/tb_forwarder key
 * the shipment on the BASE tracking. Upload it → AGGREGATE the sub-rows per base →
 * match each base to tb_forwarder → PREVIEW the diff → apply the measurement basis
 * (Σ Total Weight / Σ Total CBM / Σ box count) + the container + advance the status.
 * Bases MISSING from the system can be CREATED (opt-in per row · re-priced).
 *
 * Money-safety (fweight/fvolume is the SELL measurement basis → drives the price):
 *  - preview-before-apply; APPLY RE-PARSES the uploaded file server-side (never trusts a
 *    client-passed parse — the client only sends the raw file base64 + an opt-in list of
 *    which missing bases to create).
 *  - AGGREGATION is an exact Σ over the sub-rows; the basis write targets EXACTLY ONE
 *    non-billed row (writeFid). A base whose system side has >1 non-billed sibling
 *    (a split shipment) is "multi_row" → the basis is NEVER auto-written (writing the
 *    aggregate onto several split rows would multiply the charge); it's reported for a
 *    human. Status-only advance still runs on those rows (safe).
 *  - writes the basis + container ONLY on NON-BILLED rows (fstatus ∉ {5,6,7}); a billed
 *    row is FROZEN to its issued bill and is reported as skipped, never written.
 *  - famountcount forced to "1" because MOMO's Total CBM IS the aggregate total (so the
 *    CBM reads fvolume directly, never fvolume×famount — the 2026-06-16 double-count rule).
 *  - after the basis write it re-derives the SELL price via the canonical
 *    computeAndFillForwarderImportRate (writes ONLY frefrate/frefprice/ftotalprice, never
 *    a silent ฿0). This action NEVER hand-writes a price column.
 *  - CREATE-MISSING is OPT-IN per row (createMissingBases allowlist) — never automatic —
 *    and delegates to createMissingMomoForwarderRow, which runs its OWN money guards
 *    (base-tracking dedup + member-validate + best-effort reprice + audit).
 *  - STATUS advance is ONLY 1/2 → "3" (ปิดตู้ = กำลังส่งมาไทย · SOT lib/admin/forwarder-status.ts);
 *    guarded so it can never downgrade a 3/4 row and never touches a billed 5/6/7 row.
 *  - Format B (empty / "คิวมั่ว") → aggregated:[] → apply writes nothing.
 *
 * Gated ops/super/warehouse (+ god via withAdmin). Idempotent + audit-logged.
 */

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";
import { parseMomoPackingXlsx } from "@/lib/admin/momo-packing-xlsx-parser";
import { parseYiwuPackingXlsx } from "@/lib/admin/yiwu-packing-xlsx-parser";
import { detectPackingFormat, type PackingFormat } from "@/lib/admin/packing-xlsx-dispatch";
import { baseTrackingOf } from "@/lib/admin/momo-raw-helpers";
import { resolveTransportMode } from "@/lib/forwarder/cabinet-transport";
import { cabinetWriteGuard } from "@/lib/forwarder/cabinet-class";
import { computeAndFillForwarderImportRate } from "@/lib/forwarder/live-rate";
import { createMissingMomoForwarderRow } from "./momo-add-missing";
import {
  buildPackingTruthMap,
  type PackingContainerLine,
  type RawPackingSnapshotRow,
} from "@/lib/admin/momo-container-truth";
import { loadContainerTruthFor, describeContainerTruth, type ContainerTruthHint } from "@/lib/admin/container-truth-loader";
import {
  isNonParcelPackingRow,
  describeMissingCreatable,
  decideContainerWrite,
  containerWriteNote,
  overlayPackingLines,
  type ContainerWriteAction,
  type NonParcelReason,
} from "@/lib/admin/packing-upload-plan";

// base64 of a ≤~35MB file (~47MB base64) sits under the 50mb serverActions body limit.
// createMissingBases = the OPT-IN allowlist of missing bases the admin ticked "สร้าง".
// uploadId = the momo_packing_upload row THIS file was recorded as (owner 2026-07-30):
//   the apply stamps EXACTLY that history row "ใช้แล้ว" instead of every 'uploaded'
//   row of the container (prod has 10 containers with 2-3 uploads each → the old
//   blanket stamp made the history unable to say which file was actually applied).
const schema = z.object({
  fileBase64: z.string().min(1).max(70_000_000),
  createMissingBases: z.array(z.string().max(60)).max(500).optional(),
  uploadId: z.number().int().positive().optional(),
});

const BILLED = new Set(["5", "6", "7"]);
const WT_EPS = 0.01;
const VOL_EPS = 0.000001;

const num = (v: number | string | null | undefined): number | null =>
  v == null || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null;

/** A closed container ⇒ the row should be ≥ "3"; an early 1/2 status is stale. */
function isEarlyFstatus(fstatus: string | null | undefined): boolean {
  const s = (fstatus ?? "").trim();
  return s === "1" || s === "2";
}

/** createMissingMomoForwarderRow returns this exact prefix on a GUARD-1 dup → "ข้าม". */
const ALREADY_EXISTS_PREFIX = "พัสดุนี้มีในระบบแล้ว";

export type MomoPackingPreviewRow = {
  baseTracking: string;
  subCount: number;            // how many sub-rows the packing list split this base into
  code: string | null;
  productType: string | null;
  cg: string | null;
  // packing (authoritative measurement — Σ across the sub-rows)
  packingBoxes: number | null; // Σ parcelCount
  packingWeight: number | null; // Σ Total Weight
  packingCbm: number | null;   // Σ Total CBM
  // box dims (cm · first sub) — owner 2026-07-13 "ขนาดกล่องไม่ซิงค์": the packing list
  // carries w×l×h but the reconcile dropped it → fwidth/flength/fheight stayed 0 → the
  // Flash domestic quote couldn't run. Sync it (display + domestic-quote input · NOT the
  // SELL basis — fweight/fvolume stay authoritative for the import price).
  packingWidth: number | null;
  packingLength: number | null;
  packingHeight: number | null;
  // reference columns straight from the packing list (owner ปอน 2026-07-14) — the grid
  // shows every column the file carries. DISPLAY ONLY: never written, never priced.
  packingSmDate: string | null;   // B "SM. Date"
  packingBranch: string | null;   // C "Branch"
  packingProduct: string | null;  // D "Product" (ชื่อสินค้าจีน)
  packingDum: number | null;      // E "Dum"
  packingRemark: string | null;   // Q "Remark Number"
  packingWtPerBox: number | null; // M "Weight(KG)" — น้ำหนัก/กล่อง ที่ไฟล์เขียนมาเอง
  packingCbmPerBox: number | null;// N "CBM" — คิว/กล่อง ที่ไฟล์เขียนมาเอง
  // container (meta — every row inherits it)
  container: string | null;
  transportMode: "1" | "2" | "3" | null; // derived from the container name
  // pacred current (SYSTEM aggregate across matched siblings)
  matched: boolean;
  fids: number[];              // every matched sibling id
  nonBilledFids: number[];     // matched siblings not in {5,6,7}
  writeFid: number | null;     // the single non-billed target (null if 0 or >1)
  advanceFids: number[];       // non-billed siblings currently at fstatus 1/2
  userid: string | null;
  fstatus: string | null;      // representative (writeFid's / first non-billed / first)
  curWt: number | null;        // Σ fweight
  curVol: number | null;       // Σ fvolume
  curAmt: number | null;       // Σ famount (system box count)
  curCab: string | null;
  isBilled: boolean;           // matched but EVERY sibling is billed (frozen)
  statusStale: boolean;        // real container but a non-billed sibling still 1/2
  willAdvanceTo: string | null; // "3" when ≥1 non-billed sibling is early
  /** writeFid's fcabinet_locked (mig 0150) — the cabinet write guard reads it */
  cabinetLocked: boolean;
  // diff + verdict
  wtDiff: boolean;
  volDiff: boolean;
  cabDiff: boolean;
  amtDiff: boolean;
  /**
   * `cab_diff`   = ตู้เท่านั้นที่ต่าง (owner 2026-07-30 — เดิมโดนตีเป็น "🟡 น้ำหนัก/คิวต่าง"
   *                ซึ่งเป็นเหตุผลผิด และไม่มีที่ไหนบนจอบอกเลยว่าตู้ไม่ตรง)
   * `not_parcel` = แถวนี้ไม่ใช่พัสดุ (หัวตารางที่ติดมาในไฟล์ / เลขกระสอบ CBX) → เลิกนับเป็น 🔴 ไม่พบ
   */
  verdict: "ok" | "update" | "box_short" | "cab_diff" | "billed" | "missing" | "multi_row" | "not_parcel";
  /** เหตุผลว่าทำไมไม่ใช่พัสดุ (verdict = not_parcel) */
  nonParcelReason: NonParcelReason | null;
  /** ข้อความไทยของ not_parcel */
  nonParcelNote: string | null;
  /** 🔴 ไม่พบ: null = สร้างได้ · มีข้อความ = สร้างไม่ได้เพราะเหตุนี้ */
  createBlockedReason: string | null;
  // ── "ตู้ไหนกันแน่" (SOT lib/admin/momo-container-truth ผ่าน container-truth-loader) ──
  /** คำตอบพร้อมแสดง (null = โหลด SOT ไม่ได้ → พฤติกรรมเดิม) */
  containerHint: ContainerTruthHint | null;
  /** apply จะทับ fcabinetnumber หรือไม่ (ตัวเดียวกันทั้งจอและ apply) */
  containerAction: ContainerWriteAction;
  /** ข้อความไทยเมื่อ apply จะไม่ทับเลขตู้ */
  containerNote: string | null;
};

export type MomoPackingPreview = {
  format: PackingFormat; // "yiwu" = อี้อู (PREVIEW-ONLY · money-write guarded off) · "momo" = กวางโจว (full flow)
  listTitle: string | null;
  container: string | null;
  containerCode: string | null;
  totals: { trackingCount: number | null; qty: number | null; totalWeight: number | null; totalCbm: number | null };
  transportHint: "SEA" | "EK" | null;
  warnings: string[];
  rawGrid?: { header: string[]; rows: (string | number | null)[][] };
  rows: MomoPackingPreviewRow[];
  summary: {
    total: number;
    willUpdate: number;    // non-billed writable rows (update + box_short + cab_diff)
    boxShort: number;      // 🟠 system under-counts boxes/weight
    cabDiff: number;       // 🔵 เลขตู้ไม่ตรงกับไฟล์ (นับทุกแถวที่เขียนได้ ไม่ใช่แค่ cab-only)
    cabOnly: number;       // ในนั้น กี่แถวที่ "ตู้" เป็นความต่างเดียว (verdict cab_diff)
    cabSkipped: number;    // 🔵 ตู้ไม่ตรงแต่ apply จะไม่ทับ (ของอยู่ตู้อื่น / ชี้ไม่ได้)
    willAdvance: number;   // non-billed sibling fids that will move 1/2 → 3
    billedDiffer: number;  // 🔒 fully-billed rows (skipped)
    alreadyOk: number;
    missing: number;       // 🔴 in the file but not in tb_forwarder
    missingCreatable: number; // ในนั้น กี่แถวที่กด "สร้าง" ได้จริง (รหัสเป็น PR)
    notParcel: number;     // ⬜ หัวตารางในไฟล์ / เลขกระสอบ — ไม่ใช่พัสดุ
    multiRow: number;      // 🟣 split shipment (>1 non-billed) — never auto-write
    statusStale: number;   // 📦 real container but a sibling still early
  };
};

type FwdRow = {
  id: number;
  ftrackingchn: string | null;
  fstatus: string | null;
  fweight: number | string | null;
  fvolume: number | string | null;
  famount: number | string | null;
  fcabinetnumber: string | null;
  fcabinet_locked: boolean | null;
  ftransporttype: string | null;
  userid: string | null;
};

/**
 * "ตู้ไหนกันแน่" — โหลดคำตอบจาก SOT ให้ base ทุกตัวในไฟล์.
 *
 * ยึด **สมองเดียวกับหน้าตรวจต้นทุน MOMO** (`lib/admin/momo-container-truth` +
 * `container-truth-loader`) เพื่อไม่ให้แต่ละหน้าตอบ "ตู้ไม่ตรง" คนละอย่าง.
 *
 * ทำไมไม่เรียก `loadPackingTruthMap` ตรงๆ: มันดึง `parsed_snapshot` ทั้งก้อน (รวม rawGrid
 * ถึง 3,000 แถว/ไฟล์) — ที่นี่ขอเฉพาะ `->rows` (prod: 349KB/138ms → 145KB/64ms) แล้วป้อน
 * `buildPackingTruthMap` ตัวเดียวกันของ SOT = ไม่มี logic ซ้อน แค่ I/O แคบลง.
 *
 * แล้ว **overlay ไฟล์ที่กำลังพรีวิว** ทับตู้เดียวกัน — ไฟล์ที่เพิ่งลากเข้ามาอาจยังไม่ถูก
 * บันทึกลงประวัติ (ฝั่งจอบันทึกแบบ fire-and-forget) → ถ้าไม่ overlay จะตอบ "ยังไม่มี
 * แพคกิ้งลิส" ทั้งที่คนกำลังมองแพคกิ้งลิสอยู่.
 *
 * READ-ONLY · fail-soft: พังแล้วคืนแผนที่ว่าง → ไม่มี hint → พฤติกรรมเดิมทุกอย่าง.
 */
async function loadContainerTruth(
  admin: ReturnType<typeof createAdminClient>,
  container: string | null,
  fileRows: Array<{ baseTracking: string; boxes: number | null; weight: number | null; cbm: number | null; subCount: number; cg: string | null }>,
): Promise<Awaited<ReturnType<typeof loadContainerTruthFor>>> {
  const bases = fileRows.map((r) => r.baseTracking).filter(Boolean);
  if (bases.length === 0) return new Map();
  try {
    const { data, error } = await admin
      .from("momo_packing_upload")
      .select("container_no, rows:parsed_snapshot->rows")
      .not("container_no", "is", null)
      .neq("container_no", "")
      .order("uploaded_at", { ascending: false })
      .limit(500);
    if (error) {
      console.error("[momo-packing truth] packing history read failed", { code: error.code, message: error.message });
      return new Map();
    }
    const dbMap: Map<string, PackingContainerLine[]> = buildPackingTruthMap(
      ((data ?? []) as Array<{ container_no: string; rows: RawPackingSnapshotRow[] | null }>)
        .map((f) => ({ containerNo: f.container_no, rows: Array.isArray(f.rows) ? f.rows : [] })),
    );
    return await loadContainerTruthFor(admin, bases, overlayPackingLines(dbMap, container, fileRows));
  } catch (e) {
    console.error("[momo-packing truth] threw (fail-soft)", e);
    return new Map();
  }
}

async function buildPreview(bytes: Uint8Array): Promise<MomoPackingPreview> {
  // อี้อู(Yiwu) vs กวางโจว(MOMO) auto-detect from the bytes. Yiwu flows through this SAME
  // read-only preview (parse → match → diff · NO writes); only the money-write APPLY is
  // guarded MOMO-only (owner plan 2026-07-15: Yiwu import = a dedicated money-free path).
  const format = detectPackingFormat(bytes);
  const parsed = format === "yiwu" ? parseYiwuPackingXlsx(bytes) : parseMomoPackingXlsx(bytes);
  const admin = createAdminClient();

  // Match by BASE: a stored ftrackingchn may be the bare base OR a "-N" suffixed
  // split child. Query on both the aggregated bases AND every raw sub tracking,
  // then GROUP the returned rows by baseTrackingOf() so split siblings collapse
  // under the same base as the packing aggregate.
  const candidates = Array.from(
    new Set([
      ...parsed.aggregated.map((a) => a.baseTracking),
      ...parsed.rows.map((r) => r.tracking),
    ].filter(Boolean)),
  );
  const sysByBase = new Map<string, FwdRow[]>();
  if (candidates.length > 0) {
    const { data, error } = await admin
      .from("tb_forwarder")
      .select("id, ftrackingchn, fstatus, fweight, fvolume, famount, fcabinetnumber, fcabinet_locked, ftransporttype, userid")
      .in("ftrackingchn", candidates)
      .limit(5000);
    if (error) console.error("[momo-packing match] failed", { code: error.code, message: error.message });
    for (const r of (data ?? []) as FwdRow[]) {
      const b = baseTrackingOf(r.ftrackingchn ?? "");
      if (!b) continue;
      const arr = sysByBase.get(b);
      if (arr) arr.push(r);
      else sysByBase.set(b, [r]);
    }
  }

  // The container is meta-level (every parcel row inherits it) — derive the mode once.
  const container = parsed.container;
  const containerMode = container ? resolveTransportMode(container, null) : null;

  // "ตู้ไหนกันแน่" — ONE lookup for the whole file (fail-soft: empty map = old behaviour).
  const truthByBase = await loadContainerTruth(
    admin,
    container,
    parsed.aggregated.map((a) => ({
      baseTracking: a.baseTracking,
      boxes: a.parcelCount,
      weight: a.totalWeight,
      cbm: a.totalCbm,
      subCount: a.subTrackings.length,
      cg: a.cg,
    })),
  );

  const rows: MomoPackingPreviewRow[] = parsed.aggregated.map((a) => {
    const siblings = sysByBase.get(a.baseTracking) ?? [];
    const matched = siblings.length > 0;
    const nonBilled = siblings.filter((s) => !BILLED.has(String(s.fstatus)));
    const nonBilledFids = nonBilled.map((s) => s.id);
    const writeFid = nonBilled.length === 1 ? nonBilled[0].id : null;
    const advanceFids = nonBilled.filter((s) => isEarlyFstatus(s.fstatus)).map((s) => s.id);
    const primary = nonBilled[0] ?? siblings[0] ?? null;

    // SYSTEM aggregate across ALL matched siblings.
    const sumOrNull = (pick: (s: FwdRow) => number | null): number | null => {
      let acc: number | null = null;
      for (const s of siblings) {
        const v = pick(s);
        if (v != null) acc = (acc ?? 0) + v;
      }
      return acc;
    };
    const curWt = sumOrNull((s) => num(s.fweight));
    const curVol = sumOrNull((s) => num(s.fvolume));
    const curAmt = sumOrNull((s) => num(s.famount));
    const curCab = primary?.fcabinetnumber ?? null;
    const isBilled = matched && nonBilled.length === 0;

    // ── "ตู้ไหนกันแน่" ต่อแถว (ยึด writeFid — แถวที่ apply จะเขียนจริง) ──
    const hint = truthByBase.has(a.baseTracking)
      ? describeContainerTruth(truthByBase.get(a.baseTracking), writeFid, curCab)
      : null;
    const containerAction = decideContainerWrite({
      fileContainer: container,
      shouldBe: hint?.shouldBe ?? null,
      multiContainer: hint?.multiContainer ?? false,
    });
    const containerNote = containerWriteNote(containerAction, {
      fileContainer: container,
      shouldBe: hint?.shouldBe ?? null,
      packingCabinets: hint?.packingCabinets ?? [],
    });

    // ⬜ แถวที่ไม่ใช่พัสดุ (หัวตารางที่ติดมาในไฟล์ / เลขกระสอบ CBX) — ตรวจเฉพาะแถวที่
    // จับคู่กับระบบไม่ได้ (จับคู่ได้ = มีของจริงในระบบ ห้ามตีว่าไม่ใช่พัสดุ).
    const nonParcel = matched
      ? { nonParcel: false as const }
      : isNonParcelPackingRow({
          baseTracking: a.baseTracking, code: a.code,
          boxes: a.parcelCount, weight: a.totalWeight, cbm: a.totalCbm,
        });

    let verdict: MomoPackingPreviewRow["verdict"];
    let wtDiff = false, volDiff = false, cabDiff = false, amtDiff = false;
    if (!matched) {
      verdict = nonParcel.nonParcel ? "not_parcel" : "missing";
    } else if (isBilled) {
      verdict = "billed";
    } else if (nonBilled.length > 1) {
      verdict = "multi_row"; // split shipment — never auto-write the aggregate
    } else {
      wtDiff = a.totalWeight != null && (curWt == null || Math.abs(curWt - a.totalWeight) > WT_EPS);
      volDiff = a.totalCbm != null && (curVol == null || Math.abs(curVol - a.totalCbm) > VOL_EPS);
      cabDiff = !!container && container.trim() !== (curCab ?? "").trim();
      amtDiff = a.parcelCount != null && curAmt != null && curAmt !== a.parcelCount;
      const boxShort =
        (a.parcelCount != null && curAmt != null && curAmt < a.parcelCount) ||
        (a.totalWeight != null && (curWt == null || curWt + WT_EPS < a.totalWeight));
      const measureDiff = wtDiff || volDiff || amtDiff;
      // owner 2026-07-30 — ตู้ไม่ตรง ต้องมีผลของตัวเอง ห้ามไปโผล่เป็น "🟡 น้ำหนัก/คิวต่าง"
      // (เดิม cabDiff ถูกยุบรวมใน anyDiff → ป้ายบอกเหตุผลผิด และไม่มีที่ไหนบอกว่าตู้ต่าง).
      // ⚠️ ชุดแถวที่ถูกเขียน (update|box_short|cab_diff) ต้องเท่าเดิมเป๊ะ = ไม่มีเงินเปลี่ยน.
      verdict = boxShort ? "box_short" : measureDiff ? "update" : cabDiff ? "cab_diff" : "ok";
    }

    const statusStale = matched && !!container && advanceFids.length > 0;
    const willAdvanceTo = advanceFids.length > 0 ? "3" : null;
    const createBlocked =
      verdict === "missing" ? describeMissingCreatable({ code: a.code }) : ({ creatable: true } as const);

    return {
      baseTracking: a.baseTracking,
      subCount: a.subTrackings.length,
      code: a.code,
      productType: a.productType,
      cg: a.cg,
      packingBoxes: a.parcelCount,
      packingWeight: a.totalWeight,
      packingCbm: a.totalCbm,
      packingWidth: a.width,
      packingLength: a.length,
      packingHeight: a.height,
      packingSmDate: a.smDate,
      packingBranch: a.branch,
      packingProduct: a.product,
      packingDum: a.dum,
      packingRemark: a.remark,
      packingWtPerBox: a.weightKg,
      packingCbmPerBox: a.cbm,
      container,
      transportMode: containerMode,
      matched,
      fids: siblings.map((s) => s.id),
      nonBilledFids,
      writeFid,
      advanceFids,
      userid: primary?.userid ?? null,
      fstatus: primary?.fstatus ?? null,
      curWt, curVol, curAmt, curCab,
      isBilled,
      statusStale,
      willAdvanceTo,
      cabinetLocked:
        (nonBilled.find((s) => s.id === writeFid)?.fcabinet_locked ?? primary?.fcabinet_locked ?? false) === true,
      wtDiff, volDiff, cabDiff, amtDiff,
      verdict,
      nonParcelReason: nonParcel.nonParcel ? nonParcel.reason : null,
      nonParcelNote: nonParcel.nonParcel ? nonParcel.message : null,
      createBlockedReason: createBlocked.creatable ? null : createBlocked.reason,
      containerHint: hint,
      containerAction,
      containerNote,
    };
  });

  return {
    format,
    listTitle: parsed.listTitle,
    container: parsed.container,
    containerCode: parsed.containerCode,
    totals: parsed.totals,
    transportHint: parsed.transportHint,
    warnings: parsed.warnings,
    rawGrid: parsed.rawGrid,
    rows,
    summary: {
      total: rows.length,
      willUpdate: rows.filter(isWritableVerdict).length,
      boxShort: rows.filter((r) => r.verdict === "box_short").length,
      // 🔵 นับ "ตู้ไม่ตรง" ทุกแถวที่ apply แตะได้ (ไม่ใช่แค่แถวที่ตู้เป็นความต่างเดียว) —
      // ตัวเลขบนชิปจึงตอบตรงคำถาม "มีกี่แถวที่เลขตู้มีปัญหา".
      cabDiff: rows.filter((r) => isWritableVerdict(r) && r.cabDiff).length,
      cabOnly: rows.filter((r) => r.verdict === "cab_diff").length,
      cabSkipped: rows.filter(
        (r) => isWritableVerdict(r) && r.cabDiff && r.containerAction !== "write" && r.containerAction !== "none",
      ).length,
      willAdvance: rows.reduce((n, r) => n + r.advanceFids.length, 0),
      billedDiffer: rows.filter((r) => r.verdict === "billed").length,
      alreadyOk: rows.filter((r) => r.verdict === "ok").length,
      missing: rows.filter((r) => r.verdict === "missing").length,
      missingCreatable: rows.filter((r) => r.verdict === "missing" && !r.createBlockedReason).length,
      notParcel: rows.filter((r) => r.verdict === "not_parcel").length,
      multiRow: rows.filter((r) => r.verdict === "multi_row").length,
      statusStale: rows.filter((r) => r.statusStale).length,
    },
  };
}

/**
 * แถวที่ apply จะเขียนค่าลง tb_forwarder — **ชุดเดียวกับก่อนแยก `cab_diff` ออกมา**
 * (เดิม cab-only ถูกตีเป็น `update` และถูกเขียนอยู่แล้ว) → ไม่มีเงินเปลี่ยนจากการแยกป้าย.
 */
function isWritableVerdict(r: Pick<MomoPackingPreviewRow, "verdict">): boolean {
  return r.verdict === "update" || r.verdict === "box_short" || r.verdict === "cab_diff";
}

/** Read-only preview — parse + aggregate + match + diff. NO writes. */
export async function previewMomoPacking(input: unknown): Promise<AdminActionResult<MomoPackingPreview>> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  return withAdmin<MomoPackingPreview>(["ops", "super", "warehouse"], async () => {
    let bytes: Uint8Array;
    try {
      bytes = Buffer.from(parsed.data.fileBase64, "base64");
    } catch {
      return { ok: false, error: "อ่านไฟล์ไม่สำเร็จ (base64 ไม่ถูกต้อง)" };
    }
    return { ok: true, data: await buildPreview(bytes) };
  });
}

export type MomoPackingApplyResult = {
  updated: number;        // rows whose measurement basis was written (update + box_short + cab_diff)
  boxShort: number;       // of those, how many were box-short under-counts
  repriced: number;       // of the basis writes, how many had the SELL price re-derived
  repriceFailed: number;  // basis written but no rate card → set price manually
  advanced: number;       // sibling rows moved 1/2 → 3 (ปิดตู้ → กำลังส่งมาไทย)
  created: number;        // 🆕 missing bases created (opt-in)
  createSkipped: number;  // asked-to-create but already existed (GUARD 1)
  createFailed: number;   // asked-to-create but failed (bad member / db error)
  skippedBilled: number;  // 🔒 fully-billed rows, left frozen
  multiRow: number;       // 🟣 split shipments — basis never auto-written
  notFound: number;       // 🔴 in the file but not created (not opted-in)
  notParcel: number;      // ⬜ หัวตารางในไฟล์ / เลขกระสอบ — ไม่ใช่พัสดุ (ข้าม)
  cabinetWritten: number;      // 🔵 เลขตู้ที่เขียนจริง
  cabinetSkippedOther: number; // 🔵 ไม่ทับ เพราะแพคกิ้งบอกว่าของอยู่ตู้อื่น
  cabinetSkippedUnsure: number;// 🔵 ไม่ทับ เพราะชิปเม้นแยกหลายตู้แต่ชี้ไม่ได้
  cabinetRefused: number;      // 🔒 ไม่ทับ เพราะ cabinetWriteGuard ปฏิเสธ (ล็อกเลขตู้ / ไม่ใช่เลขตู้)
  cabinetRefusedReasons: string[]; // เหตุผลรายแถว (ตัดที่ 10 แถวสำหรับแสดง)
  total: number;
  warnings: string[];
};

/**
 * Apply — RE-PARSES the uploaded file server-side (never trusts a client parse),
 * writes the aggregate basis on the single non-billed row of each differing/box-short
 * base + re-derives the sell price, advances 1/2 → 3 on non-billed early siblings, and
 * (opt-in only) CREATES the ticked missing bases. Idempotent + audit-logged.
 */
export async function applyMomoPacking(input: unknown): Promise<AdminActionResult<MomoPackingApplyResult>> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  return withAdmin<MomoPackingApplyResult>(["ops", "super", "warehouse"], async ({ adminId }) => {
    let bytes: Uint8Array;
    try {
      bytes = Buffer.from(parsed.data.fileBase64, "base64");
    } catch {
      return { ok: false, error: "อ่านไฟล์ไม่สำเร็จ (base64 ไม่ถูกต้อง)" };
    }
    // 🔒 money-safety: Yiwu (อี้อู) is PREVIEW-ONLY on this page. Its import must run through
    // the dedicated money-free delivery-note → box-split → upload-2 path — never the MOMO
    // reconcile (a bare-单号 match could mis-price / cross-customer). Refuse here even if the
    // client is bypassed, so a Yiwu file can NEVER money-write via this action.
    if (detectPackingFormat(bytes) === "yiwu") {
      return { ok: false, error: "packing list อี้อู: ยังไม่รองรับการนำเข้าระบบจากหน้านี้ (โหมดพรีวิวเท่านั้น · ต้องอัพใบส่งของก่อน)" };
    }
    const preview = await buildPreview(bytes);
    const admin = createAdminClient();
    const wantCreate = new Set(parsed.data.createMissingBases ?? []);

    let updated = 0, boxShort = 0, repriced = 0, repriceFailed = 0, advanced = 0;
    let created = 0, createSkipped = 0, createFailed = 0;
    let cabinetWritten = 0, cabinetSkippedOther = 0, cabinetSkippedUnsure = 0, cabinetRefused = 0;
    const cabinetRefusedReasons: string[] = [];
    const repriceFailedTracks: string[] = [];

    // ── Loop 1: BASIS write (non-billed · update|box_short|cab_diff · single target) + reprice ──
    for (const r of preview.rows) {
      if (!isWritableVerdict(r)) continue;
      if (r.writeFid == null) continue; // multi_row / no single target → never write
      const transport = r.container ? resolveTransportMode(r.container, null) : null;
      const updates: Record<string, unknown> = { famountcount: "1" };
      if (r.packingWeight != null) updates.fweight = r.packingWeight;
      if (r.packingCbm != null) updates.fvolume = r.packingCbm;
      if (r.packingBoxes != null) updates.famount = r.packingBoxes;
      // owner 2026-07-13 — sync box dims too (was dropped → Flash quote couldn't run).
      // Display + domestic-quote input only; the SELL price stays fweight/fvolume-based.
      if (r.packingWidth != null)  updates.fwidth  = r.packingWidth;
      if (r.packingLength != null) updates.flength = r.packingLength;
      if (r.packingHeight != null) updates.fheight = r.packingHeight;
      // ── 🔒 เลขตู้ (owner 2026-07-30) ───────────────────────────────────────
      // (1) ยึด SOT "ตู้ไหนกันแน่": ถ้าแพคกิ้งบอกว่าแถวนี้อยู่ตู้อื่น หรือชิปเม้นแยกหลายตู้
      //     แต่ชี้ไม่ได้ → **ไม่ทับ** (กันทับงานที่เพิ่ง data-fix + กันประทับตู้เดียวให้ทั้ง
      //     ครอบครัวที่ MOMO แยกส่งจริง = ต้นเหตุอาการ "ตู้ไม่ตรงแปลกๆ").
      // (2) แล้วผ่าน `cabinetWriteGuard` ตัวเดียวกับทุก write path — เดิมพาธนี้เช็คแค่
      //     `isNonContainerCabinetId` จึง **ลอด fcabinet_locked (mig 0150)** ไปได้.
      //     ไม่ส่ง isGod: การเขียนเป็นก้อนแบบนี้ห้าม override ล็อก (ให้คนไปแก้รายแถว).
      let cabinetOk = false;
      if (r.container && r.containerAction === "write") {
        const cabGuard = cabinetWriteGuard({ next: r.container, current: r.curCab, locked: r.cabinetLocked });
        if (cabGuard.ok) {
          cabinetOk = true;
          if (r.cabDiff) cabinetWritten += 1;
          updates.fcabinetnumber = r.container;
        } else {
          cabinetRefused += 1;
          cabinetRefusedReasons.push(`${r.baseTracking}: ${cabGuard.reason}`);
        }
      } else if (r.containerAction === "skip_conflict") {
        cabinetSkippedOther += 1;
      } else if (r.containerAction === "skip_ambiguous") {
        cabinetSkippedUnsure += 1;
      }
      // ftransporttype มาจาก "ตู้" ตัวเดียวกัน → ถ้าไม่เชื่อเลขตู้ของไฟล์สำหรับแถวนี้ ก็ห้าม
      // เขียนโหมดขนส่งที่ derive จากมันด้วย (โหมดเป็นตัวเลือกคอลัมน์เรทต้นทุน เรือ/รถ).
      if (transport && cabinetOk) updates.ftransporttype = transport;

      // TOCTOU: re-assert non-billed in the WHERE so a row billed between preview and
      // apply is never overwritten.
      const { data: upd, error: updErr } = await admin
        .from("tb_forwarder")
        .update(updates)
        .eq("id", r.writeFid)
        .not("fstatus", "in", "(5,6,7)")
        .select("id")
        .maybeSingle<{ id: number }>();
      if (updErr) {
        console.error("[momo-packing apply] basis update failed", { fid: r.writeFid, code: updErr.code, message: updErr.message });
        continue;
      }
      if (!upd) continue; // became billed → skipped by the guard
      updated += 1;
      if (r.verdict === "box_short") boxShort += 1;

      const priced = await computeAndFillForwarderImportRate(admin, r.writeFid);
      if (priced.wrote) repriced += 1;
      else { repriceFailed += 1; repriceFailedTracks.push(r.baseTracking); }
    }

    // ── Loop 2: STATUS advance 1/2 → 3 (ปิดตู้ = กำลังส่งมาไทย) ──────────────────
    // Per non-billed early sibling. `.in("fstatus", ["1","2"])` guarantees it NEVER
    // downgrades a 3/4 row and NEVER touches a billed 5/6/7 row (guardrail 4). Runs
    // even for multi_row shipments (status-only · no money).
    const nowIso = new Date().toISOString();
    for (const r of preview.rows) {
      for (const fid of r.advanceFids) {
        const { data: adv, error: advErr } = await admin
          .from("tb_forwarder")
          .update({ fstatus: "3", fdatestatus3: nowIso })
          .eq("id", fid)
          .in("fstatus", ["1", "2"])
          .select("id")
          .maybeSingle<{ id: number }>();
        if (advErr) {
          console.error("[momo-packing apply] status advance failed", { fid, code: advErr.code, message: advErr.message });
          continue;
        }
        if (adv) advanced += 1;
      }
    }

    // ── Loop 3: CREATE missing (OPT-IN only) ────────────────────────────────────
    // Only bases the admin ticked (createMissingBases) whose MOMO code is a real PR
    // are created — delegating to createMissingMomoForwarderRow, which runs its own
    // dedup + member-validate + reprice + audit money guards.
    for (const r of preview.rows) {
      if (r.verdict !== "missing" || !wantCreate.has(r.baseTracking)) continue;
      if (!r.code || !/^PR\d+$/i.test(r.code)) { createFailed += 1; continue; }
      const boxCount = r.packingBoxes != null && r.packingBoxes > 0 ? r.packingBoxes : undefined;
      const shipBy = preview.transportHint === "SEA" ? "ship" : preview.transportHint === "EK" ? "car" : undefined;
      try {
        const res = await createMissingMomoForwarderRow(
          {
            tracking: r.baseTracking,
            cabinet: preview.container ?? "",
            memberCode: r.code,
            weightKg: r.packingWeight ?? 0,
            cbm: r.packingCbm ?? 0,
            boxCount,
            shipBy,
          },
          adminId,
        );
        if (res.ok) created += 1;
        else if (res.error.startsWith(ALREADY_EXISTS_PREFIX)) createSkipped += 1;
        else createFailed += 1;
      } catch (e) {
        createFailed += 1;
        console.error("[momo-packing apply] create-missing threw", { base: r.baseTracking, error: e });
      }
    }

    // ── G1 combo-flow (2026-07-08): STAMP the packing reconcile (mig 0245) ──────
    // Records that THIS real container's กล่อง/น้ำหนัก basis is now reconciled, so the
    // billing-run gate can refuse (acknowledgeably) an un-reconciled container and the
    // ตรวจตู้ / forwarder-check lists can badge it. Write-only to the reference table —
    // NO money / tb_forwarder touch. Best-effort (never fails the apply). Skipped for
    // Format B ("คิวมั่ว") — no real container to stamp. `nowIso` from Loop 2 above.
    const containerNo = (preview.container ?? "").trim();
    if (containerNo) {
      const { error: stampErr } = await admin
        .from("container_packing_reconcile")
        .upsert(
          {
            container_no:   containerNo,
            reconciled_at:  nowIso,
            reconciled_by:  adminId ? String(adminId).slice(0, 20) : null,
            rows_updated:   updated,
            boxes_short:    boxShort,
            advanced,
            tracking_count: preview.totals.trackingCount ?? null,
            source:         "momo_packing",
          },
          { onConflict: "container_no" },
        );
      if (stampErr) {
        console.error("[momo-packing apply] reconcile stamp failed", {
          container: containerNo, code: stampErr.code, message: stampErr.message,
        });
      }
    }

    // Audit P2 (2026-07-18) — stamp the upload-history row so it distinguishes
    // "uploaded only (previewed)" from "APPLIED to tb_forwarder". The client
    // records the upload at PREVIEW time (status='uploaded'); this closes the loop
    // on APPLY. Best-effort (never fails the apply).
    //
    // 🔴 owner 2026-07-30 — stamp EXACTLY ONE row. The old statement had no
    // `.order()/.limit(1)` despite its comment claiming "the newest", so a container
    // uploaded several times (prod: 10 containers · GZS260718-1 อัพ 3 รอบ) had ALL its
    // 'uploaded' rows flipped to ✓ ใช้แล้ว → the history could no longer say which file
    // was actually applied. Prefer the uploadId the client recorded for THIS file;
    // otherwise fall back to the newest still-'uploaded' row of the container.
    if (containerNo) {
      let stampId: number | null = null;
      if (parsed.data.uploadId != null) {
        // Guard the id against the container + status so a stale/foreign id can never
        // stamp another container's row.
        const { data: own, error: ownErr } = await admin
          .from("momo_packing_upload")
          .select("id")
          .eq("id", parsed.data.uploadId)
          .eq("container_no", containerNo)
          .eq("status", "uploaded")
          .maybeSingle<{ id: number }>();
        if (ownErr) console.error("[momo-packing apply] uploadId lookup failed", { uploadId: parsed.data.uploadId, code: ownErr.code, message: ownErr.message });
        stampId = own?.id ?? null;
      }
      if (stampId == null) {
        const { data: newest, error: pickErr } = await admin
          .from("momo_packing_upload")
          .select("id")
          .eq("container_no", containerNo)
          .eq("status", "uploaded")
          .order("uploaded_at", { ascending: false })
          .order("id", { ascending: false })
          .limit(1)
          .maybeSingle<{ id: number }>();
        if (pickErr) console.error("[momo-packing apply] newest-upload lookup failed", { container: containerNo, code: pickErr.code, message: pickErr.message });
        stampId = newest?.id ?? null;
      }
      if (stampId != null) {
        const { error: appliedErr } = await admin
          .from("momo_packing_upload")
          .update({ applied_at: new Date().toISOString(), status: "applied" })
          .eq("id", stampId)
          .eq("status", "uploaded"); // TOCTOU — never re-stamp an already-applied row
        if (appliedErr) console.error("[momo-packing apply] applied_at stamp failed", { uploadId: stampId, container: containerNo, code: appliedErr.code, message: appliedErr.message });
      }
    }

    await logAdminAction(adminId, "momo_packing.apply", "tb_forwarder", "", {
      container: preview.container,
      uploadId: parsed.data.uploadId ?? null,
      updated, boxShort, repriced, repriceFailed, advanced,
      created, createSkipped, createFailed,
      cabinetWritten, cabinetSkippedOther, cabinetSkippedUnsure, cabinetRefused,
      skippedBilled: preview.summary.billedDiffer,
      multiRow: preview.summary.multiRow,
      notFound: preview.summary.missing,
      notParcel: preview.summary.notParcel,
      repriceFailedTracks: repriceFailedTracks.slice(0, 50),
      cabinetRefusedReasons: cabinetRefusedReasons.slice(0, 50),
    });

    return {
      ok: true,
      data: {
        updated,
        boxShort,
        repriced,
        repriceFailed,
        advanced,
        created,
        createSkipped,
        createFailed,
        skippedBilled: preview.summary.billedDiffer,
        multiRow: preview.summary.multiRow,
        notFound: preview.summary.missing - created - createSkipped,
        notParcel: preview.summary.notParcel,
        cabinetWritten,
        cabinetSkippedOther,
        cabinetSkippedUnsure,
        cabinetRefused,
        cabinetRefusedReasons: cabinetRefusedReasons.slice(0, 10),
        total: preview.rows.length,
        warnings: preview.warnings,
      },
    };
  });
}
