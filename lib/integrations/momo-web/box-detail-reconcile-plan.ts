/**
 * ════════════════════════════════════════════════════════════════════════════
 * MOMO box-count SELF-HEAL — PURE plan + the money-safe corroboration guard
 * (owner 2026-07-16 · "fix the SOURCE so the WHOLE class can never recur").
 *
 * WHY THIS EXISTS (the whole-class prevention)
 * ────────────────────────────────────────────
 * tb_forwarder should MIRROR momo_box_detail — for a multi-box base tracking, ONE
 * "-N/M" row per box (each carrying its own per-box weight/คิว/qty), plus the bare
 * base anchor. But partial/duplicate splits, a re-commit that re-creates a bare,
 * a dangling committed_forwarder_id staging pointer, a manual box edit, or a
 * backfill can each leave tb_forwarder in ONE of two corrupt shapes:
 *
 *   (a) a LEFTOVER aggregate-weight BARE base — a bare (no "-N/M" suffix) that
 *       carries the WHOLE-shipment aggregate (famount/fweight = Σ boxes) while its
 *       real "-N/M" box siblings ALSO exist → double-counts boxes AND weight.
 *       (prod 1783582989/52559: bare fweight 58 = Σ its 4 boxes, price 0.)
 *   (b) a CORRUPT "-N/M" DETAIL row that carries the group AGGREGATE instead of its
 *       own box (famount inflated + fweight/คิว == the bare aggregate) → over-priced.
 *       (prod 519218029029: -1/2 AND -2/2 both carry 36.5 = 16.5+20 = the aggregate.)
 *
 * The existing split pass (split-box-rows.ts) is IDEMPOTENT — once a base has ANY
 * "-N/M" sibling it returns "already_split" and NEVER re-touches. So a base that got
 * corrupted (a partial split, a re-commit, a manual edit, a backfill) stays corrupt
 * FOREVER. No single path owns "make tb_forwarder match momo_box_detail" → the
 * corruption re-appears. THIS module is that owner: a self-healing reconciliation
 * that CONVERGES each multi-box group to the momo_box_detail truth every cron.
 *
 * 💰 MONEY-SAFETY — this is the CONSERVATIVE guard (ported from the proven data-fix
 *    scripts/fix-momo-boxcount-corrupt-2026-07-16.mjs). Every touch is UNBILLED-ONLY,
 *    corroborated by momo_box_detail, and never a money-carrying anchor:
 *   - UNBILLED ONLY: fstatus ∉ {5,6,7} (never a row in/through billing · the cron's
 *     universal billing gate · MORE conservative than the one-off script's {6,7}).
 *   - NEVER a money-carrying BARE: a bare with ftotalprice>0 is a REAL priced anchor
 *     (the PRICED-ANCHOR model, e.g. 519218029029/PR050 bare price 730) → NEVER zeroed,
 *     and a detail row under a priced bare is NEVER auto-fixed (a DELETE + money
 *     decision · owner-review).
 *   - momo_box_detail must CORROBORATE: the bare's fweight must ≈ Σ(true per-box
 *     weight = weight_kg×qty) within tolerance. This REFUSES the "MOMO มั่ว" cases
 *     (PR067 1782555393 / PR075 1783051207 / PR047 1782113771) where weight_kg×qty is
 *     a physically-impossible ×N over the stored fweight — applying it would 5-40×
 *     over-charge. When momo doesn't reconcile → REVIEW, never a write.
 *   - BARE-ZERO also requires the SIBLINGS ALONE to already cover the shipment weight
 *     (Σ sibling fweight ≈ Σ momo), so zeroing the redundant bare provably loses NO
 *     weight (the boxes are already fully represented). A properly-split base (bare =
 *     box-1 anchor · siblings = boxes 2..N) fails BOTH corroborations → left intact.
 *   - PRICED DETAIL fix auto-applies ONLY with a corroborating identical-dims TWIN
 *     (the re-priced value matches the twin box's price); without a twin → REVIEW
 *     (never guess money on an unattended cron). UNPRICED detail fix sets the metrics
 *     and the writer re-prices from its own คิว via the proven engine.
 *   - IDEMPOTENT: a healthy base is a no-op. Best-effort: the writer never throws.
 *
 * This is a PURE module (no DB · no "server-only") so the whole DECISION — which rows
 * to fix/zero, the truth metrics, and every money guard — is unit-tested under plain
 * `tsx`. The SQL writer (box-detail-reconcile.ts) applies the plan this returns.
 *
 * @see lib/integrations/momo-web/box-detail-reconcile.ts  — the SQL writer (applies the plan)
 * @see lib/integrations/momo-web/box-detail-basis.ts       — resolveMomoBoxBasis (THE per-box total decider)
 * @see lib/admin/momo-bill-header.ts                       — the count-display SOT (drops a money-0 bare)
 * @see lib/integrations/momo-web/box-detail-recompute.ts   — the per-box คิว/kg math (shared idioms)
 * @see scripts/fix-momo-boxcount-corrupt-2026-07-16.mjs    — the one-off data-fix these guards are ported from
 * @see scripts/audit-momo-self-heal-plan-2026-07-16.mjs    — the read-only blast-radius audit (mirrors this plan)
 * ════════════════════════════════════════════════════════════════════════════
 */

import { resolveMomoBoxBasis } from "./box-detail-basis";

/** One tb_forwarder row in a base+userid group (the money-relevant columns). */
export type ReconcileForwarderRow = {
  id: number;
  /** ftrackingchn — bare base (suffix 0) or a "-N/M" box sibling. */
  ftrackingchn: string;
  /** fstatus — {5,6,7} = in/through billing → untouchable. */
  fstatus: string | null;
  famount: number | string | null;
  famountcount?: string | null;
  fweight: number | string | null;
  fvolume: number | string | null;
  fwidth: number | string | null;
  flength: number | string | null;
  fheight: number | string | null;
  /** ftotalprice — the SELL freight; >0 on a bare = a priced anchor (never zeroed). */
  ftotalprice: number | string | null;
  frefrate: number | string | null;
  /** frefprice — pricing basis ('2' = คิว/CBM · else kg). */
  frefprice: number | string | null;
};

/** One momo_box_detail box (the per-box TRUTH).
 *
 *  ⚠️ weightKg/cbm carry NO fixed meaning — MOMO sends them per-piece on some rows and
 *  as the LINE TOTAL (already × quantity) on others. NEVER read them directly: route
 *  every box through `resolveMomoBoxBasis` (box-detail-basis.ts), which uses the dims
 *  to decide, and refuse the row when it cannot. */
export type ReconcileBox = {
  /** The exact split tracking as MOMO returns it ("<base>-3" / "<base>-3/6"). */
  boxTracking: string;
  width: number | string | null;
  length: number | string | null;
  height: number | string | null;
  /** weight (kg) — per-piece OR line-total · resolveMomoBoxBasis decides which. */
  weightKg: number | string | null;
  /** คิว — per-piece OR line-total · resolveMomoBoxBasis decides which. */
  cbm: number | string | null;
  quantity: number | string | null;
};

/** The truth metrics a corrupt detail row must be set to (its own momo box). */
export type DetailTruth = {
  famount: number;
  fweight: number;
  fvolume: number;
  fwidth: number;
  flength: number;
  fheight: number;
};

/** A "-N/M" detail row to CONVERGE to its momo box truth. */
export type DetailFix = {
  id: number;
  tracking: string;
  truth: DetailTruth;
  /** Was the row priced (ftotalprice>0)? A priced fix carries its own newPrice;
   *  an unpriced fix leaves price to the writer's engine re-price. */
  priced: boolean;
  /** For a priced fix: the re-priced ftotalprice (basis × frefrate on the TRUTH
   *  basis). 0 for an unpriced fix (the writer re-prices via computeAndFill…). */
  newPrice: number;
  /** The corroborating identical-dims twin (priced fixes only) — id + its price. */
  twinId: number | null;
  twinPrice: number | null;
};

/** Σ over the group's real momo boxes (suffix>0) — the shipment truth. */
export type TrueBoxTotals = {
  fweight: number;
  fvolume: number;
  famount: number;
  /** How many real boxes (suffix>0) fed the Σ. */
  count: number;
  /**
   * How many of those boxes had an UNPROVABLE per-piece-vs-line-total convention
   * (resolveMomoBoxBasis → decided:false · their Σ contribution fell back to the
   * legacy × qty reading). >0 ⇒ this Σ is NOT trustworthy as a money corroboration →
   * the plan refuses to zero a bare on it. (prod 2026-07-17: 0 across all 80 bases.)
   */
  undecided: number;
};

/** A redundant aggregate BARE base to ZERO (famount/fweight/fvolume → 0). */
export type BareZero = {
  id: number;
  tracking: string;
  trueSum: TrueBoxTotals;
};

/** A row the plan REFUSES to auto-heal (money-sensitive / momo-suspect / ambiguous). */
export type ReconcileReview = {
  /** Machine-readable refusal reason. */
  kind: ReconcileReviewKind;
  id: number;
  tracking: string;
};

export type ReconcileReviewKind =
  | "box_basis_undecidable"              // dims can't prove per-piece vs line-total → never guess a money basis
  | "weight_vol_only_momo_suspect"       // detail weight/คิว ≠ momo but famount NOT inflated → MOMO มั่ว → refuse
  | "aggregate_on_detail_no_bare"        // detail carries the aggregate but there is no bare base
  | "priced_anchor_bare"                 // the bare carries money (priced anchor) → detail needs a money decision
  | "amount_inflated_not_bare_aggregate" // detail famount inflated but does NOT copy the bare aggregate
  | "momo_does_not_reconcile_aggregate"  // bare.fweight ≉ Σ(momo weight_kg×qty) → MOMO มั่ว → refuse
  | "priced_no_twin_corroboration"       // priced detail fix has no identical-dims twin to corroborate the money
  | "weighted_bare_not_clean_aggregate"  // weighted bare whose fweight ≉ Σ momo (not a clean aggregate)
  | "aggregate_bare_siblings_dont_cover"; // bare ≈ Σ momo but the sibling rows don't yet cover the shipment (converges next run)

export type BoxDetailReconcilePlan = {
  detailFixes: DetailFix[];
  bareZeroes: BareZero[];
  reviews: ReconcileReview[];
};

export type ReconcileOptions = {
  /** weight/คิว-match tolerance for the money-basis corroboration (default 2%). */
  relTolerance?: number;
};

// ── pure numeric helpers (mirror box-detail-recompute / split-box-rows-plan) ──
function num(v: number | string | null | undefined): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}
/** 2dp (weight/dims — tb_forwarder numeric(14,2)). */
function r2(n: number): number {
  const v = Number(n);
  return Number.isFinite(v) ? Number(v.toFixed(2)) : 0;
}
/** 6dp (fvolume — tb_forwarder numeric(14,6) since mig 0192). */
function r6(n: number): number {
  const v = Number(n);
  return Number.isFinite(v) ? Number(v.toFixed(6)) : 0;
}
/** Numeric "-i/n" (or "-i") split-suffix; 0 = bare base. */
export function suffixOf(tracking: string | null | undefined): number {
  const m = /-(\d+)(?:\/\d+)?$/.exec((tracking ?? "").trim());
  return m ? Number(m[1]) : 0;
}
/** Strip a numeric "-i/n" split-suffix → the base tracking. */
export function baseOf(tracking: string | null | undefined): string {
  return (tracking ?? "").trim().replace(/-\d+(?:\/\d+)?$/, "");
}
/** Relative difference |a-b| / max(|a|,|b|); 0 when both ~0. */
function relDiff(a: number, b: number): number {
  const denom = Math.max(Math.abs(a), Math.abs(b));
  if (denom < 1e-9) return 0;
  return Math.abs(a - b) / denom;
}

const BILLED_FSTATUS = new Set(["5", "6", "7"]);
function isBilled(fstatus: string | null | undefined): boolean {
  return BILLED_FSTATUS.has(String(fstatus ?? "").trim());
}

/**
 * Σ over the group's REAL momo boxes (suffix>0) — the shipment truth used to
 * corroborate an aggregate bare and to size a detail fix.
 *
 * Each box's TOTAL comes from the ONE decider (`resolveMomoBoxBasis`): MOMO's
 * weight_kg/cbm are per-piece on some rows and the LINE TOTAL on others, so the old
 * blind `× quantity` inflated the line-total ones (prod: Σ 82,829 ghost kg · owner
 * 2026-07-17 "GZE260627-1 น้ำหนักมั่ว"). A box whose convention the dims can't prove
 * still contributes its LEGACY value but is COUNTED in `undecided` so the caller can
 * refuse to spend this Σ as a money corroboration.
 */
export function trueBoxTotals(boxes: readonly ReconcileBox[]): TrueBoxTotals {
  let fweight = 0;
  let fvolume = 0;
  let famount = 0;
  let count = 0;
  let undecided = 0;
  for (const b of boxes) {
    if (suffixOf(b.boxTracking) <= 0) continue; // real boxes only (drop a bare header box)
    const basis = resolveMomoBoxBasis(b);
    fweight += basis.totalWeightKg;
    fvolume += basis.totalCbm;
    famount += basis.pieces;
    count += 1;
    if (!basis.decided) undecided += 1;
  }
  return { fweight: r2(fweight), fvolume: r6(fvolume), famount, count, undecided };
}

/**
 * Decide how to CONVERGE one base+userid group of tb_forwarder rows to the
 * momo_box_detail truth. Returns the detail fixes, bare zeroes, and the refused
 * (review) rows. PURE — no DB, no IO. The writer (box-detail-reconcile.ts) applies it.
 *
 * `group`  — every tb_forwarder row sharing (baseOf(tracking), userid).
 * `boxes`  — the momo_box_detail rows for that base (the per-box truth).
 */
export function planBoxDetailReconcile(
  group: readonly ReconcileForwarderRow[],
  boxes: readonly ReconcileBox[],
  opts: ReconcileOptions = {},
): BoxDetailReconcilePlan {
  const TOL = opts.relTolerance ?? 0.02;
  const detailFixes: DetailFix[] = [];
  const bareZeroes: BareZero[] = [];
  const reviews: ReconcileReview[] = [];

  // momo box_tracking → box (the truth for a detail row).
  const byBox = new Map<string, ReconcileBox>();
  for (const b of boxes) {
    const t = (b.boxTracking ?? "").trim();
    if (t) byBox.set(t, b);
  }
  const totals = trueBoxTotals(boxes);

  // the group's bare base row (suffix 0), if any.
  const bare = group.find((r) => suffixOf(r.ftrackingchn) === 0);
  const barePrice = bare ? num(bare.ftotalprice) : 0;
  const bareIsPricedAnchor = bare != null && barePrice > 0;

  // ── PROPER-SPLIT shape (owner rule 2026-07-18: "กล่อง 1 อยู่บน bare เสมอ · sibling
  //    เริ่ม -2/n") — box_detail carries a REAL box row for the base itself (decided
  //    basis · real weight) → the bare is BOX #1, not an aggregate header. The
  //    suffix-only `totals` drops that box, so the whole-shipment Σ = totalsAll.
  //    2026-07-20 PR179 incident: fillLiveDataForParcels (pre-fix) fanned the
  //    whole-shipment Σ onto EVERY row of such a family — this shape lets the heal
  //    converge it: each row (incl. the bare) → its OWN box truth. Never zeroed. ──
  const bareBox = boxes.find((b) => suffixOf(b.boxTracking) <= 0) ?? null;
  const bareBasis = bareBox ? resolveMomoBoxBasis(bareBox) : null;
  const properSplit =
    bare != null && bareBasis != null && bareBasis.decided && bareBasis.totalWeightKg > 0;
  const totalsAllWeight = properSplit && bareBasis ? r2(totals.fweight + bareBasis.totalWeightKg) : totals.fweight;
  const totalsAllFamount = properSplit && bareBasis ? totals.famount + bareBasis.pieces : totals.famount;

  // ── (b) CORRUPT "-N/M" DETAIL rows — converge to their own momo box truth ──
  for (const row of group) {
    if (suffixOf(row.ftrackingchn) <= 0) continue;   // suffixed detail rows only
    if (isBilled(row.fstatus)) continue;             // UNBILLED ONLY (billed = owner sign-off)
    const box = byBox.get((row.ftrackingchn ?? "").trim());
    if (!box) continue;                              // no momo truth to compare

    // THE decider — is this box's weight_kg/cbm per-piece or the line total? When the
    // dims can't prove it we must NOT write a money basis on a guess (fail-safe).
    const basis = resolveMomoBoxBasis(box);
    if (!basis.decided) {
      reviews.push({ kind: "box_basis_undecidable", id: row.id, tracking: row.ftrackingchn });
      continue;
    }
    const qty = basis.pieces;
    const truth: DetailTruth = {
      famount: qty,
      fweight: basis.totalWeightKg,
      fvolume: basis.totalCbm,
      fwidth: r2(num(box.width)),
      flength: r2(num(box.length)),
      fheight: r2(num(box.height)),
    };

    const curAmount = Math.round(num(row.famount));
    // The "aggregate-on-detail" signature: famount is INFLATED beyond the box's real
    // count (the row copied the whole-shipment count). A weight-only diff with a
    // correct famount is NOT this shape → it is the MOMO-มั่ว weight case → refuse.
    const amountInflated = curAmount !== truth.famount && curAmount > truth.famount;
    if (!amountInflated) {
      if (
        relDiff(num(row.fweight), truth.fweight) > TOL ||
        relDiff(num(row.fvolume), truth.fvolume) > TOL
      ) {
        // weight/คิว disagree but famount is right → MOMO's weight_kg is suspect
        // (per-piece-vs-total ambiguity · a ×N tonnage). NEVER auto-apply — refuse.
        reviews.push({ kind: "weight_vol_only_momo_suspect", id: row.id, tracking: row.ftrackingchn });
      }
      continue;
    }

    if (!bare) {
      reviews.push({ kind: "aggregate_on_detail_no_bare", id: row.id, tracking: row.ftrackingchn });
      continue;
    }
    if (bareIsPricedAnchor) {
      // PRICED-ANCHOR model: the bare carries money → the "-N/M" rows are botched
      // duplicates whose correct resolution is a DELETE + a money decision. Never here.
      reviews.push({ kind: "priced_anchor_bare", id: row.id, tracking: row.ftrackingchn });
      continue;
    }
    // corroboration 1: the detail row COPIED the bare's aggregate (famount + weight + คิว)
    // — OR (proper-split fanout · 2026-07-20 PR179) it copied the WHOLE-SHIPMENT Σ
    // (exact famount match + weight within TOL). The second form is bare-independent,
    // so a partially-healed family (bare already converged) still heals its siblings.
    const copiesAggregate =
      curAmount === Math.round(num(bare.famount)) &&
      relDiff(num(row.fweight), num(bare.fweight)) <= TOL &&
      relDiff(num(row.fvolume), num(bare.fvolume)) <= TOL;
    const copiesWholeShipment =
      properSplit &&
      totals.count > 1 &&
      curAmount === totalsAllFamount &&
      relDiff(num(row.fweight), totalsAllWeight) <= TOL;
    if (!copiesAggregate && !copiesWholeShipment) {
      reviews.push({ kind: "amount_inflated_not_bare_aggregate", id: row.id, tracking: row.ftrackingchn });
      continue;
    }
    // corroboration 2: momo RECONCILES the aggregate (bare.fweight ≈ Σ momo per-box).
    // REFUSES the MOMO-มั่ว case (Σ is a ×N tonnage vs the real bare). `undecided>0`
    // means some box's convention was unprovable, so the Σ is a guess → never spend it.
    // Classic shape: the BARE carries the suffix-only Σ. Proper-split fanout shape:
    // THE ROW ITSELF carries the whole-shipment Σ (incl. the bare's own box) — checked
    // against the row (not the bare) so a partially-healed bare can't strand siblings.
    const momoReconciles =
      totals.count > 1 &&
      totals.undecided === 0 &&
      (relDiff(num(bare.fweight), totals.fweight) <= TOL ||
        (properSplit && relDiff(num(row.fweight), totalsAllWeight) <= TOL));
    if (!momoReconciles) {
      reviews.push({ kind: "momo_does_not_reconcile_aggregate", id: row.id, tracking: row.ftrackingchn });
      continue;
    }

    const priced = num(row.ftotalprice) > 0;
    // re-price a priced row on its OWN truth basis (คิว→fvolume · else kg→fweight) × frefrate.
    const priceBasis = String(row.frefprice ?? "").trim() === "2" ? truth.fvolume : truth.fweight;
    const newPrice = priced ? r2(priceBasis * num(row.frefrate)) : 0;
    // extra corroboration for a PRICED fix: an identical-dims twin whose price matches
    // the re-price (money is not guessed on an unattended cron — no twin → review).
    const twin = group.find(
      (x) =>
        x.id !== row.id &&
        suffixOf(x.ftrackingchn) > 0 &&
        r2(num(x.fwidth)) === truth.fwidth &&
        r2(num(x.flength)) === truth.flength &&
        r2(num(x.fheight)) === truth.fheight &&
        relDiff(num(x.fweight), truth.fweight) <= TOL,
    );
    if (priced && (!twin || relDiff(newPrice, num(twin.ftotalprice)) > 0.01)) {
      reviews.push({ kind: "priced_no_twin_corroboration", id: row.id, tracking: row.ftrackingchn });
      continue;
    }

    detailFixes.push({
      id: row.id,
      tracking: row.ftrackingchn,
      truth,
      priced,
      newPrice,
      twinId: twin?.id ?? null,
      twinPrice: twin ? num(twin.ftotalprice) : null,
    });
  }

  // ── (c) PROPER-SPLIT bare carrying the WHOLE-SHIPMENT Σ — converge to its OWN box ──
  // (2026-07-20 PR179 fanout: fillLiveDataForParcels wrote the family Σ onto the bare
  // too. The bare is BOX #1 — it must hold its own box truth, NEVER be zeroed and
  // NEVER keep the family Σ.) Guards: unbilled · unpriced (a priced bare is the anchor
  // model → hands off) · momo Σ trustworthy · the bare provably carries the ALL-boxes Σ
  // and NOT the suffix-only Σ (that would be the classic zero-case, handled in (a)).
  let bareFixPlanned = false;
  if (properSplit && bare && bareBasis && bareBox && !isBilled(bare.fstatus) && !bareIsPricedAnchor) {
    const bareAmount = Math.round(num(bare.famount));
    const bareCarriesAll =
      totals.count > 1 &&
      totals.undecided === 0 &&
      relDiff(num(bare.fweight), totalsAllWeight) <= TOL &&
      relDiff(num(bare.fweight), totals.fweight) > TOL;
    const drifted =
      bareAmount > bareBasis.pieces || relDiff(num(bare.fweight), bareBasis.totalWeightKg) > TOL;
    if (bareCarriesAll && drifted) {
      detailFixes.push({
        id: bare.id,
        tracking: bare.ftrackingchn,
        truth: {
          famount: bareBasis.pieces,
          fweight: bareBasis.totalWeightKg,
          fvolume: bareBasis.totalCbm,
          fwidth: r2(num(bareBox.width)),
          flength: r2(num(bareBox.length)),
          fheight: r2(num(bareBox.height)),
        },
        priced: false,
        newPrice: 0,
        twinId: null,
        twinPrice: null,
      });
      bareFixPlanned = true;
    }
  }

  // ── (a) LEFTOVER aggregate-weight BARE base — zero it (redundant double-count) ──
  if (!bareFixPlanned && bare && !isBilled(bare.fstatus) && !bareIsPricedAnchor) {
    const siblings = group.filter((r) => suffixOf(r.ftrackingchn) > 0);
    const hasBoxSibling = siblings.length > 0;
    const alreadyZero =
      num(bare.fweight) === 0 && num(bare.fvolume) === 0 && Math.round(num(bare.famount)) === 0;
    if (hasBoxSibling && !alreadyZero) {
      // corroboration A: the bare looks like the whole-shipment aggregate. An
      // `undecided` box makes Σ a guess → never zero a basis on it (fail-safe).
      const isTrueAggregate =
        totals.count > 1 && totals.undecided === 0 && relDiff(num(bare.fweight), totals.fweight) <= TOL;
      // corroboration B: the SIBLING rows ALONE already cover the shipment weight, so
      // zeroing the redundant bare provably loses NO weight. A properly-split base
      // (bare = box-1 · siblings = boxes 2..N) fails this (Σ sib = Σ − box1 ≠ Σ).
      const sibWeightSum = r2(siblings.reduce((s, x) => s + num(x.fweight), 0));
      const siblingsCoverShipment = totals.count > 1 && relDiff(sibWeightSum, totals.fweight) <= TOL;
      if (isTrueAggregate && siblingsCoverShipment) {
        bareZeroes.push({ id: bare.id, tracking: bare.ftrackingchn, trueSum: totals });
      } else if (num(bare.fweight) > 0) {
        // a HEALTHY proper-split bare (holds its OWN box truth) is the EXPECTED shape
        // (owner rule: กล่อง 1 อยู่บน bare) — not review noise.
        const healthyProperSplit =
          properSplit && bareBasis != null && relDiff(num(bare.fweight), bareBasis.totalWeightKg) <= TOL;
        if (!healthyProperSplit) {
          // a weighted bare that isn't a clean, sibling-covered aggregate → don't guess.
          reviews.push({
            kind: isTrueAggregate ? "aggregate_bare_siblings_dont_cover" : "weighted_bare_not_clean_aggregate",
            id: bare.id,
            tracking: bare.ftrackingchn,
          });
        }
      }
    }
  }

  return { detailFixes, bareZeroes, reviews };
}
