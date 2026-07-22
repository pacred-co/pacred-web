/**
 * Forwarder rate resolver — FAITHFUL port of the LIVE legacy tb_forwarder
 * pricing waterfall (`getPrice()` + its caller) from
 *   pcs-admin/forwarder.php  →  the `update_data` POST handler (L1753-2069)
 *   pcs-admin/include/function.php :: calPriceForwarder() (L1973-2122) [cross-check]
 *
 * This is the LIVE lane (tb_forwarder · ~45k rows). It is DISTINCT from
 * `lib/forwarder/calc-price.ts`, which only drives the rebuilt `forwarders`
 * lane (service-import/add · almost no prod data). The legacy live save path
 * is `forwarder.php` `update_data`; this module reproduces its rate math
 * EXACTLY so we can wire automatic pricing into `adminUpdateForwarderDimensions`.
 *
 * PURITY: like calc-price.ts, this module is PURE + unit-testable. The CALLER
 * does the SQL waterfall (reads tb_rate_custom / tb_rate_g tables + tb_users.coID)
 * and hands us the resolved candidate rates. We only do the legacy decision logic
 * (precedence + tier + KG/CBM selection). No server-only.
 *
 * ⚠️ VIP-GROUP TIER RETIRED (owner 2026-07-10): the legacy per-coID VIP group
 * (tb_rate_vip_*) was DROPPED. All 154 VIP-group customers were materialized to
 * per-customer SVIP rows (their old group rate) + coID='PR', so ZERO live customer
 * is on a VIP group. The waterfall is now: manual ▸ SVIP (per-customer/profile rate,
 * tb_rate_custom_*) ▸ general tiered (tb_rate_g_*). Prices are unchanged — a former
 * VIP-group customer now resolves via their materialized SVIP rate.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * LEGACY WATERFALL (verbatim from forwarder.php `getPrice()` L1806-1931):
 * ──────────────────────────────────────────────────────────────────────────
 *  0. customRate switch ON (forwarder.php L1801-1818):  the inline getPrice()
 *     returns the admin-typed rate directly —
 *       compare==1 → rate = customRateKG ;  compare==2 → rate = customRateCBM
 *     price = value * rate. HIGHEST precedence. coID is forced to 'CUSTOM'.
 *  Else (system pricing · getPrice L1830-1931):
 *  1. SVIP probe (L1841-1843):  SELECT ID FROM tb_rate_custom_cbm WHERE userID.
 *     - num_rows == 0  → general path (step 2)
 *     - num_rows  > 0  → SVIP path (step 3)
 *  2. general (L1844-1882):  tiered. (Applies to ANY non-SVIP customer now —
 *     the legacy `coID == 'PCS'` gate is gone since the VIP-group tier retired.)
 *       compare==1 (KG):  value<=100 → rgKG1 ; value>100 && value<500 → rgKG2 ; else → rgKG3
 *       compare==2 (CBM): value<=2  → rgCBM1; value>2  && value<5   → rgCBM2; else → rgCBM3
 *  3. SVIP (L1906-1929):  flat by userID (= the per-customer/profile rate).
 *       compare==1 (KG):  tb_rate_custom_kg.rKG   (SVIP KG-fallback is COMMENTED OUT in legacy)
 *       compare==2 (CBM): tb_rate_custom_cbm.rCBM
 *  → price = number_format(value * rate, 2)   (L1882/1904/1927)
 *  ── VIP-group tier (legacy step 3, `coID != 'PCS'`, tb_rate_vip_*) REMOVED
 *     2026-07-10 (materialized to per-customer SVIP · zero customers on a group).
 *
 * KG vs CBM SELECTION (the `update_data` caller body, forwarder.php L1934-2013):
 *   CBMProduct = (fAmountCount==1) ? fVolume : fVolume*fAmount        (L1935-1941)
 *   KGPerCBM   = (CBMProduct!=0) ? fWeight/CBMProduct : 0             (L1942-1944)
 *   if userComparison==1 (comparison enabled, L1947-1980):
 *       refOrder=='' → threshold = userComparisonValue                (L1948-1963)
 *       refOrder!='' → same path (legacy duplicates the branch)       (L1964-1980)
 *       KGPerCBM > threshold → KG  (compare=1, value=fWeight,  refPrice=1)
 *                            else → CBM (compare=2, value=CBMProduct, refPrice=2)
 *       NB: in the KG branch the legacy calls getPrice once to read compare2;
 *           if compare2==1 (VIP KG-rate was 0 → fell back to CBM) it switches
 *           value to CBMProduct (L1953-1956 / L1969-1972).
 *   else (NO comparison · "ราคามากสุด" L1983-2010):
 *       compute BOTH:  priceKg  = getPrice(compare=1, value=fWeight)
 *                      priceCBM = getPrice(compare=2, value=CBMProduct)
 *       priceCBM >= priceKg → CBM (refPrice=2)  else → KG (refPrice=1)   (L1993)
 *       ⚠️ legacy uses `>=` here → ties favour CBM. (calPrice.php preview uses
 *          `>` favouring KG — but the SAVE path `update_data` is authoritative.)
 *   fTotalPrice = price ;  fRefRate = rate ;  fRefPrice = refPrice       (L2012-2013)
 *
 * WHAT THE LEGACY WRITES (forwarder.php L2064-2068):
 *   fTotalPrice  = price       (= China→Thailand TRANSPORT subtotal · value*rate)
 *   fRefRate     = rate        (the unit rate chosen)
 *   fRefPrice    = refPrice    ('1' billed by KG · '2' billed by CBM)
 * ⚠️ DESPITE the name, tb_forwarder.fTotalPrice is the CHINA→THAILAND TRANSPORT
 *    price, NOT goods value. Proven by printReceiptF.php L863/L881 labelling the
 *    fTotalPrice column "ค่าขนส่ง / Amount". (See FLAG in resolve-rate.test.ts +
 *    the report — this contradicts the comment in lib/tax/wht.ts.)
 *
 * ENCODINGS (lowercase tb_forwarder cols — batch 2b deferred):
 *   sourcewarehouse 1=กวางโจว 2=อี้อู · transporttype 1=รถ 2=เรือ (3=air vip/general)
 *   productstype 1 ทั่วไป · 2 มอก. · 3 อย./น้ำยา · 4 พิเศษ
 */

/** Which physical basis a price was computed on. */
export type RateBasis = "kg" | "cbm";

/** Where the rate came from (waterfall tier). VIP-group retired 2026-07-10. */
export type RateSource = "manual" | "svip" | "general";

/**
 * The candidate rates the CALLER resolves from SQL and hands in. Each is the
 * unit rate (baht per kg / baht per cbm) for the (warehouse, transport, product)
 * tuple already applied by the caller's WHERE clause. `null`/`undefined`/`0`
 * means "no rate found" (legacy `$rate` defaults 0 → price 0).
 */
export interface ResolveRateCandidates {
  /** customRate switch — admin typed per-order override (forwarder.php L1801). */
  manualOverride: boolean;
  /** customRateKG (baht/kg) — only read when manualOverride. */
  manualKg: number | string | null;
  /** customRateCBM (baht/cbm) — only read when manualOverride. */
  manualCbm: number | string | null;

  /**
   * SVIP existence — legacy probes `SELECT ID FROM tb_rate_custom_cbm WHERE
   * userID` and branches on num_rows (forwarder.php L1841-1843). The CALLER
   * sets this true if ANY tb_rate_custom_cbm row exists for the user.
   */
  isSvip: boolean;
  /** SVIP per-user KG rate (tb_rate_custom_kg.rKG) for the tuple. */
  svipKg: number | string | null;
  /** SVIP per-user CBM rate (tb_rate_custom_cbm.rCBM) for the tuple. */
  svipCbm: number | string | null;

  /**
   * General tiered KG rates (tb_rate_g_kg.rgKG1/2/3). Applied to ANY non-SVIP
   * customer (the legacy VIP-group tier retired 2026-07-10 — the `isGeneral`
   * gate is gone; a non-SVIP row is always priced on the general tiers).
   */
  generalKg: { tier1: number | string | null; tier2: number | string | null; tier3: number | string | null } | null;
  /** General tiered CBM rates (tb_rate_g_cbm.rgCBM1/2/3). */
  generalCbm: { tier1: number | string | null; tier2: number | string | null; tier3: number | string | null } | null;
}

/** The shipment measurements + comparison flags the selection logic needs. */
export interface ResolveRateInput {
  /** fweight (kg). */
  weightKg: number | string | null;
  /**
   * The billable CBM. Legacy computes CBMProduct = (fAmountCount==1) ? fVolume
   * : fVolume*fAmount. The CALLER passes the ALREADY-COMPUTED CBMProduct here
   * (keep this module pure — it does not know fAmountCount).
   */
  volumeCbm: number | string | null;

  /** userComparison — comparison-pricing enabled (tb_users.userComparison==1). */
  comparisonEnabled: boolean;
  /** userComparisonValue — the KG/CBM ratio threshold (only used when enabled). */
  comparisonValue: number | string | null;
  /**
   * ค่าเทียบ ON THE ORDER TOTAL (ภูม/พี่ป๊อป 2026-06-18: "ค่าเทียบเราไม่เทียบ
   * ต่อแทรค เราเทียบต่อ จำนวนรวม กิโล/คิว ด้านบน"). When a multi-tracking order
   * is repriced, the KG-vs-CBM BASIS decision (kgPerCbm > threshold) must be made
   * on the AGGREGATE Σweight÷Σcbm of the whole order — NOT this single row's
   * weight/cbm. The per-row PRICE still uses this row's own weight/cbm × the
   * chosen rate; only the basis DECISION switches to the order total.
   *
   * Optional + back-compat: when undefined (single-row edit / non-tracking
   * callers) the decision falls back to this row's own kgPerCbm (legacy
   * behaviour). Only consulted when comparison pricing is ON.
   */
  comparisonKgPerCbm?: number;
  /**
   * customComparisonSwitch — per-order comparison override. When ON the legacy
   * (calPriceForwarder L2098-2106) forces the threshold to 200 (fresh order) /
   * 150 (linked refOrder). When ON, comparisonEnabled is treated as true.
   */
  customComparison?: boolean;
  /** Whether this order is linked to a refOrder (drives the 200 vs 150 default). */
  hasRefOrder?: boolean;

  /**
   * The caller PINNED a basis on purpose (the estimator / quote tool asking
   * "ถ้าคิดตามกิโล ได้เท่าไร") — it wants THAT basis' number, not the charge
   * policy. Set true by actions/forwarder-quote.ts + actions/admin/quote-multimode.ts
   * when input.basis is 'kg' or 'cbm'. When true, CHARGE_HIGHER_BASIS is skipped.
   */
  basisPinned?: boolean;

  /**
   * Override the CHARGE_HIGHER_BASIS policy for THIS call. Omitted → the policy
   * const applies (what every production caller does). Tests pass `false` to keep
   * exercising the legacy ratio / ยึดตามคิว selectors, so the day the owner says
   * "สถานการณ์ปกติแล้ว" the revert is one const flip and the old behaviour is
   * already proven green.
   */
  chargeHigherBasis?: boolean;

  /**
   * ── OWNER-LOCKED DOC-TIER DISCOUNT (owner 2026-06-16) ──────────────────
   * Pacred-NATIVE conditional discount (NOT in legacy PCS). When true, after
   * the per-basis CBM rate is resolved, subtract a fixed THB/CBM discount
   * (default ฿800/CBM → เรือ 3,700→2,900 · รถ 5,700→4,900) BEFORE the CBM
   * subtotal + the max(cbm,kg)/comparison decision are computed.
   *
   * Eligibility (computed by the CALLER, both conditions required):
   *   1. tax-doc = ใบกำกับ OR ใบขน  (tb_forwarder.tax_doc_pref ∈
   *      {'tax_invoice','customs'} — migration 0127), AND
   *   2. order came via โอนหยวน OR ฝากนำเข้า (the full-loop cargo-import
   *      service — i.e. it is a tb_forwarder import row; see live-rate.ts
   *      `isCargoImportServiceRow`).
   *
   * Applies to the CBM basis ONLY (owner specified CBM). The kg path is left
   * unchanged. When falsy → behaviour is byte-identical to before (back-compat).
   */
  docTierEligible?: boolean;
  /**
   * The fixed THB-per-CBM discount to subtract when docTierEligible. Default 0
   * so the discount is a strict no-op unless BOTH the eligibility flag AND a
   * positive amount are supplied — the caller passes the config-driven value
   * (business_config `cargo.doc_tier_discount.cbm_thb`, default 800).
   */
  docTierDiscountCbm?: number | string | null;
}

export interface ResolvedRate {
  /** The unit rate chosen (baht per kg or per cbm). */
  rate: number;
  /** Which basis won. */
  basis: RateBasis;
  /** Which waterfall tier the rate came from. */
  source: RateSource;
  /**
   * The transport subtotal = value × rate, rounded to 2 satang. This becomes
   * tb_forwarder.fTransportPrice → NO. It becomes tb_forwarder.fTotalPrice (the
   * China→Thailand transport · legacy naming). See module header FLAG.
   */
  transportSubtotal: number;
  /** Legacy fRefPrice — '1' billed-by-KG · '2' billed-by-CBM. */
  refPrice: 1 | 2;
  /**
   * True when the chosen rate resolved to 0 (no rate row matched / legacy
   * `$error[]` path). The CALLER MUST treat this as a hard flag — never persist
   * a silent ฿0 transport price. Legacy returned 0 and surfaced an error msg.
   */
  rateMissing: boolean;
  /**
   * The owner-locked doc-tier discount (THB/CBM) actually subtracted from the
   * resolved CBM rate. 0 unless the order was docTierEligible AND won on the CBM
   * basis. Surfaced for transparency (UI "−฿800/คิว" note · audit). When the kg
   * basis wins, the discount does not apply → this is 0 even if eligible.
   */
  docDiscountApplied: number;
}

// ────────────────────────────────────────────────────────────
// numeric coercion (legacy stores some price cols as varchar)
// ────────────────────────────────────────────────────────────
function n(v: number | string | null | undefined): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const p = parseFloat(v);
  return Number.isFinite(p) ? p : 0;
}
const round2 = (x: number) => Math.round(x * 100) / 100;

/**
 * ค่าเทียบ (KG-vs-CBM threshold) bounds — owner 2026-06-23: default 250, the staff
 * may set it anywhere in [250, 350]. A 0/blank/invalid value → the 250 default.
 * Exported so the caller (live-rate.ts) clamps the admin-typed tick value the same
 * way the resolver does. NB: only the comparison-TICK path is clamped — the
 * estimator's basis PINS (comparisonValue 0 = force-KG, 1e9 = force-CBM) flow
 * through the general comparisonEnabled path untouched.
 */
export const COMPARISON_DEFAULT = 250;
export const COMPARISON_MIN = 250;
export const COMPARISON_MAX = 350;

/**
 * 🔴 CHARGE-THE-HIGHER-BASIS POLICY (owner 2026-07-21 · TEMPORARY) ─────────────
 *
 * owner (verbatim): *"สมการค่าเทียบตอนนี้เราว่าแปลกๆ อะ บางงานกำไรน้อย บางงานขาดทุน
 * บางงานเลือกเกณฑ์ที่ได้กำไรน้อยกว่าหนะครับ ตอนนี้ให้เลือก ค่าที่แพงกว่าไปเก็บลูกค้า
 * ก่อนเลยครับ จนกว่าสถานะการจะกลับมาปกติ"*
 *
 * WHY THE OLD BEHAVIOUR COULD PICK THE CHEAPER SIDE — two selectors, neither
 * compares MONEY:
 *   • ค่าเทียบ ติ๊ก → picks by the DENSITY RATIO (kg/คิว > threshold → KG). A dense
 *     shipment whose KG price happens to be lower than its CBM price still bills KG.
 *   • ไม่ติ๊ก → since 2026-06-23 it billed CBM ALWAYS ("ยึดตามคิว"), which drops the
 *     legacy "ราคามากสุด" and undercharges a heavy/dense shipment. (Both quote tools
 *     still DOCUMENT auto as "ราคามากสุด" — the comment was stale, the money was real.)
 *
 * THE POLICY: compute BOTH candidate prices and charge the HIGHER one. A tie keeps
 * CBM (legacy `priceCBM >= priceKg` → CBM · forwarder.php L1993). The chosen rate,
 * basis and fRefPrice all follow the winner so the bill/doc stay self-consistent.
 * The doc-tier ฿/คิว discount still lowers the CBM candidate BEFORE the comparison.
 *
 * 🔵 SHIPMENT-LEVEL DECISION (ภูม/พี่ป๊อป 2026-07-22 "ยึดตามหัว shipment ไปเลย"):
 * when the caller threads the shipment-TOTAL ratio (`comparisonKgPerCbm` — the
 * multi-tracking editor save AND the MOMO auto-fill BOTH do) "the higher basis" is
 * decided on the WHOLE SHIPMENT, not this one box: Σweight×kgRate vs Σcbm×cbmRate ≡
 * (ratio × kgRate) vs cbmRate. Every sibling row then lands on the SAME basis → the
 * Σ of the rows == the shipment total (== the per-tracking preview footer), not the Σ
 * of each box's own dearer side (which over-charges a light box onto CBM inside a
 * weight shipment · the "กดบันทึกแล้วราคาไม่เปลี่ยน" divergence ภูม hit on 1784007549).
 * Without an aggregate (single-row edit / callers that pass undefined) it stays this
 * row's own kg-price vs cbm-price — byte-identical to before.
 *
 * SCOPE: the SELL basis only. Cost, ค่าส่งไทย, เหมาๆ, crate, discounts, WHT are
 * untouched, and NOTHING is re-priced retroactively — a stored row only changes when
 * something already re-prices it (save dimensions / rate-card save), and the billed
 * guards elsewhere still refuse settled rows.
 *
 * ⚠️ TO REVERT when the owner says สถานการณ์ปกติ: flip this to `false` — the ratio
 * (ค่าเทียบ ติ๊ก) + "ยึดตามคิว" default come back exactly as before. Nothing else to undo.
 */
export const CHARGE_HIGHER_BASIS = true;
export function clampComparison(v: number | string | null | undefined): number {
  const x = n(v);
  if (!(x > 0)) return COMPARISON_DEFAULT;
  return Math.max(COMPARISON_MIN, Math.min(x, COMPARISON_MAX));
}

/**
 * Pick the general tiered rate for a basis + quantity.
 * KG  tiers (forwarder.php L1845-1862): value<=100 → t1 ; value>100 && value<500 → t2 ; else t3.
 * CBM tiers (forwarder.php L1863-1880): value<=2  → t1 ; value>2   && value<5   → t2 ; else t3.
 * NB the legacy boundary quirk: value==100 → t1, value==500 → t3 (string `<`/`<=`
 * on numeric values still compares numerically). Reproduced exactly.
 */
function generalTierRate(
  basis: RateBasis,
  value: number,
  tiers: { tier1: number | string | null; tier2: number | string | null; tier3: number | string | null } | null,
): number {
  if (!tiers) return 0;
  if (basis === "kg") {
    if (value <= 100) return n(tiers.tier1);
    if (value > 100 && value < 500) return n(tiers.tier2);
    return n(tiers.tier3);
  }
  // cbm
  if (value <= 2) return n(tiers.tier1);
  if (value > 2 && value < 5) return n(tiers.tier2);
  return n(tiers.tier3);
}

/**
 * Apply the owner-locked doc-tier discount to a CBM unit rate (owner 2026-06-16).
 * Fixed THB/CBM subtraction, floored at 0. Pure + side-effect-free. Returns the
 * discounted rate AND the discount amount actually applied (for transparency).
 * No-op when not eligible or the discount is non-positive.
 */
function applyDocTierCbmDiscount(
  cbmRate: number,
  eligible: boolean,
  discountCbm: number,
): { rate: number; applied: number } {
  if (!eligible || discountCbm <= 0 || cbmRate <= 0) {
    return { rate: cbmRate, applied: 0 };
  }
  const discounted = Math.max(0, cbmRate - discountCbm);
  return { rate: discounted, applied: round2(cbmRate - discounted) };
}

/**
 * Resolve the unit rate for ONE basis, mirroring legacy `getPrice()`. Returns
 * the rate AND `compare2` (a legacy VIP KG-rate==0 → CBM fallback flag; always
 * false now that the VIP-group tier is retired — kept for the caller's shape).
 *
 * Precedence inside one basis call: manual → SVIP → general. (Whether the row is
 * SVIP is decided by the candidate flag the caller built from the same probe the
 * legacy ran; a non-SVIP row is always priced on the general tiers.)
 */
function rateForBasis(
  basis: RateBasis,
  c: ResolveRateCandidates,
  value: number,
): { rate: number; source: RateSource; compare2: boolean } {
  // 0. manual override (forwarder.php L1806-1818)
  if (c.manualOverride) {
    const rate = basis === "kg" ? n(c.manualKg) : n(c.manualCbm);
    return { rate, source: "manual", compare2: false };
  }

  // SVIP (forwarder.php L1906-1929) — flat per-user (= the per-customer/profile
  //   rate). SVIP KG-fallback is commented out in legacy, so NO compare2 here.
  if (c.isSvip) {
    const rate = basis === "kg" ? n(c.svipKg) : n(c.svipCbm);
    return { rate, source: "svip", compare2: false };
  }

  // general tiered (forwarder.php L1844-1882) — the final fallback for ANY
  //   non-SVIP customer. The legacy VIP-group tier (tb_rate_vip_*) was retired
  //   2026-07-10 (materialized to per-customer SVIP · zero customers on a group).
  const rate = generalTierRate(basis, value, basis === "kg" ? c.generalKg : c.generalCbm);
  return { rate, source: "general", compare2: false };
}

/**
 * Resolve the forwarder transport rate + basis the LIVE legacy way.
 *
 * Faithful port of forwarder.php `update_data` (L1934-2013). The CALLER must
 * have already:
 *   - computed CBMProduct (= fAmountCount==1 ? fVolume : fVolume*fAmount) and
 *     passed it as `input.volumeCbm`,
 *   - read the candidate rates from SQL into `candidates`.
 */
export function resolveForwarderRate(
  candidates: ResolveRateCandidates,
  input: ResolveRateInput,
): ResolvedRate {
  const weight = n(input.weightKg);
  const cbm = n(input.volumeCbm);

  // KGPerCBM (forwarder.php L1942-1944) — guard /0 exactly like legacy.
  const kgPerCbm = cbm !== 0 ? weight / cbm : 0;

  // ── owner-locked doc-tier discount inputs (owner 2026-06-16) ──
  // Eligibility + amount come from the CALLER (tax_doc_pref + yuan/import signal
  // + config). Both must be present for the discount to fire; otherwise this is
  // a strict no-op (back-compat). Applies to the CBM rate ONLY, and NEVER to a
  // manual admin-typed override (the admin already chose that exact rate).
  const docEligible = input.docTierEligible === true && !candidates.manualOverride;
  const docDiscountCbm = Math.max(0, n(input.docTierDiscountCbm));

  // Comparison threshold. customComparison forces 200 (fresh) / 150 (refOrder)
  // per calPriceForwarder L2098-2106; otherwise use the user's stored value.
  const comparisonOn = input.comparisonEnabled || input.customComparison === true;
  let threshold = n(input.comparisonValue);
  if (input.customComparison === true) {
    // owner 2026-06-23: ค่าเทียบ default 250, ปรับได้ในช่วง 250–350 (เลิก legacy
    // 200/150). hasRefOrder no longer changes the threshold — the staff types it.
    threshold = clampComparison(n(input.comparisonValue) || 250);
  }

  // ค่าเทียบ basis decision uses the ORDER-TOTAL ratio when the caller supplies
  // it (multi-tracking save · ภูม 2026-06-18); else this row's own (back-compat).
  // Require > 0 (not just finite): a degenerate 0 aggregate falls back to the
  // row's own ratio — which for a zero-weight order is also 0 → same CBM result,
  // but makes the resolver self-defending against a caller that sends 0 to mean
  // "no aggregate" (review 2026-06-18 nit).
  const decisionKgPerCbm =
    input.comparisonKgPerCbm != null &&
    Number.isFinite(input.comparisonKgPerCbm) &&
    input.comparisonKgPerCbm > 0
      ? input.comparisonKgPerCbm
      : kgPerCbm;

  // ── 🔴 CHARGE THE HIGHER BASIS (owner 2026-07-21 · see CHARGE_HIGHER_BASIS) ──
  // Runs BEFORE both selectors, because both of them can land on the cheaper side.
  // Skipped when the caller pinned a basis (estimator "ถ้าคิดตามกิโล ได้เท่าไร").
  if ((input.chargeHigherBasis ?? CHARGE_HIGHER_BASIS) && !input.basisPinned) {
    const kgProbeH = rateForBasis("kg", candidates, weight);
    const cbmProbeH = rateForBasis("cbm", candidates, cbm);
    const cbmDiscH = applyDocTierCbmDiscount(cbmProbeH.rate, docEligible, docDiscountCbm);
    const priceKgH = round2(weight * kgProbeH.rate);
    const priceCbmH = round2(cbm * cbmDiscH.rate);
    // ── SHIPMENT-level charge-higher (ภูม/พี่ป๊อป 2026-07-22 "ยึดตามหัว shipment ไปเลย") ──
    // "เก็บค่าที่แพงกว่า" is decided on the WHOLE SHIPMENT, not this one box, WHENEVER
    // the caller threads the shipment-total ratio (the multi-tracking editor save AND
    // the MOMO auto-fill BOTH do — comparisonKgPerCbm). WHY: summing each box's OWN
    // dearer side over-charges vs the shipment total — a light box (2kg/0.015คิว) flips
    // to CBM on its own (76.57 > 34) while the heavy shipment as a whole is a weight
    // shipment. That made the SAVE (Σ per-row-max = 12,206.07) diverge from the
    // per-tracking preview footer (shipment total = 12,163.50), and violated the owner's
    // "คิดเป็นชิปเม้น" rule. At shipment scope the dearer basis is
    //     Σweight × kgRate   vs   Σcbm × cbmRate     ≡   (ratio × kgRate)  vs  cbmRate
    // (both ÷ Σcbm) — computable from the ratio + the two unit rates, so EVERY sibling
    // row lands on the SAME basis → Σ rows == the shipment total (== the preview). Note
    // `decisionKgPerCbm` already holds the aggregate ratio when supplied (>0), else this
    // row's own — so WITHOUT an aggregate (single-row edit / callers that pass undefined)
    // the decision is this row's own kg-price vs cbm-price, BYTE-IDENTICAL to before.
    // Still "charge the higher basis" — just at shipment granularity. The per-CBM
    // doc-tier discount already lowered cbmDiscH.rate, so the comparison stays fair.
    const shipmentDecision =
      input.comparisonKgPerCbm != null &&
      Number.isFinite(input.comparisonKgPerCbm) &&
      input.comparisonKgPerCbm > 0;
    const cbmWins = shipmentDecision
      ? cbmDiscH.rate >= decisionKgPerCbm * kgProbeH.rate  // Σcbm×cbmRate vs Σweight×kgRate (÷Σcbm) · tie → CBM
      : priceCbmH >= priceKgH;                             // this row's own · tie → CBM (unchanged)
    if (cbmWins) {
      return {
        rate: cbmDiscH.rate,
        basis: "cbm",
        source: cbmProbeH.source,
        transportSubtotal: priceCbmH,
        refPrice: 2,
        // Both sides ฿0 = no usable rate card → the caller's hard flag, same as before.
        rateMissing: cbmProbeH.rate === 0 && kgProbeH.rate === 0,
        docDiscountApplied: cbmDiscH.applied,
      };
    }
    return {
      rate: kgProbeH.rate,
      basis: "kg",
      source: kgProbeH.source,
      transportSubtotal: priceKgH,
      refPrice: 1,
      rateMissing: kgProbeH.rate === 0,
      docDiscountApplied: 0, // the ฿/คิว discount only exists on the CBM side
    };
  }

  if (comparisonOn) {
    // ── comparison-priced (forwarder.php L1947-1980) ──
    if (decisionKgPerCbm > threshold) {
      // bill by KG (compare=1, value=fWeight, refPrice=1)
      let value = weight;
      const probe = rateForBasis("kg", candidates, value);
      // VIP KG-rate==0 → fell back to CBM → switch value to CBMProduct
      // (forwarder.php L1953-1956 / L1969-1972).
      if (probe.compare2) value = cbm;
      const finalBasis: RateBasis = probe.compare2 ? "cbm" : "kg";
      const r = finalBasis === "kg" ? probe : rateForBasis("cbm", candidates, value);
      // Doc-tier discount applies only when the chosen basis is CBM. The legacy
      // VIP KG→CBM fallback (compare2) bills the KG quantity at the CBM rate →
      // its final basis IS cbm, so it qualifies for the per-CBM-rate discount.
      const disc = applyDocTierCbmDiscount(r.rate, docEligible && finalBasis === "cbm", docDiscountCbm);
      const rate = disc.rate;
      return {
        rate,
        basis: finalBasis,
        source: r.source,
        transportSubtotal: round2(value * rate),
        refPrice: 1, // legacy keeps refPrice=1 in the comparison-KG branch
        rateMissing: rate === 0,
        docDiscountApplied: disc.applied,
      };
    }
    // bill by CBM (compare=2, value=CBMProduct, refPrice=2)
    const value = cbm;
    const r = rateForBasis("cbm", candidates, value);
    const disc = applyDocTierCbmDiscount(r.rate, docEligible, docDiscountCbm);
    return {
      rate: disc.rate,
      basis: "cbm",
      source: r.source,
      transportSubtotal: round2(value * disc.rate),
      refPrice: 2,
      rateMissing: disc.rate === 0,
      docDiscountApplied: disc.applied,
    };
  }

  // ── No ค่าเทียบ tick → DEFAULT "คิดตามคิว" (CBM) ──────────────────────────
  // owner 2026-06-23: "ยึดตามคิว เป็น default เพราะ MOMO เก็บเราเป็นคิว · ถ้าอยากคิด
  // กิโล ก็ค่อยติ๊กค่าเทียบ". Without the tick the basis is ALWAYS CBM — for the system
  // rate AND a manual/custom-rate override (the admin typing เรท ฿/กก. + ฿/CBM does
  // NOT change the basis; คิว stays the default · owner re-confirmed on order
  // 1780103566 — manual rate must still bill whole-order CBM, not per-line max). This
  // replaces the legacy "ราคามากสุด" max-of-both that silently billed dense items by KG.
  // KG-for-dense is the comparison-tick path above.
  const kgProbe = rateForBasis("kg", candidates, weight);
  const cbmProbe = rateForBasis("cbm", candidates, cbm);
  const cbmDisc = applyDocTierCbmDiscount(cbmProbe.rate, docEligible, docDiscountCbm);
  const priceKg = round2(weight * kgProbe.rate);
  const priceCbm = round2(cbm * cbmDisc.rate);

  // KG fallback ONLY when there is NO CBM rate at all but a KG rate exists — so a
  // kg-only rate card / kg-only manual override is never forced onto a ฿0 CBM. This
  // is NOT max-of-both: when a CBM rate exists, CBM always wins (ยึดตามคิว).
  if (cbmProbe.rate === 0 && kgProbe.rate > 0) {
    return {
      rate: kgProbe.rate,
      basis: "kg",
      source: kgProbe.source,
      transportSubtotal: priceKg,
      refPrice: 1,
      rateMissing: false,
      docDiscountApplied: 0,
    };
  }
  // Default → CBM. A missing CBM rate (and no KG to fall back to) is a hard flag.
  return {
    rate: cbmDisc.rate,
    basis: "cbm",
    source: cbmProbe.source,
    transportSubtotal: priceCbm,
    refPrice: 2,
    docDiscountApplied: cbmDisc.applied,
    rateMissing: cbmProbe.rate === 0,
  };
}

/** Per-basis unit rates (baht/kg + baht/cbm) for the SAME tuple, BEFORE the
 *  KG-vs-CBM winner is picked. Each is null when no rate card matched that basis
 *  (the caller renders "—" for that line rather than fabricating ฿0). */
export interface BothBasisRates {
  /** baht per kg (after any applicable adjustment) · null = no rate card. */
  kgRate: number | null;
  /** baht per cbm (doc-tier CBM discount applied, mirroring the winner path) · null = no rate card. */
  cbmRate: number | null;
}

/**
 * Resolve BOTH the kg unit rate AND the cbm unit rate for the same candidates +
 * inputs, WITHOUT picking a winner — for a DISPLAY-ONLY breakdown that must show
 * "คิดตามน้ำหนัก" and "คิดตามปริมาตร" on the SAME line even when the system only
 * bills one basis (owner ภูม 2026-06-19: "คิดตามน้ำหนัก ไม่เห็นขึ้นเลย ·
 * ต้องคิดตามคิวเป็น default · ถ้าอยากเปลี่ยนค่อยกดติ๊ก").
 *
 * PURE + side-effect-free. Re-uses the EXACT same `rateForBasis` probe +
 * `applyDocTierCbmDiscount` that `resolveForwarderRate` runs internally, so the
 * per-basis unit rate shown == the unit rate the SAVE would price that basis on
 * (no parallel formula, no drift). The CBM doc-tier discount is applied to the
 * cbm rate exactly as the winner path does (the kg path never gets it). A genuine
 * 0 rate (no card for the tuple) → null so the UI shows "—" for that line only.
 *
 * NB: this does NOT decide the winner or apply the comparison/max-price logic —
 * that stays the sole job of `resolveForwarderRate` (the chosen basis still drives
 * the bill). This helper only surfaces the two unit rates for the preview labels.
 */
export function resolveBothBasisRates(
  candidates: ResolveRateCandidates,
  input: ResolveRateInput,
): BothBasisRates {
  const weight = n(input.weightKg);
  const cbm = n(input.volumeCbm);

  // Same doc-tier inputs the winner path uses (CBM-only · never on manual).
  const docEligible = input.docTierEligible === true && !candidates.manualOverride;
  const docDiscountCbm = Math.max(0, n(input.docTierDiscountCbm));

  // Probe each basis with the SAME quantity the winner path uses (kg→weight,
  // cbm→cbm) so a tiered/general lookup picks the same tier.
  const kgProbe = rateForBasis("kg", candidates, weight);
  const cbmProbe = rateForBasis("cbm", candidates, cbm);
  const cbmDisc = applyDocTierCbmDiscount(cbmProbe.rate, docEligible, docDiscountCbm);

  return {
    kgRate: kgProbe.rate > 0 ? kgProbe.rate : null,
    cbmRate: cbmDisc.rate > 0 ? cbmDisc.rate : null,
  };
}
