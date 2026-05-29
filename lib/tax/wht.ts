/**
 * Thai tax engine — per-line withholding tax (WHT 1%/3%) + VAT (7%).
 * เดฟ 2026-05-30 · P0 of the tax-billing-flow rebuild.
 * Design: docs/research/tax-billing-flow-design-2026-05-30.md
 *
 * Replaces the legacy flat "priceFull × 0.01 for juristic" (lib/forwarder/
 * outstanding.ts) which is WRONG by Thai RD rules. The correct rule
 * (researched + owner-confirmed 2026-05-30):
 *   - WHT rate depends on the CHARGE TYPE, not the customer:
 *       ค่าขนส่ง (transport/freight)        → 1%
 *       ค่าบริการ (service / ฝากนำเข้า fee)  → 3%
 *       ค่าสินค้า (goods — owner: include)   → goods rate (default 3%, config)
 *   - WHT base = the charge amount EXCLUSIVE of VAT (never VAT-inclusive).
 *   - WHT applies only when the customer is a juristic person (นิติบุคคล).
 *   - VAT 7% applies on the (post-discount, pre-WHT) base only when a tax
 *     invoice is requested (tax point = on payment, handled by the caller).
 *
 * All rates are CONFIGURABLE (they change by law — e.g. the e-Withholding
 * 3%→1% reduction expired end-2568, the VAT 7% reduced rate runs to Sep 2026).
 * Pass `rates` from business_config; the DEFAULT_TAX_RATES below are the
 * 2026 fallbacks.
 *
 * Pure module (no server-only) — unit-tested with tsx. Same pattern as
 * lib/dbd/parse-juristic.ts.
 */

export type WhtClass = "transport" | "service" | "goods";

export interface TaxRates {
  /** ค่าขนส่ง/ค่าระวาง WHT % (default 1) */
  transportPct: number;
  /** ค่าบริการ/ค่าจ้างทำของ WHT % (default 3; e-WHT reduced 1% expired 2568) */
  servicePct: number;
  /** ค่าสินค้า WHT % (owner 2026-05-30: include goods in base; default 3, config — set 0 if accountant rules goods = sale-of-goods/WHT-exempt) */
  goodsPct: number;
  /** VAT % (default 7; reduced rate to 30 Sep 2026) */
  vatPct: number;
}

export const DEFAULT_TAX_RATES: TaxRates = {
  transportPct: 1,
  servicePct: 3,
  goodsPct: 3,
  vatPct: 7,
};

/**
 * The legacy `tb_forwarder` price components (lowercase per current schema —
 * tb_forwarder is camelCase batch-2b DEFERRED). Coerced defensively (legacy
 * stores some as varchar).
 */
export interface ForwarderCharges {
  ftotalprice:           number | string | null;   // goods value (ค่าสินค้า)
  ftransportprice:       number | string | null;   // transport (TH domestic)
  ftransportpricechnthb: number | string | null;   // transport (CN→TH)
  fshippingservice:      number | string | null;   // service fee
  pricecrate:            number | string | null;    // ค่าตีลังไม้ (service)
  fpriceupdate:          number | string | null;    // price adjustment (service)
  priceother:            number | string | null;    // misc (service)
  fdiscount:             number | string | null;    // discount off the grand total
}

export interface TaxBreakdown {
  /** Post-discount, pre-VAT taxable base, split by WHT class + total. */
  base: { transport: number; service: number; goods: number; total: number };
  /** WHT withheld per class + total (0 when not juristic). */
  wht: { transport: number; service: number; goods: number; total: number };
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
 * Compute the full tax breakdown for a forwarder bill.
 *
 * Discount is allocated PROPORTIONALLY across the three class bases (legacy
 * subtracted it from the grand total before the flat 1%; proportional keeps
 * each class's WHT correct). WHT is per-class on the post-discount pre-VAT
 * base; VAT (if requested) is on the post-discount pre-VAT total.
 */
export function computeForwarderTax(
  c: ForwarderCharges,
  opts: { isJuristic: boolean; withVat: boolean; rates?: TaxRates },
): TaxBreakdown {
  const r = opts.rates ?? DEFAULT_TAX_RATES;

  const transportGross = n(c.ftransportprice) + n(c.ftransportpricechnthb);
  const serviceGross =
    n(c.fshippingservice) + n(c.pricecrate) + n(c.fpriceupdate) + n(c.priceother);
  const goodsGross = n(c.ftotalprice);
  const grossBase = transportGross + serviceGross + goodsGross;

  const discount = n(c.fdiscount);
  const allocDiscount = (classGross: number) =>
    grossBase > 0 ? (classGross / grossBase) * discount : 0;

  const transport = transportGross - allocDiscount(transportGross);
  const service = serviceGross - allocDiscount(serviceGross);
  const goods = goodsGross - allocDiscount(goodsGross);
  const totalBase = round2(transport + service + goods); // = grossBase − discount

  const wht = opts.isJuristic
    ? {
        transport: round2(transport * (r.transportPct / 100)),
        service: round2(service * (r.servicePct / 100)),
        goods: round2(goods * (r.goodsPct / 100)),
      }
    : { transport: 0, service: 0, goods: 0 };
  const whtTotal = round2(wht.transport + wht.service + wht.goods);

  const vat = opts.withVat ? round2(totalBase * (r.vatPct / 100)) : 0;
  const grossBeforeWht = round2(totalBase + vat);
  const netPayable = Math.max(0, round2(grossBeforeWht - whtTotal));

  return {
    base: {
      transport: round2(transport),
      service: round2(service),
      goods: round2(goods),
      total: totalBase,
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
