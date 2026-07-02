/**
 * ════════════════════════════════════════════════════════════════════════
 * Per-box (momo_box_detail) → single tb_forwarder row recompute — PURE math.
 *
 * WHY THIS EXISTS (owner/ภูม 2026-07-02)
 * ─────────────────────────────────────
 * A cargo tracking MOMO split into N DIFFERENT-size boxes stores its AGGREGATE
 * on ONE tb_forwarder row (billing is per BASE tracking = 1 row = 1 bill). The
 * per-box ก×ย×ส/น้ำหนัก live in momo_box_detail. When staff FIX a box's size
 * themselves (MOMO's per-box dims are often wrong), the ONE tb_forwarder row's
 * price basis — fweight (Σ box weight) + fvolume (Σ box คิว) — must be recomputed
 * as EXACTLY the Σ of the REAL boxes, else the bill mis-charges.
 *
 * 💰 MONEY-SAFETY — this is the price-basis recompute, so it MUST equal Σ over the
 *    COUNTABLE boxes exactly:
 *   - A หัวบิล (bill-header) — a box MOMO sent with NO box number (bare tracking, no
 *     "-N/M" suffix) AND no dimensions AND no weight AND no คิว — is NOT a real box
 *     → EXCLUDED from both the box list and the Σ (else the total double-counts).
 *   - Each box's คิว = (ก×ย×ส)/1,000,000 (the legacy CBM formula); when all dims
 *     are 0 we fall back to the box's sent คิว (so a weight-only box still counts).
 *   - The TOTAL คิว/น้ำหนัก a box contributes = per-piece × จำนวนชิ้น (a box row can
 *     hold several identical pieces · momo_box_detail stores PER-PIECE values).
 *   - fweight rounded to 2dp · fvolume rounded to 6dp (tb_forwarder.fvolume is
 *     numeric(14,6) since mig 0192).
 *
 * SCOPE: recompute the ONE tb_forwarder row's fweight/fvolume only. NEVER splits
 * rows, NEVER creates sibling rows, NEVER touches billing/receipt/commission/rate/
 * status. Pure · no DB · no IO · unit-tested (runs in test:unit).
 *
 * RUN:  pnpm tsx lib/integrations/momo-web/box-detail-recompute.ts
 * ════════════════════════════════════════════════════════════════════════
 */

/** One box's editable dimensions (as staff typed them · cm / kg / คิว / ชิ้น). */
export type BoxDims = {
  /** The exact split tracking ("…-3/6" / "…-3" / bare) — identity + หัวบิล test. */
  boxTracking: string;
  /** ก (cm). */
  width: number;
  /** ย (cm). */
  length: number;
  /** ส (cm). */
  height: number;
  /** per-piece weight (kg). */
  weightKg: number;
  /** per-piece คิว — used only when all dims are 0 (weight-only box). */
  cbm: number;
  /** จำนวนชิ้น in this box (≥1). */
  quantity: number;
};

/** Round to 2dp (weight — tb_forwarder.fweight). */
export function r2(n: number): number {
  const v = Number(n);
  return Number.isFinite(v) ? Number(v.toFixed(2)) : 0;
}
/** Round to 6dp (คิว — tb_forwarder.fvolume numeric(14,6) since mig 0192). */
export function r6(n: number): number {
  const v = Number(n);
  return Number.isFinite(v) ? Number(v.toFixed(6)) : 0;
}
/** จำนวนชิ้น — floored at 1 (a box is at least one piece). */
export function piecesOf(q: number): number {
  const n = Math.round(Number(q));
  return Number.isFinite(n) && n > 0 ? n : 1;
}
/** Non-negative finite number, else 0. */
function nn(v: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** The leading number of a MOMO "-i/n" (or "-i") split-suffix; 0 when none/bare. */
export function boxTrackingSuffix(tracking: string): number {
  const m = /-(\d+)(?:\/\d+)?$/.exec((tracking ?? "").trim());
  return m ? Number(m[1]) : 0;
}

/**
 * PER-BOX คิว (per piece) from that box's dims — (ก×ย×ส)/1,000,000, 6dp. Falls
 * back to the box's own sent คิว when all dims are 0 (a weight-only box), so a box
 * with no measured size still contributes its known คิว.
 */
export function boxCbmFromDims(b: Pick<BoxDims, "width" | "length" | "height" | "cbm">): number {
  const w = nn(b.width);
  const l = nn(b.length);
  const h = nn(b.height);
  if (w > 0 || l > 0 || h > 0) {
    return r6((w * l * h) / 1_000_000);
  }
  return r6(nn(b.cbm));
}

/**
 * Is this box a MOMO หัวบิล (bill-header) placeholder — NOT a real box?
 *
 * A หัวบิล here = a box that is BARE (no "-N/M" box number) AND carries NO real
 * cargo signal: no dimensions, no weight, no คิว. MOMO occasionally inserts such a
 * bare header row into momo_box_detail alongside the real "-N/M" siblings; counting
 * it double-counts. A bare row WITH any dims/weight/คิว is a real single/whole-box
 * tracking → kept.
 */
export function isBoxBillHeader(b: BoxDims): boolean {
  if (boxTrackingSuffix(b.boxTracking) !== 0) return false; // has a box number → real box
  const hasSignal = nn(b.width) > 0 || nn(b.length) > 0 || nn(b.height) > 0 || nn(b.weightKg) > 0 || nn(b.cbm) > 0;
  return !hasSignal;
}

/** Only the boxes that should feed the Σ — drops MOMO หัวบิล placeholders. Pure. */
export function countableBoxes(boxes: readonly BoxDims[]): BoxDims[] {
  return boxes.filter((b) => !isBoxBillHeader(b));
}

export type BoxRollup = {
  /** Σ box weight (per-piece × ชิ้น) over COUNTABLE boxes — r2 → fweight. */
  fweight: number;
  /** Σ box คิว (per-piece × ชิ้น) over COUNTABLE boxes — r6 → fvolume. */
  fvolume: number;
  /** How many boxes fed the Σ (excludes any หัวบิล). */
  countableCount: number;
};

/**
 * Recompute the SINGLE tb_forwarder row's price basis from the edited boxes.
 *
 * fweight = Σ (box per-piece weight × จำนวนชิ้น) · fvolume = Σ (box per-piece คิว ×
 * จำนวนชิ้น) — both over the COUNTABLE boxes (หัวบิล excluded). This is the exact
 * total the ONE billing row must carry so the price is the sum of the real boxes.
 */
export function rollupBoxes(boxes: readonly BoxDims[]): BoxRollup {
  const countable = countableBoxes(boxes);
  let weight = 0;
  let volume = 0;
  for (const b of countable) {
    const pieces = piecesOf(b.quantity);
    weight += nn(b.weightKg) * pieces;
    volume += boxCbmFromDims(b) * pieces;
  }
  return {
    fweight: r2(weight),
    fvolume: r6(volume),
    countableCount: countable.length,
  };
}

// ── inline tests (run: pnpm tsx lib/integrations/momo-web/box-detail-recompute.ts) ──
if (process.argv[1] && process.argv[1].endsWith("box-detail-recompute.ts")) {
  let pass = 0;
  let fail = 0;
  const approx = (a: number, b: number) => Math.abs(a - b) < 1e-6;
  function eq(label: string, got: number, want: number) {
    if (approx(got, want)) {
      pass++;
    } else {
      fail++;
      console.error(`✗ ${label}: got ${got}, want ${want}`);
    }
  }
  function is(label: string, got: boolean, want: boolean) {
    if (got === want) {
      pass++;
    } else {
      fail++;
      console.error(`✗ ${label}: got ${got}, want ${want}`);
    }
  }

  // boxCbmFromDims — (ก×ย×ส)/1e6, 6dp; fallback to sent cbm when dims all 0.
  eq("cbm 204×61×80", boxCbmFromDims({ width: 204, length: 61, height: 80, cbm: 0 }), 0.99552);
  eq("cbm 100×100×100", boxCbmFromDims({ width: 100, length: 100, height: 100, cbm: 0 }), 1);
  eq("cbm fallback to sent when dims 0", boxCbmFromDims({ width: 0, length: 0, height: 0, cbm: 0.35 }), 0.35);
  eq("cbm dims win over sent", boxCbmFromDims({ width: 50, length: 40, height: 30, cbm: 99 }), 0.06);

  // suffix + หัวบิล detection.
  eq("suffix -3/6", boxTrackingSuffix("1782103385-3/6"), 3);
  eq("suffix -2", boxTrackingSuffix("1781675788-2"), 2);
  eq("suffix bare", boxTrackingSuffix("1781675788"), 0);
  is("header: bare + no signal", isBoxBillHeader({ boxTracking: "178", width: 0, length: 0, height: 0, weightKg: 0, cbm: 0, quantity: 1 }), true);
  is("NOT header: bare WITH weight", isBoxBillHeader({ boxTracking: "178", width: 0, length: 0, height: 0, weightKg: 5, cbm: 0, quantity: 1 }), false);
  is("NOT header: bare WITH dims", isBoxBillHeader({ boxTracking: "178", width: 10, length: 10, height: 10, weightKg: 0, cbm: 0, quantity: 1 }), false);
  is("NOT header: has box number even if empty", isBoxBillHeader({ boxTracking: "178-1/4", width: 0, length: 0, height: 0, weightKg: 0, cbm: 0, quantity: 1 }), false);

  // rollupBoxes — Σ over countable, per-piece × ชิ้น, หัวบิล excluded.
  const boxes: BoxDims[] = [
    { boxTracking: "T", width: 0, length: 0, height: 0, weightKg: 0, cbm: 0, quantity: 1 },      // หัวบิล → excluded
    { boxTracking: "T-1/3", width: 100, length: 100, height: 100, weightKg: 10, cbm: 0, quantity: 1 }, // 1 คิว, 10kg
    { boxTracking: "T-2/3", width: 50, length: 40, height: 30, weightKg: 5, cbm: 0, quantity: 2 },     // 0.06×2=0.12 คิว, 10kg
    { boxTracking: "T-3/3", width: 0, length: 0, height: 0, weightKg: 3, cbm: 0.2, quantity: 1 },      // weight-only fallback 0.2 คิว, 3kg
  ];
  const roll = rollupBoxes(boxes);
  eq("rollup fweight", roll.fweight, 23);          // 10 + 5×2 + 3
  eq("rollup fvolume", roll.fvolume, 1.32);        // 1 + 0.06×2 + 0.2
  eq("rollup countableCount", roll.countableCount, 3); // header dropped

  // single real box (bare, WITH dims) — kept, not treated as header.
  const single = rollupBoxes([{ boxTracking: "T", width: 100, length: 100, height: 100, weightKg: 12, cbm: 0, quantity: 1 }]);
  eq("single box fweight", single.fweight, 12);
  eq("single box fvolume", single.fvolume, 1);
  eq("single box count", single.countableCount, 1);

  // empty → zeros.
  const empty = rollupBoxes([]);
  eq("empty fweight", empty.fweight, 0);
  eq("empty fvolume", empty.fvolume, 0);

  console.log(`\nbox-detail-recompute: ${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}
