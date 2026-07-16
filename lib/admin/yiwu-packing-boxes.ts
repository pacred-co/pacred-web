/**
 * Yiwu — map packing-list rows → box-split grid rows for the ใบส่งของ create form
 * (ภูม 2026-07-16 · Phase 3 follow-up).
 *
 * WHY: the อี้อู ใบส่งของ arrives ONLY as an IMAGE (owner-confirmed) and OCR of that
 * small photographed table is unreliable — it catches the PR but not the box dims. The
 * SAME box detail, however, lives cleanly in the packing-list Excel. Grounded against
 * the real file (GZS260625-5T · 96 rows / 61 单号 · 22 multi-box): the packing parser's
 * per-单号 rows reproduce the ใบส่งของ table EXACTLY —
 *   parcelCount = box count · totalWeight = the note's WEIGHT column (group total) ·
 *   totalCbm = the note's CBM column · length/width/height = per-box dims.
 * So the create grid auto-fills its boxes from the packing Excel, keyed by 单号 — no OCR,
 * money-identical to the ใบส่งของ. This is a client PRE-FILL only: staff still reviews +
 * the money-safe create action re-validates every field server-side.
 */

import type { MomoPackingRow } from "@/lib/admin/momo-packing-xlsx-parser";
import { baseTrackingOf } from "@/lib/admin/momo-raw-helpers";

export type YiwuPackingBox = {
  boxCount: number;   // parcelCount
  weightKg: number;   // GROUP TOTAL (the ใบส่งของ WEIGHT column) — matches the grid's น้ำหนัก
  lengthCm: number;   // per-box
  widthCm: number;
  heightCm: number;
  cbm: number;        // GROUP TOTAL (the ใบส่งของ CBM column) — matches the grid's คิว
  productType: string;
};

const num = (v: number | null | undefined): number =>
  typeof v === "number" && Number.isFinite(v) ? v : 0;
const round6 = (v: number) => Math.round((v + Number.EPSILON) * 1e6) / 1e6;

/**
 * Group packing rows by base 单号 → per-单号 box-split rows for the create grid. Pure.
 * `weightKg`/`cbm` are the GROUP TOTALS (what the grid + the create action treat as the
 * row's น้ำหนัก/คิว), preferring the packing's totalWeight/totalCbm and falling back to
 * per-box × count when a total is absent.
 */
export function yiwuPackingBoxesByOrderNo(
  rows: MomoPackingRow[],
): Record<string, YiwuPackingBox[]> {
  const out: Record<string, YiwuPackingBox[]> = {};
  for (const r of rows) {
    // Group by the base 单号 (the packing parser already strips to baseTracking; run
    // baseTrackingOf defensively so an unsuffixed tracking-fallback groups the same way
    // the reconcile matches — idempotent on an already-stripped base).
    const base = baseTrackingOf((r.baseTracking || r.tracking || "").trim());
    if (!base) continue;
    const count = Math.max(1, Math.round(num(r.parcelCount) || 1));
    const L = num(r.length), W = num(r.width), H = num(r.height);
    const weightKg = r.totalWeight != null ? num(r.totalWeight) : round6(num(r.weightKg) * count);
    const cbm = r.totalCbm != null ? num(r.totalCbm) : round6((L * W * H * count) / 1_000_000);
    (out[base] ||= []).push({
      boxCount: count,
      weightKg,
      lengthCm: L,
      widthCm: W,
      heightCm: H,
      cbm,
      productType: (r.productType || r.product || "").toString().trim().slice(0, 200),
    });
  }
  return out;
}
