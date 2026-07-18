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
  /**
   * ftotalprice — the aggregate's SELL freight. When ≤0 the row is UNPRICED and
   * splits with each sibling reset to 0 (re-priced later from its own คิว). When >0
   * the row is PRICED: splittable ONLY under `opts.allowPriced` (the human-triggered
   * button/backfill), and then the total is PRESERVED — split proportionally across
   * boxes so Σ(sibling ftotalprice) === this aggregate exactly (money-neutral).
   */
  ftotalprice: number;
  /** famount — the aggregate pieces count (must equal Σ box quantity UNLESS folded). */
  famount: number;
  /**
   * famountcount — '1' = รวมกล่อง (the row is FOLDED: famount is a combined marker, usually
   * 1, NOT the real piece count · the real count is in momo_box_detail). When folded, the
   * Σ-pieces-must-equal-famount guard is RELAXED (the split restores the real per-box count).
   * famount is display-only (not in ANY bill formula) so this is money-safe.
   */
  famountcount?: string | null;
  /** fweight — the aggregate TOTAL weight (must ≈ Σ box total weight). */
  fweight: number;
  /** fvolume — the aggregate TOTAL คิว (must ≈ Σ box total cbm). */
  fvolume: number;
  /** frefrate — the SELL rate (฿/คิว or ฿/kg) · COPIED onto each priced sibling. */
  frefrate?: number | string | null;
  /** frefprice — the pricing-basis flag ('2'=คิว/CBM · else kg) · copied onto siblings. */
  frefprice?: number | string | null;
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
  /**
   * PRICED split ONLY (decision.priced === true): this box's PRESERVED SELL freight —
   * a proportional share of the aggregate ftotalprice (Σ across siblings === the
   * aggregate exactly · anchor absorbs the satang remainder). The writer writes this
   * verbatim and does NOT re-price from the live rate (that would move money). For an
   * UNPRICED split these three are undefined and the writer resets price to 0 +
   * re-prices each box from its own คิว.
   */
  ftotalprice?: number;
  /** PRICED split: the aggregate's frefrate copied onto this box (display + future edit). */
  frefrate?: number | string | null;
  /** PRICED split: the aggregate's frefprice (basis) copied onto this box. */
  frefprice?: number | string | null;
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
  | { split: true; priced: boolean; rows: BoxRowPlan[] }
  | { split: false; reason: SplitSkipReason };

/** Options for planBoxRowSplit. */
export type BoxSplitOptions = {
  /**
   * Allow splitting a PRICED aggregate (ftotalprice>0) money-neutrally (the total is
   * preserved · split proportionally). DEFAULT false → the automatic MOMO-Live cron
   * pass NEVER touches a priced row (unchanged behaviour · no surprise mass-split);
   * ONLY the human-triggered button + the backfill pass allowPriced:true. An UNBILLED
   * guard (fstatus 1-4) + no-reforder still hold — a billed row is never split.
   */
  allowPriced?: boolean;
  /** The weight/คิว-match tolerance for the money-basis guard (default 2%). */
  relTolerance?: number;
};

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
/** Round THB to 2 satang (money). */
function money2(n: number): number {
  const v = Number(n);
  return Number.isFinite(v) ? Math.round(v * 100) / 100 : 0;
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

/**
 * Allocate a TOTAL across `shares` so Σ(out) === total EXACTLY (index 0 — the anchor —
 * absorbs the rounding remainder). Used by the dims fallback to spread the trusted
 * aggregate fweight/fvolume across boxes money-neutrally. Zero/empty shares → the anchor
 * takes the whole total (defensive; the caller only calls when Σshares > 0).
 */
function allocateExact(total: number, shares: readonly number[], round: (n: number) => number): number[] {
  const sum = shares.reduce((a, b) => a + b, 0);
  if (!(sum > 0)) return shares.map((_, i) => (i === 0 ? round(total) : 0));
  const out = shares.map((s, i) => (i === 0 ? 0 : round((total * s) / sum)));
  const rest = out.reduce((a, b, i) => (i === 0 ? a : a + b), 0);
  out[0] = round(total - rest);
  return out;
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
 *   3. PRICE: an UNPRICED row (ftotalprice ≤ 0) always splits (each sibling re-prices
 *      from its own คิว). A PRICED row (ftotalprice > 0) splits ONLY under
 *      `opts.allowPriced` — and then the total is PRESERVED (split proportionally so
 *      Σ(sibling ftotalprice) === the aggregate exactly · money-neutral), NOT re-priced.
 *      Without allowPriced a priced row is refused (`already_priced`) — that's what the
 *      automatic cron pass does, so it never surprise-touches money.
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
  opts: BoxSplitOptions = {},
): BoxSplitDecision {
  const relTolerance = opts.relTolerance ?? 0.02;
  const priced = Number(agg.ftotalprice) > 0;
  // 1. never touch a billing row (fstatus 5/6/7) — the hardest money guard.
  if (BILLED_FSTATUS.has((agg.fstatus ?? "").trim())) {
    return { split: false, reason: "already_billed" };
  }
  // 2. leave rows linked to a ฝากสั่งซื้อ order.
  if ((agg.reforder ?? "").trim() !== "") {
    return { split: false, reason: "has_reforder" };
  }
  // 3. a PRICED row (money already on it) splits ONLY when the caller opts in
  //    (allowPriced — the human-triggered button/backfill). The automatic cron pass
  //    leaves it → `already_priced`. When allowed, the split PRESERVES the total
  //    (proportional · Σ === aggregate exactly), computed below.
  if (priced && !opts.allowPriced) {
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

  // 6. pieces count must be preserved EXACTLY — UNLESS the aggregate is FOLDED.
  //    A folded row (รวมกล่อง · famountcount='1', or famount≤1 while box_detail has >1 box)
  //    stores famount as a COMBINED marker (usually 1), NOT the real piece count — the real
  //    count is in momo_box_detail. Splitting INTENDS to restore that count (Σ box qty), so
  //    the exact-match would wrongly refuse EVERY folded aggregate (the whole target set).
  //    famount is display-only (NOT in any bill formula — verified outstanding.ts +
  //    forwarder-debit-total.ts), so relaxing it moves NO money. A NON-folded row keeps the
  //    exact match (a real Σ≠famount there means box_detail genuinely disagrees → refuse).
  const isFolded =
    (agg.famountcount ?? "").trim() === "1" ||
    (Math.round(Number(agg.famount)) <= 1 && uniq.length > 1);
  if (!isFolded && sumQty !== Math.round(Number(agg.famount))) {
    return { split: false, reason: "qty_mismatch" };
  }
  // 7. money basis (weight + คิว) must be preserved within tolerance — OR reconstructable
  //    from the RELIABLE per-box DIMENSIONS when the stored weight/คิว disagree.
  //
  // 💥 THE FOLDED-DISCOVERY BUG (verified prod 760234506976 / fwd 52167, PR079):
  //    momo_box_detail can carry a MIX of conventions across a folded MOMO row's boxes —
  //    the bare-base box stores weight_kg/cbm PER-PIECE while the "-i" siblings store the
  //    box TOTAL (MOMO's own Live scrape is inconsistent per box). Multiplying every box
  //    by quantity then over-counts the total ×qty (Σ weight 1901 vs the true 172.5), so
  //    the stored-based guard REFUSES a split that is actually fine — "แตกกล่องไม่ได้".
  //
  //    But the DIMENSIONS (ก×ย×ส) are per-piece on EVERY box, so Σ(w×l×h×qty) reconciles
  //    the trusted aggregate fvolume. For the HUMAN button ONLY (opts.allowPriced — never
  //    the unattended cron) we fall back to that dimensional signal: allocate the trusted
  //    aggregate fweight/fvolume PROPORTIONALLY by each box's dims-volume share so Σ ===
  //    the aggregate EXACTLY (anchor absorbs the remainder → money-neutral). The bill is
  //    the PRESERVED ftotalprice (priced) or a re-price whose Σคิว === the aggregate
  //    (unpriced) — unchanged either way. Per-box fweight is then a dims-proportional
  //    estimate (display-only for a priced row · editable per box — the whole point of
  //    splitting), and each box carries its OWN dims + real qty so staff can fix them.
  const aggWeight = Number(agg.fweight) || 0;
  const aggVolume = Number(agg.fvolume) || 0;
  const weightOk = relDiff(sumWeight, aggWeight) <= relTolerance;
  const cbmOk = relDiff(sumCbm, aggVolume) <= relTolerance;

  // effTotals = the per-box TOTAL metrics the split WRITES. Normally == boxTotals (stored),
  // so the proven path is byte-unchanged; the dims fallback only rewrites them when the
  // stored metrics fail to reconcile AND the human button is driving the split.
  let effTotals = boxTotals;
  if (!weightOk || !cbmOk) {
    const allDims = uniq.every((b) => Number(b.width) > 0 && Number(b.length) > 0 && Number(b.height) > 0);
    // box TOTAL dims-volume = (w×l×h / 1e6) × pieces (famount = piecesOf(qty)).
    const dimVols = boxTotals.map((bt, i) => {
      const u = uniq[i];
      return ((Number(u.width) * Number(u.length) * Number(u.height)) / 1_000_000) * bt.famount;
    });
    const sumDimVol = dimVols.reduce((s, v) => s + v, 0);
    const dimsReconcile = allDims && sumDimVol > 0 && relDiff(sumDimVol, aggVolume) <= relTolerance;
    if (opts.allowPriced && dimsReconcile) {
      // allocate the trusted aggregate fvolume + fweight proportionally by dims-volume →
      // Σ === aggregate EXACTLY (anchor at index 0 absorbs the rounding remainder).
      const volAlloc = allocateExact(aggVolume, dimVols, r6);
      const wtAlloc = allocateExact(aggWeight, dimVols, r2);
      effTotals = boxTotals.map((bt, i) => ({ ...bt, fvolume: volAlloc[i], fweight: wtAlloc[i] }));
    } else if (!weightOk) {
      return { split: false, reason: "weight_mismatch" };
    } else {
      return { split: false, reason: "cbm_mismatch" };
    }
  }

  // Σ over effTotals (the dims fallback rewrote fweight/fvolume) for the price basis.
  const effSumCbm = effTotals.reduce((s, b) => s + b.fvolume, 0);
  const effSumWeight = effTotals.reduce((s, b) => s + b.fweight, 0);

  // For a PRICED split (allowPriced), split the FROZEN aggregate ftotalprice across
  // the boxes MONEY-NEUTRALLY: proportional to each box's share of the billed metric
  // (คิว when the shipment has volume, else weight, else pieces), with the ANCHOR box
  // (index 0) absorbing the satang remainder so Σ(box ftotalprice) === the aggregate
  // ftotalprice EXACTLY. Billing sums the STORED per-row ftotalprice (outstanding.ts
  // forwarderPriceFull + forwarder-debit-total.ts), so an exact Σ === the aggregate =
  // the customer's bill is byte-identical after the split (the per-box allocation is
  // internal). frefrate/frefprice are copied for display + a future per-box re-price.
  const priceShares: number[] = [];
  if (priced) {
    const total = money2(Number(agg.ftotalprice));
    let basis = effTotals.map((b) => b.fvolume);
    let basisSum = effSumCbm;
    if (!(basisSum > 0)) { basis = effTotals.map((b) => b.fweight); basisSum = effSumWeight; }
    if (!(basisSum > 0)) { basis = effTotals.map(() => 1); basisSum = effTotals.length; }
    // siblings (index ≥1) get their rounded proportional share; the anchor takes the rest.
    let siblingSum = 0;
    for (let i = 1; i < effTotals.length; i++) {
      const share = money2((total * basis[i]) / basisSum);
      priceShares[i] = share;
      siblingSum += share;
    }
    priceShares[0] = money2(total - siblingSum); // anchor absorbs the remainder → Σ === total
  }

  // Build the plan: the FIRST box becomes the anchor (keeps the BARE base tracking +
  // the aggregate row's id/linkage); the rest get their own suffixed tracking.
  const base = baseOf(agg.ftrackingchn);
  const rows: BoxRowPlan[] = effTotals.map((b, i) => ({
    // Anchor keeps the BARE base (suffix 0 = เหมาๆ anchor + committed_forwarder_id link).
    ftrackingchn: i === 0 ? base : b.boxTracking,
    isAnchor: i === 0,
    fweight: b.fweight,
    fvolume: b.fvolume,
    fwidth: b.fwidth,
    flength: b.flength,
    fheight: b.fheight,
    famount: b.famount,
    ...(priced
      ? { ftotalprice: priceShares[i], frefrate: agg.frefrate ?? 0, frefprice: agg.frefprice ?? "0" }
      : {}),
  }));

  return { split: true, priced, rows };
}

// ═════════════════════════════════════════════════════════════════════════════
// RESIDUE ABSORB — complete a HALF-SPLIT shipment (owner 2026-07-18 · PR050
// 519218029029 "มีแค่ 2 กล่อง แต่ระบบแสดง 4 · ไม่เบิ้ลกล่อง ก็เบิ้ลคิว เบิ้ลน้ำหนัก").
//
// THE STATE THIS HEALS: a bare AGGREGATE tb_forwarder row (full shipment metrics)
// coexists with a FULL set of suffixed box rows ("-1/n".."-n/n") for the SAME base.
// It arises when MOMO RE-KEYS a parcel mid-flight: the import feed first returns the
// bare base (committed → aggregate row), then later returns the same parcel as
// "-1/n".."-n/n" staging rows, each committed as its OWN independent row (pre-Fix-F
// backlog · or any future path that slips the chokepoint). Every group Σ (boxes /
// weight / คิว / cost) then DOUBLE-COUNTS — หน้าบ้าน + หลังบ้าน both read the same
// wrong rows, so both show the doubled numbers.
//
// WHY THE SPLIT'S OWN IDEMPOTENT SKIP CAN'T HEAL IT: splitAggregatedMomoBoxRows sees
// "a suffixed sibling exists" → skipped.already_split → the aggregate is cemented
// forever. This planner distinguishes the two states PRECISELY:
//
//   PROPER SPLIT  = bare anchor carries BOX 1 + siblings start at "-2/n"
//                   (planBoxRowSplit NEVER creates a "-1/n" row — box 1 lives on
//                   the bare anchor) → NOT residue → leave intact.
//   RESIDUE       = a live "-1/n" (suffix === 1) row exists ALONGSIDE the bare row
//                   → the box-1 row exists separately → the bare row is the stale
//                   pre-split aggregate (or an empty re-key header).
//
// THE CONVERSION (→ the canonical split shape · anchor keeps id + bare tracking +
// the momo_import_tracks linkage + suffix-0 เหมาๆ anchor):
//   - anchor (the bare row) ADOPTS box-1's per-box payload; the "-1/n" row is DELETED
//     (the writer re-points its staging committed_forwarder_id to the anchor so the
//     dangling-ptr re-commit engine can never fire).
//   - "-2/n".."-n/n" rows stay as-is.
//   - MONEY: Σ(sell) across the group is PRESERVED EXACTLY —
//       · bare priced + sibs unpriced → allocate the bare's frozen total across the
//         boxes (คิว-first basis · anchor absorbs the satang remainder) — allowPriced
//         callers only (the human-supervised sweep), NEVER the unattended cron.
//       · all unpriced → convert; the caller re-prices each row from its OWN คิว.
//       · sibs carry sell (ambiguous double-money state) → REFUSE + flag for a human.
//   - An EMPTY bare (0 weight · 0 pieces · ฿0 — the re-key header that never got
//     data) adopts box-1's payload VERBATIM incl. its price columns (row-identity
//     swap · Σ unchanged by construction).
// ═════════════════════════════════════════════════════════════════════════════

/** One LIVE tb_forwarder row of the residue group (bare + suffixed siblings). */
export type ResidueRowInput = {
  id: number;
  ftrackingchn: string;
  fstatus: string;
  reforder: string;
  paydeposit?: string | null;
  advanceBillConfirmed?: string | null;
  fweight: number;
  fvolume: number;
  fwidth: number;
  flength: number;
  fheight: number;
  famount: number;
  famountcount?: string | null;
  ftotalprice: number;
  frefrate?: number | string | null;
  frefprice?: number | string | null;
  fcosttotalprice?: number;
};

export type ResidueSkipReason =
  | "billed_or_settled"     // any row fstatus 5/6/7/99 · paydeposit='1' · advance-confirmed
  | "has_reforder"          // any row linked to a ฝากสั่งซื้อ
  | "no_box1_sib"           // no suffix-1 row → not the residue signature (proper split)
  | "sibs_priced"           // a sibling carries sell → ambiguous money state → human
  | "bare_priced_needs_optin" // bare carries sell; caller didn't pass allowPriced (cron)
  | "qty_mismatch"          // Σ sib pieces ≠ bare famount (not a full-coverage residue)
  | "weight_mismatch"       // Σ sib weight ≉ bare fweight
  | "cbm_mismatch";         // Σ sib คิว ≉ bare fvolume

export type ResidueAbsorbDecision =
  | {
      absorb: true;
      mode: "bare-priced" | "unpriced" | "empty-bare";
      /** Per-box payload the bare ANCHOR row adopts (box 1). */
      anchorPatch: {
        fweight: number; fvolume: number; fwidth: number; flength: number;
        fheight: number; famount: number;
        ftotalprice: number; frefrate: number | string | null; frefprice: number | string | null;
      };
      /** bare-priced mode: allocated shares for the surviving suffixed rows. */
      sibPatches: Array<{ id: number; ftotalprice: number; frefrate: number | string | null; frefprice: number | string | null }>;
      /** The "-1/n" row to DELETE (its payload moved onto the anchor). */
      deleteSibId: number;
      /** Suffixed rows (≥2) that survive — for the writer's cost-dedup sweep. */
      surviveSibIds: number[];
    }
  | { absorb: false; reason: ResidueSkipReason };

const RESIDUE_FILLABLE = new Set(["1", "2", "3", "4"]);

/**
 * Decide whether — and HOW — to absorb a half-split residue group back into the
 * canonical split shape. PURE (unit-testable); the writer applies the decision.
 *
 * @param bare  the suffix-0 aggregate row
 * @param sibs  every LIVE suffixed row of the same base (any order)
 */
export function planResidueAbsorb(
  bare: ResidueRowInput,
  sibs: readonly ResidueRowInput[],
  opts: BoxSplitOptions = {},
): ResidueAbsorbDecision {
  const relTolerance = opts.relTolerance ?? 0.02;

  // ── hard money guards — EVERY row must be untouched by billing/settlement ──
  const all = [bare, ...sibs];
  for (const r of all) {
    if (!RESIDUE_FILLABLE.has((r.fstatus ?? "").trim())) return { absorb: false, reason: "billed_or_settled" };
    if ((r.paydeposit ?? "").trim() === "1") return { absorb: false, reason: "billed_or_settled" };
    if ((r.advanceBillConfirmed ?? "").trim() === "1") return { absorb: false, reason: "billed_or_settled" };
    if ((r.reforder ?? "").trim() !== "") return { absorb: false, reason: "has_reforder" };
  }

  // ── the residue signature: a live suffix-1 row (proper splits never have one) ──
  const sorted = [...sibs].sort(
    (a, b) => suffixOf(a.ftrackingchn) - suffixOf(b.ftrackingchn) || a.ftrackingchn.localeCompare(b.ftrackingchn),
  );
  const box1 = sorted[0];
  if (!box1 || suffixOf(box1.ftrackingchn) !== 1) return { absorb: false, reason: "no_box1_sib" };
  const survivors = sorted.slice(1);

  const barePriced = Number(bare.ftotalprice) > 0;
  const sibsPriced = sorted.some((s) => Number(s.ftotalprice) > 0);
  const bareEmpty =
    !(Number(bare.fweight) > 0) && !(Number(bare.famount) > 0) &&
    !barePriced && !(Number(bare.fcosttotalprice ?? 0) > 0);

  // ── EMPTY bare (re-key header that never got data): row-identity swap ──
  // box-1's payload — incl. its OWN price columns — moves onto the anchor verbatim;
  // Σ across the group is unchanged by construction (no allocation, no guard needed).
  if (bareEmpty) {
    return {
      absorb: true,
      mode: "empty-bare",
      anchorPatch: {
        fweight: r2(box1.fweight), fvolume: r6(box1.fvolume),
        fwidth: r2(box1.fwidth), flength: r2(box1.flength), fheight: r2(box1.fheight),
        famount: piecesOf(box1.famount),
        ftotalprice: money2(box1.ftotalprice), frefrate: box1.frefrate ?? 0, frefprice: box1.frefprice ?? "0",
      },
      sibPatches: [],
      deleteSibId: box1.id,
      surviveSibIds: survivors.map((s) => s.id),
    };
  }

  // ── WEIGHTED bare (the duplicated aggregate): full-coverage Σ guards ──
  if (sibsPriced) return { absorb: false, reason: "sibs_priced" };

  const sumQty = sorted.reduce((s, b) => s + piecesOf(b.famount), 0);
  const sumWeight = sorted.reduce((s, b) => s + (Number(b.fweight) || 0), 0);
  const sumCbm = sorted.reduce((s, b) => s + (Number(b.fvolume) || 0), 0);
  const isFolded = (bare.famountcount ?? "").trim() === "1";
  if (!isFolded && sumQty !== Math.round(Number(bare.famount))) {
    return { absorb: false, reason: "qty_mismatch" };
  }
  if (relDiff(sumWeight, Number(bare.fweight) || 0) > relTolerance) {
    return { absorb: false, reason: "weight_mismatch" };
  }
  if (relDiff(sumCbm, Number(bare.fvolume) || 0) > relTolerance) {
    return { absorb: false, reason: "cbm_mismatch" };
  }

  // ── money: preserve the bare's frozen total EXACTLY (คิว-first basis) ──
  if (barePriced && !opts.allowPriced) return { absorb: false, reason: "bare_priced_needs_optin" };

  let anchorPrice = 0;
  const patches: Array<{ id: number; ftotalprice: number; frefrate: number | string | null; frefprice: number | string | null }> = [];
  if (barePriced) {
    const total = money2(Number(bare.ftotalprice));
    let basis = sorted.map((b) => Number(b.fvolume) || 0);
    let basisSum = basis.reduce((s, v) => s + v, 0);
    if (!(basisSum > 0)) { basis = sorted.map((b) => Number(b.fweight) || 0); basisSum = basis.reduce((s, v) => s + v, 0); }
    if (!(basisSum > 0)) { basis = sorted.map(() => 1); basisSum = sorted.length; }
    let survivorSum = 0;
    for (let i = 1; i < sorted.length; i++) {
      const share = money2((total * basis[i]) / basisSum);
      patches.push({ id: sorted[i].id, ftotalprice: share, frefrate: bare.frefrate ?? 0, frefprice: bare.frefprice ?? "0" });
      survivorSum = money2(survivorSum + share);
    }
    anchorPrice = money2(total - survivorSum); // anchor absorbs the remainder → Σ === total
  }

  return {
    absorb: true,
    mode: barePriced ? "bare-priced" : "unpriced",
    anchorPatch: {
      fweight: r2(box1.fweight), fvolume: r6(box1.fvolume),
      fwidth: r2(box1.fwidth), flength: r2(box1.flength), fheight: r2(box1.fheight),
      famount: piecesOf(box1.famount),
      ftotalprice: anchorPrice,
      frefrate: barePriced ? (bare.frefrate ?? 0) : 0,
      frefprice: barePriced ? (bare.frefprice ?? "0") : "0",
    },
    sibPatches: patches,
    deleteSibId: box1.id,
    surviveSibIds: survivors.map((s) => s.id),
  };
}
