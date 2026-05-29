"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";
import { sendNotification } from "@/lib/notifications";
import { getWalletAvailableBalance } from "@/lib/wallet/balance";
import { safeLegacyAdminId } from "@/lib/auth/safe-legacy-admin-id";
import { resolveProfileIdsForLegacyUserids } from "@/lib/auth/tb-users-resolver";
import {
  LEGACY_ORDER_STATUS,
  legacyOrderStatusThai,
  type LegacyOrderCode,
} from "@/lib/legacy-status-map";

// ────────────────────────────────────────────────────────────
// resolveLegacyAdminId — local helper (same pattern as
// service-orders-spawn.ts L51 + customer-profile.ts L51 + 8 other
// admin actions). The acting Pacred admin is identified by their
// auth email; we look up the matching `tb_admin.adminID` (the legacy
// PCS varchar id used in audit-trail columns like
// `tb_header_order.adminidupdate`). Fallback chain on miss:
//   1. `tb_admin.adminID` matched by `adminEmail`  → returned as-is
//   2. raw auth email (clipped at the call site via safeLegacyAdminId)
//   3. literal "system" (no auth context — should not happen under withAdmin)
// ────────────────────────────────────────────────────────────
async function resolveLegacyAdminId(): Promise<string> {
  const supabase = await createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr) {
    console.error(`[service-orders.resolveLegacyAdminId auth.getUser] failed`, {
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
    console.error(`[service-orders.resolveLegacyAdminId tb_admin lookup] failed`, {
      code: error.code, message: error.message,
    });
  }
  if (data?.adminID) return data.adminID;
  return email;
}

const STATUSES = [
  "pending","awaiting_payment","ordered","awaiting_chn_dispatch","completed","cancelled",
] as const;

// V-A2: forward lifecycle. Going to a lower-index status = rollback.
// 'cancelled' is its own path (excluded from rollback detection).
const STATUS_ORDER: ReadonlyArray<string> = [
  "pending","awaiting_payment","ordered","awaiting_chn_dispatch","completed",
];
function isStatusRollback(fromStatus: string, toStatus: string): boolean {
  if (fromStatus === toStatus) return false;
  if (toStatus === "cancelled" || fromStatus === "cancelled") return false;
  const fi = STATUS_ORDER.indexOf(fromStatus);
  const ti = STATUS_ORDER.indexOf(toStatus);
  return fi >= 0 && ti >= 0 && ti < fi;
}

const updateSchema = z.object({
  h_no:    z.string(),
  status:  z.enum(STATUSES).optional(),
  note_admin: z.string().trim().max(2000).optional(),
  // V-A2: required when status change is a rollback. Optional otherwise.
  rollback_reason: z.string().trim().max(500).optional(),
});
export type AdminUpdateServiceOrderInput = z.infer<typeof updateSchema>;

// ────────────────────────────────────────────────────────────
// D1 Phase-B (Tier A4) — legacy `tb_header_order` field map
// ────────────────────────────────────────────────────────────
// The rebuilt `service_orders` table is empty on prod after the D1 pivot.
// The real shop-order data — and the row the customer detail page reads
// from in `actions/service-order.ts::getServiceOrder` — is in
// `tb_header_order`. Writing to `service_orders` was a silent dead-write:
// admin saved a status flip, no error, but the customer never saw it.
//
// Legacy schema (lowercase column names, per migration 0081):
//   tb_header_order(id, hno, hstatus, hnote, hnoteuser, hnoteuserread,
//                   hnotedate, hdate, hdate2, hdate3, hdate4, hdate5,
//                   hdateupdate, adminidupdate, userid …)
//   hstatus codes: '1'=รอดำเนินการ '2'=รอชำระเงิน '3'=สั่งสินค้า
//                  '4'=รอร้านจีนจัดส่ง '5'=สำเร็จ '6'=ยกเลิก
//   adminidupdate: varchar(10) — clip via safeLegacyAdminId
//
// Legacy SOT for the field set:
//   pcsc/public_html/member/pcs-admin/shops.php
//   - L908: `UPDATE tb_header_order SET hStatus='$hStatus', adminIDUpdate=…`
//   - L725, L854: `UPDATE tb_header_order SET hNoteDate=NOW(), hNoteUser=…,
//                   hNoteUserRead=…, hNote=…, adminIDUpdate=…`
//   - L130, L976, L1101, L1559: stamp hDate2..hDate5 + hDateUpdate per status
const LEGACY_STATUS_DATE_COL: Record<string, string | null> = {
  awaiting_payment:       "hdate2",   // legacy hDate2 — รอชำระเงิน
  ordered:                "hdate3",   // legacy hDate3 — สั่งสินค้า
  awaiting_chn_dispatch:  "hdate4",   // legacy hDate4 — รอร้านจีนจัดส่ง
  completed:              "hdate5",   // legacy hDate5 — สำเร็จ
};

// Rebuilt-enum → legacy hstatus single-char code. We inline this rather
// than depend on `toLegacyOrderCode()` because the rebuilt schema chose
// `awaiting_chn_dispatch` as the status-4 key (migration 0011), while
// `lib/legacy-status-map.ts` uses the legacy-canonical key
// `awaiting_china_ship` for the same code. Both forms exist in the
// codebase — toLegacyOrderCode would return undefined for the rebuilt
// form and silently kill the mutation. This map is the single point
// where the rebuilt-enum vocabulary meets the legacy `'1'..'6'` codes.
const REBUILT_TO_LEGACY_HSTATUS: Record<string, string> = {
  pending:               "1",
  awaiting_payment:      "2",
  ordered:               "3",
  awaiting_chn_dispatch: "4",   // legacy-map calls this "awaiting_china_ship"
  completed:             "5",
  cancelled:             "6",
};

export async function adminUpdateServiceOrder(input: AdminUpdateServiceOrderInput): Promise<AdminActionResult> {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const d = parsed.data;

  return withAdmin(["ops"], async ({ adminId }) => {
    const admin = createAdminClient();

    // Pre-resolve the acting admin's legacy adminID (used both in the audit
    // payload + the adminidupdate stamp). Same pattern as forwarders-new.ts
    // / customer-profile.ts. Clip to 10 chars — `tb_header_order.adminidupdate`
    // is varchar(10) and an unclipped slug like "admin_pasit_pappornpisit"
    // raises "value too long for type character varying(10)" → silent UI fail.
    const legacyAdminId = safeLegacyAdminId(await resolveLegacyAdminId(), 10);

    // D1: read from the LIVE table — `tb_header_order` (the rebuilt
    // `service_orders` is empty on prod after the D1 pivot · see file
    // header comment). `hno` is the legacy join key, `userid` is the
    // customer's member code (PR<n>) used downstream for notification
    // routing via resolveProfileIdsForLegacyUserids.
    const { data: existing, error: existingErr } = await admin
      .from("tb_header_order")
      .select("id, hno, userid, hstatus, htotalpriceuser")
      .eq("hno", d.h_no)
      .maybeSingle<{
        id: number;
        hno: string;
        userid: string;
        hstatus: string | null;
        htotalpriceuser: number | null;
      }>();
    if (existingErr) {
      console.error(`[tb_header_order mutation lookup] failed`, {
        code: existingErr.code, message: existingErr.message,
      });
      return { ok: false, error: `db_error:${existingErr.code ?? "unknown"}` };
    }
    if (!existing) return { ok: false, error: "not_found" };

    // Map the legacy hstatus code → rebuilt enum key so the rebuilt
    // rollback gate (STATUS_ORDER) keeps working. Unknown codes (e.g.
    // a manually-injected legacy oddity) fall back to "pending" — the
    // rollback gate is then permissive, the audit log captures the raw
    // hstatus, and the staff still sees the order load.
    const existingStatusKey =
      LEGACY_ORDER_STATUS[(existing.hstatus ?? "1") as LegacyOrderCode]?.key ?? "pending";

    // Mutation payload — lowercase legacy column names. We always stamp
    // `adminidupdate` + `hdateupdate` on any update (legacy parity:
    // every UPDATE in shops.php sets adminIDUpdate, and every status/
    // value mutation sets hDateUpdate).
    const nowIso = new Date().toISOString();
    const update: Record<string, unknown> = {
      adminidupdate: legacyAdminId,
      hdateupdate:   nowIso,
    };
    let statusChanged = false;
    let isRollback    = false;

    if (d.status && d.status !== existingStatusKey) {
      // V-A2: rollback path requires reason
      isRollback = isStatusRollback(existingStatusKey, d.status);
      if (isRollback) {
        const reason = (d.rollback_reason ?? "").trim();
        if (reason.length < 3) {
          return {
            ok: false,
            error: `rollback ${existingStatusKey} → ${d.status} ต้องระบุเหตุผล (≥3 ตัว) — ใส่ใน rollback_reason`,
          };
        }
        // Stamp reason in hnote so it surfaces in legacy + rebuilt admin UI
        update.hnote     = `[ROLLBACK ${existingStatusKey}→${d.status}] ${reason}`;
        update.hnotedate = nowIso;
      }

      // Map rebuilt key → legacy single-char code for the stored column.
      // Use the local REBUILT_TO_LEGACY_HSTATUS map (not toLegacyOrderCode)
      // because the rebuilt schema's `awaiting_chn_dispatch` differs from
      // the legacy-status-map's `awaiting_china_ship` for code '4'.
      const legacyCode = REBUILT_TO_LEGACY_HSTATUS[d.status];
      if (!legacyCode) {
        return { ok: false, error: `unknown_status:${d.status}` };
      }
      update.hstatus = legacyCode;
      statusChanged = true;

      const dateCol = LEGACY_STATUS_DATE_COL[d.status];
      if (dateCol) update[dateCol] = nowIso;
    }
    if (d.note_admin != null && !isRollback) {
      // note_admin maps to legacy hnote (the staff/admin note column).
      // Empty string → null (matches the rebuilt prior behaviour). Stamp
      // hnotedate per shops.php L725 saveNote handler.
      update.hnote     = d.note_admin.length > 0 ? d.note_admin : null;
      update.hnotedate = nowIso;
    }

    const { error } = await admin
      .from("tb_header_order")
      .update(update)
      .eq("id", existing.id);
    if (error) {
      console.error(`[tb_header_order update] failed`, {
        code: error.code, message: error.message, hint: error.hint,
        h_no: d.h_no,
      });
      return { ok: false, error: error.message };
    }

    // V-A2: audit log marks rollback distinctly from forward-update.
    // target_id is the legacy numeric id (stringified) so re-querying
    // the audit row by id matches the tb_header_order row.
    await logAdminAction(
      adminId,
      isRollback ? "service_order.rollback" : "service_order.update",
      "service_order",
      String(existing.id),
      {
        h_no:   d.h_no,
        before: { status: existingStatusKey, hstatus: existing.hstatus },
        after:  update,
        ...(isRollback && d.rollback_reason ? { rollback_reason: d.rollback_reason.trim() } : {}),
      },
    );

    if (statusChanged && d.status) {
      // Resolve the rebuilt profile_id from the legacy member code
      // (tb_header_order.userid). Without this the rebuilt `notifications`
      // table can't be addressed — legacy userid is the PR<n> string, not
      // a UUID. Mirrors service-orders-spawn.ts L335.
      try {
        const profileMap = await resolveProfileIdsForLegacyUserids([existing.userid]);
        const profileId  = profileMap.get(existing.userid);
        if (profileId) {
          void sendNotification(profileId, {
            category: "order",
            // V-A2: rollback notifications use 'warning' severity so customer
            // is aware admin reverted state (they may have planned around the
            // earlier status — e.g., already saw "completed" then it bounced back).
            severity: (d.status === "cancelled" || isRollback) ? "warning" : "info",
            title:    isRollback
              ? `ฝากสั่ง ${d.h_no} ถูกย้อนสถานะ`
              : `ฝากสั่ง ${d.h_no} อัพเดทแล้ว`,
            body:     `สถานะ: ${legacyOrderStatusThai(REBUILT_TO_LEGACY_HSTATUS[d.status] ?? "1")}`
              + (isRollback && d.rollback_reason ? ` · เหตุผล: ${d.rollback_reason.trim()}` : ""),
            link_href: `/service-order/${d.h_no}`,
            reference_type: "service_order",
            reference_id:   String(existing.id),
          });
        }
        // If no profile_id (legacy customer never bridged) the notification
        // silently no-ops — same legacy fallback as spawn (L351-354).
      } catch {
        // Non-fatal — admin status update already succeeded, notification
        // failure shouldn't bounce the UI. Legacy `sendLine` also failed
        // silently on missing token.
      }
    }

    revalidatePath("/admin/service-orders");
    revalidatePath(`/admin/service-orders/${d.h_no}`);
    revalidatePath(`/service-order/${d.h_no}`);
    return { ok: true };
  });
}

// ────────────────────────────────────────────────────────────
// T-P1: MARK service-order PAID — debit wallet + flip status
// ────────────────────────────────────────────────────────────
//
// The plain `adminUpdateServiceOrder({ status: "ordered" })` flow flips
// status but doesn't move money in the wallet ledger.  Per Part T-P1,
// admin needs an explicit "ลูกค้าจ่ายเงินแล้ว" action that:
//
//   1. Validates the order is in awaiting_payment (or pending) state
//   2. Validates customer has enough wallet balance (main bucket)
//      — admin can override by passing allow_overdraw=true
//      (e.g. "received cash directly, will reconcile later")
//   3. Creates wallet_transactions row:
//        kind='order_payment', amount=-total_thb, status='completed',
//        reference_type='order_header', reference_id=h_no
//      The wallet_recompute_balance trigger debits the main bucket.
//   4. Flips order status awaiting_payment → ordered, stamps date_ordered
//   5. Logs audit + notifies customer
//
// Idempotency: if a wallet_transaction with the same (reference_type,
// reference_id, kind, status='completed') already exists, skip the
// double-debit and just ensure status is 'ordered'.

const markPaidSchema = z.object({
  h_no:           z.string(),
  allow_overdraw: z.boolean().optional(),
});
export type AdminMarkServiceOrderPaidInput = z.infer<typeof markPaidSchema>;

type MarkPaidData = { tx_id: string; already_paid: boolean };
export async function adminMarkServiceOrderPaid(
  input: AdminMarkServiceOrderPaidInput,
): Promise<AdminActionResult<MarkPaidData>> {
  const parsed = markPaidSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const d = parsed.data;

  // Accounting role gate per ADR-0005 K-7 — wallet movements are
  // accounting work, not ops.  Super gets it too (full powers).
  return withAdmin<MarkPaidData>(["super", "accounting"], async ({ adminId }) => {
    const admin = createAdminClient();

    const { data: order, error: orderErr } = await admin
      .from("service_orders")
      .select("id, profile_id, h_no, status, total_thb")
      .eq("h_no", d.h_no)
      .maybeSingle<{ id: string; profile_id: string; h_no: string; status: string; total_thb: number }>();
    if (orderErr) {
      console.error(`[service_orders mutation lookup] failed`, { code: orderErr.code, message: orderErr.message });
      return { ok: false, error: `db_error:${orderErr.code ?? "unknown"}` };
    }
    if (!order) return { ok: false, error: "not_found" };

    if (order.status === "cancelled") {
      return { ok: false, error: "ออเดอร์ยกเลิกแล้ว — ไม่สามารถบันทึกชำระได้" };
    }
    if (order.status === "completed") {
      return { ok: false, error: "ออเดอร์เสร็จสมบูรณ์แล้ว — ไม่ต้องบันทึกชำระซ้ำ" };
    }

    // Idempotency: did this order already have a completed payment tx?
    const { data: existingTx, error: existingTxErr } = await admin
      .from("wallet_transactions")
      .select("id")
      .eq("reference_type", "order_header")
      .eq("reference_id", order.h_no)
      .eq("kind", "order_payment")
      .eq("status", "completed")
      .maybeSingle<{ id: string }>();
    if (existingTxErr) {
      console.error(`[wallet_transactions list] failed`, { code: existingTxErr.code, message: existingTxErr.message });
    }
    if (existingTx) {
      // Already paid — just nudge status forward if it isn't already
      if (order.status === "awaiting_payment" || order.status === "pending") {
        await admin
          .from("service_orders")
          .update({
            status:       "ordered",
            date_ordered: new Date().toISOString(),
            admin_id_update: adminId,
          })
          .eq("id", order.id);
      }
      return { ok: true, data: { tx_id: existingTx.id, already_paid: true } };
    }

    const totalThb = Number(order.total_thb);
    if (!(totalThb > 0)) return { ok: false, error: "total_thb invalid — ไม่สามารถบันทึกชำระได้" };

    // Balance check (skip if admin overrides). Pending-aware available
    // balance — the raw wallet.balance column (0007 trigger) is blind to
    // the customer's own open pending debits (gap-customer §H-1).
    if (!d.allow_overdraw) {
      const available = await getWalletAvailableBalance(admin, order.profile_id);
      if (available === null) {
        return { ok: false, error: "ตรวจสอบยอด wallet ไม่สำเร็จ — ลองใหม่อีกครั้ง" };
      }
      if (available < totalThb) {
        return {
          ok: false,
          error: `ยอด wallet ไม่พอ (มี ฿${available.toLocaleString()} ต้อง ฿${totalThb.toLocaleString()}) — ถ้ารับเงินสด/โอนตรง กดยืนยันด้วย allow_overdraw`,
        };
      }
    }

    // Create the debit wallet_transaction.
    // F-11 / G9 — wrap INSERT to catch the partial-unique violation from
    // migration 0049 (wallet_tx_order_payment_uniq). Under concurrent
    // submits (admin double-click / 2 tabs / customer-side race), the
    // check-then-act SELECT above may miss a still-committing peer — the
    // DB-level guard raises 23505, we re-SELECT, return as if we were the
    // second arrival in normal idempotent flow.
    const { data: insertedTx, error: txErr } = await admin
      .from("wallet_transactions")
      .insert({
        profile_id:     order.profile_id,
        bucket:         "main",
        amount:         -totalThb,             // debit
        kind:           "order_payment",
        status:         "completed",
        reference_type: "order_header",
        reference_id:   order.h_no,
        admin_id:       adminId,
        note:           `ชำระค่าฝากสั่ง ${order.h_no}${d.allow_overdraw ? " (admin override — รับเงินสด/โอนตรง)" : ""}`,
      })
      .select("id")
      .maybeSingle<{ id: string }>();

    if (txErr && (txErr.code === "23505" || /duplicate|unique/i.test(txErr.message))) {
      // Concurrent peer beat us — re-SELECT canonical row.
      const { data: peerTx, error: peerTxErr } = await admin
        .from("wallet_transactions")
        .select("id")
        .eq("reference_type", "order_header")
        .eq("reference_id", order.h_no)
        .eq("kind", "order_payment")
        .eq("status", "completed")
        .maybeSingle<{ id: string }>();
      if (peerTxErr) {
        console.error(`[wallet_transactions list] failed`, { code: peerTxErr.code, message: peerTxErr.message });
      }
      if (!peerTx) {
        return { ok: false, error: `wallet insert race: 23505 but no peer tx found for ${order.h_no}` };
      }
      // Nudge order status forward if not yet (mirror existing fast-path logic).
      if (order.status === "awaiting_payment" || order.status === "pending") {
        await admin
          .from("service_orders")
          .update({
            status:           "ordered",
            date_ordered:     new Date().toISOString(),
            admin_id_update:  adminId,
          })
          .eq("id", order.id);
      }
      revalidatePath("/admin/service-orders");
      revalidatePath(`/admin/service-orders/${order.h_no}`);
      revalidatePath("/admin/wallet");
      return { ok: true, data: { tx_id: peerTx.id, already_paid: true } };
    }
    if (txErr || !insertedTx) {
      return { ok: false, error: `wallet insert: ${txErr?.message ?? "no row"}` };
    }
    const tx = insertedTx;

    // Flip the order status forward
    const { error: ordErr } = await admin
      .from("service_orders")
      .update({
        status:           "ordered",
        date_ordered:     new Date().toISOString(),
        admin_id_update:  adminId,
      })
      .eq("id", order.id);
    if (ordErr) {
      // Don't roll back the wallet tx automatically — admin can decide
      // whether to cancel the tx or fix the order row. Surface the error.
      return { ok: false, error: `order update failed AFTER wallet debit (tx ${tx.id} stays): ${ordErr.message}` };
    }

    await logAdminAction(adminId, "service_order.mark_paid", "service_order", order.id, {
      h_no:           order.h_no,
      total_thb:      totalThb,
      tx_id:          tx.id,
      allow_overdraw: !!d.allow_overdraw,
      before:         { status: order.status },
      after:          { status: "ordered" },
    });

    void sendNotification(order.profile_id, {
      category: "order",
      severity: "success",
      title:    `ชำระเงินสำเร็จ — ${order.h_no}`,
      body:     `รับเงิน ฿${totalThb.toLocaleString()} แล้ว — ระบบจะสั่งสินค้าให้ต่อไป`,
      link_href: `/service-order/${order.h_no}`,
      reference_type: "service_order",
      reference_id:   order.id,
    });

    revalidatePath("/admin/service-orders");
    revalidatePath(`/admin/service-orders/${order.h_no}`);
    revalidatePath("/admin/wallet");
    return { ok: true, data: { tx_id: tx.id, already_paid: false } };
  });
}

// ────────────────────────────────────────────────────────────
// V-C2: set bill_to_name_override on a service_order
// ────────────────────────────────────────────────────────────
// Mirror of adminSetForwarderBillToOverride. Empty string clears.

const setOrderBillToOverrideSchema = z.object({
  h_no:     z.string().trim().min(1),
  override: z.string().trim().max(200),     // "" allowed → clear
});
export type SetOrderBillToOverrideInput = z.infer<typeof setOrderBillToOverrideSchema>;

export async function adminSetOrderBillToOverride(
  input: SetOrderBillToOverrideInput,
): Promise<AdminActionResult<{ h_no: string; bill_to_name_override: string | null }>> {
  const parsed = setOrderBillToOverrideSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const d = parsed.data;
  const next = d.override.length > 0 ? d.override : null;

  return withAdmin<{ h_no: string; bill_to_name_override: string | null }>(
    ["super", "ops", "accounting"],
    async ({ adminId }) => {
      const admin = createAdminClient();
      const { data: before, error: readErr } = await admin
        .from("service_orders")
        .select("id, bill_to_name_override")
        .eq("h_no", d.h_no)
        .maybeSingle<{ id: string; bill_to_name_override: string | null }>();
      if (readErr) return { ok: false, error: readErr.message };
      if (!before) return { ok: false, error: "not_found" };

      const { error: updErr } = await admin
        .from("service_orders")
        .update({ bill_to_name_override: next })
        .eq("id", before.id);
      if (updErr) return { ok: false, error: updErr.message };

      await logAdminAction(adminId, "service_order.set_bill_to_override", "service_order", before.id, {
        h_no:   d.h_no,
        before: before.bill_to_name_override,
        after:  next,
      });

      revalidatePath(`/admin/service-orders/${d.h_no}`);
      revalidatePath(`/service-order/${d.h_no}/receipt`);
      return { ok: true, data: { h_no: d.h_no, bill_to_name_override: next } };
    },
  );
}
