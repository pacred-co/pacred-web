import "server-only";

/**
 * LIVE forwarder rate engine — the SQL half of the legacy tb_forwarder pricing
 * waterfall, extracted (behavior-preserving) from
 * `actions/admin/forwarders-edit.ts` so it can be REUSED by any path that
 * creates/updates a tb_forwarder row and needs the China→Thailand transport
 * rate auto-computed (the admin dimension-edit save AND the MOMO import commit).
 *
 * The DECISION logic (precedence + tier + KG/CBM selection) lives in the PURE,
 * unit-tested `lib/forwarder/resolve-rate.ts`. THIS module does the SQL
 * waterfall (reads tb_users.coID + the tb_rate_custom / tb_rate_g tables · the
 * probes legacy `forwarder.php` getPrice() ran, minus the VIP-group tier retired
 * 2026-07-10) and hands the resolver the candidate rates.
 *
 * ⚠️ MONEY PATH — server-only. `resolveLiveForwarderRate` is a READ; the only
 *    WRITE here is `computeAndFillForwarderImportRate`, which persists ONLY the
 *    three transport-rate columns (frefrate / frefprice / ftotalprice) and never
 *    touches userid / status / wallet / commission / selling totals. See the
 *    function header + the resolve-rate.ts FLAG about fTotalPrice naming.
 *
 * @see lib/forwarder/resolve-rate.ts        — the pure decision logic
 * @see actions/admin/forwarders-edit.ts     — the admin dimension-edit caller
 * @see lib/admin/commit-momo-row-core.ts    — the MOMO import caller (best-effort)
 */

import { createAdminClient } from "@/lib/supabase/admin";
import {
  resolveForwarderRate,
  resolveBothBasisRates,
  clampComparison,
  COMPARISON_DEFAULT,
  type ResolveRateCandidates,
  type ResolveRateInput,
  type ResolvedRate,
} from "@/lib/forwarder/resolve-rate";
import { GENERAL_COID } from "@/lib/forwarder/coid";
import { isDocTierEligible, getDocTierDiscountCbm } from "@/lib/forwarder/doc-tier-discount";
import { transportModeFromCabinetName, resolveTransportMode } from "@/lib/forwarder/cabinet-transport";
import { evaluateBasisDrift, type MomoBoxRow } from "@/lib/forwarder/basis-drift-guard";
import { baseOf } from "@/lib/integrations/momo-web/box-detail-reconcile-plan";

// ────────────────────────────────────────────────────────────
// numeric coercion (legacy stores some price/measure cols as varchar).
// Kept local — same shape as forwarders-edit.ts `num`.
// ────────────────────────────────────────────────────────────
function num(v: number | string | null | undefined): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const p = parseFloat(v);
  return Number.isFinite(p) ? p : 0;
}

/**
 * ค่านำเข้าจีน-ไทย ขั้นต่ำ (ภูม 2026-07-01) — 50 บาท/แทรคกิ้ง. ของเบา/น้อยที่ resolve
 * ออกมาต่ำกว่า 50 ให้ยกเป็น 50. FORWARDER-ONLY (บังคับใน resolveLiveForwarderRate ที่
 * มีแต่พาธ tb_forwarder ใช้ · resolver กลาง resolveForwarderRate ที่ cart/quote ใช้
 * ไม่โดน). NEVER applied on a rate-missing row (rate<=0) — กันสร้างยอดผี 50 บนแถว
 * ที่ยังไม่มีเรท (ระบบจะไม่เขียน ฿0 อยู่แล้ว).
 */
export const FORWARDER_IMPORT_MIN_THB = 50;

// ────────────────────────────────────────────────────────────
// LIVE PRICING WATERFALL — port of forwarder.php `update_data` getPrice()
// (L1806-1931) + the SVIP probe (L1841-1843). This is the SQL half; the
// decision logic lives in lib/forwarder/resolve-rate.ts (pure + unit-tested).
//
// Inputs come from an EXISTING tb_forwarder row (warehouse/transport/
// comparison/refOrder/amount — legacy reads these from the row in
// update_data L1770-1798) + the dimensions just submitted/imported
// (weight/cbm/productType).
//
// ⚠️ MONEY PATH. The rate this resolves is written to tb_forwarder as
//    fTotalPrice (the China→Thailand TRANSPORT subtotal · legacy naming —
//    see resolve-rate.ts header FLAG). It does NOT touch fTransportPrice
//    (the Thailand domestic-delivery leg, set by the Flash/PCSE flow).
// ────────────────────────────────────────────────────────────
export interface PricingRowContext {
  userid: string;
  fwarehousechina: string;
  ftransporttype: string;
  fproductstype: string;
  weightKg: number;
  /** CBMProduct = (famountcount==1) ? fvolume : fvolume*famount  (legacy L1935-1941) */
  cbmProduct: number;
  famountcount: string | null;
  famount: number;
  reforder: string | null;
  customRateSwitch: boolean;
  customRateKg: number;
  customRateCbm: number;
  /**
   * The customer's STORED ค่าเทียบ (tb_users.userComparison / userComparisonValue).
   * `userComparison` = is comparison-pricing enabled for this customer; when true,
   * `userComparisonValue` is the KG/CBM threshold (legacy update_data L1764-1798).
   */
  userComparison: boolean;
  userComparisonValue: number;
  /**
   * Per-ORDER ค่าเทียบ override (the edit-form "คิดค่าเทียบแบบกำหนดเอง" toggle).
   * Mirrors how customRateSwitch overrides the system rate: when this switch is
   * ON, the order is priced by the admin-typed threshold for THIS order, winning
   * over the customer's stored userComparison/userComparisonValue. Optional +
   * defaults to off → byte-identical behaviour for every existing caller (MOMO
   * import / preview) that doesn't set it.
   *
   * NB: semantically this is "force comparison ON with a specific threshold" — it
   * is threaded into resolveForwarderRate via its EXISTING comparisonEnabled /
   * comparisonValue inputs (NOT its `customComparison` flag, which forces the
   * legacy 200/150 default rather than honouring the admin-typed value). No rate
   * math changes — the resolver already supports an arbitrary comparison value.
   */
  customComparisonSwitch?: boolean;
  /** The admin-typed ค่าเทียบ threshold (1 คิว = N kg) — used only when the switch is ON. */
  customComparisonValue?: number;
  /**
   * Owner-locked doc-tier discount (owner 2026-06-16). When true AND a positive
   * docTierDiscountCbm is supplied, the resolver subtracts the per-CBM discount
   * from the resolved CBM rate. Optional + defaults to no discount → back-compat
   * for any caller that doesn't set it. Eligibility = tax_doc_pref ∈
   * {tax_invoice,customs} AND the row is a cargo-import-service row (see
   * lib/forwarder/doc-tier-discount.ts).
   */
  docTierEligible?: boolean;
  /** THB/CBM discount amount (config-driven, default 800). */
  docTierDiscountCbm?: number;
  /**
   * ค่าเทียบ on the ORDER TOTAL (ภูม 2026-06-18). Σweight÷Σcbm of the whole
   * multi-tracking order — used for the KG-vs-CBM basis DECISION while each row
   * still prices on its own weight/cbm. Optional + back-compat: undefined → the
   * decision uses this row's own ratio (every existing caller is unaffected).
   */
  comparisonKgPerCbm?: number;
}

export async function resolveLiveForwarderRate(
  admin: ReturnType<typeof createAdminClient>,
  ctx: PricingRowContext,
): Promise<
  | {
      resolved: ResolvedRate;
      coID: string;
      /**
       * Per-basis unit rates for this row (baht/kg + baht/cbm), resolved from the
       * SAME candidates the winner used — so a DISPLAY breakdown can show BOTH
       * "คิดตามน้ำหนัก" and "คิดตามปริมาตร" lines even though the bill uses only the
       * chosen basis (owner ภูม 2026-06-19). null = no rate card for that basis.
       */
      unitRates: { kgRate: number | null; cbmRate: number | null };
    }
  | { error: string }
> {
  // tb_users — coID drives general(=='PR') vs VIP-group; legacy reads
  // userComparison/userComparisonValue/userCompany too (update_data L1764-1798).
  // tb_users is camelCase (batch 1) — coID/userCompany/userComparison*.
  const { data: userRow, error: userErr } = await admin
    .from("tb_users")
    .select("coID")
    .eq("userID", ctx.userid)
    .maybeSingle<{ coID: string | null }>();
  if (userErr) {
    console.error(`[resolveLiveForwarderRate: tb_users] failed`, {
      code: userErr.code, message: userErr.message, userid: ctx.userid,
    });
    return { error: `อ่านข้อมูลลูกค้าไม่สำเร็จ: ${userErr.message}` };
  }
  const coID = (userRow?.coID ?? "").trim() || GENERAL_COID;

  const wh = ctx.fwarehousechina;
  const tt = ctx.ftransporttype;
  const pt = ctx.fproductstype;

  const candidates: ResolveRateCandidates = {
    manualOverride: ctx.customRateSwitch,
    manualKg: ctx.customRateKg,
    manualCbm: ctx.customRateCbm,
    isSvip: false,
    svipKg: null,
    svipCbm: null,
    generalKg: null,
    generalCbm: null,
  };

  if (!ctx.customRateSwitch) {
    // SVIP probe — legacy `SELECT ID FROM tb_rate_custom_cbm WHERE userID`
    // (forwarder.php L1841). ANY row → SVIP.
    const { data: svipProbe, error: svipErr } = await admin
      .from("tb_rate_custom_cbm")
      .select("id")
      .eq("userid", ctx.userid)
      .limit(1)
      .maybeSingle<{ id: number }>();
    if (svipErr) {
      console.error(`[resolveLiveForwarderRate: tb_rate_custom_cbm probe] failed`, {
        code: svipErr.code, message: svipErr.message, userid: ctx.userid,
      });
      return { error: `ตรวจสอบเรท SVIP ไม่สำเร็จ: ${svipErr.message}` };
    }
    candidates.isSvip = svipProbe != null;

    if (candidates.isSvip) {
      // SVIP per-user rates for the tuple (forwarder.php L1907-1925).
      const { data: svipKgRow, error: svipKgErr } = await admin
        .from("tb_rate_custom_kg")
        .select("rkg")
        .eq("userid", ctx.userid).eq("sourcewarehouse", wh).eq("rtransporttype", tt).eq("rproductstype", pt)
        .maybeSingle<{ rkg: number | string | null }>();
      if (svipKgErr) console.error(`[resolveLiveForwarderRate: tb_rate_custom_kg] failed`, { code: svipKgErr.code, message: svipKgErr.message });
      const { data: svipCbmRow, error: svipCbmErr } = await admin
        .from("tb_rate_custom_cbm")
        .select("rcbm")
        .eq("userid", ctx.userid).eq("sourcewarehouse", wh).eq("rtransporttype", tt).eq("rproductstype", pt)
        .maybeSingle<{ rcbm: number | string | null }>();
      if (svipCbmErr) console.error(`[resolveLiveForwarderRate: tb_rate_custom_cbm rate] failed`, { code: svipCbmErr.code, message: svipCbmErr.message });
      candidates.svipKg = svipKgRow?.rkg ?? null;
      candidates.svipCbm = svipCbmRow?.rcbm ?? null;
    } else {
      // General tiered rates (forwarder.php L1846-1880). tb_rate_g_* keyed by
      // coid (not userid) — here coid='PR', the general bucket. This is the final
      // fallback for ANY non-SVIP customer (the VIP-group tier was retired
      // 2026-07-10 — its 154 customers were materialized to per-customer SVIP).
      const { data: gKg, error: gKgErr } = await admin
        .from("tb_rate_g_kg")
        .select("rgkg1, rgkg2, rgkg3")
        .eq("coid", coID).eq("sourcewarehouse", wh).eq("rgtransporttype", tt).eq("rgproductstype", pt)
        .maybeSingle<{ rgkg1: number | string | null; rgkg2: number | string | null; rgkg3: number | string | null }>();
      if (gKgErr) console.error(`[resolveLiveForwarderRate: tb_rate_g_kg] failed`, { code: gKgErr.code, message: gKgErr.message });
      const { data: gCbm, error: gCbmErr } = await admin
        .from("tb_rate_g_cbm")
        .select("rgcbm1, rgcbm2, rgcbm3")
        .eq("coid", coID).eq("sourcewarehouse", wh).eq("rgtransporttype", tt).eq("rgproductstype", pt)
        .maybeSingle<{ rgcbm1: number | string | null; rgcbm2: number | string | null; rgcbm3: number | string | null }>();
      if (gCbmErr) console.error(`[resolveLiveForwarderRate: tb_rate_g_cbm] failed`, { code: gCbmErr.code, message: gCbmErr.message });
      candidates.generalKg = gKg ? { tier1: gKg.rgkg1, tier2: gKg.rgkg2, tier3: gKg.rgkg3 } : null;
      candidates.generalCbm = gCbm ? { tier1: gCbm.rgcbm1, tier2: gCbm.rgcbm2, tier3: gCbm.rgcbm3 } : null;
    }
  }

  // Per-order ค่าเทียบ override (edit-form toggle). When ON it WINS over the
  // customer's stored userComparison/userComparisonValue — exactly the way the
  // customRate switch wins over the system rate. We express it through the
  // resolver's EXISTING comparisonEnabled/comparisonValue inputs (force ON +
  // the admin-typed threshold), so NO rate math changes. When OFF (the default
  // for MOMO import / preview), the stored values flow through unchanged.
  // owner 2026-07-08: ค่าเทียบ = 250 is now the SYSTEM DEFAULT applied to EVERY order
  // (reverses the 2026-06-23 "default = คิดตามคิว/CBM"). Dense cargo (KGPerCBM > ค่าเทียบ)
  // AUTO-charges by weight so it can never undercharge — e.g. 46.5kg / 0.044คิว
  // (=1,048 KGPerCBM) now prices 930 (น้ำหนัก) from the start, not 262 (คิว). The
  // per-order ค่าเทียบ TICK still OVERRIDES with the staff-typed threshold. The
  // comparison threshold defaults to the customer's stored value, floored to
  // COMPARISON_DEFAULT (250) — clampComparison keeps it in [250, 350].
  const comparisonEnabled = true;
  const comparisonValue = ctx.customComparisonSwitch === true
    ? clampComparison(ctx.customComparisonValue)
    : clampComparison(Number(ctx.userComparisonValue) > 0 ? ctx.userComparisonValue : COMPARISON_DEFAULT);

  // Build the resolver INPUT once + share it between the winner (the bill) and
  // the both-basis probe (the display) so the per-basis unit rates shown match
  // exactly what the save would price each basis on (no parallel formula).
  const resolveInput: ResolveRateInput = {
    weightKg: ctx.weightKg,
    volumeCbm: ctx.cbmProduct,
    comparisonEnabled,
    comparisonValue,
    // ค่าเทียบ basis decision on the order total (ภูม 2026-06-18) — pass-through;
    // undefined → resolver uses this row's own ratio (back-compat).
    comparisonKgPerCbm: ctx.comparisonKgPerCbm,
    // NB: we deliberately DON'T set resolveForwarderRate's `customComparison`
    // flag — that flag FORCES the legacy 200/150 threshold, whereas the edit
    // form lets the admin type an arbitrary ค่าเทียบ (e.g. 250). Threading the
    // typed value through comparisonEnabled/comparisonValue (above) honours it
    // without touching the math.
    // Owner-locked doc-tier discount (no-op when the caller leaves these unset).
    docTierEligible: ctx.docTierEligible === true,
    docTierDiscountCbm: ctx.docTierDiscountCbm ?? 0,
  };

  const resolved = resolveForwarderRate(candidates, resolveInput);
  // ค่านำเข้าจีน-ไทย ขั้นต่ำ 50 บาท (ภูม 2026-07-01) — ยกยอดที่ต่ำกว่า 50 (แต่มีเรทจริง)
  // ขึ้นเป็น 50. ไม่แตะเคส rateMissing/rate<=0 (กันสร้างยอดผีบนแถวยังไม่มีเรท).
  //
  // 🔵 ต่อ "ชิปเม้น" ไม่ใช่ต่อกล่องแตก (ภูม/พี่ป๊อป 2026-07-22 · "ยึดตามหัว shipment") —
  // ขั้นต่ำ ฿50 คือ ต่อ 1 ชิปเม้น (พัสดุจริง 1 ตัว) ไม่ใช่ต่อกล่องย่อยที่ MOMO แตกออกมา.
  // เมื่อ caller ส่ง comparisonKgPerCbm มา (= แถวนี้เป็นกล่องย่อยของชิปเม้นหลายแทรค) เรา
  // "ไม่" floor รายกล่อง — ยอดรวมทั้งชิปเม้นสูงกว่า ฿50 อยู่แล้ว (ตรงกับ preview ที่ floor
  // ยอดรวม). ถ้าไม่ส่ง (ชิปเม้นแทรคเดียว/ยืนเดี่ยว) → floor เหมือนเดิม (ของเล็กจริงๆ ฿50 min).
  // ถ้าไม่ทำ: กล่องเบา (2kg×17=34) โดนดันเป็น 50 ต่อกล่อง → save = 12,179.50 ≠ preview 12,163.50.
  const isShipmentChild =
    ctx.comparisonKgPerCbm != null &&
    Number.isFinite(ctx.comparisonKgPerCbm) &&
    ctx.comparisonKgPerCbm > 0;
  if (
    !isShipmentChild &&
    !resolved.rateMissing &&
    resolved.rate > 0 &&
    resolved.transportSubtotal > 0 &&
    resolved.transportSubtotal < FORWARDER_IMPORT_MIN_THB
  ) {
    resolved.transportSubtotal = FORWARDER_IMPORT_MIN_THB;
  }
  // Both per-basis unit rates from the SAME candidates+input (display only — the
  // bill still uses `resolved`). null per basis = no rate card for that tuple.
  const unitRates = resolveBothBasisRates(candidates, resolveInput);

  return { resolved, coID, unitRates };
}

// ════════════════════════════════════════════════════════════
// computeAndFillForwarderImportRate — auto-price an EXISTING tb_forwarder row.
//
// WHY: MOMO-imported rows (lib/admin/commit-momo-row-core.ts) land with
// frefrate=0 / frefprice='0' / ftotalprice=0 because the commit never ran the
// rate waterfall — so the admin detail page shows "ไม่พบข้อมูล" + ฿0.00. Legacy
// PCS auto-computes the rate at import (api-forwarder-momo.php → calPriceForwarder).
// This function reproduces that: load the row, build the SAME PricingRowContext
// the admin dimension-edit save builds, run resolveLiveForwarderRate, and persist
// ONLY the three transport-rate columns.
//
// ⚠️ MONEY-ISOLATION: writes ONLY frefrate / frefprice / ftotalprice. It NEVER
//    touches userid / status / wallet / commission / paydeposit / the selling
//    grand-total / any adder. And it NEVER persists a silent ฿0 — when the rate
//    is missing (no rate card for the customer's warehouse/transport/product
//    tuple) it returns wrote:false and leaves the row untouched, exactly like the
//    dimension-edit save refuses the write on `rateMissing`.
// ════════════════════════════════════════════════════════════
export async function computeAndFillForwarderImportRate(
  admin: ReturnType<typeof createAdminClient>,
  fid: number,
): Promise<{ ok: boolean; wrote: boolean; reason: string; rate?: number; total?: number }> {
  if (!Number.isInteger(fid) || fid <= 0) {
    return { ok: false, wrote: false, reason: "invalid_fid" };
  }

  // ── 1. Load the row (only the columns the waterfall needs) ──
  const { data: row, error: rowErr } = await admin
    .from("tb_forwarder")
    .select(
      "id, userid, fweight, fvolume, famount, famountcount, " +
      "fwarehousechina, ftransporttype, fproductstype, frefrate, " +
      // manual rate override (มัดจำ/กำหนดเอง) — honour it so an auto re-price
      // NEVER clobbers an admin's manually-set rate (owner "แก้มือได้ทุกจุด").
      "customrate, customratekg, customratecbm, " +
      // per-order ค่าเทียบ override (mig 0187) — so a measure/sync auto-price picks
      // the SAME KG-vs-CBM basis as the dimension-edit save (no basis drift).
      "custom_comparison, custom_comparison_value, " +
      // doc-tier discount inputs (owner 2026-06-16 · doc_tier_confirmed = C1 mig 0188)
      "tax_doc_pref, reforder, adminidcreator, doc_tier_confirmed, " +
      // physical-cabinet mode (owner 2026-07-08 · road-shipped=road-priced) — the
      // stored ftransporttype can be a stale sea default while the ตู้ is road (GZE/EK);
      // reconcile below so this shared pricer never under-charges a road shipment.
      "fcabinetnumber, ftrackingchn",
    )
    .eq("id", fid)
    .maybeSingle<{
      id: number;
      userid: string;
      fweight: number | string | null;
      fvolume: number | string | null;
      famount: number | string | null;
      famountcount: string | number | null;
      fwarehousechina: string | null;
      ftransporttype: string | null;
      fproductstype: string | null;
      frefrate: number | string | null;
      customrate: string | null;
      customratekg: number | string | null;
      customratecbm: number | string | null;
      custom_comparison: string | null;
      custom_comparison_value: number | string | null;
      tax_doc_pref: string | null;
      reforder: string | null;
      adminidcreator: string | null;
      doc_tier_confirmed: boolean | null;
      fcabinetnumber: string | null;
      ftrackingchn: string | null;
    }>();
  if (rowErr) {
    console.error(`[computeAndFillForwarderImportRate: tb_forwarder read] failed`, {
      code: rowErr.code, message: rowErr.message, fid,
    });
    return { ok: false, wrote: false, reason: `db_error:${rowErr.code ?? "unknown"}` };
  }
  if (!row) {
    return { ok: false, wrote: false, reason: "not_found" };
  }

  // ── 1b. ZERO-BASIS GUARD (owner 2026-07-17 · MONEY) ────────────────────────
  // A row with no weight AND no volume has NOTHING to price against — every rate is
  // ฿/kg or ฿/CBM, so pricing it can only ever produce ฿0. Refuse instead.
  //
  // WHY THIS EXISTS: a MOMO split shipment keeps its SELL freight on the bare header
  // row while the real boxes live in its "-N/M" siblings. Reconciling the box basis onto
  // the siblings means zeroing the header's basis — and without this guard, ANY later
  // re-price (a sync, a dimension save, a cron pass) would recompute that header at
  // ฿0 × rate = ฿0 and silently erase the shipment's freight (519218029029 = ฿730).
  // That exact risk is why the self-heal refused to touch a priced bare at all
  // (box-detail-reconcile-plan.ts `priced_anchor_bare`), which left the box counts wrong
  // forever (owner: "13/3 บัคไหมหละครับ · ทำไมยังแก้ไม่หายสักที").
  //
  // With the money pinned here, the header can safely become a pure summary row.
  // Fails CLOSED: keeps the stored price, writes nothing.
  const basisWeight = Number(row.fweight ?? 0);
  const basisVolume = Number(row.fvolume ?? 0);
  if (!(basisWeight > 0) && !(basisVolume > 0)) {
    return { ok: true, wrote: false, reason: "zero_basis_price_locked" };
  }

  // ── 1c. BASIS-DRIFT GUARD (owner 2026-07-17 · MONEY) ───────────────────────
  // The zero-basis guard above only catches a basis of ZERO. Prod also carries rows whose
  // stored basis is a MULTIPLE of the momo_box_detail truth (usually ×2 — verified prod
  // GZS260618-1/PR002 · 15 แถว) while ftotalprice was computed on the TRUE basis. Those
  // price correctly today, so a re-price here would silently DOUBLE them
  // (#52082 · 1781309805 · ฿3,350 → ฿6,700). ×2 is not 0 → it sails through 1b.
  //
  // Refuse to price a basis that provably disagrees with MOMO. FAIL-SAFE: no momo box /
  // undecidable / under the noise floor → PASS (blocking those would freeze the 102 prod
  // rows that carry no momo_box_detail at all). The DECISION is pure + unit-tested in
  // lib/forwarder/basis-drift-guard.ts; this block only fetches the evidence.
  const trackingForBox = String(row.ftrackingchn ?? "").trim();
  const baseForBox = baseOf(trackingForBox);
  if (baseForBox) {
    // ONE query by base_tracking serves BOTH legitimate readings the guard accepts:
    // the row's own box (split model) AND the Σ of the base (rollup model — what the staff
    // box editor writes right before it calls this function). Reading only the exact box
    // would make this guard block that repair.
    const { data: boxRows, error: boxErr } = await admin
      .from("momo_box_detail")
      .select("box_tracking, width, length, height, weight_kg, cbm, quantity")
      .eq("base_tracking", baseForBox);
    if (boxErr) {
      // A transient read must NOT freeze pricing platform-wide (the guard's whole point is
      // that over-blocking is worse than no guard) → log loudly and let it through, exactly
      // like the tb_users comparison read below. The exposure is bounded: the drifted set is
      // 30 known already-billed rows, none of which the routine flow re-prices.
      console.error(`[computeAndFillForwarderImportRate: momo_box_detail read] failed`, {
        code: boxErr.code, message: boxErr.message, fid, base: baseForBox,
      });
    } else if (boxRows && boxRows.length > 0) {
      const baseBoxes: MomoBoxRow[] = boxRows.map((b) => ({
        boxTracking: String(b.box_tracking ?? ""),
        width: b.width, length: b.length, height: b.height,
        weightKg: b.weight_kg, cbm: b.cbm, quantity: b.quantity,
      }));
      // Compare the RAW stored fvolume — the famountcount/cbmProduct derivation below is a
      // PRICING step, not part of "does our basis match MOMO".
      const drift = evaluateBasisDrift({
        storedWeightKg: basisWeight,
        storedCbm: basisVolume,
        ownBoxTracking: trackingForBox,
        baseBoxes,
      });
      if (drift.blocked) {
        console.error(`[computeAndFillForwarderImportRate] REFUSED — basis drifted from momo_box_detail`, {
          fid, tracking: trackingForBox, detail: drift.detail,
        });
        // Fails CLOSED on a PROVEN drift: keeps the stored price, writes nothing.
        return {
          ok: true,
          wrote: false,
          reason: drift.message ?? "basis_drift_price_locked",
        };
      }
    }
  }

  // ── 2. Build the PricingRowContext (exactly like adminUpdateForwarderDimensions) ──
  // MOMO has no manual rate override → customRateSwitch=false.
  // CBMProduct: legacy L1935-1941 — famountcount==1 ? fvolume : fvolume*famount.
  // The MOMO commit writes famountcount=1, so cbmProduct == fvolume for those
  // rows; we still honour famount for any other caller.
  const famountCount = row.famountcount == null ? null : String(row.famountcount);
  const famount = num(row.famount);
  const fvolume = num(row.fvolume);
  const cbmProduct = String(famountCount ?? "").trim() === "1" ? fvolume : fvolume * famount;

  // userComparison / userComparisonValue (tb_users · camelCase batch 1) — read
  // the SAME way the edit action does.
  const { data: cmpRow, error: cmpErr } = await admin
    .from("tb_users")
    .select("userComparison, userComparisonValue")
    .eq("userID", row.userid)
    .maybeSingle<{ userComparison: string | number | null; userComparisonValue: number | string | null }>();
  if (cmpErr) {
    console.error(`[computeAndFillForwarderImportRate: tb_users comparison] failed`, {
      code: cmpErr.code, message: cmpErr.message, userid: row.userid,
    });
  }
  const userComparison = String(cmpRow?.userComparison ?? "0").trim() === "1";
  const userComparisonValue = num(cmpRow?.userComparisonValue);

  // ── owner-locked doc-tier discount eligibility (owner 2026-06-16) ──
  // BOTH conditions: tax-doc ∈ {ใบกำกับ,ใบขน} AND a cargo-import-service row.
  // This is the auto-pricing path for MOMO commit + manual create — both write
  // tb_forwarder rows, so the import-service signal is read from the row itself.
  const docTierEligible = isDocTierEligible({
    taxDocPref:       row.tax_doc_pref,
    reforder:         row.reforder,
    adminidcreator:   row.adminidcreator,
    // C1 (ฝากโอน) = the per-order admin ติ๊กยืนยัน (mig 0188). Defaults FALSE on a
    // fresh/MOMO-committed row; a re-price of a confirmed row honours it.
    docTierConfirmed: row.doc_tier_confirmed === true,
  });
  const docTierDiscountCbm = docTierEligible ? await getDocTierDiscountCbm() : 0;

  // fproductstype default '1' (= ทั่วไป) — same default the MOMO commit used
  // for fProductsType. fwarehousechina / ftransporttype: read whatever the row
  // has (the MOMO commit sets fwarehousechina='1' กวางโจว + ftransporttype
  // '1'/'2'); if genuinely empty leave empty so the rate lookup simply misses
  // → rateMissing (we then DON'T write — never a silent ฿0).
  // Manual rate override — when the row has customrate='1', honour the admin's
  // typed KG/CBM rate (the waterfall returns it as source:"manual") so a re-price
  // (MOMO sync · warehouse measure · backfill) NEVER overwrites a manual rate.
  const customRateSwitch = String(row.customrate ?? "0").trim() === "1";
  // Per-order ค่าเทียบ override (mig 0187) — pick the SAME KG-vs-CBM basis the
  // dimension-edit save would, so a measure/sync auto-price never drifts the basis.
  const customComparisonSwitch = String(row.custom_comparison ?? "0").trim() === "1";
  const customComparisonValue = customComparisonSwitch ? num(row.custom_comparison_value) : 0;
  // Reconcile the transport mode to the PHYSICAL ตู้/tracking (owner 2026-07-08):
  // the stored ftransporttype may be a stale sea default while the ตู้ is road
  // (GZE/EK) — price at the ACTUAL shipped mode so road-shipped = road-priced (stops
  // the under-charge). Cabinet name wins → tracking → normalized stored fallback.
  const reconciledTransportType =
    transportModeFromCabinetName(row.fcabinetnumber) ??
    transportModeFromCabinetName(row.ftrackingchn) ??
    resolveTransportMode(null, row.ftransporttype);

  // ── SHIPMENT-level ค่าเทียบ (owner 2026-07-19 "คิดเป็นชิปเม้น ไม่ใช่แยกแทรคกิ้ง") ──
  // The KG-vs-CBM decision must be made on the SHIPMENT-TOTAL density (Σ over all
  // sibling trackings of the same base, e.g. X9002653-1..-4) — a heavy tracking
  // inside a bulky shipment must NOT flip to weight on its own. The BILLED value
  // stays per-row (this row's weight/cbmProduct); only the DECISION aggregates
  // (resolve-rate.ts comparisonKgPerCbm — same input the multi-tracking editor
  // save already threads). Single-tracking shipments: unchanged (row-local).
  let shipmentKgPerCbm = 0;
  {
    const base = baseOf((row.ftrackingchn ?? "").trim());
    if (base) {
      const { data: sibs, error: sibErr } = await admin
        .from("tb_forwarder")
        .select("fweight, fvolume, famount, famountcount, ftrackingchn")
        .eq("userid", row.userid)
        .neq("fstatus", "99")
        .ilike("ftrackingchn", `${base.replace(/[%_]/g, "\\$&")}%`)
        .limit(200);
      if (sibErr) {
        console.error(`[computeAndFillForwarderImportRate: shipment siblings] failed`, {
          code: sibErr.code, message: sibErr.message, fid, base,
        });
      } else {
        const fam = (sibs ?? []).filter((s) => baseOf((s.ftrackingchn ?? "").trim()) === base);
        if (fam.length > 1) {
          let w = 0, cbm = 0;
          for (const s of fam) {
            w += num(s.fweight);
            const fc = String(s.famountcount ?? "").trim();
            const v = num(s.fvolume);
            cbm += fc === "1" ? v : v * Math.max(num(s.famount), 1);
          }
          if (cbm > 0) shipmentKgPerCbm = w / cbm;
        }
      }
    }
  }

  const ctx: PricingRowContext = {
    userid:              row.userid,
    fwarehousechina:     String(row.fwarehousechina ?? "").trim(),
    ftransporttype:      reconciledTransportType,
    fproductstype:       String(row.fproductstype ?? "").trim() || "1",
    weightKg:            num(row.fweight),
    cbmProduct,
    famountcount:        famountCount,
    famount,
    reforder:            null,
    customRateSwitch,
    customRateKg:        customRateSwitch ? num(row.customratekg) : 0,
    customRateCbm:       customRateSwitch ? num(row.customratecbm) : 0,
    userComparison,
    userComparisonValue,
    customComparisonSwitch,
    customComparisonValue,
    docTierEligible,
    docTierDiscountCbm,
    // shipment-total density (0 = single-tracking / unknown → resolver falls
    // back to this row's own ratio · resolve-rate.ts L362-367)
    comparisonKgPerCbm: shipmentKgPerCbm > 0 ? shipmentKgPerCbm : undefined,
  };

  // ── 3. Resolve the rate ──
  const priceResult = await resolveLiveForwarderRate(admin, ctx);
  if ("error" in priceResult) {
    return { ok: false, wrote: false, reason: priceResult.error };
  }
  const { resolved } = priceResult;

  // ── 4. Never persist a silent ฿0 ──
  if (resolved.rateMissing || resolved.rate <= 0) {
    return { ok: true, wrote: false, reason: "rate_missing" };
  }

  // ── 5. Persist ONLY the three transport-rate columns ──
  // frefprice is the engine's KG/CBM choice ('1' KG · '2' CBM); frefprice/
  // ftotalprice match the legacy varchar columns (String). Money-isolation:
  // this UPDATE writes NOTHING else.
  const { error: updErr } = await admin
    .from("tb_forwarder")
    .update({
      frefrate:    resolved.rate,
      frefprice:   String(resolved.refPrice),
      ftotalprice: resolved.transportSubtotal,
      // persist the reconciled physical-cabinet mode so the stored ftransporttype
      // + the priced rate agree afterward (mirrors forwarders-edit + MOMO commit).
      ftransporttype: reconciledTransportType,
    })
    .eq("id", fid);
  if (updErr) {
    console.error(`[computeAndFillForwarderImportRate: tb_forwarder update] failed`, {
      code: updErr.code, message: updErr.message, fid,
    });
    return { ok: false, wrote: false, reason: updErr.message };
  }

  return {
    ok: true,
    wrote: true,
    reason: resolved.source,
    rate: resolved.rate,
    total: resolved.transportSubtotal,
  };
}

// ════════════════════════════════════════════════════════════
// previewForwarderRateMissing — READ-ONLY rate-missing probe for the detail page.
//
// WHY: the admin dimension-edit save (adminUpdateForwarderDimensions) only
// DISCOVERS a missing rate at SAVE time (it returns "ไม่พบเรทราคาขนส่ง…"). The
// read-only detail page showed no warning + no quick entry — staff didn't know a
// row was un-priced until they tried to save. This computes the SAME
// `rateMissing` signal the save uses, from the SAME tb_forwarder row + the SAME
// resolveLiveForwarderRate engine, so the on-page badge and the save can NEVER
// drift. PURE READ — no write, never throws (degrades to {missing:false} on a DB
// error so the detail page still renders).
//
// It deliberately mirrors the SYSTEM-pricing waterfall (customRateSwitch=false):
// the badge means "the system can't find a rate card for this tuple", which is
// exactly when the inline manual-override fallback is useful. A row that already
// carries a manual override (customrate='1') is reported NOT missing (the admin
// already supplied the rate). Money-isolation: zero writes here.
// ════════════════════════════════════════════════════════════
export async function previewForwarderRateMissing(
  admin: ReturnType<typeof createAdminClient>,
  fid: number,
): Promise<{ missing: boolean }> {
  if (!Number.isInteger(fid) || fid <= 0) return { missing: false };

  const { data: row, error: rowErr } = await admin
    .from("tb_forwarder")
    .select(
      "id, userid, fweight, fvolume, famount, famountcount, " +
      "fwarehousechina, ftransporttype, fproductstype, " +
      "customrate, customratekg, customratecbm, " +
      "tax_doc_pref, reforder, adminidcreator, doc_tier_confirmed",
    )
    .eq("id", fid)
    .maybeSingle<{
      id: number;
      userid: string;
      fweight: number | string | null;
      fvolume: number | string | null;
      famount: number | string | null;
      famountcount: string | number | null;
      fwarehousechina: string | null;
      ftransporttype: string | null;
      fproductstype: string | null;
      customrate: string | null;
      customratekg: number | string | null;
      customratecbm: number | string | null;
      tax_doc_pref: string | null;
      reforder: string | null;
      adminidcreator: string | null;
      doc_tier_confirmed: boolean | null;
    }>();
  if (rowErr) {
    console.error(`[previewForwarderRateMissing: tb_forwarder read] failed`, {
      code: rowErr.code, message: rowErr.message, fid,
    });
    return { missing: false }; // never block the page render on a transient read
  }
  if (!row) return { missing: false };

  // A row that already has a manual override is not "missing" — the admin typed it.
  const customRateSwitch = String(row.customrate ?? "0").trim() === "1";
  if (customRateSwitch) return { missing: false };

  // Same CBMProduct derivation the save + import paths use.
  const famountCount = row.famountcount == null ? null : String(row.famountcount);
  const famount = num(row.famount);
  const fvolume = num(row.fvolume);
  const cbmProduct = String(famountCount ?? "").trim() === "1" ? fvolume : fvolume * famount;

  const { data: cmpRow, error: cmpErr } = await admin
    .from("tb_users")
    .select("userComparison, userComparisonValue")
    .eq("userID", row.userid)
    .maybeSingle<{ userComparison: string | number | null; userComparisonValue: number | string | null }>();
  if (cmpErr) {
    console.error(`[previewForwarderRateMissing: tb_users comparison] failed`, {
      code: cmpErr.code, message: cmpErr.message, userid: row.userid,
    });
  }
  const userComparison = String(cmpRow?.userComparison ?? "0").trim() === "1";
  const userComparisonValue = num(cmpRow?.userComparisonValue);

  // Doc-tier discount inputs — same eligibility the save reads. (Irrelevant to
  // rateMissing, which keys off the resolved rate being 0, but kept identical so
  // the resolver runs the exact same way as the save.)
  const docTierEligible = isDocTierEligible({
    taxDocPref:       row.tax_doc_pref,
    reforder:         row.reforder,
    adminidcreator:   row.adminidcreator,
    // C1 (ฝากโอน) = the per-order admin ติ๊กยืนยัน (mig 0188). Defaults FALSE on a
    // fresh/MOMO-committed row; a re-price of a confirmed row honours it.
    docTierConfirmed: row.doc_tier_confirmed === true,
  });
  const docTierDiscountCbm = docTierEligible ? await getDocTierDiscountCbm() : 0;

  const ctx: PricingRowContext = {
    userid:              row.userid,
    fwarehousechina:     String(row.fwarehousechina ?? "").trim(),
    ftransporttype:      String(row.ftransporttype ?? "").trim(),
    fproductstype:       String(row.fproductstype ?? "").trim() || "1",
    weightKg:            num(row.fweight),
    cbmProduct,
    famountcount:        famountCount,
    famount,
    reforder:            row.reforder,
    customRateSwitch:    false,
    customRateKg:        0,
    customRateCbm:       0,
    userComparison,
    userComparisonValue,
    docTierEligible,
    docTierDiscountCbm,
  };

  const priceResult = await resolveLiveForwarderRate(admin, ctx);
  if ("error" in priceResult) {
    console.error(`[previewForwarderRateMissing: resolve] failed`, { fid, error: priceResult.error });
    return { missing: false };
  }
  return { missing: priceResult.resolved.rateMissing || priceResult.resolved.rate <= 0 };
}
