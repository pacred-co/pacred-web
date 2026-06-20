/**
 * Cargo LCL quotation pricing — pure + testable (owner ปอน 2026-06-21).
 *
 * Two parts:
 *  1) calcFreight — the ค่าเทียบ (density) billing rule. The customer gives a
 *     CBM + KG; we bill by the basis that yields the larger chargeable unit:
 *       density = kg / cbm ;  if density > ค่าเทียบ → bill by KG (ของหนัก),
 *       else bill by CBM (ของเบา/ใหญ่).  ค่าเทียบ default 250 (1 CBM ≤ 250 kg).
 *     อี้อู (เฉพาะทางรถ) adds a per-CBM surcharge. A per-shipment minimum applies.
 *  2) calcQuoteTotals — Peak-style line-item rollup: VAT 7% on taxable lines,
 *     grand total, WHT (on the pre-VAT service base), net payable.
 *
 * All money rounded to 2 dp. No I/O — safe to unit-test + import anywhere.
 */

export type ChargeBasis = "cbm" | "kg";

export interface FreightCalcInput {
  /** ปริมาตร (คิว). */
  cbm: number;
  /** น้ำหนัก (กก.). */
  kg: number;
  /** ค่าเทียบ — kg ต่อ 1 คิว ที่เป็นเส้นแบ่ง บิล KG vs CBM (default 250). */
  comparison: number;
  ratePerCbm: number;
  ratePerKg: number;
  /** อี้อู เฉพาะทางรถ — บาท/คิว ที่บวกเพิ่ม. */
  yiwuTruckSurchargePerCbm: number;
  isYiwuTruck: boolean;
  /** ค่าขั้นต่ำต่อ shipment (default 25). */
  minCharge: number;
}

export interface FreightCalcResult {
  /** kg ต่อ 1 คิว (null ถ้า cbm = 0). */
  density: number | null;
  basis: ChargeBasis;
  /** จำนวนที่ใช้คิดเงิน (คิว หรือ กก. ตาม basis). */
  chargeableQty: number;
  rateUsed: number;
  freightBeforeSurcharge: number;
  surcharge: number;
  /** = max(min, ก่อนขั้นต่ำ) — 0 ถ้ายังไม่กรอกอะไร. */
  freightTotal: number;
  belowMin: boolean;
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function calcFreight(input: FreightCalcInput): FreightCalcResult {
  const cbm = Math.max(0, Number(input.cbm) || 0);
  const kg = Math.max(0, Number(input.kg) || 0);
  const cmp = Number(input.comparison) > 0 ? Number(input.comparison) : 250;
  const density = cbm > 0 ? kg / cbm : null;
  // Bill by KG when the goods are denser than the ค่าเทียบ threshold; else by CBM.
  const basis: ChargeBasis = density != null && density > cmp ? "kg" : "cbm";
  const chargeableQty = basis === "kg" ? kg : cbm;
  const rateUsed = basis === "kg" ? Number(input.ratePerKg) || 0 : Number(input.ratePerCbm) || 0;
  const freightBeforeSurcharge = round2(chargeableQty * rateUsed);
  const surcharge = input.isYiwuTruck
    ? round2(cbm * (Number(input.yiwuTruckSurchargePerCbm) || 0))
    : 0;
  const raw = round2(freightBeforeSurcharge + surcharge);
  const min = Math.max(0, Number(input.minCharge) || 0);
  const belowMin = raw > 0 && raw < min;
  const freightTotal = raw > 0 ? Math.max(raw, min) : 0;
  return { density, basis, chargeableQty, rateUsed, freightBeforeSurcharge, surcharge, freightTotal, belowMin };
}

export interface QuoteLine {
  label: string;
  /** line total (qty already folded in). */
  amount: number;
  /** true = ราคานี้บวก VAT 7%. */
  vat: boolean;
  /** false = ไม่อยู่ในฐานหัก ณ ที่จ่าย (เช่น ค่าผ่านรัฐ). default = true. */
  whtApplicable?: boolean;
}

export interface QuoteTotals {
  subtotalNoVat: number;
  subtotalVat: number;
  vatAmount: number;
  grandTotal: number;
  whtAmount: number;
  netPayable: number;
}

/**
 * Peak-style rollup. `whtRate` (e.g. 0.01) is applied to the PRE-VAT service
 * base (subtotalVat + subtotalNoVat) — the Thai convention (WHT withheld on the
 * service value before VAT), not on the VAT-inclusive grand total.
 */
export function calcQuoteTotals(lines: QuoteLine[], whtRate = 0): QuoteTotals {
  const active = lines.filter((l) => Number(l.amount) > 0);
  const subtotalVat = round2(active.filter((l) => l.vat).reduce((s, l) => s + l.amount, 0));
  const subtotalNoVat = round2(active.filter((l) => !l.vat).reduce((s, l) => s + l.amount, 0));
  const vatAmount = round2(subtotalVat * 0.07);
  const grandTotal = round2(subtotalVat + subtotalNoVat + vatAmount);
  // WHT is withheld on the SERVICE value only — pass-through lines (whtApplicable
  // === false, e.g. ค่าผ่านรัฐ) are excluded from the base.
  const whtBase = round2(active.filter((l) => l.whtApplicable !== false).reduce((s, l) => s + l.amount, 0));
  const whtAmount = round2(whtBase * (Number(whtRate) || 0));
  const netPayable = round2(grandTotal - whtAmount);
  return { subtotalNoVat, subtotalVat, vatAmount, grandTotal, whtAmount, netPayable };
}
