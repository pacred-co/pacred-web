// Unit tests for the WHT engine (lib/tax/wht.ts).
// Run: tsx lib/tax/wht.test.ts
// Rules (owner-confirmed 2026-05-30): transport 1% · service 3% · rental 5% ·
// goods 0% WHT (but in VAT base) · VAT 7% (intl transport leg = 0%, excluded).
import { computeForwarderTax, computeTax, calcForwarderNetPayable, DEFAULT_TAX_RATES } from "./wht";

let pass = 0, fail = 0;
function eq(label: string, got: number, want: number, tol = 0.01) {
  const ok = Math.abs(got - want) <= tol;
  console.log(`${ok ? "✓" : "✗"} ${label}  got=${got} want=${want}`);
  if (ok) pass++; else fail++;
}

// 1. Personal (non-juristic) — no WHT, no VAT
{
  const t = computeForwarderTax(
    { ftotalprice: 10000, ftransportprice: 500, ftransportpricechnthb: 0, fshippingservice: 50, pricecrate: 100, fpriceupdate: 0, priceother: 0, fdiscount: 0 },
    { isJuristic: false, withVat: false });
  eq("personal: wht.total=0", t.wht.total, 0);
  eq("personal: vat=0", t.vat, 0);
  eq("personal: netPayable=base", t.netPayable, 10650);
}

// 2. Juristic — per-class WHT (1% transport, 3% service, 0% goods)
{
  const t = computeForwarderTax(
    { ftotalprice: 10000, ftransportprice: 500, ftransportpricechnthb: 0, fshippingservice: 50, pricecrate: 100, fpriceupdate: 0, priceother: 0, fdiscount: 0 },
    { isJuristic: true, withVat: false });
  eq("juristic: transport WHT (1% of 500)", t.wht.transport, 5);
  eq("juristic: service WHT (3% of 150)", t.wht.service, 4.5);
  eq("juristic: goods WHT (0% — not withheld)", t.wht.goods, 0);
  eq("juristic: wht.total", t.wht.total, 9.5);
  eq("juristic: netPayable", t.netPayable, 10640.5);
}

// 3. With VAT 7% — goods IS in the VAT base (owner: คิด VAT รวมค่าสินค้า)
{
  const t = computeForwarderTax(
    { ftotalprice: 10000, ftransportprice: 500, ftransportpricechnthb: 0, fshippingservice: 50, pricecrate: 100, fpriceupdate: 0, priceother: 0, fdiscount: 0 },
    { isJuristic: true, withVat: true });
  eq("withVat: vatable base = 10650 (no intl)", t.base.vatable, 10650);
  eq("withVat: VAT 7% of 10650", t.vat, 745.5);
  eq("withVat: grossBeforeWht=base+VAT", t.grossBeforeWht, 11395.5);
  eq("withVat: WHT base UNCHANGED (excl VAT)", t.wht.total, 9.5);
  eq("withVat: netPayable=gross-WHT", t.netPayable, 11386);
}

// 4. International transport leg → VAT 0% (excluded from VAT base), WHT 1% still
{
  const t = computeForwarderTax(
    { ftotalprice: 0, ftransportprice: 500, ftransportpricechnthb: 2000, fshippingservice: 0, pricecrate: 0, fpriceupdate: 0, priceother: 0, fdiscount: 0 },
    { isJuristic: true, withVat: true });
  eq("intl: total base = 2500", t.base.total, 2500);
  eq("intl: transportIntl = 2000", t.base.transportIntl, 2000);
  eq("intl: vatable = 500 (intl excluded)", t.base.vatable, 500);
  eq("intl: VAT = 7% of 500", t.vat, 35);
  eq("intl: WHT transport = 1% of 2500 (both legs)", t.wht.transport, 25);
}

// 5. Discount allocated proportionally (goods still 0% WHT)
{
  const t = computeForwarderTax(
    { ftotalprice: 8000, ftransportprice: 1000, ftransportpricechnthb: 0, fshippingservice: 1000, pricecrate: 0, fpriceupdate: 0, priceother: 0, fdiscount: 1000 },
    { isJuristic: true, withVat: false });
  eq("discount: transport base after alloc", t.base.transport, 900);
  eq("discount: service base after alloc", t.base.service, 900);
  eq("discount: goods base after alloc", t.base.goods, 7200);
  eq("discount: total base = 9000", t.base.total, 9000);
  eq("discount: goods WHT still 0", t.wht.goods, 0);
}

// 6. Drop-in helper — goods not withheld → full goods amount stays
{
  const n = calcForwarderNetPayable(
    { ftotalprice: 1000, ftransportprice: 100, ftransportpricechnthb: 0, fshippingservice: 50, pricecrate: 0, fpriceupdate: 0, priceother: 0, fdiscount: 0 },
    true);
  // goods 1000 (0% WHT) + transport 100×0.99=99 + service 50×0.97=48.5 = 1147.5
  eq("calcForwarderNetPayable juristic", n, 1147.5);
}

// 7. Zero base (defensive)
{
  const t = computeForwarderTax(
    { ftotalprice: 0, ftransportprice: 0, ftransportpricechnthb: 0, fshippingservice: 0, pricecrate: 0, fpriceupdate: 0, priceother: 0, fdiscount: 0 },
    { isJuristic: true, withVat: true });
  eq("zero: base=0", t.base.total, 0);
  eq("zero: vat=0", t.vat, 0);
  eq("zero: wht=0", t.wht.total, 0);
  eq("zero: net=0", t.netPayable, 0);
}

// 8. Rental WHT 5% (via generic computeTax — no rental line in forwarder schema)
{
  const t = computeTax(
    { transportDomestic: 0, transportIntl: 0, service: 0, rental: 1000, goods: 0, discount: 0 },
    { isJuristic: true, withVat: true });
  eq("rental: WHT 5% of 1000", t.wht.rental, 50);
  eq("rental: vatable = 1000 (rental is VATable)", t.base.vatable, 1000);
  eq("rental: VAT 7%", t.vat, 70);
  eq("rental: net = 1000+70-50", t.netPayable, 1020);
}

// 9. Goods-only juristic + VAT: in VAT base, 0 WHT
{
  const t = computeTax(
    { transportDomestic: 0, transportIntl: 0, service: 0, rental: 0, goods: 10000, discount: 0 },
    { isJuristic: true, withVat: true });
  eq("goods-only: vatable = 10000", t.base.vatable, 10000);
  eq("goods-only: VAT 700", t.vat, 700);
  eq("goods-only: WHT total = 0", t.wht.total, 0);
  eq("goods-only: net = 10700", t.netPayable, 10700);
}

// 10. Intl-only transport + VAT → vatable 0, VAT 0, WHT 1%
{
  const t = computeTax(
    { transportDomestic: 0, transportIntl: 5000, service: 0, rental: 0, goods: 0, discount: 0 },
    { isJuristic: true, withVat: true });
  eq("intl-only: vatable = 0", t.base.vatable, 0);
  eq("intl-only: VAT = 0", t.vat, 0);
  eq("intl-only: WHT transport 1% = 50", t.wht.transport, 50);
  eq("intl-only: net = 4950", t.netPayable, 4950);
}

// 11. DEFAULT_TAX_RATES sanity
{
  eq("default transport 1", DEFAULT_TAX_RATES.transportPct, 1);
  eq("default service 3", DEFAULT_TAX_RATES.servicePct, 3);
  eq("default rental 5", DEFAULT_TAX_RATES.rentalPct, 5);
  eq("default goods 0", DEFAULT_TAX_RATES.goodsPct, 0);
  eq("default vat 7", DEFAULT_TAX_RATES.vatPct, 7);
}

console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail > 0 ? 1 : 0);
