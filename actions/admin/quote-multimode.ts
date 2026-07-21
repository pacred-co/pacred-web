"use server";

/**
 * actions/admin/quote-multimode.ts — Lane C #3 (global-trade-group §5):
 *   "Sales quote-comparison tool: compare รถ/เรือ/แอร์ + add-on services
 *    for the rep to present."
 *
 * This is the TRANSPORT-MODE comparison (รถ vs เรือ vs แอร์) — the sibling of
 * /admin/accounting/quote-compare (which compares 9 CARRIERS for ONE mode).
 * Given a customer + shipment dimensions + the add-on services the customer
 * wants, it resolves the SALE price for EACH transport mode via the SAME legacy
 * rate waterfall the live save uses (lib/forwarder/resolve-rate.ts), adds the
 * add-on fees, and shows the all-in price + per-route min-sell + per-container
 * margin advisory side-by-side so the rep can present options.
 *
 * The SALE rate per mode uses resolveForwarderRate (the pure, faithful legacy
 * decision logic) over candidates this action reads from SQL — IDENTICAL to
 * actions/admin/forwarders-edit.ts:resolveLiveForwarderRate, just looped over
 * transport ∈ {1=รถ, 2=เรือ, 3=อากาศ}.
 *
 * Chargeable basis (Lane C #2): the rep picks "auto" (let the legacy engine
 * choose KG-vs-CBM via the "ราคามากสุด"/comparison rule — what the live save
 * does) OR pins "kg"/"cbm". Pinning is implemented by handing the engine a
 * comparison threshold that forces the chosen basis.
 *
 * Per AGENTS.md §0c — every Supabase query destructures `error`.
 */

import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  resolveForwarderRate,
  type ResolveRateCandidates,
} from "@/lib/forwarder/resolve-rate";
import { GENERAL_COID } from "@/lib/forwarder/coid";
import { getMinSellFloors } from "@/lib/pricing/min-sell-config";
import {
  getMinSellAdvisory,
  type MinSellAdvisory,
  type MinSellTransport,
  type MinSellWarehouse,
} from "@/lib/pricing/min-sell";
import { getMarginAdvisory, type MarginAdvisory } from "@/lib/pricing/margin-advisory";
import { getDocTierDiscountCbm } from "@/lib/forwarder/doc-tier-discount";

// ────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────

export type MultiModeBasis = "auto" | "kg" | "cbm";

export type MultiModeInput = {
  warehouse: MinSellWarehouse;       // 1=กวางโจว · 2=อี้อู
  productType: 1 | 2 | 3 | 4;        // 1 ทั่วไป · 2 มอก. · 3 อย. · 4 พิเศษ
  basis: MultiModeBasis;
  weightKg: number;
  volumeCbm: number;
  customerUserid?: string;           // optional → per-customer (SVIP) rate waterfall
  // Add-on services (THB) the customer wants — added on top of every mode's
  // transport subtotal so the all-in compare is apples-to-apples.
  addons: {
    crate: number;                   // ค่าตีลัง
    qc: number;                      // ค่าตรวจสอบ (QC)
    domesticChinaThb: number;        // ค่าขนส่งในจีน
    thailandDeliveryThb: number;     // ค่าส่งในไทย
    other: number;                   // อื่นๆ
  };
  /** Pacred internal cost basis for the margin advisory (optional · per-container). */
  estimatedCostThb?: number;
  /**
   * Owner-locked doc-tier discount (owner 2026-06-16): the customer will open
   * ใบกำกับ/ใบขน. Condition 2 (โอนหยวน/ฝากนำเข้า) is implicit for a cargo-import
   * quote. When true → −฿X/CBM off the CBM rate. Optional → defaults false.
   */
  docTier?: boolean;
};

export type ModeLine = {
  transport: MinSellTransport;       // 1 · 2 · 3
  transportLabel: string;            // ทางรถ / ทางเรือ / ทางอากาศ
  /** Whether a rate resolved for this mode (false → no rate set for the route). */
  hasRate: boolean;
  basisUsed: "kg" | "cbm";
  rateSource: "manual" | "svip" | "general";
  unitRate: number;                  // THB per kg / per cbm
  billableValue: number;             // kg or cbm the rate multiplied
  transportSubtotal: number;         // unitRate × billableValue (China→TH transport)
  addonsTotal: number;               // sum of add-on services
  grandTotal: number;                // transportSubtotal + addonsTotal
  /** Lane C min-sell guardrail for this route. */
  minSell: MinSellAdvisory;
  /** CEO profit-cap advisory for this mode (if estimatedCostThb given). */
  margin: MarginAdvisory | null;
  /** Projected profit (grandTotal − estimatedCost) when cost given. */
  projectedProfit: number | null;
  /** Owner-locked doc-tier discount applied to this mode (THB/CBM · 0 when none). */
  docDiscountApplied: number;
};

export type MultiModeReport = {
  asOf: string;
  input: MultiModeInput;
  /** Resolved sale-rate context note (which tier · coid). */
  rateContextNote: string;
  modes: ModeLine[];
  /** Cheapest all-in mode (with a rate). */
  cheapest: ModeLine | null;
  /** Any mode below its sales floor. */
  belowFloorCount: number;
};

const TRANSPORTS: { id: MinSellTransport; label: string }[] = [
  { id: "1", label: "ทางรถ" },
  { id: "2", label: "ทางเรือ" },
  { id: "3", label: "ทางอากาศ" },
];

function n(v: number | string | null | undefined): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const p = parseFloat(v);
  return Number.isFinite(p) ? p : 0;
}
const round2 = (x: number) => Math.round(x * 100) / 100;

// ────────────────────────────────────────────────────────────────────────
// Candidate resolver — read the rate tables for ONE (wh, transport, product).
// Mirrors forwarders-edit.ts:resolveLiveForwarderRate (the SQL waterfall).
// ────────────────────────────────────────────────────────────────────────
async function readCandidates(
  admin: ReturnType<typeof createAdminClient>,
  opts: {
    userid: string | null;
    coID: string;          // 'PR' = general
    isSvip: boolean;
    wh: MinSellWarehouse;
    transport: MinSellTransport;
    product: string;       // '1'..'4'
  },
): Promise<ResolveRateCandidates> {
  const { userid, coID, isSvip, wh, transport: tt, product: pt } = opts;
  const candidates: ResolveRateCandidates = {
    manualOverride: false,
    manualKg: null,
    manualCbm: null,
    isSvip,
    svipKg: null,
    svipCbm: null,
    generalKg: null,
    generalCbm: null,
  };

  if (isSvip && userid) {
    const { data: kg, error: kgErr } = await admin
      .from("tb_rate_custom_kg").select("rkg")
      .eq("userid", userid).eq("sourcewarehouse", wh).eq("rtransporttype", tt).eq("rproductstype", pt)
      .maybeSingle<{ rkg: number | string | null }>();
    if (kgErr) console.error(`[quote-multimode tb_rate_custom_kg] failed`, { code: kgErr.code, message: kgErr.message });
    const { data: cbm, error: cbmErr } = await admin
      .from("tb_rate_custom_cbm").select("rcbm")
      .eq("userid", userid).eq("sourcewarehouse", wh).eq("rtransporttype", tt).eq("rproductstype", pt)
      .maybeSingle<{ rcbm: number | string | null }>();
    if (cbmErr) console.error(`[quote-multimode tb_rate_custom_cbm] failed`, { code: cbmErr.code, message: cbmErr.message });
    candidates.svipKg = kg?.rkg ?? null;
    candidates.svipCbm = cbm?.rcbm ?? null;
  } else {
    // General tiered — the final fallback for ANY non-SVIP customer (the
    // VIP-group tier was retired 2026-07-10).
    const { data: gKg, error: gKgErr } = await admin
      .from("tb_rate_g_kg").select("rgkg1, rgkg2, rgkg3")
      .eq("coid", coID).eq("sourcewarehouse", wh).eq("rgtransporttype", tt).eq("rgproductstype", pt)
      .maybeSingle<{ rgkg1: number | string | null; rgkg2: number | string | null; rgkg3: number | string | null }>();
    if (gKgErr) console.error(`[quote-multimode tb_rate_g_kg] failed`, { code: gKgErr.code, message: gKgErr.message });
    const { data: gCbm, error: gCbmErr } = await admin
      .from("tb_rate_g_cbm").select("rgcbm1, rgcbm2, rgcbm3")
      .eq("coid", coID).eq("sourcewarehouse", wh).eq("rgtransporttype", tt).eq("rgproductstype", pt)
      .maybeSingle<{ rgcbm1: number | string | null; rgcbm2: number | string | null; rgcbm3: number | string | null }>();
    if (gCbmErr) console.error(`[quote-multimode tb_rate_g_cbm] failed`, { code: gCbmErr.code, message: gCbmErr.message });
    candidates.generalKg = gKg ? { tier1: gKg.rgkg1, tier2: gKg.rgkg2, tier3: gKg.rgkg3 } : null;
    candidates.generalCbm = gCbm ? { tier1: gCbm.rgcbm1, tier2: gCbm.rgcbm2, tier3: gCbm.rgcbm3 } : null;
  }
  return candidates;
}

// ────────────────────────────────────────────────────────────────────────
// Main entry
// ────────────────────────────────────────────────────────────────────────

export async function getMultiModeQuote(input: MultiModeInput): Promise<MultiModeReport> {
  await requireAdmin(["super", "accounting", "sales_admin"]);

  const admin = createAdminClient();
  const asOf = new Date().toISOString();
  const pt = String(input.productType);
  const userid = input.customerUserid?.trim() ? input.customerUserid.trim() : null;

  // ── Resolve customer rate context (coID + SVIP) ONCE — same for all modes ──
  let coID: string = GENERAL_COID;
  let isSvip = false;
  if (userid) {
    const { data: u, error: uErr } = await admin
      .from("tb_users").select("coID").eq("userID", userid)
      .maybeSingle<{ coID: string | null }>();
    if (uErr) console.error(`[quote-multimode tb_users] failed`, { code: uErr.code, message: uErr.message });
    coID = (u?.coID ?? GENERAL_COID).trim() || GENERAL_COID;

    const { data: svip, error: svipErr } = await admin
      .from("tb_rate_custom_cbm").select("id").eq("userid", userid).limit(1)
      .maybeSingle<{ id: number }>();
    if (svipErr) console.error(`[quote-multimode svip-probe] failed`, { code: svipErr.code, message: svipErr.message });
    isSvip = svip != null;
  }
  const rateContextNote = isSvip
    ? `เรทเฉพาะตัว (tb_rate_custom_*) · ${userid}`
    : `General tiered (tb_rate_g_*) · ${coID}`;

  // ── Comparison flags to force the chargeable basis ──
  // The legacy engine, when comparisonEnabled, bills by KG if KGPerCBM >
  // threshold else CBM. We pin a basis by setting an extreme threshold:
  //   pin "kg"  → threshold 0   (KGPerCBM > 0 → always KG)
  //   pin "cbm" → threshold 1e9 (KGPerCBM never exceeds → always CBM)
  //   "auto"    → comparison OFF → "ราคามากสุด" (legacy default · higher price wins)
  const pinKg = input.basis === "kg";
  const pinCbm = input.basis === "cbm";
  const comparisonEnabled = pinKg || pinCbm;
  const comparisonValue = pinKg ? 0 : pinCbm ? 1e9 : 0;
  // 'auto' = no pin → resolveForwarderRate charges the HIGHER of KG/CBM again
  // (CHARGE_HIGHER_BASIS · owner 2026-07-21). A pin is passed through untouched.

  const addonsTotal = round2(
    n(input.addons.crate) +
    n(input.addons.qc) +
    n(input.addons.domesticChinaThb) +
    n(input.addons.thailandDeliveryThb) +
    n(input.addons.other),
  );

  const floors = await getMinSellFloors();

  // Owner-locked doc-tier discount (condition 2 implicit for a cargo-import
  // quote; condition 1 = the rep's docTier toggle).
  const docDiscountCbm = await getDocTierDiscountCbm();
  const docTierApplied = input.docTier === true && docDiscountCbm > 0;

  // ── Compute each transport mode ──
  const modes: ModeLine[] = [];
  for (const T of TRANSPORTS) {
    const candidates = await readCandidates(admin, {
      userid, coID, isSvip, wh: input.warehouse, transport: T.id, product: pt,
    });
    const resolved = resolveForwarderRate(candidates, {
      weightKg: input.weightKg,
      volumeCbm: input.volumeCbm,
      comparisonEnabled,
      comparisonValue,
      basisPinned: comparisonEnabled, // a pinned basis wins over the charge-higher policy
      docTierEligible: docTierApplied,
      docTierDiscountCbm: docDiscountCbm,
    });

    const transportSubtotal = resolved.transportSubtotal;
    const grandTotal = round2(transportSubtotal + addonsTotal);
    const billableValue = resolved.basis === "kg" ? input.weightKg : input.volumeCbm;

    const minSell = getMinSellAdvisory({
      floors,
      warehouse: input.warehouse,
      transport: T.id,
      quotedThb: transportSubtotal,
    });

    let margin: MarginAdvisory | null = null;
    let projectedProfit: number | null = null;
    if (input.estimatedCostThb != null && Number.isFinite(input.estimatedCostThb)) {
      projectedProfit = round2(grandTotal - input.estimatedCostThb);
      margin = getMarginAdvisory(projectedProfit);
    }

    modes.push({
      transport: T.id,
      transportLabel: T.label,
      hasRate: !resolved.rateMissing,
      basisUsed: resolved.basis,
      rateSource: resolved.source,
      unitRate: resolved.rate,
      billableValue,
      transportSubtotal,
      addonsTotal,
      grandTotal,
      minSell,
      margin,
      projectedProfit,
      docDiscountApplied: resolved.docDiscountApplied,
    });
  }

  const withRate = modes.filter((m) => m.hasRate);
  const cheapest =
    withRate.length > 0
      ? withRate.reduce((a, b) => (b.grandTotal < a.grandTotal ? b : a))
      : null;
  const belowFloorCount = modes.filter((m) => m.minSell.level === "below").length;

  return { asOf, input, rateContextNote, modes, cheapest, belowFloorCount };
}
