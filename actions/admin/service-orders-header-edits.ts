"use server";

/**
 * Admin > "แก้ไขออเดอร์ฝากสั่งซื้อ" (header-level field edits) — server actions
 * for /admin/service-orders/[hNo] update form.
 *
 * Lane A_header (2026-06-02) — closes the 2026-06-01 master gap audit
 * §6 finding: the legacy admin per-field "แก้ไข" handlers in
 * `pcs-admin/shops.php` L1238-1362 are unported on Pacred. The existing
 * `actions/admin/service-orders.ts` writes to the REBUILT empty
 * `service_orders` table (Potemkin trap per AGENTS.md §0e) — staff
 * edit, see green toast, and nothing on the live customer-facing row
 * changes. This file targets the LIVE `tb_header_order` (8,898 customers,
 * 21,950 rows on prod).
 *
 * Per AGENTS.md §0a — legacy = WORKFLOW source (which columns, in what
 * shape); Pacred = UI source (our own Tailwind form, NOT BS4 markup).
 * Per AGENTS.md §0e — verify CONSUMER reads the same `tb_*` table before
 * trusting any write. Pacred's customer-side `service-order/[hno]`,
 * `service-payment`, receipt printer, admin reports all read
 * `tb_header_order` — so writes here are visible end-to-end.
 *
 * Handlers ported (legacy shops.php line refs):
 *   - update_hShipBy   (L1309-1340) → adminUpdateOrderShipBy
 *       UPDATE hshipby + (if 'PCS') overwrite 10 haddress* cols with
 *       Pacred warehouse pickup snapshot. Rejects empty / value '3'.
 *       saveHistory(sql, 35).
 *   - update_hRate     (L1238-1267) → adminUpdateOrderRate    ⚠️ MONEY
 *       UPDATE hrate, then recompute htotalpriceuser =
 *       round_up(((htotalpricechn + hshippingchn) * hrate) + hshippingservice, 2)
 *       and UPDATE htotalpriceuser. round_up = Math.ceil(x*100)/100 →
 *       use the existing roundUp() helper (lib/admin/shop-disbursement-calc.ts).
 *       saveHistory(sql, 33).
 *   - update_payMethod (L1341-1351) → adminUpdateOrderPayMethod
 *       UPDATE paymethod. 1='ต้นทาง' (paid at origin/China) · 2='ปลายทาง'
 *       (paid at destination/Thailand by recipient). Affects forwarder COD
 *       flag downstream — NOT a wallet/cash distinction. Legacy doesn't
 *       saveHistory; we add logAdminAction for trail.
 *   - update_crate     (L1352-1362) → adminUpdateOrderCrate
 *       UPDATE crate. 1='ตีลังไม้' (wooden crate) · 2='ไม่ตีลังไม้'.
 *       Adds packaging surcharge downstream at forwarder dispatch (not
 *       in this writer's scope). Legacy doesn't saveHistory; we add.
 *
 * Column casing — tb_header_order is fully lowercase (hshipby, hrate,
 * paymethod, crate, haddress*, adminidupdate · per migration 0081 and
 * verified against actions/admin/cart.ts L443-475 + actions/admin/
 * service-orders-tb.ts L143-218 + actions/admin/service-orders-spawn.ts
 * L260-290). NOT camelCase like tb_users/tb_admin.
 *
 * PCS-pickup address — legacy hard-coded the old Bangkok PCS warehouse
 * (กทม 10160 · 02-444-7046 · เพชรเกษม 77). Per AGENTS.md §0 ("don't
 * preempt brand cleanup") the verbatim PCS strings should not be scrubbed
 * before ก๊อต API switchover. BUT sister code (actions/admin/cart.ts
 * L73-84 PCS_PICKUP_ADDRESS + actions/admin/forwarders-field-edits.ts
 * L356-367 FPCS_DEPOT_ADDRESS) already uses the Pacred TH-receiving
 * warehouse (ADDRESSES.warehouseTh, สมุทรสาคร). For consistency with the
 * sister writers AND because admin-edit re-running the SAME shipBy='PCS'
 * change on an existing PCS-pickup order MUST land the SAME address
 * (else displayed address drifts mid-order), this file uses the SAME
 * Pacred warehouse snapshot. Flagged for owner: if the legacy verbatim
 * is preferred until API switchover, swap HPCS_PICKUP_ADDRESS to the
 * legacy strings — same shape.
 *
 * NOT in this lane (scoped to other lanes per workflow split):
 *   - Per-line cart edits (qty / price / tracking / refund) → Lane B_line
 *   - Cancel order / soft-delete / reassign operator → Lane C_governance
 *   - hAddress update from saved tb_address book → already in
 *     actions/admin/service-orders.ts adminUpdateOrderAddress? (out of
 *     this lane's scope; not touched here)
 *   - Customer notification on rate change → flagged for ภูม decision
 *     (legacy doesn't notify; trust requires it but we don't ship the
 *     notify wire here)
 *   - UI mount buttons → main session task per spawn brief
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";
import { safeLegacyAdminId } from "@/lib/auth/safe-legacy-admin-id";
import { roundUp } from "@/lib/admin/shop-disbursement-calc";
import { ADDRESSES, CONTACT } from "@/components/seo/site";
import { isValidShopCarrierCode } from "@/lib/freight/shipping-methods";

// ────────────────────────────────────────────────────────────
// Resolve current admin's legacy adminID (tb_header_order.adminidupdate
// is varchar(10) → use safeLegacyAdminId at the write site).
//
// Same pattern as service-orders-tb.ts L79-103 / forwarders-edit.ts L50-70
// / forwarders-field-edits.ts L70-82 — kept local until the consolidation
// task lifts these into actions/admin/common.ts (4th+ caller).
// ────────────────────────────────────────────────────────────
async function resolveLegacyAdminId(): Promise<string> {
  const supabase = await createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr) {
    console.error(`[service-orders-header-edits.resolveLegacyAdminId auth] failed`, {
      code: authErr.code, message: authErr.message,
    });
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
    console.error(`[service-orders-header-edits.resolveLegacyAdminId tb_admin] failed`, {
      code: error.code, message: error.message,
    });
  }
  if (data?.adminID) return data.adminID;
  return email.slice(0, 10);
}

// ────────────────────────────────────────────────────────────
// Pacred warehouse pickup snapshot — written when hshipby='PCS'.
//
// Matches the sister writers (actions/admin/cart.ts PCS_PICKUP_ADDRESS +
// actions/admin/forwarders-field-edits.ts FPCS_DEPOT_ADDRESS). See
// file-header comment for the legacy-verbatim-vs-Pacred-rebrand
// trade-off. Flagged for owner if reversal needed.
// ────────────────────────────────────────────────────────────
const HPCS_PICKUP_ADDRESS = {
  haddressname:        "รับที่โกดัง Pacred",
  haddresslastname:    "",
  haddressno:          ADDRESSES.warehouseTh.line,
  haddresssubdistrict: ADDRESSES.warehouseTh.subDistrict,
  haddressdistrict:    ADDRESSES.warehouseTh.district,
  haddressprovince:    ADDRESSES.warehouseTh.province,
  haddresszipcode:     ADDRESSES.warehouseTh.postcode,
  haddressnote:        "",
  haddresstel:         CONTACT.phoneCompanyDisplay,
  haddresstel2:        "",
} as const;

// ────────────────────────────────────────────────────────────
// Common: hno regex — legacy hno = 'P' + numeric id (cart.ts L375).
// All writers accept the same shape.
// ────────────────────────────────────────────────────────────
const hnoSchema = z.string().trim().regex(/^P\d+$/, "hno ไม่ถูกต้อง (ต้องขึ้นต้นด้วย P ตามด้วยตัวเลข)").max(30);

// RBAC union — same as service-orders-tb.ts (admin staff who manage shop
// orders end-to-end). 'super' covers CEO/ITDT, 'accounting' covers
// payment + rate edits, but NOT 'ops' / 'sales_admin' which lack the
// authority to alter money + courier on a live order.
const HEADER_EDIT_ROLES = ["super", "accounting"] as const;

// ════════════════════════════════════════════════════════════════════════
// 1. adminUpdateOrderShipBy — เปลี่ยนบริษัทขนส่ง
//    Legacy: shops.php L1309-1340 (update_hShipBy)
// ════════════════════════════════════════════════════════════════════════

const updateShipBySchema = z.object({
  h_no:    hnoSchema,
  // 2026-06-29 (owner: shop-order page must match the legacy 47-carrier
  // dropdown) — legacy `optionHShipBy()` offers PCS/PCSF/PCSE + the numeric
  // domestic carriers (2..46). The prior 5-value enum (PCS/PCSF/TTP/JMF/PCSE)
  // dropped the entire numeric carrier set + included TTP/JMF that the shop
  // dropdown never had. Validate against the faithful SHOP_CARRIER_CODES SOT
  // (lib/freight/shipping-methods) — same approach as the forwarder
  // adminUpdateForwarderShipBy (free string, validated). Empty / '3' rejected
  // per legacy L1312.
  ship_by: z
    .string()
    .trim()
    .min(1, "กรุณาเลือกบริษัทขนส่ง")
    .max(10)
    .refine((v) => v !== "3", "รหัสผู้ขนส่งไม่ถูกต้อง (3 สงวนไว้)")
    .refine(isValidShopCarrierCode, "รหัสผู้ขนส่งไม่ถูกต้อง"),
});
export type AdminUpdateOrderShipByInput = z.infer<typeof updateShipBySchema>;

export async function adminUpdateOrderShipBy(
  input: AdminUpdateOrderShipByInput,
): Promise<AdminActionResult<{ h_no: string; ship_by: string; address_overwritten: boolean }>> {
  const parsed = updateShipBySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  return withAdmin<{ h_no: string; ship_by: string; address_overwritten: boolean }>(
    [...HEADER_EDIT_ROLES],
    async ({ adminId }) => {
      const admin = createAdminClient();
      const legacyAdminId = safeLegacyAdminId(await resolveLegacyAdminId(), 10);

      // 1. Verify the order exists + capture before-state for audit log.
      const { data: before, error: readErr } = await admin
        .from("tb_header_order")
        .select("id, hno, hshipby, hstatus")
        .eq("hno", d.h_no)
        .maybeSingle<{
          id: number;
          hno: string;
          hshipby: string | null;
          hstatus: string | null;
        }>();
      if (readErr) {
        console.error(`[adminUpdateOrderShipBy read] failed`, {
          code: readErr.code, message: readErr.message, hno: d.h_no,
        });
        return { ok: false, error: `อ่านออเดอร์ไม่สำเร็จ: ${readErr.message}` };
      }
      if (!before) return { ok: false, error: "ไม่พบออเดอร์ฝากสั่งซื้อ" };

      const beforeShipBy = (before.hshipby ?? "").trim();
      if (beforeShipBy === d.ship_by) {
        return { ok: false, error: "ไม่มีการเปลี่ยนแปลง (ผู้ขนส่งเดิม)" };
      }

      // 2. Build the UPDATE. Legacy L1313 always writes hshipby + adminID.
      const update: Record<string, string | number> = {
        hshipby:       d.ship_by,
        adminidupdate: legacyAdminId,
      };
      // Legacy L1320-1335 — when shipBy='PCS', overwrite the 10 haddress
      // columns with the warehouse-pickup snapshot.
      const addressOverwritten = d.ship_by === "PCS";
      if (addressOverwritten) Object.assign(update, HPCS_PICKUP_ADDRESS);

      const { error: updErr } = await admin
        .from("tb_header_order")
        .update(update)
        .eq("id", before.id);
      if (updErr) {
        console.error(`[adminUpdateOrderShipBy update] failed`, {
          code: updErr.code, message: updErr.message, hno: d.h_no,
        });
        return { ok: false, error: `บันทึกผู้ขนส่งไม่สำเร็จ: ${updErr.message}` };
      }

      // 3. Audit log — mirrors legacy saveHistory($sql, 35).
      await logAdminAction(
        adminId,
        "tb_header_order.update_ship_by",
        "tb_header_order",
        before.hno,
        {
          hno:                  before.hno,
          before:               beforeShipBy,
          after:                d.ship_by,
          address_overwritten:  addressOverwritten,
          legacy_history_code:  35,
        },
      );

      revalidatePath("/admin/service-orders");
      revalidatePath(`/admin/service-orders/${before.hno}`);
      revalidatePath(`/service-order/${before.hno}`);
      return {
        ok:   true,
        data: { h_no: before.hno, ship_by: d.ship_by, address_overwritten: addressOverwritten },
      };
    },
  );
}

// ════════════════════════════════════════════════════════════════════════
// 2. adminUpdateOrderRate — ปรับอัตราแลกเปลี่ยน  ⚠️ MONEY-CRITICAL
//    Legacy: shops.php L1238-1267 (update_hRate)
//
//    Two-statement legacy flow:
//      1. UPDATE hrate, adminIDUpdate WHERE hno=?
//      2. recompute htotalpriceuser = round_up(((htotalpricechn +
//         hshippingchn) * hrate) + hshippingservice, 2) and UPDATE.
//    We do BOTH in this one action (matching legacy semantics; the
//    customer-facing total must move when rate moves — silent drift
//    between hrate and htotalpriceuser is the classic faithful-port bug).
// ════════════════════════════════════════════════════════════════════════

const updateRateSchema = z.object({
  h_no:   hnoSchema,
  // hrate = yuan→THB. Legacy decimal(10,2). Sanity-cap at 20 (real prod
  // values 4.93-5.0). Sub-zero / non-finite rejected — would zero/flip
  // the customer total.
  h_rate: z.coerce.number().positive("อัตราแลกเปลี่ยนต้องเป็นค่าบวก").max(20, "อัตราแลกเปลี่ยนเกินช่วงที่ยอมรับ (>20)"),
});
export type AdminUpdateOrderRateInput = z.infer<typeof updateRateSchema>;

export async function adminUpdateOrderRate(
  input: AdminUpdateOrderRateInput,
): Promise<AdminActionResult<{
  h_no:            string;
  before_rate:     number;
  after_rate:      number;
  before_total:    number;
  after_total:     number;
}>> {
  const parsed = updateRateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  return withAdmin<{
    h_no:         string;
    before_rate:  number;
    after_rate:   number;
    before_total: number;
    after_total:  number;
  }>(
    [...HEADER_EDIT_ROLES],
    async ({ adminId }) => {
      const admin = createAdminClient();
      const legacyAdminId = safeLegacyAdminId(await resolveLegacyAdminId(), 10);

      // 1. Read all columns needed for the recompute. Legacy L1248 re-reads
      //    the row AFTER the hrate UPDATE; we read once before to avoid the
      //    race and have the before-state for the audit log.
      const { data: header, error: readErr } = await admin
        .from("tb_header_order")
        .select(
          "id, hno, userid, hstatus, hrate, htotalpricechn, hshippingchn, hshippingservice, htotalpriceuser",
        )
        .eq("hno", d.h_no)
        .maybeSingle<{
          id:                number;
          hno:               string;
          userid:            string | null;
          hstatus:           string | null;
          hrate:             number | string | null;
          htotalpricechn:    number | string | null;
          hshippingchn:      number | string | null;
          hshippingservice:  number | string | null;
          htotalpriceuser:   number | string | null;
        }>();
      if (readErr) {
        console.error(`[adminUpdateOrderRate read] failed`, {
          code: readErr.code, message: readErr.message, hno: d.h_no,
        });
        return { ok: false, error: `อ่านออเดอร์ไม่สำเร็จ: ${readErr.message}` };
      }
      if (!header) return { ok: false, error: "ไม่พบออเดอร์ฝากสั่งซื้อ" };

      // Guard rate edits on already-paid / cancelled orders — money is set.
      const status = (header.hstatus ?? "").trim();
      if (status === "6") {
        return { ok: false, error: "ออเดอร์ยกเลิกแล้ว — แก้อัตราแลกเปลี่ยนไม่ได้" };
      }
      if (status === "3" || status === "4" || status === "5") {
        return {
          ok: false,
          error: `ออเดอร์ชำระเงินแล้ว (สถานะ ${status}) — แก้อัตราแลกเปลี่ยนไม่ได้ ต้องคืนเงิน + รีออเดอร์`,
        };
      }

      const beforeRate  = Number(header.hrate ?? 0);
      const beforeTotal = Number(header.htotalpriceuser ?? 0);
      const chn         = Number(header.htotalpricechn ?? 0);
      const ship        = Number(header.hshippingchn ?? 0);
      const svc         = Number(header.hshippingservice ?? 0);

      // Sanity — if the cost-side data is junk, refuse rather than write
      // a garbage total. Customer would be charged 0 or NaN otherwise.
      if (![chn, ship, svc].every(Number.isFinite)) {
        return {
          ok: false,
          error: "ข้อมูลต้นทุนของออเดอร์ไม่ครบ — แก้อัตราแลกเปลี่ยนไม่ได้ จนกว่าจะเซ็ตราคาจีน/ค่าขนส่ง",
        };
      }

      // Legacy round_up(x, 2) → roundUp(x, 2) (Math.ceil-based, satang-safe).
      const afterTotalRaw = (chn + ship) * d.h_rate + svc;
      if (!Number.isFinite(afterTotalRaw) || afterTotalRaw <= 0) {
        return { ok: false, error: "คำนวณยอดสุทธิใหม่ไม่ได้ (ผลลัพธ์ไม่ใช่ตัวเลขบวก)" };
      }
      const afterTotal = roundUp(afterTotalRaw, 2);

      // 2. UPDATE — both hrate + htotalpriceuser in one round-trip
      //    (legacy splits this into 2 statements; same end-state).
      const { error: updErr } = await admin
        .from("tb_header_order")
        .update({
          hrate:           d.h_rate,
          htotalpriceuser: afterTotal,
          adminidupdate:   legacyAdminId,
        })
        .eq("id", header.id);
      if (updErr) {
        console.error(`[adminUpdateOrderRate update] failed`, {
          code: updErr.code, message: updErr.message, hno: d.h_no,
        });
        return { ok: false, error: `บันทึกอัตราแลกเปลี่ยนไม่สำเร็จ: ${updErr.message}` };
      }

      // 3. Audit log — mirrors legacy saveHistory($sql, 33). Money-trail.
      await logAdminAction(
        adminId,
        "tb_header_order.update_rate",
        "tb_header_order",
        header.hno,
        {
          hno:                 header.hno,
          userid:              header.userid,
          before_rate:         beforeRate,
          after_rate:          d.h_rate,
          before_total:        beforeTotal,
          after_total:         afterTotal,
          htotalpricechn:      chn,
          hshippingchn:        ship,
          hshippingservice:    svc,
          legacy_history_code: 33,
        },
      );

      revalidatePath("/admin/service-orders");
      revalidatePath(`/admin/service-orders/${header.hno}`);
      revalidatePath(`/service-order/${header.hno}`);
      return {
        ok:   true,
        data: {
          h_no:         header.hno,
          before_rate:  beforeRate,
          after_rate:   d.h_rate,
          before_total: beforeTotal,
          after_total:  afterTotal,
        },
      };
    },
  );
}

// ════════════════════════════════════════════════════════════════════════
// 2b. adminUpdateOrderCost — แก้ต้นทุน (เรทต้นทุน + ราคาซื้อจริง)  ⚠️ COST/MARGIN
//     Legacy: shops.php L1186-1224 (update_cost · available at status 4)
//
//     [[cost-editable-sell-locked]] — COST is editable at ANY status (even
//     after the customer paid) because it only moves margin/accounting. SELL
//     is locked. So this writes ONLY the cost trio:
//        hratecost  (เรทต้นทุน · cost FX)
//        hcostall   (ราคาซื้อจริง · ¥ actually paid)
//        hcostallth = round_up(hcostall × hratecost, 2)  (legacy L1198)
//
//     ⚠️ SELL-LOCKED: unlike legacy update_cost (which re-derives
//     hTotalPriceUser from the existing hRate, L1219-1222), we OMIT that
//     rewrite so the customer-facing SELL total can NEVER move from a cost
//     edit. The sell total is owned by the rate/items editors only. (This is
//     the deliberate, owner-aligned divergence flagged in the audit's open
//     question #3.)
//
//     Role gate: cost authority = accounting / pricing (+ ultra/super via
//     isGodRole) — same set as actions/admin/cargo-cost.ts. NOT ops/warehouse
//     (granting a cost change is an accounting/pricing call). Allowed at every
//     status (incl. paid 3/4/5) per [[cost-editable-sell-locked]]; '6'
//     cancelled is blocked (nothing to cost).
// ════════════════════════════════════════════════════════════════════════

const COST_EDIT_ROLES = ["accounting", "pricing"] as const;

const updateCostSchema = z.object({
  h_no:       hnoSchema,
  // เรทต้นทุน — yuan→THB cost rate. decimal(10,2). Sanity-cap at 20 (real prod
  // ~4.9-5.0). 0 allowed (clears). Non-finite/negative rejected.
  h_rate_cost: z.coerce.number().nonnegative("เรทต้นทุนต้องไม่ติดลบ").max(20, "เรทต้นทุนเกินช่วงที่ยอมรับ (>20)"),
  // ราคาซื้อจริงทั้งหมด (¥). numeric(10,2). 0 allowed.
  h_cost_all:  z.coerce.number().nonnegative("ราคาซื้อจริงต้องไม่ติดลบ").max(99_999_999, "ราคาซื้อจริงเกินช่วงที่ยอมรับ"),
});
export type AdminUpdateOrderCostInput = z.infer<typeof updateCostSchema>;

export async function adminUpdateOrderCost(
  input: AdminUpdateOrderCostInput,
): Promise<AdminActionResult<{
  h_no:          string;
  h_rate_cost:   number;
  h_cost_all:    number;
  h_cost_all_th: number;
}>> {
  const parsed = updateCostSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  return withAdmin<{
    h_no:          string;
    h_rate_cost:   number;
    h_cost_all:    number;
    h_cost_all_th: number;
  }>(
    [...COST_EDIT_ROLES],
    async ({ adminId }) => {
      const admin = createAdminClient();
      const legacyAdminId = safeLegacyAdminId(await resolveLegacyAdminId(), 10);

      const { data: before, error: readErr } = await admin
        .from("tb_header_order")
        .select("id, hno, hstatus, hratecost, hcostall, hcostallth")
        .eq("hno", d.h_no)
        .maybeSingle<{
          id:         number;
          hno:        string;
          hstatus:    string | null;
          hratecost:  number | string | null;
          hcostall:   number | string | null;
          hcostallth: number | string | null;
        }>();
      if (readErr) {
        console.error(`[adminUpdateOrderCost read] failed`, {
          code: readErr.code, message: readErr.message, hno: d.h_no,
        });
        return { ok: false, error: `อ่านออเดอร์ไม่สำเร็จ: ${readErr.message}` };
      }
      if (!before) return { ok: false, error: "ไม่พบออเดอร์ฝากสั่งซื้อ" };

      // COST is editable at any status EXCEPT cancelled (nothing to cost).
      if ((before.hstatus ?? "").trim() === "6") {
        return { ok: false, error: "ออเดอร์ยกเลิกแล้ว — แก้ต้นทุนไม่ได้" };
      }

      // legacy L1198: hCostAllTH = round_up(hCostAll × hRateCost, 2). COST-only —
      // no SELL driver is touched (hRate / htotalpriceuser stay as-is).
      const hCostAllTh = roundUp(d.h_cost_all * d.h_rate_cost, 2);

      const { error: updErr } = await admin
        .from("tb_header_order")
        .update({
          hratecost:     d.h_rate_cost,
          hcostall:      d.h_cost_all,
          hcostallth:    hCostAllTh,
          hdateupdate:   new Date().toISOString(),
          adminidupdate: legacyAdminId,
        })
        .eq("id", before.id);
      if (updErr) {
        console.error(`[adminUpdateOrderCost update] failed`, {
          code: updErr.code, message: updErr.message, hno: d.h_no,
        });
        return { ok: false, error: `บันทึกต้นทุนไม่สำเร็จ: ${updErr.message}` };
      }

      await logAdminAction(
        adminId,
        "tb_header_order.update_cost",
        "tb_header_order",
        before.hno,
        {
          hno:               before.hno,
          before_rate_cost:  Number(before.hratecost ?? 0),
          after_rate_cost:   d.h_rate_cost,
          before_cost_all:   Number(before.hcostall ?? 0),
          after_cost_all:    d.h_cost_all,
          before_cost_allth: Number(before.hcostallth ?? 0),
          after_cost_allth:  hCostAllTh,
          status:            before.hstatus,
          sell_locked:       true,
          legacy_history_ref: "update_cost L1186-1224 (SELL rewrite omitted)",
        },
      );

      revalidatePath("/admin/service-orders");
      revalidatePath(`/admin/service-orders/${before.hno}`);
      revalidatePath(`/admin/service-orders/${before.hno}/edit`);
      return {
        ok: true,
        data: {
          h_no:          before.hno,
          h_rate_cost:   d.h_rate_cost,
          h_cost_all:    d.h_cost_all,
          h_cost_all_th: hCostAllTh,
        },
      };
    },
  );
}

// ════════════════════════════════════════════════════════════════════════
// 3. adminUpdateOrderPayMethod — เปลี่ยนวิธีเก็บเงินค่าขนส่งในไทย
//    Legacy: shops.php L1341-1351 (update_payMethod)
//
//    '1' = ต้นทาง (paid at origin / China · the customer prepays the
//                  domestic-TH carrier when settling the order)
//    '2' = ปลายทาง (paid at destination / Thailand · recipient pays the
//                   courier COD at delivery)
//    Affects forwarder dispatch COD flag downstream; pure flag flip here.
// ════════════════════════════════════════════════════════════════════════

const updatePayMethodSchema = z.object({
  h_no:       hnoSchema,
  pay_method: z.enum(["1", "2"] as const, {
    message: "วิธีชำระต้องเป็น 1=ต้นทาง หรือ 2=ปลายทาง",
  }),
});
export type AdminUpdateOrderPayMethodInput = z.infer<typeof updatePayMethodSchema>;

export async function adminUpdateOrderPayMethod(
  input: AdminUpdateOrderPayMethodInput,
): Promise<AdminActionResult<{ h_no: string; pay_method: "1" | "2" }>> {
  const parsed = updatePayMethodSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  return withAdmin<{ h_no: string; pay_method: "1" | "2" }>(
    [...HEADER_EDIT_ROLES],
    async ({ adminId }) => {
      const admin = createAdminClient();
      const legacyAdminId = safeLegacyAdminId(await resolveLegacyAdminId(), 10);

      const { data: before, error: readErr } = await admin
        .from("tb_header_order")
        .select("id, hno, paymethod, hstatus")
        .eq("hno", d.h_no)
        .maybeSingle<{
          id:        number;
          hno:       string;
          paymethod: string | null;
          hstatus:   string | null;
        }>();
      if (readErr) {
        console.error(`[adminUpdateOrderPayMethod read] failed`, {
          code: readErr.code, message: readErr.message, hno: d.h_no,
        });
        return { ok: false, error: `อ่านออเดอร์ไม่สำเร็จ: ${readErr.message}` };
      }
      if (!before) return { ok: false, error: "ไม่พบออเดอร์ฝากสั่งซื้อ" };

      const beforePay = (before.paymethod ?? "").trim();
      if (beforePay === d.pay_method) {
        return { ok: false, error: "ไม่มีการเปลี่ยนแปลง (วิธีชำระเดิม)" };
      }

      const { error: updErr } = await admin
        .from("tb_header_order")
        .update({
          paymethod:     d.pay_method,
          adminidupdate: legacyAdminId,
        })
        .eq("id", before.id);
      if (updErr) {
        console.error(`[adminUpdateOrderPayMethod update] failed`, {
          code: updErr.code, message: updErr.message, hno: d.h_no,
        });
        return { ok: false, error: `บันทึกวิธีชำระไม่สำเร็จ: ${updErr.message}` };
      }

      // Audit log — legacy doesn't saveHistory here; Pacred upgrades with
      // a trail (covers downstream forwarder COD-flag disputes).
      await logAdminAction(
        adminId,
        "tb_header_order.update_pay_method",
        "tb_header_order",
        before.hno,
        {
          hno:    before.hno,
          before: beforePay,
          after:  d.pay_method,
        },
      );

      revalidatePath("/admin/service-orders");
      revalidatePath(`/admin/service-orders/${before.hno}`);
      revalidatePath(`/service-order/${before.hno}`);
      return { ok: true, data: { h_no: before.hno, pay_method: d.pay_method } };
    },
  );
}

// ════════════════════════════════════════════════════════════════════════
// 4. adminUpdateOrderCrate — ตั้งค่าตีลังไม้
//    Legacy: shops.php L1352-1362 (update_crate)
//
//    '1' = ตีลังไม้ (wooden crate · adds packaging surcharge downstream)
//    '2' = ไม่ตีลังไม้
//    Pure flag flip; surcharge math lives at forwarder dispatch (not
//    this writer's scope).
// ════════════════════════════════════════════════════════════════════════

// 2026-06-29 (fix #3) — schema now also accepts an optional crate PRICE
// (ราคาค่าตีลังไม้ → tb_header_order.pricecrate · mig 0223). pricecrate is a
// COST/charge field carried to tb_forwarder.pricecrate on spawn — it is NOT
// part of the ฝากสั่งซื้อ SELL total (htotalpriceuser), so writing it never
// moves the customer's charge. Optional → existing crate-only callers are
// unaffected. No status gate (legacy update_crate had none) — crate +
// crate-price are editable at any status.
const updateCrateSchema = z.object({
  h_no:  hnoSchema,
  crate: z.enum(["1", "2"] as const, {
    message: "ค่าตีลังต้องเป็น 1=ตีลังไม้ หรือ 2=ไม่ตีลังไม้",
  }),
  pricecrate: z.coerce.number().nonnegative("ราคาค่าตีลังไม้ต้องไม่ติดลบ").max(99_999_999).optional(),
});
export type AdminUpdateOrderCrateInput = z.infer<typeof updateCrateSchema>;

export async function adminUpdateOrderCrate(
  input: AdminUpdateOrderCrateInput,
): Promise<AdminActionResult<{ h_no: string; crate: "1" | "2"; pricecrate: number | null }>> {
  const parsed = updateCrateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  return withAdmin<{ h_no: string; crate: "1" | "2"; pricecrate: number | null }>(
    [...HEADER_EDIT_ROLES],
    async ({ adminId }) => {
      const admin = createAdminClient();
      const legacyAdminId = safeLegacyAdminId(await resolveLegacyAdminId(), 10);

      const { data: before, error: readErr } = await admin
        .from("tb_header_order")
        .select("id, hno, crate, pricecrate, hstatus")
        .eq("hno", d.h_no)
        .maybeSingle<{
          id:         number;
          hno:        string;
          crate:      string | null;
          pricecrate: number | string | null;
          hstatus:    string | null;
        }>();
      if (readErr) {
        console.error(`[adminUpdateOrderCrate read] failed`, {
          code: readErr.code, message: readErr.message, hno: d.h_no,
        });
        return { ok: false, error: `อ่านออเดอร์ไม่สำเร็จ: ${readErr.message}` };
      }
      if (!before) return { ok: false, error: "ไม่พบออเดอร์ฝากสั่งซื้อ" };

      const beforeCrate = (before.crate ?? "").trim();
      const beforePrice = Number(before.pricecrate ?? 0);
      const crateUnchanged = beforeCrate === d.crate;
      const priceUnchanged =
        d.pricecrate === undefined || Math.abs(beforePrice - d.pricecrate) < 0.005;
      if (crateUnchanged && priceUnchanged) {
        return { ok: false, error: "ไม่มีการเปลี่ยนแปลง (ค่าตีลัง/ราคาเดิม)" };
      }

      const update: Record<string, unknown> = {
        crate:         d.crate,
        adminidupdate: legacyAdminId,
      };
      // Only write the price when the caller supplied it (keeps crate-only
      // callers from zeroing an existing price).
      if (d.pricecrate !== undefined) update.pricecrate = d.pricecrate;

      const { error: updErr } = await admin
        .from("tb_header_order")
        .update(update)
        .eq("id", before.id);
      if (updErr) {
        console.error(`[adminUpdateOrderCrate update] failed`, {
          code: updErr.code, message: updErr.message, hno: d.h_no,
        });
        return { ok: false, error: `บันทึกค่าตีลังไม่สำเร็จ: ${updErr.message}` };
      }

      // Audit log — legacy doesn't saveHistory here; Pacred upgrades.
      await logAdminAction(
        adminId,
        "tb_header_order.update_crate",
        "tb_header_order",
        before.hno,
        {
          hno:              before.hno,
          before:           beforeCrate,
          after:            d.crate,
          before_pricecrate: beforePrice,
          after_pricecrate:  d.pricecrate ?? beforePrice,
        },
      );

      revalidatePath("/admin/service-orders");
      revalidatePath(`/admin/service-orders/${before.hno}`);
      revalidatePath(`/service-order/${before.hno}`);
      return {
        ok: true,
        data: {
          h_no: before.hno,
          crate: d.crate,
          pricecrate: d.pricecrate ?? beforePrice,
        },
      };
    },
  );
}
