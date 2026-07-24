/**
 * Forwarder price engine — port of legacy apiCalPrice.php (PCS Cargo).
 *
 * Pricing rules (locked, mirror legacy logic):
 *
 * 1. **Rate resolution waterfall** (most specific wins):
 *      rate_custom_hs → rate_custom_user → rate_vip → rate_general
 *    The first non-null match for the (warehouse, transport, product,
 *    basis) tuple is the unit rate.
 *
 * 2. **KG vs CBM** — for rate_basis='auto', use whichever produces the
 *    higher price (weight × kg-rate  vs  volume × cbm-rate). When the
 *    user pins a basis ('kg' or 'cbm'), use that one only.
 *
 * 3. **Tiered general rate** — rate_general has tier1/2/3. Tier
 *    selection is by total billable quantity (kg or cbm):
 *      tier1: < threshold1
 *      tier2: threshold1 ≤ q < threshold2
 *      tier3: q ≥ threshold2
 *    The legacy tb_settings stored thresholds in the per-customer-group
 *    config; for now we use sensible defaults (10 / 50 kg, 0.5 / 3 cbm)
 *    until admin Phase G ships configurable thresholds.
 *
 * 4. **Juristic withholding (หัก ณ ที่จ่าย)** — when profile.account_type='juristic',
 *    deduct settings.juristic_discount_pct (default 1%) from the transport subtotal.
 *    ⚠️ owner 2026-07-22 ABOLISHED the ฿1,000 minimum → it now fires on ANY positive
 *    subtotal. `settings.juristic_discount_threshold` is therefore NO LONGER READ
 *    (the column survives for history only). Same rule as the live money SOT
 *    `legacyReceiptAmount` (lib/tax/wht.ts) — keep the two in step.
 *    NOTE the legacy column name says "discount", but this is a WITHHOLDING the
 *    customer remits to the Revenue Department and must issue a 50-ทวิ for.
 *
 * 5. **Adders** (added on top of transport subtotal):
 *      service_fee (default 50 THB — Pacred handling)
 *      crate_price          when crate=true
 *      qc_price             when qc=true
 *      domestic_china_thb   (CNY transport in China, already converted)
 *      thailand_delivery_thb
 *      other_price
 *      price_update         (admin adjustment)
 *      − discount
 *
 * 6. **Round** — final total rounds to 2 decimals (THB satang).
 *
 * The shape lets callers use it in two places without a DB roundtrip:
 *  - Server action createForwarder: compute final price at submit
 *  - Client-side preview: estimate as the user types (call calcPrice
 *    via Server Action, since rate tables live in DB)
 */

export type RateRow = {
  source_warehouse: string;
  transport_type:   string;
  product_type:     string;
  basis:            "kg" | "cbm";
  tier1?: number | null;
  tier2?: number | null;
  tier3?: number | null;
  rate?:  number | null;          // for flat (vip / custom) rates
};

export type RateLookupResult = {
  rate:  number;
  source: "custom_hs" | "custom_user" | "vip" | "general";
  tier?: 1 | 2 | 3;
};

export type CalcPriceInput = {
  // shipment classification
  source_warehouse: "guangzhou" | "yiwu";
  transport_type:   "truck" | "ship" | "air";
  product_type:     "general" | "tisi" | "fda" | "special";
  rate_basis:       "kg" | "cbm" | "auto";

  // measurements
  weight_kg:        number;
  volume_cbm:       number;

  // adders
  crate:             boolean;
  crate_price:       number;
  qc:                boolean;
  qc_price:          number;
  domestic_china_thb: number;
  thailand_delivery_thb: number;
  other_price:       number;
  price_update:      number;
  discount:          number;
  service_fee:       number;

  // juristic flag (drives discount)
  is_juristic:       boolean;

  // resolved rates (caller does the SQL waterfall + hands us the four candidates)
  rate_custom_hs?:   { kg?: number; cbm?: number } | null;
  rate_custom_user?: { kg?: number; cbm?: number } | null;
  rate_vip?:         { kg?: number; cbm?: number } | null;
  rate_general?:    {
    kg?:  { tier1?: number | null; tier2?: number | null; tier3?: number | null };
    cbm?: { tier1?: number | null; tier2?: number | null; tier3?: number | null };
  } | null;

  // settings
  settings: {
    juristic_discount_threshold: number;
    juristic_discount_pct:       number;
    tier_kg_threshold1:          number;
    tier_kg_threshold2:          number;
    tier_cbm_threshold1:         number;
    tier_cbm_threshold2:         number;
  };
};

export type CalcPriceBreakdown = {
  basis_used:           "kg" | "cbm";
  rate_used:            number;
  rate_source:          RateLookupResult["source"];
  rate_tier?:           1 | 2 | 3;
  transport_subtotal:   number;       // rate × quantity (kg or cbm)
  juristic_discount:    number;       // ≥ 0
  service_fee:          number;
  crate_price:          number;
  qc_price:             number;
  domestic_china_thb:   number;
  thailand_delivery_thb: number;
  other_price:          number;
  price_update:         number;
  discount:             number;
  total_price:          number;
};

const DEFAULT_TIER_THRESHOLDS = {
  tier_kg_threshold1:  10,
  tier_kg_threshold2:  50,
  tier_cbm_threshold1: 0.5,
  tier_cbm_threshold2: 3,
};

export const DEFAULT_SETTINGS = {
  juristic_discount_threshold: 1000,
  juristic_discount_pct:       0.01,
  ...DEFAULT_TIER_THRESHOLDS,
};

/** Snap a number to 2-decimal THB satang. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Look up the kg or cbm rate for the given basis. Returns null if no match. */
export function resolveRate(
  basis: "kg" | "cbm",
  input: Pick<
    CalcPriceInput,
    "rate_custom_hs" | "rate_custom_user" | "rate_vip" | "rate_general"
    | "weight_kg" | "volume_cbm" | "settings"
  >,
): RateLookupResult | null {
  // 1. rate_custom_hs (most specific)
  const customHs = input.rate_custom_hs?.[basis];
  if (customHs != null && customHs > 0) {
    return { rate: customHs, source: "custom_hs" };
  }
  // 2. rate_custom_user
  const customUser = input.rate_custom_user?.[basis];
  if (customUser != null && customUser > 0) {
    return { rate: customUser, source: "custom_user" };
  }
  // 3. rate_vip
  const vip = input.rate_vip?.[basis];
  if (vip != null && vip > 0) {
    return { rate: vip, source: "vip" };
  }
  // 4. rate_general — pick tier based on quantity
  const general = input.rate_general?.[basis];
  if (general) {
    const q = basis === "kg" ? input.weight_kg : input.volume_cbm;
    const t1 = basis === "kg"
      ? input.settings.tier_kg_threshold1
      : input.settings.tier_cbm_threshold1;
    const t2 = basis === "kg"
      ? input.settings.tier_kg_threshold2
      : input.settings.tier_cbm_threshold2;

    let tier: 1 | 2 | 3 = 1;
    let rate: number | null | undefined = general.tier1;
    if (q >= t2 && general.tier3 != null && general.tier3 > 0) {
      tier = 3;
      rate = general.tier3;
    } else if (q >= t1 && general.tier2 != null && general.tier2 > 0) {
      tier = 2;
      rate = general.tier2;
    }
    if (rate != null && rate > 0) {
      return { rate, source: "general", tier };
    }
  }
  return null;
}

export function calcPrice(input: CalcPriceInput): CalcPriceBreakdown {
  // 1. Decide basis: 'auto' = pick the side that yields higher price
  let basis: "kg" | "cbm";
  let rateLookup: RateLookupResult | null;

  if (input.rate_basis === "kg") {
    basis = "kg";
    rateLookup = resolveRate("kg", input);
  } else if (input.rate_basis === "cbm") {
    basis = "cbm";
    rateLookup = resolveRate("cbm", input);
  } else {
    // auto — compute both and keep higher
    const kgRate  = resolveRate("kg",  input);
    const cbmRate = resolveRate("cbm", input);
    const kgPrice  = kgRate  ? kgRate.rate  * input.weight_kg : 0;
    const cbmPrice = cbmRate ? cbmRate.rate * input.volume_cbm : 0;
    if (cbmPrice > kgPrice) {
      basis = "cbm";
      rateLookup = cbmRate;
    } else {
      basis = "kg";
      rateLookup = kgRate;
    }
  }

  const rate = rateLookup?.rate ?? 0;
  const quantity = basis === "kg" ? input.weight_kg : input.volume_cbm;
  const transportSubtotal = round2(rate * quantity);

  // 2. Juristic withholding 1% — owner 2026-07-22: NO minimum. Fires on any
  //    positive subtotal (the old `>= juristic_discount_threshold` gate is gone).
  let juristicDiscount = 0;
  if (input.is_juristic && transportSubtotal > 0) {
    juristicDiscount = round2(transportSubtotal * input.settings.juristic_discount_pct);
  }

  // 3. Adders
  const crate     = input.crate ? input.crate_price : 0;
  const qc        = input.qc    ? input.qc_price    : 0;
  const total = round2(
    transportSubtotal
    - juristicDiscount
    + input.service_fee
    + crate
    + qc
    + input.domestic_china_thb
    + input.thailand_delivery_thb
    + input.other_price
    + input.price_update
    - input.discount,
  );

  return {
    basis_used:            basis,
    rate_used:             rate,
    rate_source:           rateLookup?.source ?? "general",
    rate_tier:             rateLookup?.tier,
    transport_subtotal:    transportSubtotal,
    juristic_discount:     juristicDiscount,
    service_fee:           input.service_fee,
    crate_price:           crate,
    qc_price:              qc,
    domestic_china_thb:    input.domestic_china_thb,
    thailand_delivery_thb: input.thailand_delivery_thb,
    other_price:           input.other_price,
    price_update:          input.price_update,
    discount:              input.discount,
    total_price:           total,
  };
}
