"use server";

/**
 * Admin > "แก้ไขขนาด/น้ำหนัก" — server actions for /admin/forwarders/[fNo]/edit.
 *
 * Wave 12-C ภาค 2 (2026-05-23) — follow-up to Wave 12-C v2 (commit d2f5db1).
 * Wave 12-C v2 ships the 9-field CREATE modal; this file ships the EDIT flow
 * that lets admin fill in dimensions (weight · L×W×H · CBM · crate · type) AFTER
 * the goods arrive at the China warehouse (legacy fstatus='2').
 *
 * Per docs/learnings/pacred-design-philosophy.md + AGENTS.md §0a:
 *   - Legacy = workflow source (which columns get UPDATEd, in what shape)
 *   - Pacred = UI source (own Tailwind form, NOT BS4 markup)
 *
 * Legacy admin edit flow (forwarder.php $_GET['page']=='edit' / 'detail') updates
 * these tb_forwarder columns when goods arrive:
 *   - fweight              numeric — kg
 *   - fwidth · flength · fheight  numeric — cm
 *   - fvolume              numeric — (W × L × H) / 1,000,000 — cbm
 *   - fproductstype        char(1) — '1' ทั่วไป · '2' มอก. · '3' อย. · '4' พิเศษ
 *   - frefprice            char(1) — '1' น้ำหนัก · '2' ปริมาตร — which one bills
 *   - fnote                text   — admin-facing note
 *   - adminidupdate        — last updater
 *   - fdateadminstatus     — timestamp of last admin status touch
 *
 * Per-item crate update (tb_forwarder_item):
 *   - chinawoodencratefeetype  char(1) — '1' ไม่ตี · '2' ตีลัง
 *   - chinawoodencratefee      numeric — fee (THB) · 0 = free
 *
 * Resolution of f_no slug — matches the detail page (page.tsx):
 *   numeric → tb_forwarder.id
 *   string  → tb_forwarder.fidorco
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";
import {
  resolveForwarderRate,
  type ResolveRateCandidates,
  type ResolvedRate,
} from "@/lib/forwarder/resolve-rate";
import { getMinSellFloors } from "@/lib/pricing/min-sell-config";
import {
  getMinSellAdvisory,
  type MinSellAdvisory,
  type MinSellTransport,
  type MinSellWarehouse,
} from "@/lib/pricing/min-sell";

// ────────────────────────────────────────────────────────────
// Resolve current admin's legacy id (tb_forwarder.adminid* is varchar(10)).
// Same helper as forwarders-new.ts — kept local to avoid premature extraction.
// ────────────────────────────────────────────────────────────
async function resolveLegacyAdminId(): Promise<string> {
  const supabase = await createClient();
  const { data: { user }, error: dataErr } = await supabase.auth.getUser();
  if (dataErr) {
    console.error(`[supabase list] failed`, { code: dataErr.code, message: dataErr.message });
  }
  const email = user?.email ?? null;
  if (!email) return "system";

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("tb_admin")
    .select("adminID")
    .eq("adminEmail", email)
    .maybeSingle<{ adminID: string | null }>();
  if (error) {
    console.error(`[tb_admin list] failed`, { code: error.code, message: error.message });
  }
  if (data?.adminID) return data.adminID;
  return (email.split("@")[0] || "system").slice(0, 20); // 2026-06-05 varchar(20)
}

// ────────────────────────────────────────────────────────────
// Per-item crate edit input (one entry per tb_forwarder_item row).
// ────────────────────────────────────────────────────────────
const itemCrateSchema = z.object({
  itemId:    z.number().int().positive(),
  crateType: z.enum(["1", "2"] as const),       // '1' ไม่ตี · '2' ตีลัง
  crateFee:  z.number().min(0).max(99999.99).default(0),
});
export type ItemCrateInput = z.infer<typeof itemCrateSchema>;

// ────────────────────────────────────────────────────────────
// Main edit schema — fweight / fwidth / flength / fheight + cbm-derived.
// All optional individually but at least one must change (validated below).
// ────────────────────────────────────────────────────────────
const editForwarderSchema = z.object({
  fNo:           z.string().trim().min(1).max(50),
  weightKg:      z.number().min(0).max(99999.99),
  widthCm:       z.number().min(0).max(9999.99),
  lengthCm:      z.number().min(0).max(9999.99),
  heightCm:      z.number().min(0).max(9999.99),
  // fproductstype char(1) — legacy enum
  productType:   z.enum(["1", "2", "3", "4"] as const),
  // frefprice char(1) — '1' น้ำหนัก · '2' ปริมาตร
  refPrice:      z.enum(["1", "2"] as const),
  // admin-facing note (tb_forwarder.fnote — TEXT, no length cap in schema; we cap at 2000)
  note:          z.string().trim().max(2000).optional(),
  // Per-item crate list. Empty list = no crate updates.
  items:         z.array(itemCrateSchema).max(200).default([]),
});
export type AdminEditForwarderInput = z.infer<typeof editForwarderSchema>;

// Compute CBM the same way legacy does: (W × L × H) / 1,000,000 (cm³ → m³).
function computeCbm(width: number, length: number, height: number): number {
  const v = (width * length * height) / 1_000_000;
  // Legacy numeric(10,5) — keep 5 decimals.
  return Math.round(v * 100_000) / 100_000;
}

function num(v: number | string | null | undefined): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const p = parseFloat(v);
  return Number.isFinite(p) ? p : 0;
}

// ────────────────────────────────────────────────────────────
// LIVE PRICING WATERFALL — port of forwarder.php `update_data` getPrice()
// (L1806-1931) + the SVIP probe (L1841-1843). This is the SQL half; the
// decision logic lives in lib/forwarder/resolve-rate.ts (pure + unit-tested).
//
// Inputs come from the EXISTING tb_forwarder row (warehouse/transport/
// comparison/refOrder/amount — legacy reads these from the row in
// update_data L1770-1798) + the dimensions the admin just submitted
// (weight/cbm/productType).
//
// ⚠️ MONEY PATH. The rate this resolves is written to tb_forwarder as
//    fTotalPrice (the China→Thailand TRANSPORT subtotal · legacy naming —
//    see resolve-rate.ts header FLAG). It does NOT touch fTransportPrice
//    (the Thailand domestic-delivery leg, set by the Flash/PCSE flow).
// ────────────────────────────────────────────────────────────
interface PricingRowContext {
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
  userComparison: boolean;
  userComparisonValue: number;
}

async function resolveLiveForwarderRate(
  admin: ReturnType<typeof createAdminClient>,
  ctx: PricingRowContext,
): Promise<{ resolved: ResolvedRate; coID: string } | { error: string }> {
  // tb_users — coID drives general(=='PCS') vs VIP-group; legacy reads
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
  const coID = (userRow?.coID ?? "").trim();
  const isGeneral = coID === "PCS";

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
    isGeneral,
    generalKg: null,
    generalCbm: null,
    vipKg: null,
    vipCbm: null,
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
    } else if (isGeneral) {
      // General tiered rates (forwarder.php L1846-1880). tb_rate_g_* keyed
      // by coid (not userid) — here coid='PCS', the general bucket.
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
    } else {
      // VIP-group flat rates by coID (forwarder.php L1884-1904).
      const { data: vKg, error: vKgErr } = await admin
        .from("tb_rate_vip_kg")
        .select("rkg")
        .eq("coid", coID).eq("sourcewarehouse", wh).eq("rtransporttype", tt).eq("rproductstype", pt)
        .maybeSingle<{ rkg: number | string | null }>();
      if (vKgErr) console.error(`[resolveLiveForwarderRate: tb_rate_vip_kg] failed`, { code: vKgErr.code, message: vKgErr.message });
      const { data: vCbm, error: vCbmErr } = await admin
        .from("tb_rate_vip_cbm")
        .select("rcbm")
        .eq("coid", coID).eq("sourcewarehouse", wh).eq("rtransporttype", tt).eq("rproductstype", pt)
        .maybeSingle<{ rcbm: number | string | null }>();
      if (vCbmErr) console.error(`[resolveLiveForwarderRate: tb_rate_vip_cbm] failed`, { code: vCbmErr.code, message: vCbmErr.message });
      candidates.vipKg = vKg?.rkg ?? null;
      candidates.vipCbm = vCbm?.rcbm ?? null;
    }
  }

  const resolved = resolveForwarderRate(candidates, {
    weightKg: ctx.weightKg,
    volumeCbm: ctx.cbmProduct,
    comparisonEnabled: ctx.userComparison,
    comparisonValue: ctx.userComparisonValue,
    // customComparison (per-order comparison override) is not part of the
    // dimensions form; legacy reads it from the calPrice POST. For the
    // dimension-edit save we follow the customer's stored userComparison.
  });

  return { resolved, coID };
}

// ────────────────────────────────────────────────────────────
// adminUpdateForwarderDimensions — UPDATE tb_forwarder + tb_forwarder_item.
//
// Resolution: numeric fNo → tb_forwarder.id · else → tb_forwarder.fidorco.
// (Matches `[fNo]/page.tsx` renderLegacyForwarderView.)
// ────────────────────────────────────────────────────────────
export type AdminUpdateForwarderDimensionsData = {
  id: number;
  cbm: number;
  /** China→Thailand transport price the rate engine resolved (legacy fTotalPrice). */
  ftotalprice: number;
  /** Unit rate chosen (legacy fRefRate). */
  frefrate: number;
  /** 1 = billed by KG · 2 = billed by CBM (legacy fRefPrice). */
  frefprice: 1 | 2;
  basis: "kg" | "cbm";
  rateSource: "manual" | "svip" | "vip" | "general";
  /** Recomputed grand total (transport + adders − discount). */
  grandTotal: number;
  /**
   * Lane C min-sell guardrail (global-trade-group §5). Evaluates the resolved
   * China→Thailand transport price against the per-route floor (business_config
   * `pricing.min_sell_floor`). The save STILL succeeds (faithful — the row is
   * priced by the legacy engine); this is surfaced so the edit UI can hard-WARN
   * (`level==="below"`) the pricer that they're under the sales floor. `block`
   * is true only if the owner flips the policy to a true gate.
   */
  minSell: MinSellAdvisory;
};

export async function adminUpdateForwarderDimensions(
  rawInput: AdminEditForwarderInput,
): Promise<AdminActionResult<AdminUpdateForwarderDimensionsData>> {
  const parsed = editForwarderSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  return withAdmin<AdminUpdateForwarderDimensionsData>(
    ["ops", "accounting", "super"],
    async ({ adminId }) => {
      const admin         = createAdminClient();
      const legacyAdminId = (await resolveLegacyAdminId()).slice(0, 10);
      const cbm           = computeCbm(d.widthCm, d.lengthCm, d.heightCm);

      // ─── Resolve target row ─────────────────────────────────────
      const asNumber = Number(d.fNo);
      const isId = Number.isFinite(asNumber) && Number.isInteger(asNumber) && asNumber > 0;

      let q = admin
        .from("tb_forwarder")
        .select(
          "id, fidorco, userid, fweight, fwidth, flength, fheight, fvolume, " +
          "fproductstype, frefprice, fnote, " +
          // ── pricing-context columns (legacy update_data reads these) ──
          "fwarehousechina, ftransporttype, famount, famountcount, reforder, " +
          "customrate, customratekg, customratecbm, fdiscount, " +
          "ftotalprice, ftransportprice, fshippingservice, ftransportpricechnthb, " +
          "pricecrate, priceother, fpriceupdate, frefrate",
        )
        .limit(1);
      q = isId ? q.eq("id", asNumber) : q.eq("fidorco", d.fNo);
      const { data: existing, error: existingErr } = await q.maybeSingle();
      if (existingErr) {
        console.error(`[adminUpdateForwarderDimensions: tb_forwarder read] failed`, {
          code: existingErr.code, message: existingErr.message, fNo: d.fNo,
        });
        return { ok: false, error: `อ่านรายการไม่สำเร็จ: ${existingErr.message}` };
      }
      if (!existing) {
        return { ok: false, error: "ไม่พบรายการ (fNo ไม่ตรงกับ tb_forwarder)" };
      }
      const before = existing as unknown as {
        id: number;
        fidorco: string | null;
        userid: string;
        fweight: number | string;
        fwidth: number | string;
        flength: number | string;
        fheight: number | string;
        fvolume: number | string;
        fproductstype: string;
        frefprice: string;
        fnote: string | null;
        fwarehousechina: string;
        ftransporttype: string;
        famount: number | string | null;
        famountcount: string | null;
        reforder: string | null;
        customrate: string | null;
        customratekg: number | string | null;
        customratecbm: number | string | null;
        fdiscount: number | string | null;
        ftotalprice: number | string | null;
        ftransportprice: number | string | null;
        fshippingservice: number | string | null;
        ftransportpricechnthb: number | string | null;
        pricecrate: number | string | null;
        priceother: number | string | null;
        fpriceupdate: number | string | null;
        frefrate: number | string | null;
      };

      const nowIso = new Date().toISOString();

      // ─── LIVE PRICING (port of forwarder.php update_data L1934-2068) ──
      // After the admin sets weight/CBM/product, recompute the China→Thailand
      // transport price via the legacy rate waterfall, EXACTLY as the legacy
      // save did. The result → fTotalPrice (legacy naming · transport), with
      // fRefRate (unit rate) + fRefPrice ('1' KG · '2' CBM). The manual-
      // override path (customrate switch on) keeps the admin-typed rate.
      //
      // ⚠️ Faithful note: the dimension-edit form does NOT send warehouse /
      //    transport-type / comparison — legacy reads those from the row in
      //    update_data, so we do the same (use `before.*`).
      const customRateSwitch = String(before.customrate ?? "0").trim() === "1";
      const famountCount = before.famountcount;
      const famount = num(before.famount);
      // CBMProduct — legacy L1935-1941: famountcount==1 → fvolume; else fvolume*famount.
      const cbmProduct = String(famountCount ?? "").trim() === "1" ? cbm : cbm * famount;

      // userComparison / userComparisonValue (tb_users · camelCase batch 1).
      const { data: cmpRow, error: cmpErr } = await admin
        .from("tb_users")
        .select("userComparison, userComparisonValue")
        .eq("userID", before.userid)
        .maybeSingle<{ userComparison: string | number | null; userComparisonValue: number | string | null }>();
      if (cmpErr) {
        console.error(`[adminUpdateForwarderDimensions: tb_users comparison] failed`, {
          code: cmpErr.code, message: cmpErr.message, userid: before.userid,
        });
      }
      const userComparison = String(cmpRow?.userComparison ?? "0").trim() === "1";
      const userComparisonValue = num(cmpRow?.userComparisonValue);

      const priceResult = await resolveLiveForwarderRate(admin, {
        userid:            before.userid,
        fwarehousechina:   before.fwarehousechina,
        ftransporttype:    before.ftransporttype,
        fproductstype:     d.productType,          // the JUST-submitted product type
        weightKg:          d.weightKg,
        cbmProduct,
        famountcount:      famountCount,
        famount,
        reforder:          before.reforder,
        customRateSwitch,
        customRateKg:      num(before.customratekg),
        customRateCbm:     num(before.customratecbm),
        userComparison,
        userComparisonValue,
      });
      if ("error" in priceResult) {
        return { ok: false, error: priceResult.error };
      }
      const { resolved } = priceResult;

      // ⚠️ FAITHFUL-GAP (flagged to orchestrator): legacy update_data also
      //    re-derives a PROMO discount (forwarder.php L2022-2061 · promoID
      //    3/4/7/15 → fDiscount += price × 0.10/0.07/0.05/0.03) and writes
      //    fDiscount. We deliberately DO NOT mutate fDiscount here — a
      //    dimension edit silently changing the discount is surprising, and
      //    the promo path needs tb_promotion + coID logic. fDiscount is left
      //    as-is. If promo auto-discount on re-price is required, port it as a
      //    follow-up (with owner sign-off, since it changes money).

      // §money: NEVER persist a silent ฿0 transport price. legacy returned 0
      // + surfaced "ไม่มีเรทราคา …"; we refuse the write and tell the admin.
      if (resolved.rateMissing) {
        console.error(`[adminUpdateForwarderDimensions: rate missing]`, {
          fNo: d.fNo, id: before.id, userid: before.userid,
          warehouse: before.fwarehousechina, transport: before.ftransporttype,
          product: d.productType, source: resolved.source,
        });
        return {
          ok: false,
          error:
            "ไม่พบเรทราคาขนส่งสำหรับ (โกดัง/ขนส่ง/ประเภทสินค้า) ของลูกค้ารายนี้ — " +
            "กรุณาตั้งเรทขนส่งให้ลูกค้าก่อน (หน้าโปรไฟล์ลูกค้า) หรือใช้เรทกำหนดเอง แล้วลองอีกครั้ง",
        };
      }

      // Recompute the grand total exactly as legacy does (forwarder.php L220 /
      // printReceiptF.php L354 / outstanding.calcForwarderOutstanding):
      //   ftotalprice (NEW transport) + fpriceupdate + fshippingservice +
      //   ftransportpricechnthb + pricecrate + priceother + ftransportprice
      //   − fdiscount.
      // (We do NOT mutate the service adders / discount here — the dimension
      //  edit only changes the transport leg. fTransportPrice = TH-domestic,
      //  left untouched — legacy update_data also leaves it as the POST value.)
      const newFTotalPrice = resolved.transportSubtotal;
      const grandTotal =
        newFTotalPrice +
        num(before.fpriceupdate) +
        num(before.fshippingservice) +
        num(before.ftransportpricechnthb) +
        num(before.pricecrate) +
        num(before.priceother) +
        num(before.ftransportprice) -
        num(before.fdiscount);
      const newGrandTotal = Math.round(grandTotal * 100) / 100;

      // ─── Lane C — min-sell guardrail advisory (global-trade-group §5) ──
      // Evaluate the resolved China→Thailand transport price (legacy fTotalPrice
      // = the shipping subtotal a customer is charged) against the per-route
      // sales floor. We do NOT block the save (faithful — the legacy engine just
      // priced the row); we return the advisory so the edit form can hard-WARN
      // the pricer. The floor is per (warehouse, transport) — both read from the
      // row (before.*), the same source the rate engine used above.
      const minSellFloors = await getMinSellFloors();
      const minSell = getMinSellAdvisory({
        floors: minSellFloors,
        warehouse: (String(before.fwarehousechina ?? "1").trim() as MinSellWarehouse) || "1",
        transport: (String(before.ftransporttype ?? "1").trim() as MinSellTransport) || "1",
        quotedThb: newFTotalPrice,
      });

      // ─── UPDATE tb_forwarder ────────────────────────────────────
      const update: Record<string, unknown> = {
        fweight:           d.weightKg,
        fwidth:            d.widthCm,
        flength:           d.lengthCm,
        fheight:           d.heightCm,
        fvolume:           cbm,
        fproductstype:     d.productType,
        // fRefPrice is COMPUTED by the rate engine (legacy overwrites the
        // POSTed value with the engine's choice). We keep the engine result.
        frefprice:         String(resolved.refPrice),
        frefrate:          resolved.rate,
        ftotalprice:       newFTotalPrice,
        fnote:             d.note ?? before.fnote ?? null,
        adminidupdate:     legacyAdminId,
        fdateadminstatus:  nowIso,
      };

      const { error: updErr } = await admin
        .from("tb_forwarder")
        .update(update)
        .eq("id", before.id);
      if (updErr) {
        console.error(`[adminUpdateForwarderDimensions: tb_forwarder update] failed`, {
          code: updErr.code, message: updErr.message, id: before.id,
        });
        return { ok: false, error: updErr.message };
      }

      // ─── UPDATE tb_forwarder_item rows ──────────────────────────
      // Each item row update is one PATCH — Supabase doesn't support a
      // bulk-by-id UPDATE in one call. We loop sequentially because the
      // list is small (the largest order in prod is ~30 items).
      const itemUpdateErrors: { itemId: number; error: string }[] = [];
      for (const it of d.items) {
        const { error: itemErr } = await admin
          .from("tb_forwarder_item")
          .update({
            chinawoodencratefeetype: it.crateType,
            chinawoodencratefee:     it.crateFee,
            adminidupdated:          legacyAdminId,
            lasttimeupdated:         nowIso,
          })
          .eq("id", it.itemId)
          .eq("fid", before.id);   // belt-and-suspenders: don't let an admin
                                   // touch an item from a different order
        if (itemErr) {
          itemUpdateErrors.push({ itemId: it.itemId, error: itemErr.message });
        }
      }

      // ─── Mirror crate flag onto tb_forwarder ────────────────────
      // Legacy convention: tb_forwarder.crate = '1' if ANY item has
      // chinawoodencratefeetype='2'; else '2'. The header-level pricecrate
      // is the sum of per-item fees (admin can later adjust).
      const anyCrated = d.items.some((it) => it.crateType === "2");
      const totalCrateFee = d.items
        .filter((it) => it.crateType === "2")
        .reduce((sum, it) => sum + it.crateFee, 0);

      if (d.items.length > 0) {
        const { error: crateMirrorErr } = await admin
          .from("tb_forwarder")
          .update({
            crate:      anyCrated ? "1" : "2",
            pricecrate: totalCrateFee,
          })
          .eq("id", before.id);
        if (crateMirrorErr) {
          itemUpdateErrors.push({ itemId: 0, error: `mirror: ${crateMirrorErr.message}` });
        }
      }

      // ─── Audit log ──────────────────────────────────────────────
      await logAdminAction(
        adminId,
        "tb_forwarder.update_dimensions",
        "tb_forwarder",
        String(before.id),
        {
          fNo: d.fNo,
          before: {
            fweight:       Number(before.fweight),
            fwidth:        Number(before.fwidth),
            flength:       Number(before.flength),
            fheight:       Number(before.fheight),
            fvolume:       Number(before.fvolume),
            fproductstype: before.fproductstype,
            frefprice:     before.frefprice,
            fnote:         before.fnote,
          },
          after: {
            fweight:       d.weightKg,
            fwidth:        d.widthCm,
            flength:       d.lengthCm,
            fheight:       d.heightCm,
            fvolume:       cbm,
            fproductstype: d.productType,
            frefprice:     String(resolved.refPrice),
            fnote:         d.note ?? null,
          },
          // ── money-path audit trail (the live-pricing change) ──
          pricing: {
            before: {
              ftotalprice: num(before.ftotalprice),
              frefrate:    num(before.frefrate),
              frefprice:   before.frefprice,
            },
            after: {
              ftotalprice: newFTotalPrice,     // China→Thailand transport (legacy fTotalPrice)
              frefrate:    resolved.rate,
              frefprice:   String(resolved.refPrice),
            },
            basis:           resolved.basis,
            rate_source:     resolved.source,   // manual | svip | vip | general
            custom_rate:     customRateSwitch,
            cbm_product:     cbmProduct,
            grand_total:     newGrandTotal,
            // Lane C — record when the resolved price landed below the sales
            // floor (so a below-floor save is auditable even if the rep
            // overrode the UI warning).
            min_sell: {
              level:        minSell.level,
              floor_thb:    minSell.floorThb,
              quoted_thb:   minSell.quotedThb,
              shortfall_thb: minSell.shortfallThb,
            },
          },
          items_updated:   d.items.length,
          crate_count:     d.items.filter((it) => it.crateType === "2").length,
          crate_fee_total: totalCrateFee,
          item_errors:     itemUpdateErrors.length > 0 ? itemUpdateErrors : undefined,
        },
      );

      // ─── Revalidate ────────────────────────────────────────────
      revalidatePath("/admin/forwarders");
      revalidatePath(`/admin/forwarders/${d.fNo}`);
      revalidatePath(`/admin/forwarders/${d.fNo}/edit`);
      revalidatePath(`/admin/forwarders/${before.id}`);
      revalidatePath("/admin");
      // NB: the sidebar badge "รอชำระเงิน" count is served from the
      // 60s-TTL pcs-chrome cache (lib/legacy/pcs-chrome.ts). We intentionally
      // do NOT revalidateTag it here — Next 16's revalidateTag now requires a
      // cache profile arg and this admin edit doesn't change a customer's
      // sidebar count (the row is already in รอชำระเงิน). The 60s TTL is fine.

      if (itemUpdateErrors.length > 0) {
        return {
          ok: false,
          error:
            `บันทึกค่าหลักได้ แต่มี ${itemUpdateErrors.length} รายการสินค้าอัปเดตไม่สำเร็จ — ` +
            itemUpdateErrors.map((e) => `#${e.itemId}: ${e.error}`).join(", "),
        };
      }
      return {
        ok: true,
        data: {
          id: before.id,
          cbm,
          ftotalprice: newFTotalPrice,
          frefrate:    resolved.rate,
          frefprice:   resolved.refPrice,
          basis:       resolved.basis,
          rateSource:  resolved.source,
          grandTotal:  newGrandTotal,
          minSell,
        },
      };
    },
  );
}
