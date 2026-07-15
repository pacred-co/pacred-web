/**
 * ════════════════════════════════════════════════════════════════════════
 * "MOMO มั่ว" detector — is a base tracking's momo_box_detail SELF-CONSISTENT
 * with its aggregate tb_forwarder row? (owner/ภูม 2026-07-15 · ตรวจตู้ 🚩 flag)
 *
 * WHY THIS EXISTS
 * ───────────────
 * MOMO's web sometimes returns per-box numbers that CONTRADICT the aggregate it
 * also reports — e.g. base 1782555393 (fwd 52137): aggregate fweight=150kg, but its
 * momo_box_detail has a box claiming 3,580kg/piece (a 1.75-คิว box "weighing" 10
 * tons). When that happens, the automatic box-split REFUSES the row (planBoxRowSplit
 * → weight_mismatch / cbm_mismatch) and leaves it as one aggregate that can't be
 * auto-fixed — the only cure is a real แต้ม packing list. Staff had no way to SEE
 * which container/row was in this state; this powers the 🚩 flag on "MOMO ตรวจตู้"
 * so ภูม spots "ตู้ไหน/แถวไหนต้องอัพแต้ม" at a glance.
 *
 * THE INVARIANT (mirrors planBoxRowSplit guard #7 EXACTLY — the same box-total math,
 * the same 2% tolerance, the same dims-volume fallback)
 * ─────────────────────────────────────────────────────────────────────────
 *   box TOTAL weight = weight_kg(per-piece) × quantity  →  Σ over boxes.
 *   The data is CONSISTENT when Σ box weight ≈ aggregate fweight AND Σ box cbm ≈
 *   aggregate fvolume (within 2%). When the STORED weight/คิว disagree, MOMO's own
 *   per-box DIMENSIONS (ก×ย×ส) are still trustworthy on many folded rows: if
 *   Σ(w×l×h×qty) reconciles the aggregate fvolume, the human box-split button CAN
 *   fix it (dims fallback) — so it is NOT "มั่ว", NOT flagged (this is the crucial
 *   false-alarm guard: e.g. fwd 52167 / 760234506976 reconciles via dims).
 *
 *   ⇒ "garbage" (🚩 · needs แต้ม) IFF the stored metrics fail AND the dims fallback
 *      ALSO fails — i.e. even the human button would return weight/cbm_mismatch.
 *
 * SCOPE: DISPLAY-ONLY diagnostic. This module writes nothing, feeds no price/status,
 * and never changes a bill — it only tells staff which MOMO numbers to distrust.
 *
 * SAFETY — pure · no DB · no IO · unit-tested (agrees with planBoxRowSplit).
 * RUN:  pnpm tsx lib/admin/momo-box-consistency.test.ts
 * @see lib/integrations/momo-web/split-box-rows-plan.ts — the money guard this mirrors
 * @see supabase/migrations/0240_momo_box_detail.sql      — the per-box store
 * ════════════════════════════════════════════════════════════════════════
 */

/** Tolerance for the money-basis match — MUST equal planBoxRowSplit's default (2%). */
const REL_TOLERANCE = 0.02;

/** One momo_box_detail row (per-PIECE metrics + pieces count) — the box TOTAL = per-piece × qty. */
export type BoxConsistencyInput = {
  boxTracking: string;
  /** weight_kg — per PIECE. */
  weightKgPerPiece: number;
  /** cbm — per PIECE. */
  cbmPerPiece: number;
  width: number;
  length: number;
  height: number;
  quantity: number;
};

export type MomoBoxConsistency = {
  /** true = MOMO's per-box numbers contradict the aggregate AND dims can't reconcile → 🚩 ต้องแต้ม. */
  garbage: boolean;
  /** which metric is inconsistent (only when garbage). */
  reason: null | "weight" | "cbm";
  /** number of distinct boxes considered (0/1 → never garbage — nothing to cross-check). */
  boxCount: number;
  /** Σ of box TOTAL weight (per-piece × qty) across boxes. */
  boxWeightSum: number;
  aggWeight: number;
  /** Σ of box TOTAL cbm across boxes. */
  boxCbmSum: number;
  aggCbm: number;
  /**
   * true when the stored weight/คิว disagreed BUT the per-box dims reconciled the
   * aggregate volume → the human box-split button can fix it (so NOT garbage). Purely
   * informational (a caller may show "ซ่อมได้ด้วยปุ่มแตกกล่อง" vs "ต้องอัพแต้ม").
   */
  dimsReconcilable: boolean;
};

function r2(n: number): number {
  const v = Number(n);
  return Number.isFinite(v) ? Number(v.toFixed(2)) : 0;
}
function r6(n: number): number {
  const v = Number(n);
  return Number.isFinite(v) ? Number(v.toFixed(6)) : 0;
}
function pieces(q: number): number {
  const n = Math.round(Number(q));
  return Number.isFinite(n) && n > 0 ? n : 1;
}
/** |a-b| / max(|a|,|b|); 0 when both are 0. (Mirrors split-box-rows-plan.relDiff.) */
function relDiff(a: number, b: number): number {
  const denom = Math.max(Math.abs(a), Math.abs(b));
  if (denom === 0) return 0;
  return Math.abs(a - b) / denom;
}

/**
 * Decide whether a base tracking's momo_box_detail is self-consistent with its
 * aggregate tb_forwarder weight/คิว. Pure. Returns the sums so the UI can show
 * "แถวย่อยรวม X > ก้อนรวม Y".
 *
 * `agg` = the aggregate row's fweight (kg) + fvolume (คิว). `boxes` = its
 * momo_box_detail rows (per-piece metrics). A base with ≤1 box is never garbage
 * (there is nothing to cross-check).
 */
export function deriveMomoBoxConsistency(
  agg: { fweight: number; fvolume: number },
  boxes: readonly BoxConsistencyInput[],
): MomoBoxConsistency {
  const aggWeight = Number(agg.fweight) || 0;
  const aggCbm = Number(agg.fvolume) || 0;

  // De-dupe by exact box tracking (defensive — a caller may pass repeats).
  const byBox = new Map<string, BoxConsistencyInput>();
  for (const b of boxes) {
    const t = (b.boxTracking ?? "").trim();
    if (t) byBox.set(t, b);
  }
  const uniq = Array.from(byBox.values());

  const base: MomoBoxConsistency = {
    garbage: false,
    reason: null,
    boxCount: uniq.length,
    boxWeightSum: 0,
    aggWeight,
    boxCbmSum: 0,
    aggCbm,
    dimsReconcilable: false,
  };
  if (uniq.length <= 1) return base;

  // box TOTALs (per-piece × qty) + Σ, and each box's dims-volume total.
  let sumWeight = 0;
  let sumCbm = 0;
  let allDims = true;
  const dimVols: number[] = [];
  for (const b of uniq) {
    const q = pieces(b.quantity);
    sumWeight += r2((Number(b.weightKgPerPiece) || 0) * q);
    sumCbm += r6((Number(b.cbmPerPiece) || 0) * q);
    const w = Number(b.width), l = Number(b.length), h = Number(b.height);
    if (!(w > 0 && l > 0 && h > 0)) allDims = false;
    dimVols.push(((w * l * h) / 1_000_000) * q);
  }
  base.boxWeightSum = r2(sumWeight);
  base.boxCbmSum = r6(sumCbm);

  const weightOk = relDiff(sumWeight, aggWeight) <= REL_TOLERANCE;
  const cbmOk = relDiff(sumCbm, aggCbm) <= REL_TOLERANCE;
  if (weightOk && cbmOk) return base; // stored metrics reconcile → consistent.

  // Dims fallback (mirrors planBoxRowSplit): if the per-box dims-volume reconciles
  // the aggregate fvolume, the human box-split button CAN fix it → NOT garbage.
  const sumDimVol = dimVols.reduce((s, v) => s + v, 0);
  const dimsReconcile = allDims && sumDimVol > 0 && relDiff(sumDimVol, aggCbm) <= REL_TOLERANCE;
  if (dimsReconcile) {
    base.dimsReconcilable = true;
    return base;
  }

  base.garbage = true;
  base.reason = !weightOk ? "weight" : "cbm";
  return base;
}
