/**
 * ════════════════════════════════════════════════════════════════════════════
 * BASIS-DRIFT GUARD — "ฐานเพี้ยน ห้าม re-price" (owner 2026-07-17 · MONEY)
 *
 * WHY THIS EXISTS — the zero-basis guard cannot see this
 * ─────────────────────────────────────────────────────
 * `computeAndFillForwarderImportRate` (live-rate.ts) already refuses to price a row
 * whose basis is **0** (the `zero_basis_price_locked` guard — it pins the money on a
 * bare summary header so the box reconcile can zero its basis safely).
 *
 * But prod carries a SECOND, invisible shape: rows whose stored `fweight`/`fvolume`
 * are a **MULTIPLE** of the momo_box_detail truth — most often exactly ×2 (verified
 * prod · GZS260618-1/PR002 · 15 แถว) — while `ftotalprice` was computed on the *true*
 * basis. Those rows price CORRECTLY today, so nothing looks wrong:
 *
 *   #52082 · 1781309805 · PR10190
 *     momo_box_detail: qty=1 · weight_kg=335 · cbm=1.05   (dims 100×70×150 ยืนยัน)
 *     tb_forwarder:    fweight=670 · fvolume=2.10          ← 2 เท่าเป๊ะ
 *     ftotalprice = ฿3,350 = rate 10 × **335** (ฐานจริง)   ← เงินวันนี้ถูก
 *
 *   → any re-price (a dimension save · a MOMO sync · a rate-card save · a backfill)
 *     recomputes 10 × **670** = ฿6,700 = **เก็บเกิน 2 เท่า ทันที**.
 *
 * A basis of ×2 is not 0, so it sails straight through the zero-basis guard. THIS
 * module is that missing gate: before money is computed from a stored basis, prove
 * the basis still agrees with MOMO's per-box truth; refuse when it does not.
 *
 * 🧭 SCOPE — this guard answers exactly ONE question:
 *     "ฐานที่เก็บไว้ ตรงกับ momo_box_detail ไหม?"
 *   It does NOT judge whether the stored PRICE is right, does not decide a refund, and
 *   never repairs anything. Refusing is the whole behaviour — the repair belongs to the
 *   pass-6 self-heal (box-detail-reconcile-plan.ts), the staff box editor
 *   (adminUpdateMomoBoxDetails), and the owner-gated backfill.
 *
 * ⚖️ ONE ROW HAS **TWO** LEGITIMATE READINGS — so we accept either
 * ────────────────────────────────────────────────────────────────
 * A tb_forwarder row can legitimately carry EITHER
 *   (1) **its own box** — the split model, one "-N/M" row per momo box; or
 *   (2) **the Σ of every box of its base** — the ROLLUP model, which
 *       `adminUpdateMomoBoxDetails` deliberately writes (`rollupBoxes` → one row,
 *       `famountcount='1'`), and which the แต้ม reconcile writes too.
 * Nothing on the row itself says which. So this guard refuses ONLY when the stored
 * basis fits **NEITHER** reading — the ×2 landmine fits neither (670 ≠ box 335 and
 * ≠ Σ 335), while a freshly-rolled-up row fits (2) exactly.
 *
 * 🔴 Checking only reading (1) would BLOCK THE REPAIR ITSELF: staff fix the boxes →
 *    the row is written with Σ → the very next line re-prices → a strict per-box guard
 *    refuses → the corrected row keeps its stale price, and the fix looks broken.
 *    (Verified against prod: accepting both readings costs ZERO protection — the same
 *    30 rows block either way today — while removing that whole regression class.)
 *
 * 💰 FAIL-SAFE, NOT FAIL-CLOSED — deliberate, and the opposite of most money guards
 * ────────────────────────────────────────────────────────────────────────────────
 * A guard that blocks on missing evidence would refuse EVERY non-MOMO row (102 prod
 * rows carry no momo_box_detail at all) and freeze normal pricing platform-wide — far
 * worse than no guard. So: **no evidence → PASS**. It only refuses when MOMO's truth is
 * present, decidable, and materially disagrees with BOTH readings. Every skip is listed
 * in `SkipReason`.
 *
 * 🚧 KNOWN, DELIBERATE GAP — the bare ↔ "-1/N" mapping is NOT attempted
 * ────────────────────────────────────────────────────────────────────
 * 15 prod rows are bare bases whose momo_box_detail names box #1 as `<base>-1/N`
 * instead of `<base>` (MOMO is inconsistent · the invoice ground-truth doc §3 verified
 * the equivalence). Mapping them here would be UNSAFE: a bare row is sometimes box #1
 * and sometimes the whole-shipment summary (prod 519218029029 bare carries 36.5kg = Σ
 * its 2 boxes · ฿730). Those rows have no exact box → SKIP (under-protection, never
 * over-blocking). Do not "improve" this without the sibling analysis that
 * `planBoxDetailReconcile` already owns.
 *
 * ⚖️ WHY THE Σ IS ONLY EVER A *RESCUE*, NEVER A TRIGGER
 * `momo_box_detail` is written continuously by the MOMO cron, so a base can be
 * mid-split at any instant. Comparing "our Σ (complete)" against "MOMO's Σ (still
 * arriving)" manufactures a phantom difference — that exact mistake produced the false
 * "เก็บเกิน ฿10,604" report (backfill-inventory §F6a: the number moved between two runs
 * 2 minutes apart as boxes landed). Here an incomplete Σ can only FAIL to rescue a row;
 * it can never itself cause a block. The block decision always needs the row's own
 * exact box, which either exists or doesn't — immune to the race.
 *
 * PURE: no DB · no IO · no "server-only" → unit-tested under plain `tsx`.
 * RUN:  pnpm tsx lib/forwarder/basis-drift-guard.test.ts
 *
 * @see lib/integrations/momo-web/box-detail-basis.ts      — resolveMomoBoxBasis (THE per-box decider · reused, not re-implemented)
 * @see lib/integrations/momo-web/box-detail-recompute.ts  — rollupBoxes (THE Σ · reused so guard + repair can never disagree)
 * @see lib/forwarder/live-rate.ts                         — the caller (computeAndFillForwarderImportRate)
 * @see actions/admin/forwarder-box-detail.ts              — the staff repair path that writes the rollup reading
 * @see docs/research/backfill-inventory-2026-07-17.md     — §F6 the landmine · §F6a why Σ-comparison lies
 * ════════════════════════════════════════════════════════════════════════════
 */

import { resolveMomoBoxBasis } from "@/lib/integrations/momo-web/box-detail-basis";
import { rollupBoxes, type BoxDims } from "@/lib/integrations/momo-web/box-detail-recompute";

/**
 * Relative tolerance for "the stored basis still agrees with MOMO" (2%).
 * Deliberately the SAME 2% as `BOX_BASIS_TOLERANCE` / `planBoxDetailReconcile` /
 * `deriveMomoBoxConsistency` — one platform-wide notion of "matches momo_box_detail",
 * so this guard can never disagree with the self-heal about whether a row is healthy.
 */
export const BASIS_DRIFT_TOLERANCE = 0.02;

/**
 * Absolute noise floors — a relative test ALONE over-flags tiny parcels.
 * MOMO rounds weight to ~0.01 kg, which on a 0.41 kg parcel is 2.4% → a pure 2% rule
 * refuses it (verified prod: 3 rows — #52625 0.42 vs 0.41 · #52633 0.21 vs 0.20 ·
 * #52707 0.43 vs 0.42 — all ฿50 min-charge rows, all healthy). Requiring the gap to be
 * material in BOTH relative and absolute terms removes that whole false-positive class
 * while leaving every real ×2 landmine caught (they miss by whole kg / whole คิว).
 */
export const BASIS_DRIFT_MIN_KG = 0.5;
/** momo sends `cbm` at 4dp; dims derive at 6dp → sub-0.001 gaps are representation noise. */
export const BASIS_DRIFT_MIN_CBM = 0.001;

/** Why the guard did not evaluate (every one of these = PASS · fail-safe). */
export type BasisDriftSkipReason =
  /** No momo_box_detail row for this exact tracking → nothing to compare (non-MOMO row,
   *  a not-yet-synced box, or the deliberate bare↔"-1/N" gap documented above). */
  | "no_momo_box"
  /** resolveMomoBoxBasis could not prove per-piece vs line-total → MOMO's own numbers are
   *  ambiguous; refusing on a guess would block real work (fail-SAFE, not fail-closed). */
  | "momo_basis_undecidable"
  /** Neither weight nor คิว is comparable (a 0 on either side = missing data, NOT drift —
   *  "MOMO ส่ง 0 มา = ข้อมูลขาด ไม่ใช่เราเก็บเกิน"). */
  | "nothing_comparable"
  /** Matches the row's OWN box (the split reading). */
  | "basis_matches_box"
  /** Matches Σ of the base's boxes (the ROLLUP reading — what the staff box editor writes). */
  | "basis_matches_base_sum";

/** Which reading explained the stored basis (null ⇔ neither ⇒ blocked). */
export type BasisDriftModel = "own_box" | "base_sum" | null;

export type BasisDriftVerdict = {
  /** true ⇔ REFUSE to compute money from this stored basis. */
  blocked: boolean;
  /** Present when blocked=false — why the guard let it through (fail-safe accounting). */
  skipReason: BasisDriftSkipReason | null;
  /** Which legitimate reading explained the row (null when blocked / not evaluated). */
  matchedModel: BasisDriftModel;
  /** Thai, states the ACTUAL numbers + what to do — never a vague "ผิดพลาด".
   *  ([[wrong-error-message-hides-real-block]] · an error that hides the real block sends
   *  staff hunting the wrong thing.) null when not blocked. */
  message: string | null;
  /** The comparison, for a review row / audit log (populated whenever a compare ran). */
  detail: {
    storedWeightKg: number;
    storedCbm: number;
    /** The row's OWN box totals (reading 1). */
    ownBoxWeightKg: number;
    ownBoxCbm: number;
    /** stored ÷ own box (1 = agree · 2 = the classic ×2 landmine · 0 = not compared). */
    ownWeightRatio: number;
    ownCbmRatio: number;
    /** Σ over the base's countable boxes (reading 2); null when not supplied/derivable. */
    baseSumWeightKg: number | null;
    baseSumCbm: number | null;
    /** How many boxes fed the Σ. */
    baseBoxCount: number;
  } | null;
};

/** A momo_box_detail row as it arrives from the DB (values may be string). */
export type MomoBoxRow = {
  /** momo_box_detail.box_tracking — identity + the หัวบิล test inside rollupBoxes. */
  boxTracking: string;
  width: number | string | null | undefined;
  length: number | string | null | undefined;
  height: number | string | null | undefined;
  weightKg: number | string | null | undefined;
  cbm: number | string | null | undefined;
  quantity: number | string | null | undefined;
};

export type BasisDriftInput = {
  /** tb_forwarder.fweight as stored (the basis a re-price WILL use). */
  storedWeightKg: number;
  /** tb_forwarder.fvolume as stored. NB: pass the RAW fvolume — the caller's cbmProduct
   *  (famountcount) derivation is a PRICING step, not part of the momo truth compare. */
  storedCbm: number;
  /** tb_forwarder.ftrackingchn — picks this row's own box out of `baseBoxes`. */
  ownBoxTracking: string;
  /** EVERY momo_box_detail row of this row's base (include the row's own box).
   *  Empty/absent → no MOMO truth → PASS. */
  baseBoxes: readonly MomoBoxRow[] | null | undefined;
};

export type BasisDriftOptions = {
  relTolerance?: number;
  minAbsKg?: number;
  minAbsCbm?: number;
};

function num(v: number | string | null | undefined): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
}
/** |a−b| / max(|a|,|b|); 0 when both ≈ 0. */
function relDiff(a: number, b: number): number {
  const denom = Math.max(Math.abs(a), Math.abs(b));
  if (denom < 1e-9) return 0;
  return Math.abs(a - b) / denom;
}
const fmtKg = (n: number) =>
  new Intl.NumberFormat("th-TH", { maximumFractionDigits: 2 }).format(n);
const fmtCbm = (n: number) =>
  new Intl.NumberFormat("th-TH", { maximumFractionDigits: 6 }).format(n);
/** "2.00 เท่า" / "0.50 เท่า" — the shape staff recognise from the ×2 landmine. */
const fmtRatio = (n: number) => `${n.toFixed(2)} เท่า`;

/** Normalize a DB row into the pure `BoxDims` shape `rollupBoxes` expects. */
function toBoxDims(b: MomoBoxRow): BoxDims {
  return {
    boxTracking: (b.boxTracking ?? "").trim(),
    width: num(b.width),
    length: num(b.length),
    height: num(b.height),
    weightKg: num(b.weightKg),
    cbm: num(b.cbm),
    quantity: num(b.quantity),
  };
}

/**
 * ⭐ Decide whether a stored pricing basis may still be trusted to compute money.
 *
 * PURE. Returns `blocked:true` ONLY when the row's own momo box is present + decidable
 * AND the stored basis materially disagrees with BOTH legitimate readings (own box ·
 * Σ of the base). Every other outcome PASSES with a `skipReason` — see the FAIL-SAFE
 * note in the module header.
 */
export function evaluateBasisDrift(
  input: BasisDriftInput,
  opts: BasisDriftOptions = {},
): BasisDriftVerdict {
  const TOL = opts.relTolerance ?? BASIS_DRIFT_TOLERANCE;
  const MIN_KG = opts.minAbsKg ?? BASIS_DRIFT_MIN_KG;
  const MIN_CBM = opts.minAbsCbm ?? BASIS_DRIFT_MIN_CBM;

  const pass = (skipReason: BasisDriftSkipReason): BasisDriftVerdict => ({
    blocked: false,
    skipReason,
    matchedModel: null,
    message: null,
    detail: null,
  });

  const boxes = (input.baseBoxes ?? []).filter((b) => (b.boxTracking ?? "").trim() !== "");
  const ownTracking = (input.ownBoxTracking ?? "").trim();
  const ownRaw = ownTracking ? boxes.find((b) => b.boxTracking.trim() === ownTracking) : undefined;

  // No MOMO truth for THIS row → nothing to prove the basis against. PASS (a non-MOMO
  // row must price normally; blocking here would freeze 102 prod rows for no reason).
  // Also covers the deliberate bare↔"-1/N" gap documented in the header.
  if (!ownRaw) return pass("no_momo_box");

  // THE decider (reused verbatim — never re-implemented, so this guard and the self-heal
  // can never disagree about what MOMO's numbers mean).
  const ownBasis = resolveMomoBoxBasis({
    width: ownRaw.width, length: ownRaw.length, height: ownRaw.height,
    weightKg: ownRaw.weightKg, cbm: ownRaw.cbm, quantity: ownRaw.quantity,
  });
  // MOMO's own row is ambiguous → we cannot state a truth, so we must not refuse on one.
  if (!ownBasis.decided) return pass("momo_basis_undecidable");

  const storedW = num(input.storedWeightKg);
  const storedV = num(input.storedCbm);
  const ownW = ownBasis.totalWeightKg;
  const ownV = ownBasis.totalCbm;

  // Compare a field ONLY when both sides carry a value. A 0 on either side is missing
  // data, not drift (and the both-zero case is already owned by the zero-basis guard).
  const cmpW = storedW > 0 && ownW > 0;
  const cmpV = storedV > 0 && ownV > 0;
  if (!cmpW && !cmpV) return pass("nothing_comparable");

  /** Material in BOTH senses — relative (a ×2 landmine) AND absolute (not 0.01 kg noise). */
  const drifted = (stored: number, expected: number, minAbs: number): boolean =>
    stored > 0 &&
    expected > 0 &&
    relDiff(stored, expected) > TOL &&
    Math.abs(stored - expected) > minAbs;

  // ── reading 1: the row carries its OWN box ──
  const matchesOwn = !drifted(storedW, ownW, MIN_KG) && !drifted(storedV, ownV, MIN_CBM);

  // ── reading 2: the row carries Σ of the base's boxes (the ROLLUP the staff editor
  // writes). Reuses rollupBoxes so the guard's Σ IS the repair path's Σ, by construction.
  // A Σ containing an undecidable box is a guess → don't let a guess rescue a row.
  const rollup = rollupBoxes(boxes.map(toBoxDims));
  const sumUsable = rollup.countableCount > 0 && rollup.undecidedBoxes.length === 0;
  const matchesSum =
    sumUsable &&
    !drifted(storedW, rollup.fweight, MIN_KG) &&
    !drifted(storedV, rollup.fvolume, MIN_CBM);

  const detail = {
    storedWeightKg: storedW,
    storedCbm: storedV,
    ownBoxWeightKg: ownW,
    ownBoxCbm: ownV,
    ownWeightRatio: cmpW ? Number((storedW / ownW).toFixed(4)) : 0,
    ownCbmRatio: cmpV ? Number((storedV / ownV).toFixed(4)) : 0,
    baseSumWeightKg: sumUsable ? rollup.fweight : null,
    baseSumCbm: sumUsable ? rollup.fvolume : null,
    baseBoxCount: rollup.countableCount,
  };

  if (matchesOwn) {
    return { blocked: false, skipReason: "basis_matches_box", matchedModel: "own_box", message: null, detail };
  }
  if (matchesSum) {
    return { blocked: false, skipReason: "basis_matches_base_sum", matchedModel: "base_sum", message: null, detail };
  }

  // ── REFUSE — say WHAT is wrong, by HOW MUCH, and WHAT to do next ──
  const parts: string[] = [];
  if (drifted(storedW, ownW, MIN_KG)) {
    parts.push(
      `น้ำหนัก ระบบเก็บ ${fmtKg(storedW)} กก. · MOMO ${fmtKg(ownW)} กก. (${fmtRatio(detail.ownWeightRatio)})`,
    );
  }
  if (drifted(storedV, ownV, MIN_CBM)) {
    parts.push(
      `ปริมาตร ระบบเก็บ ${fmtCbm(storedV)} คิว · MOMO ${fmtCbm(ownV)} คิว (${fmtRatio(detail.ownCbmRatio)})`,
    );
  }
  // Multi-box base → tell staff the Σ we also checked, so "แล้วเลขไหนถูก" is answerable
  // without opening the DB.
  const sumNote =
    rollup.countableCount > 1 && sumUsable
      ? ` (เทียบกับยอดรวมทั้งแทรคกิ้ง ${fmtKg(rollup.fweight)} กก. / ${fmtCbm(rollup.fvolume)} คิว จาก ${rollup.countableCount} กล่อง ก็ไม่ตรง)`
      : "";

  return {
    blocked: true,
    skipReason: null,
    matchedModel: null,
    message:
      `⛔ ไม่คิดราคาใหม่ให้ — ฐานคิดราคาที่เก็บไว้ไม่ตรงกับ MOMO: ${parts.join(" · ")}${sumNote}. ` +
      `ราคาเดิมถูกล็อกไว้ (ไม่ถูกแก้). ` +
      `ถ้าคิดราคาใหม่จากฐานนี้ ยอดจะผิดตามส่วนต่างข้างต้นทันที — ` +
      `ต้องซ่อมน้ำหนัก/ปริมาตร ให้ตรง MOMO ก่อน (แก้ที่ "ขนาดกล่อง" ของแทรคกิ้งนี้) แล้วค่อยคิดราคาใหม่`,
    detail,
  };
}
