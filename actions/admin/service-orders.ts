"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";
import { sendNotification } from "@/lib/notifications";
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

// "arrived_china_warehouse" (hstatus '40' · ถึงโกดังจีน · owner 2026-06-16
// MOMO arrival) slots between awaiting_chn_dispatch (4) and completed (5).
const STATUSES = [
  "pending","awaiting_payment","ordered","awaiting_chn_dispatch","arrived_china_warehouse","completed","cancelled",
] as const;

// V-A2: forward lifecycle. Going to a lower-index status = rollback.
// 'cancelled' is its own path (excluded from rollback detection).
const STATUS_ORDER: ReadonlyArray<string> = [
  "pending","awaiting_payment","ordered","awaiting_chn_dispatch","arrived_china_warehouse","completed",
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
  arrived_china_warehouse: null,      // ถึงโกดังจีน — no dedicated legacy date col
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
  arrived_china_warehouse: "40", // ถึงโกดังจีน (owner 2026-06-16 · MOMO arrival)
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
      // Sitting-G bug fix: tb_header_order.hnote is NOT NULL (legacy
      // schema 0081 — every row needs a real string, default ''). The
      // prior "rebuilt → null" mapping crashed prod with "null value in
      // column 'hnote' violates not-null constraint" when an admin
      // cleared the field (browser-verified P22305). Empty string is
      // the legacy "no note" marker. Stamp hnotedate per shops.php L725
      // saveNote handler.
      update.hnote     = d.note_admin.length > 0 ? d.note_admin : "";
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
// (removed) adminMarkServiceOrderPaid — Potemkin dead-read
// ────────────────────────────────────────────────────────────
// This T-P1 action read+wrote the rebuilt `service_orders` table, which is
// 0-row on prod after the D1 pivot → it returned `not_found` for EVERY real
// order. Its only caller was the duplicate mark-paid block in
// `[hNo]/update-form.tsx` (removed in the same change). The LIVE mark-paid
// path is `adminMarkServiceOrderPaidTb` (actions/admin/service-orders-tb.ts),
// surfaced by <MarkPaidTbForm> on the legacy-view — it debits the real
// tb_wallet/tb_wallet_hs + flips tb_header_order.hstatus. Deleted to remove
// the dead-write trap (§0e). The `getWalletAvailableBalance` import this used
// was dropped; `sendNotification` stays (adminUpdateServiceOrder uses it).

// ────────────────────────────────────────────────────────────
// V-C2: set bill_to_name_override on a service_order
// ────────────────────────────────────────────────────────────
// Mirror of adminSetForwarderBillToOverride.
//
// 🚨 Tier-A "silent dead-write" partial-fix (2026-06-02):
//   The prior implementation read + wrote `.from("service_orders")` — the
//   REBUILT UUID table, EMPTY on prod after the D1 pivot. Every "บันทึก"
//   press in the bill-to-override panel returned `not_found` (no real
//   service_orders rows) OR silently succeeded on a stray rebuilt row that
//   nobody else read. The real ~21,950 orders sit in `tb_header_order`.
//
//   `tb_forwarder` got a Pacred-native bill-to column in migration 0132
//   (`fbilltoname varchar(200)` · NULL = use ship-to). The equivalent
//   `tb_header_order.hbilltoname` column does NOT yet exist — a future
//   migration must add it (next free = 0135+; see migration-ledger.md).
//
// Tombstoned for now: returns a clear error so callers (the bill-to-override
//   panel on /admin/service-orders/[hNo]) see "feature pending migration"
//   rather than green-toast → no-op. Once the migration lands, swap the
//   body back to a real `tb_header_order.update({ hbilltoname: next })`.
//
// Empty string clears.

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
  const _d = parsed.data;
  void _d;

  // Reject loudly — silent dead-write to rebuilt `service_orders` is the bug
  // we're closing. Replace this body with a tb_header_order update once
  // migration `ALTER TABLE tb_header_order ADD COLUMN hbilltoname varchar(200)`
  // ships (migration 0135+ · author = ภูม / accounting lane).
  console.warn(
    "[service-orders] adminSetOrderBillToOverride called — tombstoned pending "
    + "tb_header_order.hbilltoname column. Add migration + restore the live body.",
  );
  return {
    ok: false,
    error: "feature_pending_migration: ใบกำกับ override บนฝากสั่ง รอเพิ่มคอลัมน์ hbilltoname บน tb_header_order — ตอนนี้ยังใช้ไม่ได้",
  };
}
