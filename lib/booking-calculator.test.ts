/**
 * Unit tests for lib/booking-calculator.ts — public landing freight-quote
 * calculator (LCL / FCL / Truck / Air).
 *
 * These four functions drive the customer-facing "ตีราคา" widget on the
 * booking landing page — revenue-relevant: a wrong number quotes a wrong
 * price. All four are pure (form + term in, CalcResult out), so they unit
 * test cleanly with no IO.
 *
 * Harness: plain tsx script, matches lib/warehouse/cargo-type.test.ts.
 */

import { calcLCL, calcFCL, calcTruck, calcAir } from "./booking-calculator";
import type { LCLForm, FCLForm, TruckForm, AirForm } from "@/types/booking";

let pass = 0;
let fail = 0;
const failures: string[] = [];

function eq<T>(name: string, actual: T, expected: T): void {
  if (actual === expected) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    failures.push(`${name}\n      expected ${JSON.stringify(expected)}\n      got      ${JSON.stringify(actual)}`);
    console.log(`  ✗ ${name}`);
  }
}

function truthy(name: string, cond: boolean, detail = ""): void {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

// Identity translator — returns the key so we can assert on label keys
// without coupling to the messages/*.json wording.
const t = (key: string, vars?: Record<string, string | number>) =>
  vars ? `${key}(${JSON.stringify(vars)})` : key;
const tRoot = (key: string) => key;

// ════════════════════════════════════════════════════════════════════
// calcLCL — sea LCL: max(cbm·1800·originMult, weight·6, 2500) + thc + doc
// ════════════════════════════════════════════════════════════════════
console.log("\ncalcLCL — sea LCL freight");

// nominal: cbm 5 → 5·1800 = 9000 (>2500, >weight·6), +2000 thc, doc=none → 11000
{
  const form: LCLForm = {
    origin: "guangzhou", originLabel: "GZ", productType: "general", productLabel: "ทั่วไป",
    weight: "100", cbm: "5", cif: "0", dateStart: "", dateEnd: "",
  };
  const r = calcLCL(form, "fob", "none", t, tRoot);
  truthy("returns a result for cbm=5", r !== null);
  eq("amount = seaFreight 9000 + thc 2000", r?.amount, 11000);
  eq("currency uses baht key", r?.currency, "baht");
}

// returns null when both cbm and weight are zero/blank
{
  const form: LCLForm = {
    origin: "guangzhou", originLabel: "GZ", productType: "general", productLabel: "",
    weight: "0", cbm: "0", cif: "0", dateStart: "", dateEnd: "",
  };
  eq("null when cbm=0 and weight=0", calcLCL(form, "fob", "none", t, tRoot), null);
}

// floor 2500 applies when cbm tiny
{
  const form: LCLForm = {
    origin: "guangzhou", originLabel: "GZ", productType: "general", productLabel: "",
    weight: "0.1", cbm: "0.1", cif: "0", dateStart: "", dateEnd: "",
  };
  const r = calcLCL(form, "fob", "none", t, tRoot);
  // seaFreight = max(0.1·1800=180, 0.1·6=0.6, 2500) = 2500; +2000 thc = 4500
  eq("seaFreight floored to 2500 → total 4500", r?.amount, 4500);
}

// yiwu origin applies 1.1 multiplier to sea freight
{
  const form: LCLForm = {
    origin: "yiwu", originLabel: "Yiwu", productType: "general", productLabel: "",
    weight: "0", cbm: "5", cif: "0", dateStart: "", dateEnd: "",
  };
  const r = calcLCL(form, "fob", "none", t, tRoot);
  // 5·1800·1.1 = 9900, +2000 = 11900
  eq("yiwu 1.1x multiplier → 11900", r?.amount, 11900);
}

// ddp adds customs fee 3500 + 7% duty on cif
{
  const form: LCLForm = {
    origin: "guangzhou", originLabel: "GZ", productType: "general", productLabel: "",
    weight: "0", cbm: "5", cif: "100000", dateStart: "", dateEnd: "",
  };
  const r = calcLCL(form, "ddp", "none", t, tRoot);
  // 9000 sea + 2000 thc + 3500 customs + 7000 duty (7% of 100000) = 21500
  eq("ddp adds customs 3500 + 7% duty → 21500", r?.amount, 21500);
}

// doc fee: customs=1200, invoice=600
{
  const form: LCLForm = {
    origin: "guangzhou", originLabel: "GZ", productType: "general", productLabel: "",
    weight: "0", cbm: "5", cif: "0", dateStart: "", dateEnd: "",
  };
  eq("doc=customs adds 1200 → 12200", calcLCL(form, "fob", "customs", t, tRoot)?.amount, 12200);
  eq("doc=invoice adds 600 → 11600", calcLCL(form, "fob", "invoice", t, tRoot)?.amount, 11600);
}

// product surcharge fda = 3000
{
  const form: LCLForm = {
    origin: "guangzhou", originLabel: "GZ", productType: "fda", productLabel: "FDA",
    weight: "0", cbm: "5", cif: "0", dateStart: "", dateEnd: "",
  };
  eq("fda surcharge 3000 → total 14000", calcLCL(form, "fob", "none", t, tRoot)?.amount, 14000);
}

// special product → contact-sales result (amount 0, special label)
{
  const form: LCLForm = {
    origin: "guangzhou", originLabel: "GZ", productType: "special", productLabel: "พิเศษ",
    weight: "0", cbm: "5", cif: "0", dateStart: "", dateEnd: "",
  };
  const r = calcLCL(form, "fob", "none", t, tRoot);
  eq("special product → amount 0", r?.amount, 0);
  eq("special product → labelSpecialLcl", r?.label, "labelSpecialLcl");
}

// ════════════════════════════════════════════════════════════════════
// calcFCL — container lane base × originMult + surcharge + ddp duty
// ════════════════════════════════════════════════════════════════════
console.log("\ncalcFCL — full container");

// 20ft fob general = base 45000, no surcharge, no duty
{
  const form: FCLForm = {
    origin: "guangzhou", originLabel: "GZ", productType: "general", productLabel: "",
    cbm: "20", weight: "5000", cif: "0", date: "",
  };
  eq("20ft fob general → 45000", calcFCL(form, "20ft", "fob", t, tRoot)?.amount, 45000);
}

// 40ft ddp general with cif → base 82000 + 7% duty
{
  const form: FCLForm = {
    origin: "guangzhou", originLabel: "GZ", productType: "general", productLabel: "",
    cbm: "40", weight: "10000", cif: "200000", date: "",
  };
  // 82000 + 14000 duty (7% of 200000) = 96000
  eq("40ft ddp + 7% duty → 96000", calcFCL(form, "40ft", "ddp", t, tRoot)?.amount, 96000);
}

// yiwu origin = 1.05 multiplier, rounded
{
  const form: FCLForm = {
    origin: "yiwu", originLabel: "Yiwu", productType: "general", productLabel: "",
    cbm: "20", weight: "5000", cif: "0", date: "",
  };
  // round(45000 · 1.05) = 47250
  eq("yiwu 1.05x on 20ft fob → 47250", calcFCL(form, "20ft", "fob", t, tRoot)?.amount, 47250);
}

// FCL product surcharge differs from LCL — fda = 8000
{
  const form: FCLForm = {
    origin: "guangzhou", originLabel: "GZ", productType: "fda", productLabel: "FDA",
    cbm: "20", weight: "5000", cif: "0", date: "",
  };
  eq("FCL fda surcharge 8000 → 53000", calcFCL(form, "20ft", "fob", t, tRoot)?.amount, 53000);
}

// special → contact sales
{
  const form: FCLForm = {
    origin: "guangzhou", originLabel: "GZ", productType: "special", productLabel: "",
    cbm: "20", weight: "5000", cif: "0", date: "",
  };
  const r = calcFCL(form, "20ft", "fob", t, tRoot);
  eq("FCL special → amount 0", r?.amount, 0);
  eq("FCL special → labelSpecialFcl", r?.label, "labelSpecialFcl");
}

// no duty when ddp but cif is zero
{
  const form: FCLForm = {
    origin: "guangzhou", originLabel: "GZ", productType: "general", productLabel: "",
    cbm: "20", weight: "5000", cif: "0", date: "",
  };
  eq("ddp with cif=0 → no duty, base 58000", calcFCL(form, "20ft", "ddp", t, tRoot)?.amount, 58000);
}

// ════════════════════════════════════════════════════════════════════
// calcTruck — chargeWeight = max(weight, cbm·250); freight = max(·rate, 3500)
// ════════════════════════════════════════════════════════════════════
console.log("\ncalcTruck — China-Thai truck (share load)");

// guangzhou rate 75/kg, weight 100kg → 7500
{
  const form: TruckForm = {
    origin: "guangzhou", originLabel: "GZ", dest: "bangkok", destLabel: "BKK",
    productType: "general", productLabel: "", weight: "100", cbm: "0", date: "",
  };
  eq("100kg @ 75/kg → 7500", calcTruck(form, "share", t)?.amount, 7500);
}

// volumetric weight wins: cbm 1 → 250kg vol weight, beats 100kg actual
{
  const form: TruckForm = {
    origin: "guangzhou", originLabel: "GZ", dest: "bangkok", destLabel: "BKK",
    productType: "general", productLabel: "", weight: "100", cbm: "1", date: "",
  };
  // chargeWeight = max(100, 250) = 250 → 250·75 = 18750
  eq("volumetric 250kg beats actual 100kg → 18750", calcTruck(form, "share", t)?.amount, 18750);
}

// floor 3500
{
  const form: TruckForm = {
    origin: "guangzhou", originLabel: "GZ", dest: "bangkok", destLabel: "BKK",
    productType: "general", productLabel: "", weight: "1", cbm: "0", date: "",
  };
  // 1·75 = 75 → floored to 3500
  eq("tiny load floored to 3500", calcTruck(form, "share", t)?.amount, 3500);
}

// yiwu rate 85/kg
{
  const form: TruckForm = {
    origin: "yiwu", originLabel: "Yiwu", dest: "bangkok", destLabel: "BKK",
    productType: "general", productLabel: "", weight: "100", cbm: "0", date: "",
  };
  eq("yiwu 100kg @ 85/kg → 8500", calcTruck(form, "share", t)?.amount, 8500);
}

// upcountry destination adds 1500
{
  const form: TruckForm = {
    origin: "guangzhou", originLabel: "GZ", dest: "upcountry", destLabel: "ตจว",
    productType: "general", productLabel: "", weight: "100", cbm: "0", date: "",
  };
  eq("upcountry surcharge 1500 → 9000", calcTruck(form, "share", t)?.amount, 9000);
}

// null when no weight + no cbm
{
  const form: TruckForm = {
    origin: "guangzhou", originLabel: "GZ", dest: "bangkok", destLabel: "BKK",
    productType: "general", productLabel: "", weight: "0", cbm: "0", date: "",
  };
  eq("null when weight=0 and cbm=0", calcTruck(form, "share", t), null);
}

// sub=full → contact sales
{
  const form: TruckForm = {
    origin: "guangzhou", originLabel: "GZ", dest: "bangkok", destLabel: "BKK",
    productType: "general", productLabel: "", weight: "100", cbm: "0", date: "",
  };
  const r = calcTruck(form, "full", t);
  eq("full-truck → amount 0", r?.amount, 0);
  eq("full-truck → labelSpecialTruck", r?.label, "labelSpecialTruck");
}

// ════════════════════════════════════════════════════════════════════
// calcAir — volWeight = w·l·h/6000; freight = max(chargeable·rate, 1800)
// ════════════════════════════════════════════════════════════════════
console.log("\ncalcAir — air freight");

// china origin = 220/kg; 50kg actual, no dims → 11000
{
  const form: AirForm = {
    origin: "จีน กวางโจว", dest: "BKK", weight: "50", w: "0", l: "0", h: "0",
  };
  eq("china 50kg @ 220/kg → 11000", calcAir(form, t)?.amount, 11000);
}

// japan origin = 260/kg
{
  const form: AirForm = {
    origin: "japan tokyo", dest: "BKK", weight: "50", w: "0", l: "0", h: "0",
  };
  eq("japan 50kg @ 260/kg → 13000", calcAir(form, t)?.amount, 13000);
}

// unknown origin → default rate 300/kg
{
  const form: AirForm = {
    origin: "เวียดนาม", dest: "BKK", weight: "50", w: "0", l: "0", h: "0",
  };
  eq("other origin 50kg @ 300/kg default → 15000", calcAir(form, t)?.amount, 15000);
}

// volumetric: 60·60·60 / 6000 = 36kg vol; beats 10kg actual
{
  const form: AirForm = {
    origin: "จีน", dest: "BKK", weight: "10", w: "60", l: "60", h: "60",
  };
  // chargeable = max(10, 36) = 36 → 36·220 = 7920
  eq("dim weight 36kg beats actual 10kg → 7920", calcAir(form, t)?.amount, 7920);
}

// floor 1800
{
  const form: AirForm = {
    origin: "จีน", dest: "BKK", weight: "1", w: "0", l: "0", h: "0",
  };
  // 1·220 = 220 → floored to 1800
  eq("tiny air load floored to 1800", calcAir(form, t)?.amount, 1800);
}

// null when no weight and incomplete dims
{
  const form: AirForm = {
    origin: "จีน", dest: "BKK", weight: "0", w: "10", l: "0", h: "10",
  };
  eq("null when weight=0 and dims incomplete", calcAir(form, t), null);
}

// hong kong matches china rate (220)
{
  const form: AirForm = {
    origin: "Hong Kong", dest: "BKK", weight: "50", w: "0", l: "0", h: "0",
  };
  eq("hong kong → china rate 220 → 11000", calcAir(form, t)?.amount, 11000);
}

// ════════════════════════════════════════════════════════════════════
console.log(`\n  ${pass} pass · ${fail} fail`);
if (failures.length > 0) {
  console.error("\nFailures:");
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
