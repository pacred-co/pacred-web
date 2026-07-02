/**
 * MOMO box-split → sibling rows — PURE plan + the money-neutral guard.
 *
 * WHY THIS EXISTS (owner/ภูม 2026-07-02, definitive)
 * ─────────────────────────────────────────────────
 * When MOMO splits ONE cargo tracking into N boxes of DIFFERENT sizes (its web
 * shows them as "<base>-1/n … -n/n", each 1 box), Pacred currently stores the
 * WHOLE tracking as ONE aggregate `tb_forwarder` row (famount=N, the per-box dims
 * stashed only in `momo_box_detail`). The owner wants it to MATCH MOMO exactly:
 * ONE box = ONE `tb_forwarder` row = N sibling rows sharing the base tracking —
 * the SAME shape the already-correct trackings X90012661 / 800117017081 have (they
 * render as normal sibling rows in the main table). ภูม flag (revert dad3b07a):
 * "boxes เป็น main rows แบบ X90012661 = เก็บ box-split เป็น sibling rows · เป็นงาน
 * money-touching ทำแยกอย่างระวัง".
 *
 * 💰 MONEY-SAFETY — this module holds the CONSERVATIVE money-neutral guard.
 * ─────────────────────────────────────────────────────────────────────────
 * Splitting an aggregate row into N siblings is money-SAFE **only** when the split
 * PRESERVES the shipment total — i.e. the per-box Σ(weight/cbm/pieces) equals the
 * aggregate's current fweight/fvolume/famount. The billing loop bills each sibling
 * on its OWN gross and sums them (verified: forwarder-debit-total.ts anchors the
 * เหมาๆ ฿100 to the base tracking suffix-0, and billing-run.ts sums per-row
 * calcForwarderGross), so a split that preserves the Σ never multiplies or loses a
 * baht. A split that would CHANGE the Σ (box_detail disagrees with the aggregate),
 * or a row that is already PRICED (ftotalprice>0) or already IN billing (fstatus
 * 5/6/7), is REFUSED here → the aggregate is left intact for a human to reconcile.
 *
 * This is a PURE module (no DB · no "server-only") so the decision — WHICH rows to
 * split, the per-box row shape, and the money-neutral guard — is unit-tested under
 * plain `tsx`. The SQL writer (split-box-rows.ts) applies the plan this returns.
 *
 * @see lib/integrations/momo-web/split-box-rows.ts       — the SQL writer (applies the plan)
 * @see lib/integrations/momo-web/live-parcel-metrics.ts  — parcelTotals (per-piece × qty)
 * @see lib/admin/momo-bill-header.ts                     — baseTracking/trackingSuffix (billing group key)
 * @see supabase/migrations/0240_momo_box_detail.sql       — the per-box store this reads from
 */

/** One per-box row read out of momo_box_detail (per-PIECE metrics + pieces count). */
export type BoxDetailInput = {
  /** The exact split tracking as MOMO returns it ("<base>-3" or "<base>-3/6"). */
  boxTracking: string;
  /** Per-PIECE weight (kg) — the box TOTAL = weightKgPerPiece × quantity. */
  weightKgPerPiece: number;
  /** Per-PIECE volume (คิว) — the box TOTAL = cbmPerPiece × quantity. */
  cbmPerPiece: number;
  width: number;   // ก (cm)
  length: number;  // ย (cm)
  height: number;  // ส (cm)
  /** จำนวนชิ้น — pieces in this box (min 1). */
  quantity: number;
};

/** The current aggregate tb_forwarder row's money-relevant fields (for the guard). */
export type AggregateRowInput = {
  id: number;
  /** ftrackingchn — expected to be the BARE base tracking (no "-i/n" suffix). */
  ftrackingchn: string;
  /** fstatus — must be a NON-billed stage (1/2/3/4) to be splittable. */
  fstatus: string;
  /** reforder — must be empty (no linked ฝากสั่งซื้อ) to be splittable. */
  reforder: string;
  /** ftotalprice — must be ≤0 (unpriced) to be splittable (never re-price a billed amount). */
  ftotalprice: number;
  /** famount — the aggregate pieces count (must equal Σ box quantity). */
  famount: number;
  /** fweight — the aggregate TOTAL weight (must ≈ Σ box total weight). */
  fweight: number;
  /** fvolume — the aggregate TOTAL คิว (must ≈ Σ box total cbm). */
  fvolume: number;
};

/** The plan for ONE box row the writer will create (the aggregate's non-metric
 *  fields are cloned by the writer; this carries only the per-box metrics + identity). */
export type BoxRowPlan = {
  /** The exact tracking this sibling row gets. The FIRST box keeps the BARE base
   *  tracking (suffix 0) so it stays the เหมาๆ anchor + preserves the
   *  momo_import_tracks.committed_forwarder_id linkage; the rest get "<base>-i/n". */
  ftrackingchn: string;
  /** True for the first box → the writer UPDATEs the existing aggregate row in place
   *  (keeps its id + linkage); false → the writer INSERTs a new sibling row. */
  isAnchor: boolean;
  /** fweight — this box's TOTAL weight = per-piece × quantity (rounded 2dp). */
  fweight: number;
  /** fvolume — this box's TOTAL คิว = per-piece × quantity (rounded 6dp · mig 0192). */
  fvolume: number;
  fwidth: number;
  flength: number;
  fheight: number;
  /** famount — this box's pieces count. */
  famount: number;
};

/** Why an aggregate row was NOT split (for logging + the backfill dry-run print). */
export type SplitSkipReason =
  | "already_billed"        // fstatus 5/6/7
  | "has_reforder"          // linked to a ฝากสั่งซื้อ order
  | "already_priced"        // ftotalprice > 0 (money already on the row)
  | "not_multi_box"         // ≤1 box in momo_box_detail (nothing to split)
  | "qty_mismatch"          // Σ box quantity ≠ famount (would change pieces)
  | "weight_mismatch"       // Σ box weight ≉ fweight (would change money basis)
  | "cbm_mismatch"          // Σ box cbm ≉ fvolume (would change money basis)
  | "not_bare_base";        // ftrackingchn already carries a suffix (unexpected)

export type BoxSplitDecision =
  | { split: true; rows: BoxRowPlan[] }
  | { split: false; reason: SplitSkipReason };

const BILLED_FSTATUS = new Set(["5", "6", "7"]);

/** Round to 2dp (weight/dims — tb_forwarder numeric(14,2)). */
function r2(n: number): number {
  const v = Number(n);
  return Number.isFinite(v) ? Number(v.toFixed(2)) : 0;
}
/** Round to 6dp (fvolume — tb_forwarder numeric(14,6) since mig 0192). */
function r6(n: number): number {
  const v = Number(n);
  return Number.isFinite(v) ? Number(v.toFixed(6)) : 0;
}
/** Pieces count — floored at 1 (a box is at least one piece). */
function piecesOf(q: number): number {
  const n = Math.round(Number(q));
  return Number.isFinite(n) && n > 0 ? n : 1;
}
/** Relative difference |a-b| / max(|a|,|b|); 0 when both are 0. */
function relDiff(a: number, b: number): number {
  const denom = Math.max(Math.abs(a), Math.abs(b));
  if (denom === 0) return 0;
  return Math.abs(a - b) / denom;
}

/** Strip a numeric "-i/n" (or "-i") split-suffix → the BASE tracking. Mirrors
 *  baseTrackingOf / momo-bill-header.baseTracking (SEA isn't digits → left intact). */
export function baseOf(tracking: string): string {
  return (tracking ?? "").trim().replace(/-\d+(\/\d+)?$/, "");
}

/** The numeric split-suffix (box number); 0 when there is none (the base row). */
export function suffixOf(tracking: string): number {
  const m = /-(\d+)(?:\/\d+)?$/.exec((tracking ?? "").trim());
  return m ? Number(m[1]) : 0;
}

/**
 * Decide whether — and HOW — to split ONE aggregate tb_forwarder row into N
 * sibling box rows, from its momo_box_detail boxes.
 *
 * The MONEY-NEUTRAL guard (all must hold, else `{ split:false, reason }`):
 *   1. NOT billed (fstatus ∉ 5/6/7) — never regroup/re-price a billing row.
 *   2. NO reforder — a linked ฝากสั่งซื้อ complicates the arrival trigger; leave it.
 *   3. NOT priced (ftotalprice ≤ 0) — never re-price a row that already carries money.
 *   4. ftrackingchn is the BARE base (no suffix) — a suffixed row is already split.
 *   5. > 1 box in momo_box_detail — nothing to split otherwise.
 *   6. Σ box pieces === famount (EXACT) — the split must not change the pieces count.
 *   7. Σ box weight ≈ fweight AND Σ box cbm ≈ fvolume (within `relTolerance`, default
 *      2%) — the split must preserve the SELL-price basis (คิวรวม/น้ำหนักรวม). If
 *      box_detail disagrees with the aggregate, splitting would move money → refuse.
 *
 * When it splits: the FIRST box (sorted by suffix, then tracking) keeps the BARE
 * base tracking (isAnchor=true → the writer UPDATEs the aggregate in place, keeping
 * its id + the momo_import_tracks linkage + suffix-0 เหมาๆ anchor). Each remaining
 * box gets its own suffixed tracking (isAnchor=false → INSERT). Every row carries
 * its OWN box TOTAL metrics (per-piece × qty), so Σ across the rows == the aggregate.
 */
export function planBoxRowSplit(
  agg: AggregateRowInput,
  boxes: readonly BoxDetailInput[],
  relTolerance = 0.02,
): BoxSplitDecision {
  // 1. never touch a billing row.
  if (BILLED_FSTATUS.has((agg.fstatus ?? "").trim())) {
    return { split: false, reason: "already_billed" };
  }
  // 2. leave rows linked to a ฝากสั่งซื้อ order.
  if ((agg.reforder ?? "").trim() !== "") {
    return { split: false, reason: "has_reforder" };
  }
  // 3. never re-price a row that already carries a bill amount.
  if (Number(agg.ftotalprice) > 0) {
    return { split: false, reason: "already_priced" };
  }
  // 4. the aggregate must be the bare base (a suffixed row is already a sibling).
  if (suffixOf(agg.ftrackingchn) !== 0) {
    return { split: false, reason: "not_bare_base" };
  }

  // De-dupe boxes by exact tracking (defensive — the caller may pass repeats), and
  // sort by the numeric suffix (then tracking) so the anchor is deterministic.
  const byBox = new Map<string, BoxDetailInput>();
  for (const b of boxes) {
    const t = (b.boxTracking ?? "").trim();
    if (!t) continue;
    byBox.set(t, b);
  }
  const uniq = Array.from(byBox.values()).sort(
    (a, b) => suffixOf(a.boxTracking) - suffixOf(b.boxTracking) || a.boxTracking.localeCompare(b.boxTracking),
  );

  // 5. must be a genuine multi-box tracking.
  if (uniq.length <= 1) {
    return { split: false, reason: "not_multi_box" };
  }

  // Compute each box TOTAL (per-piece × qty) + the Σ across boxes.
  let sumWeight = 0;
  let sumCbm = 0;
  let sumQty = 0;
  const boxTotals = uniq.map((b) => {
    const qty = piecesOf(b.quantity);
    const wt = r2((Number(b.weightKgPerPiece) || 0) * qty);
    const cbm = r6((Number(b.cbmPerPiece) || 0) * qty);
    sumWeight += wt;
    sumCbm += cbm;
    sumQty += qty;
    return {
      boxTracking: (b.boxTracking ?? "").trim(),
      fweight: wt,
      fvolume: cbm,
      fwidth: r2(b.width),
      flength: r2(b.length),
      fheight: r2(b.height),
      famount: qty,
    };
  });

  // 6. pieces count must be preserved EXACTLY.
  if (sumQty !== Math.round(Number(agg.famount))) {
    return { split: false, reason: "qty_mismatch" };
  }
  // 7. money basis (weight + คิว) must be preserved within tolerance.
  if (relDiff(sumWeight, Number(agg.fweight) || 0) > relTolerance) {
    return { split: false, reason: "weight_mismatch" };
  }
  if (relDiff(sumCbm, Number(agg.fvolume) || 0) > relTolerance) {
    return { split: false, reason: "cbm_mismatch" };
  }

  // Build the plan: the FIRST box becomes the anchor (keeps the BARE base tracking +
  // the aggregate row's id/linkage); the rest get their own suffixed tracking.
  const base = baseOf(agg.ftrackingchn);
  const rows: BoxRowPlan[] = boxTotals.map((b, i) => ({
    // Anchor keeps the BARE base (suffix 0 = เหมาๆ anchor + committed_forwarder_id link).
    ftrackingchn: i === 0 ? base : b.boxTracking,
    isAnchor: i === 0,
    fweight: b.fweight,
    fvolume: b.fvolume,
    fwidth: b.fwidth,
    flength: b.flength,
    fheight: b.fheight,
    famount: b.famount,
  }));

  return { split: true, rows };
}
