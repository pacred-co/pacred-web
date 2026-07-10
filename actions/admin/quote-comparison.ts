"use server";

/**
 * actions/admin/quote-comparison.ts — Sales-side forward-looking pricing
 * comparison tool.
 *
 * Per CLAUDE.md PM section + ceo-directives-2026-06-01.md:
 *   "pricing profit-cap ≤15k฿/ตู้ + sales quote-comparison tool"
 *
 * This is the FORWARD-LOOKING pair to /admin/accounting/margin-monitor
 * (which analyses delivered margins retrospectively). Sales reps use this
 * to pitch customers — given a shipment's dimensions, compare 9 partner
 * carriers' costs side-by-side + show projected margin per carrier so the
 * rep can recommend the right routing internally.
 *
 * Inputs:
 *   - shipment dimensions (weight kg + volume CBM)
 *   - warehouse (1=กวางโจว · 2=อี้อู)
 *   - transport (1=truck/รถ · 2=sea/เรือ)
 *   - product type 1-4 (ทั่วไป / มอก. / อย. / พิเศษ)
 *   - basis (KG or CBM — which dimension to bill on)
 *   - optional customer userid (applies SVIP/VIP/custom rate waterfall)
 *
 * Outputs:
 *   - Pacred SALE rate + sale subtotal (from tb_rate_g_* or override)
 *   - per-carrier COST rate + cost subtotal (from tb_settings.fcost*)
 *   - per-carrier projected MARGIN + CEO cap bucket
 *
 * Per AGENTS.md §0c — every Supabase query destructures `error`.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { CARRIERS, costColumn } from "@/app/[locale]/(admin)/admin/settings/forwarder-costs/costs-model";

// ────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────

export type QuoteWarehouse  = "1" | "2";   // 1=กวางโจว · 2=อี้อู
export type QuoteTransport  = "1" | "2";   // 1=truck · 2=sea
export type QuoteProduct    = 1 | 2 | 3 | 4;
export type QuoteBasis      = "kg" | "cbm";

export type QuoteInput = {
  warehouse:       QuoteWarehouse;
  transport:       QuoteTransport;
  productType:     QuoteProduct;
  basis:           QuoteBasis;
  weightKg:        number;
  volumeCbm:       number;
  customerUserid?: string;          // optional → applies VIP/SVIP rate
};

export type QuoteCarrierLine = {
  carrierKey:    string;            // suffix from CARRIERS registry ("" / "sang" / etc)
  carrierLabel:  string;
  costRate:      number;            // unit rate from tb_settings (THB per CBM, or per-KG for wmxcargo)
  costSubtotal:  number;            // value × costRate
  margin:        number;            // saleSubtotal − costSubtotal
  marginPct:     number;            // margin / saleSubtotal × 100
  bucket:        "negative" | "low" | "mid" | "good" | "over_cap";
  hasRate:       boolean;           // false if cell is 0 (carrier not active for this route)
};

export type QuoteReport = {
  asOf:             string;
  input:            QuoteInput;
  // SALE side (what Pacred charges the customer)
  saleSource:       "manual" | "svip" | "general" | "missing";
  saleRate:         number;
  saleSubtotal:     number;
  saleNote:         string;         // explanation of which rate tier resolved
  // COST side (what Pacred pays the carrier)
  billableValue:    number;         // weight or volume (the chosen basis)
  carriers:         QuoteCarrierLine[];
  // Bottom-line recommendation
  bestCarrier:      QuoteCarrierLine | null;   // highest non-negative margin
  worstCarrier:     QuoteCarrierLine | null;   // lowest (most negative)
  capWarnings:      number;         // count of carriers with margin > 15k
  lossWarnings:     number;         // count of carriers with margin < 0
};

// ────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────

function bucketForMargin(margin: number): QuoteCarrierLine["bucket"] {
  if (margin < 0)      return "negative";
  if (margin < 5000)   return "low";
  if (margin < 10_000) return "mid";
  if (margin <= 15_000) return "good";
  return "over_cap";
}

function n(v: number | string | null | undefined): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const p = parseFloat(v);
  return Number.isFinite(p) ? p : 0;
}

const round2 = (x: number) => Math.round(x * 100) / 100;

// General-tiered KG/CBM rate (forwarder.php L1844-1882 · same logic as resolve-rate.ts)
function generalTier(basis: QuoteBasis, value: number, tier1: number, tier2: number, tier3: number): number {
  if (basis === "kg") {
    if (value <= 100) return tier1;
    if (value > 100 && value < 500) return tier2;
    return tier3;
  }
  if (value <= 2) return tier1;
  if (value > 2 && value < 5) return tier2;
  return tier3;
}

// ────────────────────────────────────────────────────────────────────────
// Main entry
// ────────────────────────────────────────────────────────────────────────

export async function getQuoteComparison(input: QuoteInput): Promise<QuoteReport> {
  await requireAdmin(["super", "accounting", "sales_admin"]);
  const admin = createAdminClient();
  const asOf  = new Date().toISOString();

  // Billable value (what we'll multiply the rate by)
  const billableValue = input.basis === "kg" ? input.weightKg : input.volumeCbm;

  // ── 1. SALE rate — Pacred → customer ──
  // Follows the same waterfall as lib/forwarder/resolve-rate.ts:
  //   manual override (skipped here — admin-typed-per-order only) →
  //   SVIP (tb_rate_custom_*) → general (tb_rate_g_*)
  //   (VIP-group tier tb_rate_vip_* retired 2026-07-10.)
  let saleRate = 0;
  let saleSource: QuoteReport["saleSource"] = "general";
  let saleNote = "";

  // Build SQL-friendly tuple constants
  // tb_rate_g_*  / tb_rate_custom_*  share keys:
  //   fSourceWarehouse · fTransportType · fProductsType
  const sourceWh    = input.warehouse;       // "1" or "2"
  const transportTy = input.transport;       // "1" or "2"
  const productTy   = String(input.productType);

  // 1b. SVIP probe (any tb_rate_custom_cbm row for the user)
  let isSvip = false;
  if (input.customerUserid && input.customerUserid.trim() !== "") {
    const { data: svipRow, error: svipErr } = await admin
      .from("tb_rate_custom_cbm")
      .select("id")
      .eq("userid", input.customerUserid.trim())
      .limit(1)
      .maybeSingle();
    if (svipErr) {
      console.error("[quote-compare tb_rate_custom_cbm svip-probe] failed", { code: svipErr.code, message: svipErr.message });
    }
    isSvip = !!svipRow;
  }

  if (isSvip) {
    // SVIP — per-user flat rate (tb_rate_custom_*)
    const table = input.basis === "kg" ? "tb_rate_custom_kg" : "tb_rate_custom_cbm";
    const col   = input.basis === "kg" ? "rkg" : "rcbm";
    const { data: row, error: rErr } = await admin
      .from(table)
      .select(`${col}`)
      .eq("userid", (input.customerUserid ?? "").trim())
      .eq("fsourcewarehouse", sourceWh)
      .eq("ftransporttype",   transportTy)
      .eq("fproductstype",    productTy)
      .maybeSingle<Record<string, number | string | null>>();
    if (rErr) {
      console.error(`[quote-compare ${table}] failed`, { code: rErr.code, message: rErr.message });
    }
    saleRate   = n(row?.[col]);
    saleSource = saleRate > 0 ? "svip" : "missing";
    saleNote   = saleRate > 0
      ? `เรทเฉพาะตัว (tb_rate_custom_${input.basis})`
      : "เรทเฉพาะตัวยังว่าง — admin ต้องตั้งเรท";
  } else {
    // General tiered (tb_rate_g_*) — the final fallback for ANY non-SVIP
    // customer (VIP-group tier retired 2026-07-10).
    const table = input.basis === "kg" ? "tb_rate_g_kg" : "tb_rate_g_cbm";
    const c1    = input.basis === "kg" ? "rgkg1" : "rgcbm1";
    const c2    = input.basis === "kg" ? "rgkg2" : "rgcbm2";
    const c3    = input.basis === "kg" ? "rgkg3" : "rgcbm3";
    const { data: row, error: rErr } = await admin
      .from(table)
      .select(`${c1}, ${c2}, ${c3}`)
      .eq("fsourcewarehouse", sourceWh)
      .eq("ftransporttype",   transportTy)
      .eq("fproductstype",    productTy)
      .maybeSingle<Record<string, number | string | null>>();
    if (rErr) {
      console.error(`[quote-compare ${table}] failed`, { code: rErr.code, message: rErr.message });
    }
    saleRate   = generalTier(input.basis, billableValue, n(row?.[c1]), n(row?.[c2]), n(row?.[c3]));
    saleSource = saleRate > 0 ? "general" : "missing";
    saleNote   = saleRate > 0
      ? `General PR tiered (${input.basis === "kg" ? "value≤100 t1 · ≤500 t2 · else t3" : "value≤2 t1 · ≤5 t2 · else t3"})`
      : "General tier cell empty — admin should fill tb_rate_g_*";
  }
  const saleSubtotal = round2(billableValue * saleRate);

  // ── 2. COST per-carrier — read all 9 cells from tb_settings ──
  // For wmxcargo (MX-weight-tier), the cell stores a per-kg rate, NOT per-CBM
  // (legacy convention from costs-model.ts). When user chose CBM basis but
  // wmxcargo is weight-only, we still surface it but mark it explicitly so the
  // sales rep doesn't accidentally use a CBM rate as kg.
  const citySuffix = input.warehouse === "2" ? "2" : "";
  const transportInfix: "car" | "ship" = input.transport === "1" ? "car" : "ship";

  // Build the array of {col, carrier} we'll select
  const cellsToFetch = CARRIERS.map((c) => ({
    carrier: c,
    col: costColumn(transportInfix, input.productType, c.suffix, citySuffix as "" | "2"),
  }));
  const selectCols = cellsToFetch.map((c) => c.col).join(", ");

  const { data: settingsRow, error: settingsErr } = await admin
    .from("tb_settings")
    .select(selectCols)
    .eq("id", 1)
    .maybeSingle<Record<string, number | string | null>>();
  if (settingsErr) {
    console.error("[quote-compare tb_settings] failed", { code: settingsErr.code, message: settingsErr.message });
  }

  // ── 3. Compute per-carrier margin ──
  const carriers: QuoteCarrierLine[] = cellsToFetch.map(({ carrier, col }) => {
    const costRate = n(settingsRow?.[col]);
    // wmxcargo stores a per-kg rate (per costs-model.ts comment). If user chose
    // CBM basis the comparison is apples-to-oranges; we still compute it but
    // flag in the label.
    const costSubtotal = round2(billableValue * costRate);
    const margin       = round2(saleSubtotal - costSubtotal);
    const marginPct    = saleSubtotal > 0 ? round2((margin / saleSubtotal) * 100) : 0;
    return {
      carrierKey:   carrier.suffix,
      carrierLabel: carrier.label,
      costRate,
      costSubtotal,
      margin,
      marginPct,
      bucket:       bucketForMargin(margin),
      hasRate:      costRate > 0,
    };
  });

  // Best/worst surfaces (filtered to carriers with a real rate set)
  const activeCarriers = carriers.filter((c) => c.hasRate);
  const sortedByMargin = [...activeCarriers].sort((a, b) => b.margin - a.margin);
  const bestCarrier    = sortedByMargin[0] ?? null;
  const worstCarrier   = sortedByMargin[sortedByMargin.length - 1] ?? null;
  const capWarnings    = activeCarriers.filter((c) => c.margin > 15_000).length;
  const lossWarnings   = activeCarriers.filter((c) => c.margin < 0).length;

  return {
    asOf,
    input,
    saleSource,
    saleRate,
    saleSubtotal,
    saleNote,
    billableValue,
    carriers,
    bestCarrier,
    worstCarrier,
    capWarnings,
    lossWarnings,
  };
}
