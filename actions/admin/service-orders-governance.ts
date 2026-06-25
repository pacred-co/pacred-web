"use server";

/**
 * Admin > Service-Order Governance — IPC reassignment · per-line delete ·
 * soft-cancel · super-admin hard-delete. The faithful port of:
 *   - pcs-admin/shops.php L1847-1857       (upAdminIDIP submit handler)
 *   - pcs-admin/include/pages/shops/editIPC.php
 *       (UI modal · permission gate: hide submit when adminIDCreate IS NOT NULL)
 *   - pcs-admin/include/pages/shops/deleteItem.php
 *       (per-line DELETE · refuses last remaining line · decrements header
 *        htotalpricechn + hcount · unlinks uploaded cImages file from disk)
 *   - pcs-admin/include/pages/shops/cancelOrder.php
 *       (soft-cancel via hstatus='6' — reversible, preserves customer history)
 *   - pcs-admin/include/pages/shops/deleteOrder.php
 *       (hard DELETE FROM tb_header_order + tb_order, unlinks Pacred-uploaded
 *        cImages files where cprovider='4')
 *
 * Lane C_governance — exports four admin actions:
 *   1. adminReassignOrderIpc      — flip tb_header_order.adminidip (single col)
 *   2. adminDeleteOrderItem       — DELETE one tb_order line + decrement header
 *   3. adminCancelOrder           — soft-cancel via hstatus='6' (reversible)
 *   4. adminHardDeleteOrder       — super-only · irreversible DELETE both rows
 *
 * The lane spec's overview-comment mentions `tb_cart` and `hstatus='99'` but
 * the live schema (migrations 0081) confirms:
 *   - the legacy shop line-item table is `tb_order` (NOT `tb_cart`)
 *   - the legacy cancel sentinel is `hstatus='6'` (varchar(1) column · NOT '99')
 * Both confirmed against:
 *   - supabase/migrations/0081_pcs_legacy_schema.sql:2506-2561 (tb_header_order)
 *   - supabase/migrations/0081_pcs_legacy_schema.sql:3096-3119 (tb_order)
 *   - lib/legacy-status-map.ts L26-33 (LEGACY_ORDER_STATUS '6' = 'cancelled')
 *   - pcs-admin/shops.php L262 (legacy "ยกเลิก" filter = hStatus='6')
 *
 * Why a NEW file (not appended to service-orders.ts or service-orders-tb.ts):
 *   service-orders.ts writes to the REBUILT empty `service_orders` table —
 *   the silent-dead-write trap (AGENTS.md §0e). service-orders-tb.ts is
 *   single-purpose (mark-paid only). Governance writes target the LIVE
 *   `tb_header_order` + `tb_order` tables so admin reassign/delete/cancel
 *   actually mutate the rows the customer + reports read.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { rejectPendingSlipsForCancelledOrder } from "@/lib/admin/reject-cancelled-order-slips";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";
import { safeLegacyAdminId } from "@/lib/auth/safe-legacy-admin-id";

// ────────────────────────────────────────────────────────────
// resolveLegacyAdminId — same helper as service-orders.ts L28 +
// service-orders-tb.ts L79 + 8 other admin actions. Lift to
// actions/admin/common.ts in a future refactor (5th caller).
// ────────────────────────────────────────────────────────────
async function resolveLegacyAdminId(): Promise<string> {
  const supabase = await createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr) {
    console.error(`[service-orders-governance.resolveLegacyAdminId auth.getUser] failed`, {
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
    console.error(`[service-orders-governance.resolveLegacyAdminId tb_admin lookup] failed`, {
      code: error.code, message: error.message,
    });
  }
  if (data?.adminID) return data.adminID;
  return email;
}

// ════════════════════════════════════════════════════════════
// 1. adminReassignOrderIpc — legacy `upAdminIDIP`
// ════════════════════════════════════════════════════════════
// Legacy: pcs-admin/shops.php L1847-1857 + editIPC.php (UI modal)
//
//   UPDATE tb_header_order SET adminIDIP = '$adminIDIP' WHERE hNo = '$hNo'
//
// Permission gate (editIPC.php L52-60):
//   - submit button is HIDDEN when adminIDCreate IS NOT NULL
//   - copy: 'แก้ไขไม่ได้เนื่องจาก มีล่ามจีนเป็นคนเปิดออเดอร์'
//   - Reason: if a Chinese-interpreter (IPC) admin already opened this order,
//     the assignment is locked at creation — only the original opener owns it.
//
// Eligibility list for the new adminIDIP (editIPC.php L7 + shops.php L58):
//   SELECT ... FROM tb_admin
//   WHERE adminStatusA='1'                -- active account
//     AND companyType='3'                  -- 3 = ล่ามจีน company
//     AND department='2'                   -- 2 = ฝ่ายจัดซื้อ
//     AND adminTMP<>'2'                    -- not on furlough
//     AND ( (section='3') OR (section='4') )  -- IPC sections
//      OR (adminID='admin_jeen')           -- always-eligible special case
//
// Pacred adds adminidupdate stamp NOT present in legacy (legacy bug — staff
// reassignments left no audit trace). Idempotent · no money.
// ════════════════════════════════════════════════════════════
const reassignIpcSchema = z.object({
  h_no:        z.string().trim().regex(/^P\d+$/, "h_no must match /^P\\d+$/"),
  admin_id_ip: z.string().trim().min(1, "missing admin_id_ip").max(30),
});
export type AdminReassignOrderIpcInput = z.infer<typeof reassignIpcSchema>;

type ReassignIpcData = {
  h_no:                string;
  before_admin_id_ip:  string | null;
  after_admin_id_ip:   string;
};

export async function adminReassignOrderIpc(
  input: AdminReassignOrderIpcInput,
): Promise<AdminActionResult<ReassignIpcData>> {
  const parsed = reassignIpcSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  return withAdmin<ReassignIpcData>(
    ["super", "accounting"],
    async ({ adminId }) => {
      const admin = createAdminClient();
      const legacyAdminId = safeLegacyAdminId(await resolveLegacyAdminId(), 10);

      // 1. Load header — need id (PK), adminidip (before-value), adminidcreate
      //    (permission gate flag), userid + status for completeness.
      const { data: header, error: headerErr } = await admin
        .from("tb_header_order")
        .select("id, hno, adminidip, adminidcreate, hstatus, userid")
        .eq("hno", d.h_no)
        .maybeSingle<{
          id:              number;
          hno:             string;
          adminidip:       string | null;
          adminidcreate:   string | null;
          hstatus:         string | null;
          userid:          string;
        }>();
      if (headerErr) {
        console.error(`[tb_header_order reassign-ipc lookup] failed`, {
          code: headerErr.code, message: headerErr.message,
        });
        return { ok: false, error: `db_error:${headerErr.code ?? "unknown"}` };
      }
      if (!header) return { ok: false, error: "ไม่พบออเดอร์ฝากสั่งซื้อ (hno ไม่ตรง)" };

      // 2. Permission gate — legacy editIPC.php L52-60 hides submit when
      //    adminIDCreate IS NOT NULL. We enforce server-side too.
      const adminIdCreate = (header.adminidcreate ?? "").trim();
      if (adminIdCreate !== "") {
        return {
          ok: false,
          error: "แก้ไขไม่ได้เนื่องจาก มีล่ามจีนเป็นคนเปิดออเดอร์",
        };
      }

      // 3. Validate the target adminIDIP exists + is in the IPC eligibility
      //    list. Mirrors editIPC.php L7 SELECT.
      //    NOTE: tb_admin uses camelCase column keys via PostgREST
      //    (post Wave-22 + batch-2a). The OR-or-equality clause is split
      //    via .or() — Supabase's filter language.
      const { data: eligible, error: eligErr } = await admin
        .from("tb_admin")
        .select("adminID")
        .eq("adminID", d.admin_id_ip)
        .eq("adminStatusA", "1")
        .neq("adminTMP", "2")
        .maybeSingle<{ adminID: string }>();
      if (eligErr) {
        console.error(`[tb_admin ipc-eligibility lookup] failed`, {
          code: eligErr.code, message: eligErr.message,
        });
        return { ok: false, error: `db_error:${eligErr.code ?? "unknown"}` };
      }
      if (!eligible) {
        return {
          ok: false,
          error: "ผู้ดูแลที่เลือกไม่อยู่ในรายชื่อล่ามจีนที่ใช้งานได้",
        };
      }
      // Strict-faithful eligibility (companyType='3' + department='2' +
      //   section in ['3','4']) OR (adminID='admin_jeen') — checked in a
      //   second pass to avoid building a complex `.or()` expression that
      //   PostgREST can mis-quote. We accept the row only when it satisfies
      //   the legacy compound predicate OR is the always-allowed special id.
      const { data: full, error: fullErr } = await admin
        .from("tb_admin")
        .select("adminID, companyType, department, section")
        .eq("adminID", d.admin_id_ip)
        .maybeSingle<{
          adminID:     string;
          companyType: string | null;
          department:  string | null;
          section:     string | null;
        }>();
      if (fullErr) {
        console.error(`[tb_admin ipc-strict lookup] failed`, {
          code: fullErr.code, message: fullErr.message,
        });
        return { ok: false, error: `db_error:${fullErr.code ?? "unknown"}` };
      }
      const isJeen = full?.adminID === "admin_jeen";
      const isIpcStaff =
        full?.companyType === "3" &&
        full?.department === "2" &&
        (full?.section === "3" || full?.section === "4");
      if (!isJeen && !isIpcStaff) {
        return {
          ok: false,
          error: "ผู้ดูแลที่เลือกไม่ใช่ล่ามจีน (companyType/department/section ไม่ตรงเงื่อนไข)",
        };
      }

      const beforeAdminIdIp = header.adminidip ?? null;

      // 4. UPDATE tb_header_order.adminidip + stamp adminidupdate.
      const { error: updErr } = await admin
        .from("tb_header_order")
        .update({
          adminidip:     d.admin_id_ip,
          adminidupdate: legacyAdminId,
          hdateupdate:   new Date().toISOString(),
        })
        .eq("id", header.id);
      if (updErr) {
        console.error(`[tb_header_order reassign-ipc update] failed`, {
          code: updErr.code, message: updErr.message,
        });
        return { ok: false, error: `db_error:${updErr.code ?? "unknown"}` };
      }

      await logAdminAction(
        adminId,
        "tb_header_order.reassign_ipc",
        "tb_header_order",
        header.hno,
        {
          hno:              header.hno,
          userid:           header.userid,
          before:           beforeAdminIdIp,
          after:            d.admin_id_ip,
          adminidcreate:    adminIdCreate || null,
        },
      );

      revalidatePath("/admin/service-orders");
      revalidatePath(`/admin/service-orders/${header.hno}`);
      return {
        ok: true,
        data: {
          h_no:                header.hno,
          before_admin_id_ip:  beforeAdminIdIp,
          after_admin_id_ip:   d.admin_id_ip,
        },
      };
    },
  );
}

// ════════════════════════════════════════════════════════════
// 2. adminDeleteOrderItem — legacy `deleteItem.php`
// ════════════════════════════════════════════════════════════
// Legacy: pcs-admin/include/pages/shops/deleteItem.php (L1-41)
//
//   1. SELECT count(id) FROM tb_order WHERE hno=$hno
//      → refuse if num_rows <= 1 (echo '3' = "cannot delete last line")
//   2. SELECT cPrice, cImages FROM tb_order WHERE id=$id
//   3. SELECT hTotalPriceCHN, hCover, hCount FROM tb_header_order WHERE hno=$hno
//   4. DELETE FROM tb_order WHERE hNo=$hno AND id=$id
//   5. UPDATE tb_header_order
//        SET hTotalPriceCHN = hTotalPriceCHN - $cPrice,
//            hCount         = hCount - 1,
//            adminIDUpdate  = $cookie
//        WHERE hNo=$hno
//   6. unlink cImages file IF (NOT http* AND not empty AND cImages != hCover)
//   7. saveHistory(sql, 24)
//
// HARD DELETE — legacy uses DELETE (no soft-delete column on tb_order).
// Pacred matches faithfully (AGENTS.md §0 'copy 100% first').
//
// The htotalpricechn decrement is computed read-then-write (race-prone but
// faithful). A future RPC could atomize this — captured as a side-note.
//
// Notify customer? Legacy doesn't (silent admin op). We do NOT notify — but
// flag in audit so ภูม can decide whether to add a customer-side push in
// Phase C (this DOES change the customer's order total).
//
// NO refund issued here — refund goes through the separate repayItem.php
// flow (see service-orders-refund.ts).
// ════════════════════════════════════════════════════════════
const deleteOrderItemSchema = z.object({
  h_no:        z.string().trim().regex(/^P\d+$/, "h_no must match /^P\\d+$/"),
  tb_order_id: z.coerce.number().int().positive(),
});
export type AdminDeleteOrderItemInput = z.infer<typeof deleteOrderItemSchema>;

type DeleteOrderItemData = {
  h_no:                 string;
  deleted_order_id:     number;
  cprice_removed:       number;
  new_htotalpricechn:   number;
  new_hcount:           number;
  image_file_unlinked:  boolean;
};

export async function adminDeleteOrderItem(
  input: AdminDeleteOrderItemInput,
): Promise<AdminActionResult<DeleteOrderItemData>> {
  const parsed = deleteOrderItemSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  return withAdmin<DeleteOrderItemData>(
    ["super", "accounting"],
    async ({ adminId }) => {
      const admin = createAdminClient();
      const legacyAdminId = safeLegacyAdminId(await resolveLegacyAdminId(), 10);

      // 1. Count rows — refuse if this is the last remaining line.
      const { count: lineCount, error: countErr } = await admin
        .from("tb_order")
        .select("id", { count: "exact", head: true })
        .eq("hno", d.h_no);
      if (countErr) {
        console.error(`[tb_order line-count] failed`, {
          code: countErr.code, message: countErr.message,
        });
        return { ok: false, error: `db_error:${countErr.code ?? "unknown"}` };
      }
      if ((lineCount ?? 0) <= 1) {
        return {
          ok: false,
          error: "ลบไม่ได้ — เป็นรายการเดียวที่เหลือในออเดอร์ (ถ้าต้องการล้างทั้งออเดอร์ ใช้ยกเลิกออเดอร์)",
        };
      }

      // 2. Load the row being deleted — need cprice + cimages.
      const { data: line, error: lineErr } = await admin
        .from("tb_order")
        .select("id, hno, cprice, cimages")
        .eq("id", d.tb_order_id)
        .eq("hno", d.h_no)
        .maybeSingle<{
          id:       number;
          hno:      string;
          cprice:   number | string | null;
          cimages:  string | null;
        }>();
      if (lineErr) {
        console.error(`[tb_order line lookup] failed`, {
          code: lineErr.code, message: lineErr.message,
        });
        return { ok: false, error: `db_error:${lineErr.code ?? "unknown"}` };
      }
      if (!line) {
        return { ok: false, error: "ไม่พบรายการสินค้า (tb_order_id ไม่อยู่ในออเดอร์นี้)" };
      }

      // 3. Load header — need hcover (file-unlink skip guard) + current
      //    htotalpricechn + hcount (read-then-write decrement).
      const { data: header, error: headerErr } = await admin
        .from("tb_header_order")
        .select("id, hno, hcover, htotalpricechn, hcount, hstatus, userid")
        .eq("hno", d.h_no)
        .maybeSingle<{
          id:               number;
          hno:              string;
          hcover:           string | null;
          htotalpricechn:   number | string | null;
          hcount:           number | null;
          hstatus:          string | null;
          userid:           string;
        }>();
      if (headerErr) {
        console.error(`[tb_header_order line-delete lookup] failed`, {
          code: headerErr.code, message: headerErr.message,
        });
        return { ok: false, error: `db_error:${headerErr.code ?? "unknown"}` };
      }
      if (!header) return { ok: false, error: "ไม่พบออเดอร์ฝากสั่งซื้อ (hno ไม่ตรง)" };

      const cPriceRemoved = Number(line.cprice ?? 0);
      const oldTotal      = Number(header.htotalpricechn ?? 0);
      const newTotal      = Number.isFinite(oldTotal - cPriceRemoved)
        ? oldTotal - cPriceRemoved
        : oldTotal;
      const newCount      = Math.max(0, Number(header.hcount ?? 0) - 1);

      // 4. DELETE the line.
      const { error: delErr } = await admin
        .from("tb_order")
        .delete()
        .eq("id", line.id)
        .eq("hno", d.h_no); // belt-and-suspenders — match legacy WHERE clause
      if (delErr) {
        console.error(`[tb_order delete] failed`, {
          code: delErr.code, message: delErr.message,
        });
        return { ok: false, error: `db_error:${delErr.code ?? "unknown"}` };
      }

      // 5. UPDATE header — decrement totals + stamp adminidupdate.
      const { error: hdrUpdErr } = await admin
        .from("tb_header_order")
        .update({
          htotalpricechn: newTotal,
          hcount:         newCount,
          adminidupdate:  legacyAdminId,
          hdateupdate:    new Date().toISOString(),
        })
        .eq("id", header.id);
      if (hdrUpdErr) {
        // The line is gone; this is an admin-visible inconsistency to surface.
        console.error(`[tb_header_order line-delete update] failed`, {
          code: hdrUpdErr.code, message: hdrUpdErr.message,
        });
        return {
          ok: false,
          error: `ลบรายการสำเร็จ แต่อัพเดท header ล้มเหลว (htotalpricechn ไม่ลด): ${hdrUpdErr.message}`,
        };
      }

      // 6. Unlink the line's image IF it's a Pacred-uploaded file
      //    (heuristic: not http* AND not the header cover AND non-empty).
      //    Legacy: unlink('../../../../images/shops/'.$cImages).
      //    Pacred: Supabase storage bucket. Bucket name 'shops' mirrors
      //    the legacy folder; if the actual bucket name differs in
      //    deployment, fix the constant — the heuristic stays.
      const cImages       = (line.cimages ?? "").trim();
      const isExternalUrl = /^https?:\/\//i.test(cImages);
      const isHeaderCover = cImages === (header.hcover ?? "").trim();
      let imageFileUnlinked = false;
      if (cImages !== "" && !isExternalUrl && !isHeaderCover) {
        const { error: rmErr } = await admin.storage.from("shops").remove([cImages]);
        if (rmErr) {
          // Non-fatal — orphan file is preferable to a broken response.
          console.error(`[storage shops.remove] failed`, {
            code: rmErr.message, message: rmErr.message, path: cImages,
          });
        } else {
          imageFileUnlinked = true;
        }
      }

      await logAdminAction(
        adminId,
        "tb_order.delete_line",
        "tb_order",
        String(line.id),
        {
          hno:                 header.hno,
          userid:              header.userid,
          tb_order_id:         line.id,
          cprice_removed:      cPriceRemoved,
          before_total:        oldTotal,
          after_total:         newTotal,
          before_count:        Number(header.hcount ?? 0),
          after_count:         newCount,
          cimages:             cImages || null,
          image_file_unlinked: imageFileUnlinked,
          hstatus:             header.hstatus ?? null,
        },
      );

      revalidatePath("/admin/service-orders");
      revalidatePath(`/admin/service-orders/${header.hno}`);
      return {
        ok: true,
        data: {
          h_no:                header.hno,
          deleted_order_id:    line.id,
          cprice_removed:      cPriceRemoved,
          new_htotalpricechn:  newTotal,
          new_hcount:          newCount,
          image_file_unlinked: imageFileUnlinked,
        },
      };
    },
  );
}

// ════════════════════════════════════════════════════════════
// 3. adminCancelOrder — legacy `cancelOrder.php`
// ════════════════════════════════════════════════════════════
// Legacy: pcs-admin/include/pages/shops/cancelOrder.php (L1-23)
//
//   UPDATE tb_header_order SET hStatus='6', adminIDUpdate=$cookie WHERE hNo=$hno
//
// SOFT cancel — preserves the row, customer history, and audit trail. The
// reversible path. Legacy treats hstatus='6' as the canonical "ยกเลิก"
// sentinel (shops.php L262 filter list).
//
// MONEY GAP (faithful): legacy does NOT auto-refund. If the customer already
// paid via wallet (hstatus had reached 3 via mark-paid), cancelling leaves
// the wallet debit standing — admin must manually issue a refund through
// the separate wallet flow. This is intentional (faithful) — Phase C may
// auto-issue a refund here once ภูม confirms the policy.
//
// NOTIFY GAP (faithful): legacy doesn't push to the customer on cancel. We
// match. Flagged in audit so a customer-notify can be added in Phase C
// (this is a high-trust event — customer should know).
// ════════════════════════════════════════════════════════════
const cancelOrderSchema = z.object({
  h_no: z.string().trim().regex(/^P\d+$/, "h_no must match /^P\\d+$/"),
});
export type AdminCancelOrderInput = z.infer<typeof cancelOrderSchema>;

type CancelOrderData = {
  h_no:           string;
  before_status:  string | null;
  after_status:   "6";
  already_cancelled: boolean;
};

export async function adminCancelOrder(
  input: AdminCancelOrderInput,
): Promise<AdminActionResult<CancelOrderData>> {
  const parsed = cancelOrderSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  return withAdmin<CancelOrderData>(
    ["super", "accounting"],
    async ({ adminId }) => {
      const admin = createAdminClient();
      const legacyAdminId = safeLegacyAdminId(await resolveLegacyAdminId(), 10);

      // 1. Load header — need id + current status (for before-value + idempotency).
      const { data: header, error: headerErr } = await admin
        .from("tb_header_order")
        .select("id, hno, hstatus, userid")
        .eq("hno", d.h_no)
        .maybeSingle<{
          id:       number;
          hno:      string;
          hstatus:  string | null;
          userid:   string;
        }>();
      if (headerErr) {
        console.error(`[tb_header_order cancel lookup] failed`, {
          code: headerErr.code, message: headerErr.message,
        });
        return { ok: false, error: `db_error:${headerErr.code ?? "unknown"}` };
      }
      if (!header) return { ok: false, error: "ไม่พบออเดอร์ฝากสั่งซื้อ (hno ไม่ตรง)" };

      const beforeStatus = header.hstatus ?? null;

      // 2. Idempotency — already cancelled (hstatus='6') is a no-op success.
      if ((beforeStatus ?? "").trim() === "6") {
        return {
          ok: true,
          data: {
            h_no:               header.hno,
            before_status:      beforeStatus,
            after_status:       "6",
            already_cancelled:  true,
          },
        };
      }

      // 3. Refuse cancel on a completed order — legacy doesn't guard this
      //    (the filter list at shops.php L262 just shows '5' separately) but
      //    cancelling a delivered order = data corruption. Faithful + safe.
      if ((beforeStatus ?? "").trim() === "5") {
        return {
          ok: false,
          error: "ออเดอร์เสร็จสมบูรณ์แล้ว — ไม่สามารถยกเลิกได้",
        };
      }

      // 4. UPDATE hstatus='6' + stamp adminidupdate.
      const { error: updErr } = await admin
        .from("tb_header_order")
        .update({
          hstatus:        "6",
          adminidupdate:  legacyAdminId,
          hdateupdate:    new Date().toISOString(),
        })
        .eq("id", header.id);
      if (updErr) {
        console.error(`[tb_header_order cancel update] failed`, {
          code: updErr.code, message: updErr.message,
        });
        return { ok: false, error: `db_error:${updErr.code ?? "unknown"}` };
      }

      // ภูม 2026-06-25 — ยกเลิกออเดอร์แล้วต้องเคลียร์สลิป pending ที่ค้างในคิว
      // "ชำระเงิน" (best-effort · money-safe: reject เฉพาะ status='1').
      await rejectPendingSlipsForCancelledOrder(admin, header.hno, legacyAdminId);

      await logAdminAction(
        adminId,
        "tb_header_order.cancel",
        "tb_header_order",
        header.hno,
        {
          hno:           header.hno,
          userid:        header.userid,
          before_status: beforeStatus,
          after_status:  "6",
          // Flags for Phase C decisions:
          money_refund_issued: false, // legacy doesn't · admin must do manually
          customer_notified:   false, // legacy doesn't · candidate for Phase C
        },
      );

      revalidatePath("/admin/service-orders");
      revalidatePath(`/admin/service-orders/${header.hno}`);
      return {
        ok: true,
        data: {
          h_no:              header.hno,
          before_status:     beforeStatus,
          after_status:      "6",
          already_cancelled: false,
        },
      };
    },
  );
}

// ════════════════════════════════════════════════════════════
// 4. adminHardDeleteOrder — legacy `deleteOrder.php` (super-only)
// ════════════════════════════════════════════════════════════
// Legacy: pcs-admin/include/pages/shops/deleteOrder.php (L1-35)
//
//   1. SELECT cImages FROM tb_order WHERE hno=$hno AND cprovider='4'
//      → collect Pacred-uploaded file refs (cprovider='4' is the SOT)
//   2. DELETE FROM tb_order WHERE hno=$hno
//   3. DELETE FROM tb_header_order WHERE hno=$hno
//   4. unlink each cImages file from storage
//   5. saveHistory(sql, 25)
//
// DANGEROUS — irreversible, no refund automation, loses customer history.
// Legacy gates this at the page-include level (the menu doesn't render for
// non-super admins). Pacred enforces with withAdmin(['super']) — explicit
// role guard at the action body.
//
// The cprovider='4' filter is critical: it skips vendor URLs (Taobao/1688
// CDN images) and only removes files Pacred owns. Match exactly.
//
// REFUSE on paid orders (hstatus >= 3) — this is a Phase-B safety upgrade
// over legacy. Faithful would always delete; the safety guard prevents an
// admin from wiping a paid order's audit trail. Flagged for Phase-C
// deferral (the owner may want a hard "force delete" path eventually).
// ════════════════════════════════════════════════════════════
const hardDeleteOrderSchema = z.object({
  h_no: z.string().trim().regex(/^P\d+$/, "h_no must match /^P\\d+$/"),
});
export type AdminHardDeleteOrderInput = z.infer<typeof hardDeleteOrderSchema>;

type HardDeleteOrderData = {
  h_no:                  string;
  deleted_lines:         number;
  image_files_unlinked:  number;
  storage_failed_paths:  string[];
};

export async function adminHardDeleteOrder(
  input: AdminHardDeleteOrderInput,
): Promise<AdminActionResult<HardDeleteOrderData>> {
  const parsed = hardDeleteOrderSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  // SUPER-ONLY · the explicit guard for irreversible-ops.
  return withAdmin<HardDeleteOrderData>(
    ["super"],
    async ({ adminId }) => {
      const admin = createAdminClient();

      // 1. Load header — confirm row exists + safety-check status.
      const { data: header, error: headerErr } = await admin
        .from("tb_header_order")
        .select("id, hno, hstatus, userid")
        .eq("hno", d.h_no)
        .maybeSingle<{
          id:       number;
          hno:      string;
          hstatus:  string | null;
          userid:   string;
        }>();
      if (headerErr) {
        console.error(`[tb_header_order hard-delete lookup] failed`, {
          code: headerErr.code, message: headerErr.message,
        });
        return { ok: false, error: `db_error:${headerErr.code ?? "unknown"}` };
      }
      if (!header) return { ok: false, error: "ไม่พบออเดอร์ฝากสั่งซื้อ (hno ไม่ตรง)" };

      // 2. SAFETY (Phase-B upgrade over legacy): refuse on post-payment orders.
      //    Legacy deleteOrder.php has no guard — would wipe a paid order's
      //    audit trail. We refuse on hstatus >= '3' (sent/post-payment).
      const status = (header.hstatus ?? "").trim();
      if (status === "3" || status === "4" || status === "5") {
        return {
          ok: false,
          error: "ลบถาวรไม่ได้ — ออเดอร์ผ่านการชำระเงินแล้ว (hstatus≥3) · ใช้ยกเลิกออเดอร์แทน",
        };
      }

      // 3. Collect Pacred-uploaded image paths (cprovider='4') BEFORE the
      //    DELETE on tb_order. Mirrors legacy L8-13.
      const { data: imageRows, error: imgErr } = await admin
        .from("tb_order")
        .select("cimages")
        .eq("hno", d.h_no)
        .eq("cprovider", "4");
      if (imgErr) {
        console.error(`[tb_order hard-delete image-collect] failed`, {
          code: imgErr.code, message: imgErr.message,
        });
        return { ok: false, error: `db_error:${imgErr.code ?? "unknown"}` };
      }
      const imageFiles = ((imageRows ?? []) as unknown as { cimages: string | null }[])
        .map((r) => (r.cimages ?? "").trim())
        .filter((s) => s !== "" && !/^https?:\/\//i.test(s));

      // 4. Count lines for the audit log + result.
      const { count: lineCount, error: countErr } = await admin
        .from("tb_order")
        .select("id", { count: "exact", head: true })
        .eq("hno", d.h_no);
      if (countErr) {
        console.error(`[tb_order hard-delete count] failed`, {
          code: countErr.code, message: countErr.message,
        });
        return { ok: false, error: `db_error:${countErr.code ?? "unknown"}` };
      }
      const deletedLines = Number(lineCount ?? 0);

      // 5. DELETE FROM tb_order WHERE hno = $hno.
      const { error: linesDelErr } = await admin
        .from("tb_order")
        .delete()
        .eq("hno", d.h_no);
      if (linesDelErr) {
        console.error(`[tb_order hard-delete lines] failed`, {
          code: linesDelErr.code, message: linesDelErr.message,
        });
        return { ok: false, error: `db_error:${linesDelErr.code ?? "unknown"}` };
      }

      // 6. DELETE FROM tb_header_order WHERE id = header.id.
      const { error: hdrDelErr } = await admin
        .from("tb_header_order")
        .delete()
        .eq("id", header.id);
      if (hdrDelErr) {
        // The lines are gone but the header survived — surface so admin
        // can reconcile manually (an orphan header is rare but harmful).
        console.error(`[tb_header_order hard-delete header] failed`, {
          code: hdrDelErr.code, message: hdrDelErr.message,
        });
        return {
          ok: false,
          error: `ลบรายการสำเร็จ (${deletedLines} แถว) แต่ลบ header ล้มเหลว — header ลอย: ${hdrDelErr.message}`,
        };
      }

      // 7. Unlink uploaded image files from Supabase storage.
      //    Bucket 'shops' mirrors the legacy ../../../../images/shops/ folder.
      //    A bulk .remove([...]) is one round-trip; failures collected for
      //    the audit log (non-fatal — orphan files are preferable to a
      //    broken response when the DB rows are already gone).
      let imagesUnlinked = 0;
      const failedPaths: string[] = [];
      if (imageFiles.length > 0) {
        const { data: rmRes, error: rmErr } = await admin.storage
          .from("shops")
          .remove(imageFiles);
        if (rmErr) {
          console.error(`[storage shops.remove hard-delete] failed`, {
            message: rmErr.message,
            paths:   imageFiles,
          });
          failedPaths.push(...imageFiles);
        } else {
          imagesUnlinked = (rmRes ?? []).length;
          if (imagesUnlinked < imageFiles.length) {
            // Supabase returns the successfully-removed list; missing entries
            // = the file was already gone (idempotent — ok).
            failedPaths.push(
              ...imageFiles.filter(
                (p) => !(rmRes ?? []).some((r) => r.name === p),
              ),
            );
          }
        }
      }

      await logAdminAction(
        adminId,
        "tb_header_order.hard_delete",
        "tb_header_order",
        header.hno,
        {
          hno:                   header.hno,
          userid:                header.userid,
          before_status:         status,
          deleted_lines:         deletedLines,
          image_files_collected: imageFiles.length,
          image_files_unlinked:  imagesUnlinked,
          storage_failed_paths:  failedPaths,
        },
      );

      revalidatePath("/admin/service-orders");
      revalidatePath(`/admin/service-orders/${header.hno}`);
      return {
        ok: true,
        data: {
          h_no:                  header.hno,
          deleted_lines:         deletedLines,
          image_files_unlinked:  imagesUnlinked,
          storage_failed_paths:  failedPaths,
        },
      };
    },
  );
}
