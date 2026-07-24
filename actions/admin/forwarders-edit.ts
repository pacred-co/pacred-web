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
import { appendStatusLog } from "@/lib/notifications/status-flip-helper";
import { resolveComparisonInput, validateComparisonPricePair } from "@/lib/forwarder/comparison-guard";
import {
  resolveLiveForwarderRate,
  type PricingRowContext,
} from "@/lib/forwarder/live-rate";
import { isDocTierEligible, getDocTierDiscountCbm } from "@/lib/forwarder/doc-tier-discount";
import {
  transportModeFromCabinetName,
  resolveTransportMode,
  type TransportMode,
} from "@/lib/forwarder/cabinet-transport";
import { evaluateRateModeGuard, type RateModeGuard } from "@/lib/forwarder/rate-mode-guard";
import { evaluateDeliveryAddressGate } from "@/lib/forwarder/delivery-address-gate";
import { autoFillThShippingForForwarder } from "@/lib/admin/auto-fill-th-shipping";
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
//
// 2026-06-05 (this commit): added the legacy `update.php` override block:
//   customrate switch + customratekg / customratecbm   (forwarder.php L1801-1818
//                                                         + L1074-1086 form)
//   fdiscount, ftransportpricechnthb, priceother,
//   ftransportprice, fshippingservice                    (L1217-1241 form)
//   fwarehousechina, fwarehousename                      (L1112-1132 form)
// All optional + default to legacy-row value (read from `before.*`) when omitted
// — the schema is non-breaking for existing callers.
// ────────────────────────────────────────────────────────────
const editForwarderSchema = z.object({
  fNo:           z.string().trim().min(1).max(50),
  weightKg:      z.number().min(0).max(99999.99),
  widthCm:       z.number().min(0).max(9999.99),
  lengthCm:      z.number().min(0).max(9999.99),
  heightCm:      z.number().min(0).max(9999.99),
  /** CBM override — Issue 3 (ภูม 2026-06-16 "ช่อง …(ถึงไทยแล้ว) แก้ให้สามารถ
   *  แก้ไข CBM ได้ด้วย"). When present it WINS over the (W×L×H)/1e6 auto-
   *  derivation (the legacy computeCbm); when omitted (old callers) we fall
   *  back to computeCbm so the change is non-breaking. A manual CBM is
   *  authoritative — it drives fvolume AND the by-volume price leg
   *  (cbmProduct below), so the billed volume matches what the admin typed. */
  volumeCbm:     z.number().min(0).max(99999.99).optional(),
  // fproductstype char(1) — legacy enum
  productType:   z.enum(["1", "2", "3", "4"] as const),
  // frefprice char(1) — '1' น้ำหนัก · '2' ปริมาตร.
  // 2026-06-17 (ภูม flag · "คิดเรทตาม dropdown ลบออก") — the rate engine
  // COMPUTES frefprice itself (resolved.refPrice overwrites whatever the form
  // sent · see the UPDATE below), so this input is unused in the money calc.
  // The "คิดเรทตาม" dropdown was removed from the edit form (the 2 toggles
  // คิดราคา/ค่าเทียบ decide kg-vs-cbm now). Kept OPTIONAL so legacy callers
  // (e.g. ForwarderRateMissingFallback) that still send it don't break.
  refPrice:      z.enum(["1", "2"] as const).optional(),
  // admin-facing note (tb_forwarder.fnote — TEXT, no length cap in schema; we cap at 2000)
  note:          z.string().trim().max(2000).optional(),

  // ── Custom-rate override block (legacy `customRate` toggle, L1074-1086) ──
  /** '0' = system pricing waterfall · '1' = admin override (customratekg/cbm) */
  customRate:    z.enum(["0", "1"] as const).optional(),
  customRateKg:  z.number().min(0).max(99999.99).optional(),
  customRateCbm: z.number().min(0).max(99999.99).optional(),

  // ── Per-order ค่าเทียบ override (legacy `customComparison` toggle) ──
  // The edit-form "คิดค่าเทียบแบบกำหนดเอง" toggle + ค่าเทียบ input. When ON, the
  // KG-vs-CBM comparison threshold for THIS order is the admin-typed value (winning
  // over the customer's stored tb_users.userComparisonValue) — mirrors how
  // customRate overrides the system rate. Both optional → non-breaking for any
  // caller that still sends the old payload (the comparison then follows tb_users).
  /** '0' = use the customer's stored ค่าเทียบ · '1' = per-order override */
  customComparison:      z.enum(["0", "1"] as const).optional(),
  /** ค่าเทียบ threshold (1 คิว = N kg) — used only when customComparison === '1'. */
  userComparisonValue:   z.number().min(0).max(99999.99).optional(),
  /**
   * ค่าเทียบ on the ORDER TOTAL (ภูม 2026-06-18) — Σweight÷Σcbm of every sibling
   * tracking. The per-tracking editor sends this so the KG-vs-CBM basis decision
   * is made on the whole order, not this single row. Optional → undefined keeps
   * the legacy per-row decision (single-row edit form / other callers).
   */
  comparisonKgPerCbm:    z.number().min(0).max(9999999).optional(),

  // ── Money-side adders / discount (legacy L1217-1241) ──
  fDiscount:              z.number().min(0).max(9999999.99).optional(),
  fTransportPriceChnThb:  z.number().min(0).max(9999999.99).optional(),
  priceOther:             z.number().min(0).max(9999999.99).optional(),
  /** ค่าขนส่งในไทย — domestic delivery leg (legacy L1206) */
  fTransportPrice:        z.number().min(0).max(9999999.99).optional(),
  /** ค่าบริการฝากนำเข้า (legacy fshippingservice — not on update.php form
   *  itself but on calPrice preview L243 + the receipt; admin can set it
   *  in the edit form per ภูม flag). */
  fShippingService:       z.number().min(0).max(9999999.99).optional(),
  /** ค่าตีลังไม้ per row (tb_forwarder.pricecrate — PCS report-cnt "ค่าตีลัง"
   *  column · owner 2026-07-21 "ค่าตีลังไม้ยังไม่เห็นมีให้ใส่"). Part of the same
   *  grand-total composite as priceother/ftransportpricechnthb. */
  priceCrate:             z.number().min(0).max(9999999.99).optional(),
  /** จำนวนกล่อง (tb_forwarder.famount · owner 2026-07-21 "จำนวนกล่อง สามารถแก้ไข
   *  และบันทึกได้") — sits behind the client's unlock gate. Changing it re-prices
   *  through the SAME engine below: cbmProduct = famountcount==='1' ? cbm : cbm×famount. */
  boxCount:               z.number().int().min(0).max(99999).optional(),

  // ── Warehouses (legacy L1112-1132) ──
  /** โกดังต้นทางในจีน · varchar(1) '1' กวางโจว · '2' อี้อู */
  fWarehouseChina: z.enum(["1", "2"] as const).optional(),
  /** โกดังที่รับในไทย · varchar(1) '1' แสง · '2' CTT · '3' MK · '4' MX ·
   *  '5' JMF · '6' GOGO · '7' Cargo Center · '8' MOMO */
  fWarehouseName:  z.enum(["1", "2", "3", "4", "5", "6", "7", "8", "9"] as const).optional(),

  // Per-item crate list. Empty list = no crate updates.
  items:         z.array(itemCrateSchema).max(200).default([]),

  // ── DIMS-ONLY save gate (ภูม 2026-07-01) ──────────────────────────────────
  // Warehouse staff need to enter/save the physical measurements (น้ำหนัก · กว้าง ·
  // ยาว · สูง · CBM) as soon as goods arrive — while the SELLER may not have set the
  // freight rate yet. The default save auto-advances ถึงไทยแล้ว(4)→รอชำระเงิน(5)
  // once a freight rate exists; that prematurely bills an order whose rate isn't
  // ready. When `advanceToPayment === false`, this save persists the dimensions +
  // recomputes CBM/price (price is a derived read — fine) but LEAVES fstatus AS-IS
  // (no advance to 5, no lock, no billing). OPTIONAL + defaults to the legacy
  // behaviour (advance when eligible) so every existing caller — the "บันทึก + ส่ง
  // ไปรอชำระเงิน" button, the edit form, the rate-missing fallback — is unchanged.
  advanceToPayment: z.boolean().optional(),
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
// LIVE PRICING WATERFALL — the SQL waterfall (`resolveLiveForwarderRate`) +
// its `PricingRowContext` type were extracted (behavior-preserving) to
// `lib/forwarder/live-rate.ts` so the MOMO import path can reuse the exact
// same engine. Imported at the top of this file. The decision logic still
// lives in the pure `lib/forwarder/resolve-rate.ts`.
//
// ⚠️ MONEY PATH. The rate it resolves is written to tb_forwarder as
//    fTotalPrice (the China→Thailand TRANSPORT subtotal · legacy naming —
//    see resolve-rate.ts header FLAG). It does NOT touch fTransportPrice
//    (the Thailand domestic-delivery leg, set by the Flash/PCSE flow).
// ────────────────────────────────────────────────────────────

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
  rateSource: "manual" | "svip" | "general";
  /** Recomputed grand total (transport + adders − discount). */
  grandTotal: number;
  /** ภูม 2026-06-25 — did this save advance ถึงไทยแล้ว(4)→รอชำระเงิน(5)? false when
   *  the freight rate is still 0 (เซลยังไม่ตั้งเรท) — the UI shows a "ตั้งเรทก่อน" hint
   *  instead of falsely claiming the order moved to billing. */
  advancedToFive: boolean;
  /**
   * Lane C min-sell guardrail (global-trade-group §5). Evaluates the resolved
   * China→Thailand transport price against the per-route floor (business_config
   * `pricing.min_sell_floor`). The save STILL succeeds (faithful — the row is
   * priced by the legacy engine); this is surfaced so the edit UI can hard-WARN
   * (`level==="below"`) the pricer that they're under the sales floor. `block`
   * is true only if the owner flips the policy to a true gate.
   */
  minSell: MinSellAdvisory;
  /**
   * Rate-mode guard advisory (mirrors minSell shape). When the "คิดราคาแบบกำหนดเอง"
   * override is on AND the container's mode is decodable from its cabinet/tracking
   * name, this flags when the typed custom rate looks like the WRONG transport
   * mode's number (e.g. a ทางรถ rate on a ทางเรือ ตู้). ADVISORY ONLY — the save
   * still succeeds; the edit UI hard-WARNS. undefined = no container/mode to
   * evaluate, override off, or the extra rate resolves failed (never breaks save).
   */
  modeGuard?: RateModeGuard;
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
    // 2026-06-08 (ภูม warehouse-handoff round 2): added "warehouse".
    // The /admin/forwarders/[fNo]/edit page accepts warehouse role
    // (round 2 fix), but the SAVE action here was still ops/accounting
    // only — so warehouse staff could open the edit form (kg / cbm /
    // box-count / status pills) but every "บันทึก" press → ok:false
    // unauthorized. They'd see the form, type, click save, get an
    // unhelpful error. Now they can update box dimensions + status
    // (the legacy `update.php` was implicitly any-staff-with-the-
    // adminID-cookie; this matches that intent in V3 roles).
    ["ops", "accounting", "super", "warehouse"],
    async ({ adminId, roles }) => {
      const admin         = createAdminClient();

      // ── ค่าเทียบ (KG-vs-CBM comparison) server-side guard (2026-06-19) ──
      //   ภูม's client rule: warehouse staff may NOT edit ค่าเทียบ + it's capped
      //   at ≤350. The client disables the input, but warehouse IS admitted to
      //   this action — so a crafted POST could still set/override this billing-
      //   pricing field. resolveComparisonInput() mirrors the client gate: a
      //   non-god warehouse caller's override is dropped (stored value seeds) and
      //   an over-cap value is rejected. (See lib/forwarder/comparison-guard.ts.)
      const cmp = resolveComparisonInput(roles, d.customComparison, d.userComparisonValue);
      if (cmp.error) return { ok: false, error: cmp.error };
      const cmpSwitchInput = cmp.switchInput;
      const cmpValueInput  = cmp.valueInput;

      // ── 2026-07-06 (owner) — LOCKED PAIR server-side enforcement ──
      // "คิดราคาแบบกำหนดเอง" (custom sell price · d.customRate) และ ค่าเทียบ ต้องมา
      // พร้อมกัน (หรือไม่มาทั้งคู่). Enforce on the EFFECTIVE (post-guard) comparison
      // switch so a warehouse caller whose ค่าเทียบ was dropped can't set custom
      // price alone. Guard ONLY when the caller sends customRate — a legacy/single-
      // row caller that omits both toggles stays non-breaking (uses the stored/auto
      // path). When both-unchecked, the resolver's system waterfall runs unchanged.
      if (d.customRate !== undefined) {
        const pairErr = validateComparisonPricePair(
          d.customRate === "1",
          cmpSwitchInput === "1",
          cmpValueInput,
        );
        if (pairErr) {
          return {
            ok: false,
            error:
              pairErr +
              ((roles ?? []).includes("warehouse") && d.customRate === "1"
                ? " — พนักงานโกดังตั้งค่าเทียบไม่ได้ จึงกำหนดราคาเองไม่ได้"
                : ""),
          };
        }
      }
      const legacyAdminId = (await resolveLegacyAdminId()).slice(0, 10);
      // Issue 3: a typed CBM overrides the W×L×H derivation (rounded to the
      // legacy numeric(10,5) shape); omitted → fall back to computeCbm.
      const cbm           = d.volumeCbm != null
        ? Math.round(d.volumeCbm * 1_000_000) / 1_000_000
        : computeCbm(d.widthCm, d.lengthCm, d.heightCm);

      // ─── Resolve target row ─────────────────────────────────────
      const asNumber = Number(d.fNo);
      const isId = Number.isFinite(asNumber) && Number.isInteger(asNumber) && asNumber > 0;

      let q = admin
        .from("tb_forwarder")
        .select(
          "id, fidorco, userid, fweight, fwidth, flength, fheight, fvolume, " +
          "fproductstype, frefprice, fnote, fstatus, fcredit, " +
          // ── rate-mode guard inputs (decode transport mode from the ตู้ name) ──
          "fcabinetnumber, ftrackingchn, " +
          // ── ด่านที่อยู่จัดส่งก่อน 4→5 (owner 2026-07-23 · delivery-address-gate) ──
          "fshipby, faddressprovince, faddresszipcode, faddressno, " +
          // ── pricing-context columns (legacy update_data reads these) ──
          "fwarehousechina, ftransporttype, famount, famountcount, reforder, " +
          "customrate, customratekg, customratecbm, fdiscount, " +
          "ftotalprice, ftransportprice, fshippingservice, ftransportpricechnthb, paymethod, " +
          "pricecrate, priceother, fpriceupdate, frefrate, " +
          // ── per-order ค่าเทียบ override (0187 · durable persistence) ──
          "custom_comparison, custom_comparison_value, " +
          // ── doc-tier discount inputs (owner 2026-06-16) ──
          // doc_tier_confirmed = the per-order admin ติ๊กยืนยัน (C1 ฝากโอน · mig 0188).
          "tax_doc_pref, adminidcreator, doc_tier_confirmed",
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
        fshipby: string | null;
        faddressprovince: string | null;
        faddresszipcode: string | null;
        faddressno: string | null;
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
        paymethod: string | null;
        fshippingservice: number | string | null;
        ftransportpricechnthb: number | string | null;
        pricecrate: number | string | null;
        priceother: number | string | null;
        fpriceupdate: number | string | null;
        frefrate: number | string | null;
        custom_comparison: string | null;
        custom_comparison_value: number | string | null;
        tax_doc_pref: string | null;
        adminidcreator: string | null;
        doc_tier_confirmed: boolean | null;
        fstatus: string | null;
        fcredit: string | null;
        fcabinetnumber: string | null;
        ftrackingchn: string | null;
      };

      const nowIso = new Date().toISOString();

      // ─── LIVE PRICING (port of forwarder.php update_data L1934-2068) ──
      // After the admin sets weight/CBM/product, recompute the China→Thailand
      // transport price via the legacy rate waterfall, EXACTLY as the legacy
      // save did. The result → fTotalPrice (legacy naming · transport), with
      // fRefRate (unit rate) + fRefPrice ('1' KG · '2' CBM). The manual-
      // override path (customrate switch on) keeps the admin-typed rate.
      //
      // 2026-06-05: when the admin submits the customrate override block, use
      //   the just-submitted values for the rate waterfall — that's the whole
      //   point of the toggle (legacy L1801 reads `$_POST['customRate']`,
      //   `$_POST['customRateKG']`, `$_POST['customRateCBM']`). Fall back to
      //   the existing row when the field is omitted (backwards-compat).
      // Faithful note: the dimension-edit form may now send warehouse —
      //   when omitted, legacy reads from the row in update_data; we do the
      //   same.
      const effectiveCustomRate =
        d.customRate !== undefined ? d.customRate : String(before.customrate ?? "0").trim();
      const customRateSwitch = effectiveCustomRate === "1";
      const effectiveCustomRateKg =
        d.customRateKg !== undefined ? d.customRateKg : num(before.customratekg);
      const effectiveCustomRateCbm =
        d.customRateCbm !== undefined ? d.customRateCbm : num(before.customratecbm);
      const effectiveWarehouseChina =
        d.fWarehouseChina !== undefined
          ? d.fWarehouseChina
          : String(before.fwarehousechina ?? "1");
      const famountCount = before.famountcount;
      // owner 2026-07-21 — the unlock-gated จำนวนกล่อง edit: when the caller sends
      // boxCount it wins over the stored famount AND flows into cbmProduct below,
      // so the re-price runs on the corrected box count in the same save.
      const famount = d.boxCount !== undefined ? d.boxCount : num(before.famount);
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

      // ── per-order ค่าเทียบ override (legacy customComparison toggle) ──
      // When the admin ticks "คิดค่าเทียบแบบกำหนดเอง", the typed ค่าเทียบ wins
      // over the customer's stored userComparisonValue for THIS save (mirrors the
      // customRate override). The resolver applies it through its existing
      // comparison inputs (no rate-math change).
      // 2026-06-17 (ภูม · owner "ให้สวิตซ์ค้างถาวร") — NOW DURABLE (mig 0187):
      //   tb_forwarder.custom_comparison / custom_comparison_value persist the
      //   per-order override. When the caller sends customComparison we use +
      //   write it; when omitted (old callers e.g. ForwarderRateMissingFallback
      //   re-pricing) we SEED from the persisted row value so a re-price keeps
      //   the override (never silently drops it back to the tb_users default).
      // Uses the role-gated/cap-checked inputs (cmpSwitchInput / cmpValueInput)
      // computed above — NOT the raw d.customComparison — so a warehouse caller's
      // override is dropped (stored value seeds) and an over-cap value is rejected.
      const customComparisonSwitch =
        cmpSwitchInput !== undefined
          ? cmpSwitchInput === "1"
          : String(before.custom_comparison ?? "0").trim() === "1";
      const customComparisonValue =
        cmpSwitchInput !== undefined
          ? (cmpValueInput !== undefined ? cmpValueInput : 0)
          : num(before.custom_comparison_value);

      // ── owner-locked doc-tier discount eligibility (owner 2026-06-16) ──
      // BOTH conditions: tax-doc ∈ {ใบกำกับ,ใบขน} AND a cargo-import-service row
      // (reforder set = ฝากสั่งซื้อ/โอนหยวน · adminidcreator set = ฝากนำเข้า).
      // The manual customrate override path keeps the admin-typed rate as-is
      // (the resolver only discounts the SYSTEM CBM rate, never the manual one).
      const docTierEligible = isDocTierEligible({
        taxDocPref:       before.tax_doc_pref,
        reforder:         before.reforder,
        adminidcreator:   before.adminidcreator,
        // C1 (ฝากโอน) = the per-order admin ติ๊กยืนยัน (mig 0188). Defaults FALSE,
        // so no order is eligible until a role-gated admin confirms it.
        docTierConfirmed: before.doc_tier_confirmed === true,
      });
      const docTierDiscountCbm = docTierEligible ? await getDocTierDiscountCbm() : 0;

      // ── Reconcile transport mode to the PHYSICAL cabinet (owner 2026-07-08) ──
      // The stored ftransporttype is unreliable ("อย่าหลงเชื่อข้อมูลผิดๆ") — an
      // order shipped by road (GZE/EK ตู้) can sit with a stored sea "2" and get
      // priced sea = under-charged. The ตู้/tracking NAME is authoritative
      // (cabinet-transport.ts SOT · same decode MOMO commit already uses), so the
      // PHYSICAL mode wins at pricing; fall back to the normalized stored mode
      // only when neither the ตู้ nor the tracking carries a mode token. We both
      // price at THIS mode (below) AND persist it (update object) so the stored
      // mode and the rate agree afterwards. NOT a blanket backfill — only rows
      // saved through this pricing path are reconciled.
      const reconciledTransportType: TransportMode =
        transportModeFromCabinetName(before.fcabinetnumber) ??
        transportModeFromCabinetName(before.ftrackingchn) ??
        resolveTransportMode(null, before.ftransporttype);

      const priceCtx: PricingRowContext = {
        userid:            before.userid,
        fwarehousechina:   effectiveWarehouseChina,
        ftransporttype:    reconciledTransportType,
        fproductstype:     d.productType,          // the JUST-submitted product type
        weightKg:          d.weightKg,
        cbmProduct,
        famountcount:      famountCount,
        famount,
        reforder:          before.reforder,
        customRateSwitch,
        customRateKg:      effectiveCustomRateKg,
        customRateCbm:     effectiveCustomRateCbm,
        userComparison,
        userComparisonValue,
        // per-order ค่าเทียบ override — wins over the tb_users value when ON.
        customComparisonSwitch,
        customComparisonValue,
        // ค่าเทียบ decision on the order total (ภูม 2026-06-18) — when the
        // per-tracking editor supplies Σweight÷Σcbm, the KG-vs-CBM basis is
        // decided on the whole order; undefined → this row's own ratio.
        comparisonKgPerCbm: d.comparisonKgPerCbm,
        docTierEligible,
        docTierDiscountCbm,
      };
      const priceResult = await resolveLiveForwarderRate(admin, priceCtx);
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
          warehouse: before.fwarehousechina, transport: reconciledTransportType,
          storedTransport: before.ftransporttype,
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
      // 2026-06-05: the form now sends fshippingservice / ftransportpricechnthb
      //   / priceother / ftransportprice / fdiscount when the admin types them —
      //   when omitted, fall back to the existing row (=legacy behaviour, leaves
      //   them as the POST value). The dimension edit still does NOT touch
      //   fpriceupdate (driven by the shop-order auto-update path).
      const effectiveDiscount =
        d.fDiscount !== undefined ? d.fDiscount : num(before.fdiscount);
      const effectiveTransportChnThb =
        d.fTransportPriceChnThb !== undefined
          ? d.fTransportPriceChnThb
          : num(before.ftransportpricechnthb);
      const effectivePriceOther =
        d.priceOther !== undefined ? d.priceOther : num(before.priceother);
      const effectiveTransportPrice =
        d.fTransportPrice !== undefined
          ? d.fTransportPrice
          : num(before.ftransportprice);
      const effectiveShippingService =
        d.fShippingService !== undefined
          ? d.fShippingService
          : num(before.fshippingservice);
      const effectivePriceCrate =
        d.priceCrate !== undefined ? d.priceCrate : num(before.pricecrate);

      const newFTotalPrice = resolved.transportSubtotal;
      const grandTotal =
        newFTotalPrice +
        num(before.fpriceupdate) +
        effectiveShippingService +
        effectiveTransportChnThb +
        effectivePriceCrate +
        effectivePriceOther +
        effectiveTransportPrice -
        effectiveDiscount;
      const newGrandTotal = Math.round(grandTotal * 100) / 100;

      // ─── Lane C — min-sell guardrail advisory (global-trade-group §5) ──
      // Evaluate the resolved China→Thailand transport price (legacy fTotalPrice
      // = the shipping subtotal a customer is charged) against the per-route
      // sales floor. We do NOT block the save (faithful — the legacy engine just
      // priced the row); we return the advisory so the edit form can hard-WARN
      // the pricer. The floor is per (warehouse, transport) — both use the
      // effective values (the just-submitted one wins).
      const minSellFloors = await getMinSellFloors();
      const minSell = getMinSellAdvisory({
        floors: minSellFloors,
        warehouse: (effectiveWarehouseChina.trim() as MinSellWarehouse) || "1",
        transport: (reconciledTransportType as MinSellTransport) || "1",
        quotedThb: newFTotalPrice,
      });

      // ─── Rate-mode guard advisory (mirrors minSell · ADVISORY ONLY) ──
      // When the pricer overrode the rate manually (customRateSwitch), check that
      // the typed custom rate isn't the WRONG transport mode's number. The mode is
      // decoded from the ตู้/tracking NAME (authoritative · cabinet-transport.ts),
      // NOT the unreliable stored ftransporttype. We resolve the SYSTEM rate for the
      // derived mode AND the other mode (read-only · customRateSwitch:false) and
      // compare. NEVER blocks — wrapped in try/catch so any resolve failure leaves
      // modeGuard undefined and the save proceeds unchanged.
      let modeGuard: RateModeGuard | undefined;
      try {
        if (customRateSwitch) {
          const derivedMode =
            transportModeFromCabinetName(before.fcabinetnumber) ??
            transportModeFromCabinetName(before.ftrackingchn);
          if (derivedMode) {
            const otherMode = derivedMode === "1" ? "2" : derivedMode === "2" ? "1" : null;
            const sysCtx: PricingRowContext = {
              ...priceCtx,
              customRateSwitch: false,
              customRateKg: 0,
              customRateCbm: 0,
            };
            const exp = await resolveLiveForwarderRate(admin, { ...sysCtx, ftransporttype: derivedMode });
            const expCbm = "error" in exp ? 0 : (exp.unitRates.cbmRate ?? 0);
            const expKg  = "error" in exp ? 0 : (exp.unitRates.kgRate ?? 0);
            let othCbm = 0;
            let othKg = 0;
            if (otherMode) {
              const oth = await resolveLiveForwarderRate(admin, { ...sysCtx, ftransporttype: otherMode });
              othCbm = "error" in oth ? 0 : (oth.unitRates.cbmRate ?? 0);
              othKg  = "error" in oth ? 0 : (oth.unitRates.kgRate ?? 0);
            }
            modeGuard = evaluateRateModeGuard({
              derivedMode,
              typedCbmRate: effectiveCustomRateCbm,
              typedKgRate: effectiveCustomRateKg,
              expectedCbmRate: expCbm,
              otherModeCbmRate: othCbm,
              expectedKgRate: expKg,
              otherModeKgRate: othKg,
            });
          }
        }
      } catch (e) {
        console.error(`[adminUpdateForwarderDimensions: modeGuard]`, {
          fNo: d.fNo, id: before.id, error: String(e),
        });
        modeGuard = undefined;
      }

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
        // Persist the reconciled mode so the stored ftransporttype matches the
        // rate we just priced (the cabinet/tracking name won). Only changes the
        // row when the physical ตู้/tracking implies a different mode than the
        // stored one; identical otherwise (resolveTransportMode normalizes).
        ftransporttype:    reconciledTransportType,
        fnote:             d.note ?? before.fnote ?? null,
        adminidupdate:     legacyAdminId,
        fdateadminstatus:  nowIso,
      };

      // 2026-06-22 (ภูม · prod URGENT) — auto-advance "ถึงไทยแล้ว" → "รอชำระเงิน"
      // when the pricer fills the price + saves. The sales rep enters the price
      // on this form once the goods arrive (fstatus 4); saving must move the
      // order to 5 (รอชำระเงิน) so the customer is billed — staff were having to
      // flip the status by hand every time. Forward-only by construction:
      //   • ONLY from fstatus 4 → a credit-6 (juristic credit) or an already-
      //     paid/shipped 5/6/7 row is NEVER touched.
      //   • ONLY when the FREIGHT rate is actually set (newFTotalPrice > 0).
      //     ภูม 2026-06-25: gate on the FREIGHT (เรทนำเข้าจีน-ไทย = ftotalprice),
      //     NOT newGrandTotal. A manually-created import (เคสเซลได้ลูกค้าใหม่ →
      //     ภูมสร้างรายการเอง → โกดังคีย์น้ำหนัก/ขนาด แต่เซลยังไม่ตั้งเรท) has
      //     freight=0 yet a ฿100 ค่าจัดส่งไทย → newGrandTotal=100>0 เลย "เด้งไป
      //     รอชำระเงิน" ทั้งที่ราคายังไม่ตั้ง. Stay at "ถึงไทยแล้ว(4)" until the
      //     pricer fills a real rate (> 0). (MOMO sync ส่งน้ำหนัก+เรทมาครบ ปกติ
      //     freight>0 → advance เหมือนเดิม — กระทบเฉพาะเคสสร้างมือที่ยังไม่ตั้งเรท.)
      // Mirrors the accounting bulk-bill stamp (forwarder-check.ts → fstatus '5'
      // + fdatestatus5), so the order shows up correctly in AR aging (which dates
      // the receivable from fdatestatus5).
      //
      // 2026-07-01 (ภูม · แยก "บันทึกขนาด" ออกจาก "ส่งไปรอชำระ") — the caller can
      // OPT OUT with advanceToPayment=false (the warehouse dims-only save). Then we
      // persist the measurements + recomputed price but NEVER flip fstatus to 5:
      // the order stays at "ถึงไทยแล้ว(4)" until the pricer is ready to bill. The
      // flag defaults to the legacy behaviour (undefined → treated as advance), so
      // the existing "บันทึก + ส่งไปรอชำระเงิน" path is byte-for-byte unchanged.
      const advancedToFive =
        d.advanceToPayment !== false &&
        String(before.fstatus ?? "") === "4" &&
        newFTotalPrice > 0;

      // 🔴 ด่านที่อยู่จัดส่ง ก่อน 4→5 (owner 2026-07-23 · MONEY) — ที่อยู่กำหนด
      // ค่าส่งไทยที่ขึ้นบิล + ที่อยู่ผู้รับบนเอกสาร → ห้ามให้ไปถึง "รอชำระเงิน"
      // โดยยังไม่มีปลายทาง. REFUSE ก่อนเขียน (ยังไม่มีอะไรลง DB = ไม่มีสถานะครึ่งๆ).
      // ยิงเฉพาะตอนที่ save นี้จะ advance จริง → **การกด "บันทึกขนาด (ยังไม่ส่งรอชำระ)"
      // ของโกดังไม่กระทบเลย** และเป็นทางออกให้เซฟงานไว้ก่อนถ้าที่อยู่ยังไม่มา.
      if (advancedToFive) {
        const addrGate = evaluateDeliveryAddressGate([before]);
        if (!addrGate.ok) return { ok: false, error: addrGate.message };
      }

      if (advancedToFive) {
        update.fstatus = "5";
        update.fdatestatus5 = nowIso;
      }

      // 2026-06-05 — write the override block + adders only when the admin
      // actually typed something (each field is optional in the schema). This
      // preserves backwards-compat for callers that still send the old payload.
      if (d.customRate !== undefined)            update.customrate            = d.customRate;
      if (d.customRateKg !== undefined)          update.customratekg          = d.customRateKg;
      if (d.customRateCbm !== undefined)         update.customratecbm         = d.customRateCbm;
      if (d.fDiscount !== undefined)             update.fdiscount             = d.fDiscount;
      if (d.fTransportPriceChnThb !== undefined) update.ftransportpricechnthb = d.fTransportPriceChnThb;
      if (d.priceOther !== undefined)            update.priceother            = d.priceOther;
      if (d.fTransportPrice !== undefined)       update.ftransportprice       = d.fTransportPrice;
      if (d.fShippingService !== undefined)      update.fshippingservice      = d.fShippingService;
      if (d.fWarehouseChina !== undefined)       update.fwarehousechina       = d.fWarehouseChina;
      if (d.fWarehouseName !== undefined)        update.fwarehousename        = d.fWarehouseName;
      // ค่าตีลังไม้ (owner 2026-07-21) — header pricecrate. A positive fee also
      // marks the row crated (legacy crate='1'); ฿0 leaves the flag alone (the
      // per-item crate flags may still drive it via the items mirror below).
      if (d.priceCrate !== undefined) {
        update.pricecrate = d.priceCrate;
        if (d.priceCrate > 0) update.crate = "1";
      }
      if (d.boxCount !== undefined)              update.famount               = d.boxCount;
      // 2026-06-17 (mig 0187 · ภูม "ให้สวิตซ์ค้างถาวร") — persist the per-order
      // ค่าเทียบ override so the "คิดค่าเทียบแบบกำหนดเอง" toggle stays ON (with its
      // value) after reload. Written only when the form actually sends it; when
      // OFF we reset the value to 0 so a stale threshold can't linger.
      if (d.customComparison !== undefined) {
        update.custom_comparison       = d.customComparison;
        update.custom_comparison_value = d.customComparison === "1" ? customComparisonValue : 0;
      }

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

      // Audit the auto-bill flip (4→5) for the status timeline + AR aging trail.
      // Best-effort — a logging miss must never fail the price save.
      if (advancedToFive) {
        await appendStatusLog(admin, before.id, "4", "5", legacyAdminId);
      }

      // owner 2026-07-18 "เรทค่าขนส่งไม่ยอมขึ้น auto · Flash/J&T เก็บตามจริง" — the
      // MEASURE save is the moment the quote inputs (kg + girth) become complete →
      // quote the real courier rate into ftransportprice NOW if it's still ฿0.
      // costOnly (never touches carrier/paymethod) · fill-when-empty (a typed
      // fTransportPrice above wins — the helper re-guards 0/null) · best-effort.
      if (d.fTransportPrice === undefined || !(Number(d.fTransportPrice) > 0)) {
        await autoFillThShippingForForwarder(admin, before.id, { costOnly: true });
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
            // 2026-06-05 — overrides + adders (only when the admin typed them)
            ...(d.customRate            !== undefined ? { customrate:            d.customRate } : {}),
            ...(d.customRateKg          !== undefined ? { customratekg:          d.customRateKg } : {}),
            ...(d.customRateCbm         !== undefined ? { customratecbm:         d.customRateCbm } : {}),
            ...(d.fDiscount             !== undefined ? { fdiscount:             d.fDiscount } : {}),
            ...(d.fTransportPriceChnThb !== undefined ? { ftransportpricechnthb: d.fTransportPriceChnThb } : {}),
            ...(d.priceOther            !== undefined ? { priceother:            d.priceOther } : {}),
            // 🔒 COD LOCK (owner 2026-07-21 "พอเลือกชำระปลายทาง ค่าขนส่งไทยควรเป็น 0"):
            // a ปลายทาง row stores NO domestic charge — the courier collects it at the
            // door. Keeps the typed value on a ต้นทาง row exactly as before.
            ...(d.fTransportPrice       !== undefined
              ? { ftransportprice: String(before.paymethod ?? "").trim() === "2" ? 0 : d.fTransportPrice }
              : {}),
            ...(d.fShippingService      !== undefined ? { fshippingservice:      d.fShippingService } : {}),
            ...(d.fWarehouseChina       !== undefined ? { fwarehousechina:       d.fWarehouseChina } : {}),
            ...(d.fWarehouseName        !== undefined ? { fwarehousename:        d.fWarehouseName } : {}),
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
            rate_source:     resolved.source,   // manual | svip | general (vip-group retired 2026-07-10)
            custom_rate:     customRateSwitch,
            // per-order ค่าเทียบ override (compute-only · no tb_forwarder column)
            custom_comparison:       customComparisonSwitch,
            custom_comparison_value: customComparisonSwitch ? customComparisonValue : undefined,
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
            // Rate-mode guard (advisory) — record when a manual custom rate looked
            // like the wrong transport mode's number (auditable even if overridden).
            mode_guard: modeGuard
              ? {
                  level:        modeGuard.level,
                  derived_mode: modeGuard.derivedMode,
                  expected_cbm: modeGuard.expectedCbmRate,
                  typed_cbm:    modeGuard.typedCbmRate,
                }
              : undefined,
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
          advancedToFive,
          minSell,
          modeGuard,
        },
      };
    },
  );
}
