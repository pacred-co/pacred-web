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

// 2. Juristic — ftotalprice is the CN→TH TRANSPORT charge (intl), NOT goods.
//    transport = ftotalprice(10000, intl) + ftransportprice(500, domestic) = 10500 → WHT 1%
{
  const t = computeForwarderTax(
    { ftotalprice: 10000, ftransportprice: 500, ftransportpricechnthb: 0, fshippingservice: 50, pricecrate: 100, fpriceupdate: 0, priceother: 0, fdiscount: 0 },
    { isJuristic: true, withVat: false });
  eq("juristic: transport WHT (1% of 10500)", t.wht.transport, 105);
  eq("juristic: service WHT (3% of 150)", t.wht.service, 4.5);
  eq("juristic: goods WHT (0 — no goods in forwarder)", t.wht.goods, 0);
  eq("juristic: wht.total", t.wht.total, 109.5);
  eq("juristic: netPayable", t.netPayable, 10540.5);
}

// 3. With VAT 7% — intl transport leg (ftotalprice CN→TH) is ZERO-RATED →
//    only domestic transport (500) + service (150) = 650 is VATable.
{
  const t = computeForwarderTax(
    { ftotalprice: 10000, ftransportprice: 500, ftransportpricechnthb: 0, fshippingservice: 50, pricecrate: 100, fpriceupdate: 0, priceother: 0, fdiscount: 0 },
    { isJuristic: true, withVat: true });
  eq("withVat: vatable = 650 (intl ftotalprice excluded)", t.base.vatable, 650);
  eq("withVat: VAT 7% of 650", t.vat, 45.5);
  eq("withVat: grossBeforeWht=base+VAT", t.grossBeforeWht, 10695.5);
  eq("withVat: WHT base UNCHANGED (excl VAT)", t.wht.total, 109.5);
  eq("withVat: netPayable=gross-WHT", t.netPayable, 10586);
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

// 5. Discount allocated proportionally. ftotalprice(8000)=intl transport,
//    ftransportprice(1000)=domestic → base.transport = 900+7200 = 8100.
{
  const t = computeForwarderTax(
    { ftotalprice: 8000, ftransportprice: 1000, ftransportpricechnthb: 0, fshippingservice: 1000, pricecrate: 0, fpriceupdate: 0, priceother: 0, fdiscount: 1000 },
    { isJuristic: true, withVat: false });
  eq("discount: transport base (dom 900 + intl 7200)", t.base.transport, 8100);
  eq("discount: transportIntl after alloc", t.base.transportIntl, 7200);
  eq("discount: service base after alloc", t.base.service, 900);
  eq("discount: goods base = 0 (forwarder)", t.base.goods, 0);
  eq("discount: total base = 9000", t.base.total, 9000);
}

// 6. Drop-in helper — transport (intl 1000 + dom 100) all WHT 1%, service 3%
{
  const n = calcForwarderNetPayable(
    { ftotalprice: 1000, ftransportprice: 100, ftransportpricechnthb: 0, fshippingservice: 50, pricecrate: 0, fpriceupdate: 0, priceother: 0, fdiscount: 0 },
    true);
  // transport 1100×0.99=1089 + service 50×0.97=48.5 = 1137.5
  eq("calcForwarderNetPayable juristic", n, 1137.5);
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
