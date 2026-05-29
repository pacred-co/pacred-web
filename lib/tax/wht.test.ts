// Unit tests for the WHT engine (lib/tax/wht.ts).
// Run: tsx lib/tax/wht.test.ts
import { computeForwarderTax, calcForwarderNetPayable, DEFAULT_TAX_RATES } from "./wht";

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

// 2. Juristic — per-class WHT (1% transport, 3% service, 3% goods)
{
  const t = computeForwarderTax(
    { ftotalprice: 10000, ftransportprice: 500, ftransportpricechnthb: 0, fshippingservice: 50, pricecrate: 100, fpriceupdate: 0, priceother: 0, fdiscount: 0 },
    { isJuristic: true, withVat: false });
  eq("juristic: transport WHT (1%)", t.wht.transport, 5);
  eq("juristic: service WHT (3%) — 50+100", t.wht.service, 4.5);
  eq("juristic: goods WHT (3%) — 10000", t.wht.goods, 300);
  eq("juristic: wht.total", t.wht.total, 309.5);
  eq("juristic: netPayable", t.netPayable, 10340.5);
}

// 3. With VAT 7% — invoice path
{
  const t = computeForwarderTax(
    { ftotalprice: 10000, ftransportprice: 500, ftransportpricechnthb: 0, fshippingservice: 50, pricecrate: 100, fpriceupdate: 0, priceother: 0, fdiscount: 0 },
    { isJuristic: true, withVat: true });
  eq("withVat: VAT 7% of 10650", t.vat, 745.5);
  eq("withVat: grossBeforeWht=base+VAT", t.grossBeforeWht, 11395.5);
  eq("withVat: WHT base UNCHANGED (excl VAT)", t.wht.total, 309.5);
  eq("withVat: netPayable=gross-WHT", t.netPayable, 11086);
}

// 4. Discount allocated proportionally
{
  const t = computeForwarderTax(
    { ftotalprice: 8000, ftransportprice: 1000, ftransportpricechnthb: 0, fshippingservice: 1000, pricecrate: 0, fpriceupdate: 0, priceother: 0, fdiscount: 1000 },
    { isJuristic: true, withVat: false });
  // gross 10000 → discount 1000 → each class loses 10%
  eq("discount: transport base after alloc", t.base.transport, 900);
  eq("discount: service base after alloc", t.base.service, 900);
  eq("discount: goods base after alloc", t.base.goods, 7200);
  eq("discount: total base = 9000", t.base.total, 9000);
}

// 5. Configurable rates (e-WHT 1% service)
{
  const t = computeForwarderTax(
    { ftotalprice: 0, ftransportprice: 0, ftransportpricechnthb: 0, fshippingservice: 1000, pricecrate: 0, fpriceupdate: 0, priceother: 0, fdiscount: 0 },
    { isJuristic: true, withVat: false, rates: { ...DEFAULT_TAX_RATES, servicePct: 1 } });
  eq("config: e-WHT service 1%", t.wht.service, 10);
}

// 6. Drop-in helper
{
  const n = calcForwarderNetPayable(
    { ftotalprice: 1000, ftransportprice: 100, ftransportpricechnthb: 0, fshippingservice: 50, pricecrate: 0, fpriceupdate: 0, priceother: 0, fdiscount: 0 },
    true);
  // 1000*0.97 + 100*0.99 + 50*0.97 = 970+99+48.5 = 1117.5
  eq("calcForwarderNetPayable juristic", n, 1117.5);
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

console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail > 0 ? 1 : 0);
