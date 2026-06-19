/**
 * Customer-facing import price-breakdown — PURE, DISPLAY-ONLY (owner ภูม #2).
 *
 * The customer order-detail page (`/service-import/[fNo]`) shows the customer
 * HOW Pacred picked their import rate — so they can see we chose the most
 * cost-effective basis for them. This module turns the ALREADY-STORED
 * tb_forwarder decision (frefrate / frefprice / ftotalprice + weight/cbm) into
 * the same lines the ADMIN box renders (per-tracking-editor-client.tsx
 * "หาค่าเทียบ … / คิดตามน้ำหนัก … / คิดตามปริมาตร … / ระบบเลือก …").
 *
 * ⚠️ MONEY ISOLATION: this module NEVER recomputes the bill. It reads the rate
 *    decision the SAVE path already persisted (lib/forwarder/live-rate.ts ·
 *    resolve-rate.ts) and only reformats it for the customer. NO write, NO SQL,
 *    NO new server action. PURE + unit-testable.
 *
 * KG-vs-CBM basis (mirror of resolve-rate.ts):
 *   - ค่าเทียบ ON  → kgPerCbm (Σweight ÷ Σcbm) > threshold ? คิดตามน้ำหนัก : คิดตามปริมาตร
 *   - ค่าเทียบ OFF → "ราคามากสุด" (the system already chose the larger subtotal)
 * frefprice records which basis won: '1' = KG, '2' = CBM.
 *
 * @see app/[locale]/(admin)/admin/forwarders/[fNo]/per-tracking-editor-client.tsx
 * @see lib/forwarder/resolve-rate.ts
 */

/** Which physical basis the stored rate was billed on. */
export type DisplayBasis = "kg" | "cbm";

/** The raw stored fields the breakdown needs (all from the tb_forwarder row). */
export interface PriceBreakdownInput {
  /** fweight (kg). */
  weightKg: number;
  /** fvolume (the per-row CBM as stored). */
  volume: number;
  /** famount (box count) — used to compute billable CBM when famountcount != 1. */
  amount: number;
  /** famountcount — "1" means fvolume is ALREADY the total ("รวมกล่อง"). */
  amountCount: string | null;
  /** frefrate — the chosen unit rate (baht per kg OR per cbm). */
  refRate: number;
  /** frefprice — '1' billed-by-KG · '2' billed-by-CBM (the system's choice). */
  refPrice: string | null;
  /** ftotalprice — the China→Thailand transport subtotal (= value × refRate). */
  totalPrice: number;
  /** Whether comparison pricing (ค่าเทียบ) was in effect for this order. */
  comparisonOn: boolean;
  /** The ค่าเทียบ threshold (1 คิว = N kg) — only meaningful when comparisonOn. */
  comparisonThreshold: number;
}

export interface PriceBreakdownDisplay {
  /** Billable CBM = (amountCount==1) ? volume : volume*amount  (legacy L1935-1941). */
  billableCbm: number;
  /** Σweight (here = this order's weight). */
  weightKg: number;
  /** The chosen basis ('kg' | 'cbm') derived from frefprice. */
  basis: DisplayBasis;
  /** The chosen unit rate. */
  rate: number;
  /** The chosen transport subtotal (= the stored ftotalprice). */
  transport: number;
  /** Whether ค่าเทียบ was on (drives the "หาค่าเทียบ …" line + the badge label). */
  comparisonOn: boolean;
  /** The ค่าเทียบ threshold. */
  threshold: number;
  /** kgPerCbm ratio (Σweight ÷ billableCbm) — for the "หาค่าเทียบ …" line. */
  kgPerCbm: number;
  /** True when ค่าเทียบ chose KG (kgPerCbm > threshold). */
  byWeight: boolean;
}

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

/**
 * Build the customer price-breakdown view-model from the stored row. PURE.
 * Returns null when there is no priced decision to show (no rate / no total) —
 * the page then renders nothing (display-only, never a misleading ฿0 box).
 */
export function buildPriceBreakdownDisplay(
  input: PriceBreakdownInput,
): PriceBreakdownDisplay | null {
  const rate = Number.isFinite(input.refRate) ? input.refRate : 0;
  const transport = Number.isFinite(input.totalPrice) ? input.totalPrice : 0;
  // Nothing meaningful to explain if neither a rate nor a subtotal was set.
  if (rate <= 0 && transport <= 0) return null;

  const weightKg = Number.isFinite(input.weightKg) ? input.weightKg : 0;
  const volume = Number.isFinite(input.volume) ? input.volume : 0;
  const amount = Number.isFinite(input.amount) ? input.amount : 0;
  // Billable CBM — legacy CBMProduct (forwarder.php L1935-1941).
  const billableCbm =
    String(input.amountCount ?? "").trim() === "1" ? volume : volume * amount;

  // The chosen basis is the AUTHORITATIVE record of what the system picked.
  // frefprice '1' = KG, '2' = CBM. Default to CBM only if a positive value
  // exists but frefprice is unset (the legacy "ราคามากสุด" ties favour CBM).
  const basis: DisplayBasis = String(input.refPrice ?? "").trim() === "1" ? "kg" : "cbm";

  const kgPerCbm = billableCbm !== 0 ? weightKg / billableCbm : 0;
  const byWeight = input.comparisonOn ? kgPerCbm > input.comparisonThreshold : basis === "kg";

  return {
    billableCbm: round2(billableCbm),
    weightKg,
    basis,
    rate,
    transport,
    comparisonOn: input.comparisonOn,
    threshold: input.comparisonThreshold,
    kgPerCbm,
    byWeight,
  };
}
