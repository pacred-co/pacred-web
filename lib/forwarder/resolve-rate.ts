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
   * customComparisonSwitch — per-order comparison override. When ON the legacy
   * (calPriceForwarder L2098-2106) forces the threshold to 200 (fresh order) /
   * 150 (linked refOrder). When ON, comparisonEnabled is treated as true.
   */
  customComparison?: boolean;
  /** Whether this order is linked to a refOrder (drives the 200 vs 150 default). */
  hasRefOrder?: boolean;
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

  // Comparison threshold. customComparison forces 200 (fresh) / 150 (refOrder)
  // per calPriceForwarder L2098-2106; otherwise use the user's stored value.
  const comparisonOn = input.comparisonEnabled || input.customComparison === true;
  let threshold = n(input.comparisonValue);
  if (input.customComparison === true) {
    threshold = input.hasRefOrder ? 150 : 200;
  }

  if (comparisonOn) {
    // ── comparison-priced (forwarder.php L1947-1980) ──
    if (kgPerCbm > threshold) {
      // bill by KG (compare=1, value=fWeight, refPrice=1)
      let value = weight;
      const probe = rateForBasis("kg", candidates, value);
      // VIP KG-rate==0 → fell back to CBM → switch value to CBMProduct
      // (forwarder.php L1953-1956 / L1969-1972).
      if (probe.compare2) value = cbm;
      const finalBasis: RateBasis = probe.compare2 ? "cbm" : "kg";
      const r = finalBasis === "kg" ? probe : rateForBasis("cbm", candidates, value);
      const rate = r.rate;
      return {
        rate,
        basis: finalBasis,
        source: r.source,
        transportSubtotal: round2(value * rate),
        refPrice: 1, // legacy keeps refPrice=1 in the comparison-KG branch
        rateMissing: rate === 0,
      };
    }
    // bill by CBM (compare=2, value=CBMProduct, refPrice=2)
    const value = cbm;
    const r = rateForBasis("cbm", candidates, value);
    return {
      rate: r.rate,
      basis: "cbm",
      source: r.source,
      transportSubtotal: round2(value * r.rate),
      refPrice: 2,
      rateMissing: r.rate === 0,
    };
  }

  // ── "ราคามากสุด" — no comparison (forwarder.php L1983-2010) ──
  // Compute BOTH totals; legacy `priceCBM >= priceKg` → CBM (ties favour CBM).
  const kgProbe = rateForBasis("kg", candidates, weight);
  const cbmProbe = rateForBasis("cbm", candidates, cbm);
  const priceKg = round2(weight * kgProbe.rate);
  const priceCbm = round2(cbm * cbmProbe.rate);

  if (priceCbm >= priceKg) {
    return {
      rate: cbmProbe.rate,
      basis: "cbm",
      source: cbmProbe.source,
      transportSubtotal: priceCbm,
      refPrice: 2,
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
  };
}
