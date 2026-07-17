/**
 * ════════════════════════════════════════════════════════════════════════════
 * momo_box_detail → the box's TOTAL weight/คิว — the ONE decider (SOT).
 * (owner 2026-07-17 · "GZE260627-1 น้ำหนักมั่ว" · [[fix-root-prevent-whole-class]])
 *
 * WHY THIS EXISTS — MOMO ส่งค่ามาไม่คงเส้นคงวา
 * ────────────────────────────────────────────
 * `momo_box_detail.weight_kg` / `.cbm` do NOT carry a stable meaning. On some rows
 * they are the value **ต่อกล่อง** (per piece); on others they are the **ยอดรวมทั้ง
 * บรรทัด** (the line total, already × quantity). MOMO mixes both conventions inside
 * ONE shipment (verified prod · see the table below).
 *
 * Every consumer historically assumed PER-PIECE and multiplied by `quantity`, so a
 * line-total row got multiplied a SECOND time:
 *
 *   fid 52225 · KY4001041630124-25 · qty 70
 *     momo weight_kg = 945   (= 13.5 kg/กล่อง × 70 = ยอดรวม)
 *     we stored fweight = 945 × 70 = 66,150 kg  ← ผี 65,205 kg
 *   ตู้ GZE260627-1 Σ = 69,916 kg ใน 10.28 คิว = 6,802 kg/คิว (น้ำ = 1,000 → เป็นไปไม่ได้)
 *
 * 🔑 THE ONLY RELIABLE DECIDER = **dims** (ก×ย×ส → m³). MOMO's per-box dimensions are
 * per-piece on EVERY row, so they arbitrate the ambiguous `cbm`:
 *
 *   cbm ≈ dims        → PER-PIECE   → total = value × quantity   (multiply)
 *   cbm ≈ dims × qty  → LINE TOTAL  → total = value              (do NOT multiply)
 *
 * and `weight_kg` follows **the same convention as `cbm` on that row** (MOMO prints
 * the pair together · verified: every line-total row has BOTH fields line-total).
 *
 * ⚠️ TWO DECIDERS THAT LOOK RIGHT AND ARE WRONG (both were tried · do NOT reintroduce)
 * ──────────────────────────────────────────────────────────────────────────────
 *  1. **ความหนาแน่น > 1,000 kg/คิว** — metal genuinely exceeds water's 1,000 kg/m³.
 *     prod `908006917359` = 28.5 kg / 0.0138 คิว = 2,065 kg/คิว and is CORRECT
 *     (30×23×20 matches its dims exactly) → this decider flags real cargo.
 *  2. **fweight == weight_kg × quantity** — that is the CORRECT shape for a per-piece
 *     row, so it flags 122 healthy rows.
 *  → dims-only. Prod: 605 boxes → 116 per-piece · 22 line-total · 10 rows actually
 *    double-multiplied in tb_forwarder (Σ ghost 82,829 kg · verified read-only).
 *
 * 💰 MONEY-SAFETY — FAIL-SAFE, never guess
 *   - When dims are missing / cbm is 0 / qty ≤ 1 / BOTH shapes fit / NEITHER fits, the
 *     convention is **undecidable** → this returns the LEGACY value (× quantity, dims
 *     win over cbm — byte-identical to the pre-2026-07-17 math) and sets
 *     `decided:false`. Callers that write money MUST treat `decided:false` as "leave
 *     alone + flag", never as a licence to change a basis on a guess.
 *   - PURE: no DB · no IO · no "server-only" → unit-tested under plain `tsx`.
 *
 * RUN:  pnpm tsx lib/integrations/momo-web/box-detail-basis.test.ts
 *
 * @see lib/integrations/momo-web/box-detail-recompute.ts       — rollupBoxes (staff-edit Σ)
 * @see lib/integrations/momo-web/box-detail-reconcile-plan.ts  — pass-6 self-heal (cron)
 * @see lib/admin/momo-box-consistency.ts                       — the 🚩 "MOMO มั่ว" display flag
 * @see scripts/momo-weight-qty-backfill-2026-07-17.mjs         — the data-fix (mirrors this)
 * @see docs/research/momo-invoice-reconcile-ground-truth-2026-07-17.md — the prod evidence
 * ════════════════════════════════════════════════════════════════════════════
 */

/** Which meaning MOMO used for `weight_kg`/`cbm` on this box row. */
export type BoxBasisConvention =
  /** cbm ≈ dims → the values are ต่อกล่อง → total = value × quantity. */
  | "per_piece"
  /** cbm ≈ dims × qty → the values are ยอดรวมทั้งบรรทัด → total = value (no multiply). */
  | "line_total"
  /** quantity ≤ 1 → both conventions are identical (nothing to decide · safe). */
  | "single_piece"
  /** No dims / no cbm / both fit / neither fits → LEGACY fallback + flag. */
  | "undecidable";

/** One momo_box_detail row as stored (values may be per-piece OR line-total). */
export type MomoBoxBasisInput = {
  width: number | string | null | undefined;
  length: number | string | null | undefined;
  height: number | string | null | undefined;
  /** momo_box_detail.weight_kg — per-piece OR line-total (this module decides which). */
  weightKg: number | string | null | undefined;
  /** momo_box_detail.cbm — per-piece OR line-total (the decider's subject). */
  cbm: number | string | null | undefined;
  quantity: number | string | null | undefined;
};

export type ResolvedBoxBasis = {
  convention: BoxBasisConvention;
  /**
   * true ⇔ dims PROVED the convention (per_piece / line_total), or qty ≤ 1 made it
   * moot. false ⇔ `undecidable` → the totals below are the LEGACY (× qty) values and
   * a money-writing caller must SKIP + flag rather than trust them.
   */
  decided: boolean;
  /** จำนวนชิ้น actually used (floored at 1). */
  pieces: number;
  /** The box row's TOTAL weight (kg · 2dp) — what tb_forwarder.fweight must carry. */
  totalWeightKg: number;
  /** The box row's TOTAL คิว (6dp) — what tb_forwarder.fvolume must carry. */
  totalCbm: number;
  /** Per-piece คิว derived from dims (6dp); 0 when dims are absent. */
  dimsCbmPerPiece: number;
  /** Why it was (not) decided — for the backfill report / a review row. */
  reason:
    | "cbm_matches_dims"            // per_piece
    | "cbm_matches_dims_times_qty"  // line_total
    | "single_piece"                // qty ≤ 1
    | "no_dims"                     // dims missing → cannot arbitrate
    | "no_cbm"                      // cbm 0/absent → nothing to arbitrate
    | "ambiguous_both_fit"          // dims ≈ dims×qty (degenerate) → refuse
    | "ambiguous_neither_fits";     // cbm matches neither shape → MOMO มั่ว → refuse
};

/** Default relative tolerance for the dims match — mirrors the 2% used by
 *  planBoxRowSplit / planBoxDetailReconcile / deriveMomoBoxConsistency. */
export const BOX_BASIS_TOLERANCE = 0.02;

export type BoxBasisOptions = {
  /** Relative tolerance for `cbm ≈ dims` and `cbm ≈ dims × qty` (default 2%). */
  relTolerance?: number;
};

function num(v: number | string | null | undefined): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}
/** Non-negative finite, else 0. */
function nn(v: number | string | null | undefined): number {
  const n = num(v);
  return n > 0 ? n : 0;
}
/** 2dp — tb_forwarder.fweight numeric(14,2). */
function r2(n: number): number {
  const v = Number(n);
  return Number.isFinite(v) ? Number(v.toFixed(2)) : 0;
}
/** 6dp — tb_forwarder.fvolume numeric(14,6) since mig 0192. */
function r6(n: number): number {
  const v = Number(n);
  return Number.isFinite(v) ? Number(v.toFixed(6)) : 0;
}
/** จำนวนชิ้น — floored at 1 (a box is at least one piece). */
export function piecesOf(q: number | string | null | undefined): number {
  const n = Math.round(num(q));
  return Number.isFinite(n) && n > 0 ? n : 1;
}
/** |a−b| / max(|a|,|b|); 0 when both ≈ 0. */
function relDiff(a: number, b: number): number {
  const denom = Math.max(Math.abs(a), Math.abs(b));
  if (denom < 1e-9) return 0;
  return Math.abs(a - b) / denom;
}

/** Per-piece คิว from this box's own dims — (ก×ย×ส)/1,000,000, 6dp; 0 when any
 *  dimension is missing (a partial dims triple can't arbitrate anything). */
export function dimsCbmPerPiece(b: Pick<MomoBoxBasisInput, "width" | "length" | "height">): number {
  const w = nn(b.width);
  const l = nn(b.length);
  const h = nn(b.height);
  if (!(w > 0 && l > 0 && h > 0)) return 0;
  return r6((w * l * h) / 1_000_000);
}

/**
 * The LEGACY per-box คิว rule (dims win over the sent cbm; fall back to the sent cbm
 * only when ALL dims are 0). Kept verbatim from box-detail-recompute.boxCbmFromDims /
 * box-detail-reconcile-plan.boxCbmFromDims so the `undecidable` fallback below is
 * byte-identical to the pre-decider behaviour (no silent regression).
 *
 * NOTE this differs from `dimsCbmPerPiece` on a PARTIAL dims triple (e.g. w>0 but
 * h=0): legacy computed w×l×0 = 0. Preserved deliberately.
 */
export function legacyBoxCbmPerPiece(
  b: Pick<MomoBoxBasisInput, "width" | "length" | "height" | "cbm">,
): number {
  const w = nn(b.width);
  const l = nn(b.length);
  const h = nn(b.height);
  if (w > 0 || l > 0 || h > 0) return r6((w * l * h) / 1_000_000);
  return r6(nn(b.cbm));
}

/**
 * ⭐ THE decider — resolve ONE momo_box_detail row's TOTAL weight/คิว.
 *
 * Uses the per-box dims to arbitrate whether MOMO's `cbm`/`weight_kg` are ต่อกล่อง or
 * ยอดรวม, then applies that ONE decision to BOTH fields (they always share a row's
 * convention). On any doubt it returns the LEGACY (× quantity) totals with
 * `decided:false` — a money-writing caller must then SKIP and flag, never guess.
 */
export function resolveMomoBoxBasis(
  b: MomoBoxBasisInput,
  opts: BoxBasisOptions = {},
): ResolvedBoxBasis {
  const TOL = opts.relTolerance ?? BOX_BASIS_TOLERANCE;
  const pieces = piecesOf(b.quantity);
  const dimsPerPiece = dimsCbmPerPiece(b);
  const sentCbm = nn(b.cbm);
  const sentWeight = nn(b.weightKg);

  /** The pre-decider math — dims win, everything × pieces. */
  const legacy = (reason: ResolvedBoxBasis["reason"]): ResolvedBoxBasis => ({
    convention: "undecidable",
    decided: false,
    pieces,
    totalWeightKg: r2(sentWeight * pieces),
    totalCbm: r6(legacyBoxCbmPerPiece(b) * pieces),
    dimsCbmPerPiece: dimsPerPiece,
    reason,
  });

  // qty ≤ 1 → per-piece and line-total are the SAME number. Nothing to decide, and
  // the legacy math (× 1) is already correct → decided, no flag.
  if (pieces <= 1) {
    return {
      convention: "single_piece",
      decided: true,
      pieces,
      totalWeightKg: r2(sentWeight),
      totalCbm: r6(legacyBoxCbmPerPiece(b)),
      dimsCbmPerPiece: dimsPerPiece,
      reason: "single_piece",
    };
  }

  // No dims → nothing can arbitrate the ambiguity → LEGACY + flag.
  if (dimsPerPiece <= 0) return legacy("no_dims");
  // No cbm → there is no ambiguous value to arbitrate; the legacy dims × pieces is
  // the only available reading → LEGACY + flag (a caller may still want to look).
  if (sentCbm <= 0) return legacy("no_cbm");

  const fitsPerPiece = relDiff(sentCbm, dimsPerPiece) <= TOL;
  const fitsLineTotal = relDiff(sentCbm, dimsPerPiece * pieces) <= TOL;

  if (fitsPerPiece && fitsLineTotal) return legacy("ambiguous_both_fit");
  if (!fitsPerPiece && !fitsLineTotal) return legacy("ambiguous_neither_fits");

  if (fitsPerPiece) {
    // ต่อกล่อง → multiply. คิว from dims (legacy rule: dims win) so this branch is
    // byte-identical to the pre-decider result for every healthy per-piece row.
    return {
      convention: "per_piece",
      decided: true,
      pieces,
      totalWeightKg: r2(sentWeight * pieces),
      totalCbm: r6(dimsPerPiece * pieces),
      dimsCbmPerPiece: dimsPerPiece,
      reason: "cbm_matches_dims",
    };
  }

  // ยอดรวมทั้งบรรทัด → do NOT multiply. คิว = MOMO's own stated line total (that is
  // the number MOMO bills on · it agrees with dims × qty inside TOL by construction).
  return {
    convention: "line_total",
    decided: true,
    pieces,
    totalWeightKg: r2(sentWeight),
    totalCbm: r6(sentCbm),
    dimsCbmPerPiece: dimsPerPiece,
    reason: "cbm_matches_dims_times_qty",
  };
}
