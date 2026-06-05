/**
 * Thai tax engine — per-line withholding tax (WHT) + VAT.
 * เดฟ 2026-05-30 · P0 of the tax-billing-flow rebuild.
 * Design: docs/research/tax-billing-flow-design-2026-05-30.md
 *
 * Replaces the legacy flat "priceFull × 0.01 for juristic" (lib/forwarder/
 * outstanding.ts) which is WRONG by Thai RD rules.
 *
 * RULES — owner-confirmed 2026-05-30 (the 5 accountant answers):
 *   WHT rate depends on the CHARGE TYPE (not the customer):
 *     ค่าขนส่ง (transport — รถ/เรือ/แอร์ · ทั้ง domestic + ระหว่างประเทศ) → 1%
 *     ค่าบริการ (service — ตีลังไม้/QC/ปรับราคา/อื่นๆ · "อะไรก็ตามที่ไม่ใช่สินค้า") → 3%
 *     ค่าเช่า (rental — เช่นค่าเช่าโกดัง/พื้นที่)                            → 5%
 *     ค่าสินค้า (goods)                                                  → 0% (ไม่หัก — สินค้าไม่ใช่บริการ)
 *   WHT base = the charge amount EXCLUSIVE of VAT (never VAT-inclusive).
 *   WHT applies only when the customer is a juristic person (นิติบุคคล).
 *
 *   VAT:
 *     ปกติ 7% (ลดถึง 30 ก.ย. 2026).
 *     ค่าขนส่งระหว่างประเทศ (international transport leg, CN→TH) = VAT 0%
 *       (zero-rated, ม.80/1) → ตัดออกจากฐาน VAT.
 *     ค่าสินค้า (goods) อยู่ในฐาน VAT (owner: "คิด VAT รวมค่าสินค้าด้วย").
 *   tax point ของบริการ = เมื่อรับชำระเงิน (ม.78/1) → ออกใบกำกับ + รับรู้ VAT
 *     ตอน payment-land (จัดการโดย caller).
 *   e-Withholding tax: Pacred ใช้ → service WHT อาจลดเหลือ 1% ตอน remit ผ่าน
 *     e-WHT (กลไก remittance · ไม่ฝังในเรท nominal นี้ · จัดการชั้น P2).
 *
 * All rates are CONFIGURABLE (business_config); DEFAULT_TAX_RATES = 2026 fallback.
 * Pure module (no server-only) — unit-tested with tsx.
 */

export type WhtClass = "transport" | "service" | "rental" | "goods";

export interface TaxRates {
  /** ค่าขนส่ง WHT % (default 1) */
  transportPct: number;
  /** ค่าบริการ/ค่าจ้างทำของ WHT % (default 3) */
  servicePct: number;
  /** ค่าเช่า WHT % (default 5) */
  rentalPct: number;
  /** ค่าสินค้า WHT % (default 0 — goods is not a service → not withheld; it is
   *  still in the VAT base). Configurable in case an accountant rules otherwise. */
  goodsPct: number;
  /** VAT % (default 7; reduced rate to 30 Sep 2026) */
  vatPct: number;
}

export const DEFAULT_TAX_RATES: TaxRates = {
  transportPct: 1,
  servicePct: 3,
  rentalPct: 5,
  goodsPct: 0,
  vatPct: 7,
};

/**
 * Generic taxable parts (any Pacred bill). Amounts are pre-VAT, pre-WHT.
 *   transportDomestic → VAT 7%, WHT 1%
 *   transportIntl     → VAT 0% (zero-rated), WHT 1%
 *   service           → VAT 7%, WHT 3%
 *   rental            → VAT 7%, WHT 5%
 *   goods             → VAT 7% (in base), WHT 0%
 *   discount          → subtracted off the grand total (allocated proportionally)
 */
export interface TaxableParts {
  transportDomestic: number;
  transportIntl: number;
  service: number;
  rental: number;
  goods: number;
  discount: number;
}

/**
 * The legacy `tb_forwarder` price components (lowercase per current schema —
 * tb_forwarder is camelCase batch-2b DEFERRED). Coerced defensively (legacy
 * stores some as varchar).
 */
export interface ForwarderCharges {
  // ⚠ ค่าขนส่ง — ฝากนำเข้า (import) มี "ค่าสินค้า/goods" ฝั่งนี้ = 0 เสมอ
  // (ลูกค้าเป็นเจ้าของสินค้าอยู่แล้ว · ฝากแค่ "ขนส่ง"). verified จาก prod
  // data จริง (ftotalprice ≈ fweight × rate ทุกแถว) + legacy printReceiptF.php
  // (label "ค่าขนส่ง/Amount") + B agent audit 2026-05-30.
  ftotalprice:           number | string | null;   // ค่าขนส่งหลัก CN→TH (cargo · weight/cbm × rate) — TRANSPORT · VAT 0% (intl leg)
  ftransportprice:       number | string | null;   // ค่าส่งในไทย (TH last-mile) — TRANSPORT · VAT 7% (domestic)
  ftransportpricechnthb: number | string | null;   // ค่าส่งในจีน (China-domestic leg, THB) — TRANSPORT · VAT 0% (foreign leg)
  fshippingservice:      number | string | null;   // service fee (SERVICE · VAT 7%)
  pricecrate:            number | string | null;    // ค่าตีลังไม้ (SERVICE)
  fpriceupdate:          number | string | null;    // price adjustment (SERVICE)
  priceother:            number | string | null;    // misc (SERVICE)
  fdiscount:             number | string | null;    // discount off the grand total
}

export interface TaxBreakdown {
  /** Post-discount, pre-VAT taxable base, split by class + total + VAT base. */
  base: {
    transport: number;       // domestic + intl (WHT-transport total)
    transportIntl: number;   // the zero-rated (VAT-excluded) portion
    service: number;
    rental: number;
    goods: number;
    total: number;           // grand base = grossBase − discount
    vatable: number;         // total − transportIntl (what 7% applies to)
  };
  /** WHT withheld per class + total (0 when not juristic). */
  wht: { transport: number; service: number; rental: number; goods: number; total: number };
  /** VAT amount (0 when withVat=false). */
  vat: number;
  /** base.total + vat (what the invoice shows before WHT). */
  grossBeforeWht: number;
  /** grossBeforeWht − wht.total = what the customer actually pays. */
  netPayable: number;
  isJuristic: boolean;
  withVat: boolean;
}

function n(v: number | string | null | undefined): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const p = parseFloat(v);
  return Number.isFinite(p) ? p : 0;
}
const round2 = (x: number) => Math.round(x * 100) / 100;

/**
 * Core tax math over generic taxable parts. Discount is allocated
 * PROPORTIONALLY across all class bases (keeps each class's WHT correct).
 * VAT applies to (post-discount base − international transport leg).
 */
export function computeTax(
  parts: TaxableParts,
  opts: { isJuristic: boolean; withVat: boolean; rates?: TaxRates },
): TaxBreakdown {
  const r = opts.rates ?? DEFAULT_TAX_RATES;

  const transportGross = n(parts.transportDomestic) + n(parts.transportIntl);
  const intlGross = n(parts.transportIntl);
  const serviceGross = n(parts.service);
  const rentalGross = n(parts.rental);
  const goodsGross = n(parts.goods);
  const grossBase = transportGross + serviceGross + rentalGross + goodsGross;

  const discount = n(parts.discount);
  const alloc = (g: number) => (grossBase > 0 ? (g / grossBase) * discount : 0);

  const transport = transportGross - alloc(transportGross);
  const intl = intlGross - alloc(intlGross);
  const service = serviceGross - alloc(serviceGross);
  const rental = rentalGross - alloc(rentalGross);
  const goods = goodsGross - alloc(goodsGross);
  const totalBase = round2(transport + service + rental + goods);
  const vatable = round2(Math.max(0, totalBase - intl)); // intl transport zero-rated

  const wht = opts.isJuristic
    ? {
        transport: round2(transport * (r.transportPct / 100)),
        service: round2(service * (r.servicePct / 100)),
        rental: round2(rental * (r.rentalPct / 100)),
        goods: round2(goods * (r.goodsPct / 100)),
      }
    : { transport: 0, service: 0, rental: 0, goods: 0 };
  const whtTotal = round2(wht.transport + wht.service + wht.rental + wht.goods);

  const vat = opts.withVat ? round2(vatable * (r.vatPct / 100)) : 0;
  const grossBeforeWht = round2(totalBase + vat);
  const netPayable = Math.max(0, round2(grossBeforeWht - whtTotal));

  return {
    base: {
      transport: round2(transport),
      transportIntl: round2(intl),
      service: round2(service),
      rental: round2(rental),
      goods: round2(goods),
      total: totalBase,
      vatable,
    },
    wht: { ...wht, total: whtTotal },
    vat,
    grossBeforeWht,
    netPayable,
    isJuristic: opts.isJuristic,
    withVat: opts.withVat,
  };
}

/**
 * Map legacy `tb_forwarder` charges → TaxableParts and compute. (No rental
 * line in the forwarder schema → rental=0; rental matters for other Pacred
 * bills, e.g. warehouse storage.)
 */
export function computeForwarderTax(
  c: ForwarderCharges,
  opts: { isJuristic: boolean; withVat: boolean; rates?: TaxRates },
): TaxBreakdown {
  return computeTax(
    {
      // TH last-mile = domestic transport (VAT 7%, WHT 1%).
      transportDomestic: n(c.ftransportprice),
      // CN→TH cargo (ftotalprice, the MAIN charge) + China-domestic leg =
      // international transport (VAT 0% zero-rated, WHT 1%). ftotalprice is
      // NOT goods — a forwarder bill has no goods line (goods=0 below).
      transportIntl: n(c.ftotalprice) + n(c.ftransportpricechnthb),
      service: n(c.fshippingservice) + n(c.pricecrate) + n(c.fpriceupdate) + n(c.priceother),
      rental: 0,
      goods: 0,
      discount: n(c.fdiscount),
    },
    opts,
  );
}

/**
 * Drop-in replacement for the legacy `calcForwarderOutstanding` — the
 * outstanding balance = net payable with NO VAT (VAT is added only at the
 * tax-invoice step). Use this to migrate the list-page / receipt calc from
 * the flat-1% to the per-line WHT engine.
 */
export function calcForwarderNetPayable(
  c: ForwarderCharges,
  isJuristic: boolean,
  rates?: TaxRates,
): number {
  return computeForwarderTax(c, { isJuristic, withVat: false, rates }).netPayable;
}

// ════════════════════════════════════════════════════════════════════════
// Legacy flat-1% receipt rule (the RECEIPT/grenrateReceiptF path)
// ════════════════════════════════════════════════════════════════════════
//
// This is the rule that fires when a forwarder payment LANDS and an auto-
// receipt is minted (lib/admin/auto-issue-receipt.ts). It is DISTINCT from the
// per-line `computeTax` engine above:
//   - `computeTax` = the correct per-charge-type WHT engine (transport 1% /
//     service 3% / rental 5% / goods 0%) used for the tax-INVOICE step.
//   - `legacyReceiptAmount` (this) = the legacy flat 1%-off-the-grand-total
//     allowance the legacy `grenrateReceiptF` wrote onto tb_receipt.ramount.
//
// Faithful to legacy `pcs-admin/include/function.php`:
//   - grenrateReceiptF (L557-559): the 1% allowance applies only when the
//     customer is juristic AND the total ≥ 1000 (small juristic orders get no
//     allowance).
//   - calPriceForwarderMainNew (L1875-1885) uses the SAME `userCompany==1 &&
//     priceFull>=1000` gate (plus an `fUserCompany==1` per-order override that
//     forces the allowance regardless of amount).
//
// WHT eligibility = the JURISTIC flag — there is NO separate per-customer "WHT
// enable" field in legacy. A customer is juristic ⇔ they registered with
// `type==2` → `tb_users.userCompany='1'` (check-otp-register.php L98-100) +
// have a `tb_corporate` row. Pacred derives `isJuristic` the same way
// (tb_corporate existence in auto-issue-receipt; userCompany='1' elsewhere).
//
// Pure + rounded to 2 satang. Returns BOTH the pre-WHT total and the amount
// the customer actually pays so callers (and tests) can assert each.
export const LEGACY_RECEIPT_WHT_MIN = 1000; // legacy threshold (≥ 1000 to withhold)
export const LEGACY_RECEIPT_WHT_PCT = 1;    // legacy flat allowance %

export interface LegacyReceiptAmount {
  /** Pre-WHT raw sum (tb_receipt.totalbeforewithholding). */
  totalBeforeWithholding: number;
  /** What the customer pays (tb_receipt.ramount) — pre-WHT minus the allowance. */
  rAmount: number;
  /** Whether the juristic 1% allowance was applied. */
  applied: boolean;
}

/**
 * Compute the legacy receipt amount + whether the juristic 1% allowance fired.
 *
 * @param pricePayAll  the pre-WHT grand total (sum of charge buckets − discount)
 * @param isJuristic   the customer's juristic flag (userCompany='1' / has tb_corporate)
 */
export function legacyReceiptAmount(
  pricePayAll: number,
  isJuristic: boolean,
): LegacyReceiptAmount {
  const total = round2(pricePayAll);
  // Legacy gate: juristic AND total ≥ 1000.
  const applied = isJuristic && pricePayAll >= LEGACY_RECEIPT_WHT_MIN;
  const rAmount = applied
    ? round2(pricePayAll * (1 - LEGACY_RECEIPT_WHT_PCT / 100))
    : total;
  return { totalBeforeWithholding: total, rAmount, applied };
}
