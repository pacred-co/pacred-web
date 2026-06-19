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
 * does the SQL waterfall (reads tb_rate_custom / tb_rate_vip / tb_rate_g tables
 * + tb_users.coID) and hands us the resolved candidate rates. We only do the
 * legacy decision logic (precedence + tier + KG/CBM selection). No server-only.
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
 *     - num_rows == 0  → general / VIP path (step 2/3)
 *     - num_rows  > 0  → SVIP path (step 4)
 *  2. general (coID == 'PCS', L1844-1882):  tiered.
 *       compare==1 (KG):  value<=100 → rgKG1 ; value>100 && value<500 → rgKG2 ; else → rgKG3
 *       compare==2 (CBM): value<=2  → rgCBM1; value>2  && value<5   → rgCBM2; else → rgCBM3
 *  3. VIP (coID != 'PCS', L1883-1905):  flat by coID.
 *       compare==1 (KG):  tb_rate_vip_kg.rKG  (FALLBACK: if rKG==0 → use rCBM + set compare2=1)
 *       compare==2 (CBM): tb_rate_vip_cbm.rCBM
 *  4. SVIP (L1906-1929):  flat by userID.
 *       compare==1 (KG):  tb_rate_custom_kg.rKG   (SVIP KG-fallback is COMMENTED OUT in legacy)
 *       compare==2 (CBM): tb_rate_custom_cbm.rCBM
 *  → price = number_format(value * rate, 2)   (L1882/1904/1927)
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

/** Where the rate came from (legacy waterfall tier). */
export type RateSource = "manual" | "svip" | "vip" | "general";

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
   * General-customer flag — legacy `coID == 'PCS'` (forwarder.php L1844).
   * When NOT SVIP: true → tiered general (tb_rate_g_*); false → VIP group.
   */
  isGeneral: boolean;
  /** General tiered KG rates (tb_rate_g_kg.rgKG1/2/3). */
  generalKg: { tier1: number | string | null; tier2: number | string | null; tier3: number | string | null } | null;
  /** General tiered CBM rates (tb_rate_g_cbm.rgCBM1/2/3). */
  generalCbm: { tier1: number | string | null; tier2: number | string | null; tier3: number | string | null } | null;

  /** VIP-group KG rate (tb_rate_vip_kg.rKG) for the coID + tuple. */
  vipKg: number | string | null;
  /** VIP-group CBM rate (tb_rate_vip_cbm.rCBM) for the coID + tuple. */
  vipCbm: number | string | null;
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
 * the rate AND `compare2` (legacy VIP KG-rate==0 → CBM fallback flag).
 *
 * Precedence inside one basis call: manual → SVIP → general/VIP. (Whether the
 * row is SVIP/general/VIP is decided by the candidate flags the caller built
 * from the same probes the legacy ran.)
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

  // 4. SVIP (forwarder.php L1906-1929) — flat per-user. SVIP KG-fallback is
  //    commented out in legacy, so NO compare2 here.
  if (c.isSvip) {
    const rate = basis === "kg" ? n(c.svipKg) : n(c.svipCbm);
    return { rate, source: "svip", compare2: false };
  }

  // 2. general tiered (forwarder.php L1844-1882)
  if (c.isGeneral) {
    const rate = generalTierRate(basis, value, basis === "kg" ? c.generalKg : c.generalCbm);
    return { rate, source: "general", compare2: false };
  }

  // 3. VIP group (forwarder.php L1883-1905). KG path: if rKG==0 → use rCBM +
  //    set compare2=1 (the legacy KG→CBM fallback, L1890-1896).
  if (basis === "kg") {
    const rKg = n(c.vipKg);
    if (rKg === 0) {
      return { rate: n(c.vipCbm), source: "vip", compare2: true };
    }
    return { rate: rKg, source: "vip", compare2: false };
  }
  return { rate: n(c.vipCbm), source: "vip", compare2: false };
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
    threshold = input.hasRefOrder ? 150 : 200;
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

  // ── "ราคามากสุด" — no comparison (forwarder.php L1983-2010) ──
  // Compute BOTH totals; legacy `priceCBM >= priceKg` → CBM (ties favour CBM).
  // The doc-tier discount is applied to the CBM unit rate BEFORE the subtotal
  // AND the priceCBM>=priceKg decision (owner spec) — so a discounted CBM that
  // dips below the KG total can flip the winner to KG, exactly as a hand-typed
  // lower CBM rate would.
  const kgProbe = rateForBasis("kg", candidates, weight);
  const cbmProbe = rateForBasis("cbm", candidates, cbm);
  const cbmDisc = applyDocTierCbmDiscount(cbmProbe.rate, docEligible, docDiscountCbm);
  const priceKg = round2(weight * kgProbe.rate);
  const priceCbm = round2(cbm * cbmDisc.rate);

  if (priceCbm >= priceKg) {
    return {
      rate: cbmDisc.rate,
      basis: "cbm",
      source: cbmProbe.source,
      transportSubtotal: priceCbm,
      refPrice: 2,
      docDiscountApplied: cbmDisc.applied,
      // Both legs 0 → genuinely no rate. (If only one leg is 0, the larger
      // non-zero leg wins above; here priceCbm>=priceKg with priceCbm 0 means
      // both are 0.)
      rateMissing: cbmProbe.rate === 0 && kgProbe.rate === 0,
    };
  }
  return {
    rate: kgProbe.rate,
    basis: "kg",
    source: kgProbe.source,
    transportSubtotal: priceKg,
    refPrice: 1,
    rateMissing: kgProbe.rate === 0 && cbmProbe.rate === 0,
    // KG basis won → the CBM-only doc-tier discount does not apply here.
    docDiscountApplied: 0,
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
