"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";
import { sendNotification } from "@/lib/notifications";
import { notify } from "@/lib/notifications/templates";
import { appendStatusLog } from "@/lib/notifications/status-flip-helper";
import { fireUserSalesEarnTriggerOnDelivery } from "./earn-trigger-tb-user-sales";
import { resolveProfileIdsForLegacyUserids, resolveProfileIdForLegacyUserid } from "@/lib/auth/tb-users-resolver";
import { notifyStaffGroup } from "@/lib/notifications/staff-group";
// NOTE: getWalletAvailableBalance + getCargoBillingGate were only used by the
// now-tombstoned adminMarkForwarderPaid (rebuilt-table dead-write). The faithful
// forwarder-payment lives in actions/admin/pay-user.ts. Imports removed 2026-05-31.
import { logger, redactId } from "@/lib/logger";
import { getAdminRoles } from "@/lib/auth/require-admin";
import { canAnyRoleFlipFstatus } from "@/lib/auth/check-fstatus-transition";

const STATUSES = [
  "pending_payment","shipped_china","in_transit","arrived_thailand",
  "out_for_delivery","delivered","cancelled",
] as const;

// V-A2: forward-direction lifecycle order. 'cancelled' is terminal-anywhere.
// Going from a higher-index status back to a lower-index = rollback → reason required.
const STATUS_ORDER: ReadonlyArray<string> = [
  "pending_payment","shipped_china","in_transit","arrived_thailand",
  "out_for_delivery","delivered",
];
function isStatusRollback(fromStatus: string, toStatus: string): boolean {
  if (fromStatus === toStatus) return false;
  if (toStatus === "cancelled") return false;          // cancellation is its own path
  if (fromStatus === "cancelled") return false;        // un-cancel = forward repair, not rollback
  const fi = STATUS_ORDER.indexOf(fromStatus);
  const ti = STATUS_ORDER.indexOf(toStatus);
  return fi >= 0 && ti >= 0 && ti < fi;
}

const updateForwarderSchema = z.object({
  f_no:             z.string(),
  status:           z.enum(STATUSES).optional(),
  tracking_chn:     z.string().trim().max(255).optional(),
  tracking_th:      z.string().trim().max(255).optional(),
  cabinet_number:   z.string().trim().max(255).optional(),
  partner_warehouse: z.enum(["sang","ctt","mk","mx","jmf"]).optional(),
  note_admin:       z.string().trim().max(2000).optional(),
  // V-A2: required when status change is a rollback (going backward).
  // Optional otherwise; ignored unless a rollback transition is detected.
  rollback_reason:  z.string().trim().max(500).optional(),
});
export type UpdateForwarderInput = z.infer<typeof updateForwarderSchema>;

const STATUS_DATE_COL: Record<string, string | null> = {
  shipped_china:    "date_shipped_china",
  in_transit:       "date_in_transit",
  arrived_thailand: "date_arrived_thailand",
  out_for_delivery: "date_out_for_delivery",
  delivered:        "date_delivered",
};

export async function adminUpdateForwarder(input: UpdateForwarderInput): Promise<AdminActionResult> {
  const parsed = updateForwarderSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  return withAdmin(["ops"], async ({ adminId }) => {
    const admin = createAdminClient();

    // Fetch existing for diff + customer notification + V-A2 rollback note merging
    const { data: existing, error: existingErr } = await admin
      .from("forwarders")
      .select("id, profile_id, status, total_price, note_admin")
      .eq("f_no", d.f_no)
      .maybeSingle<{ id: string; profile_id: string; status: string; total_price: number; note_admin: string | null }>();
    if (existingErr) {
      console.error("[forwarders mutation lookup] f_no=", d.f_no, { code: existingErr.code, message: existingErr.message });
      return { ok: false, error: `db_error:${existingErr.code}` };
    }
    if (!existing) return { ok: false, error: "not_found" };

    const update: Record<string, unknown> = { admin_id_update: adminId };
    let statusChanged = false;
    let isRollback    = false;

    if (d.status && d.status !== existing.status) {
      // V-A2: rollback path requires a reason
      isRollback = isStatusRollback(existing.status, d.status);
      if (isRollback) {
        const reason = (d.rollback_reason ?? "").trim();
        if (reason.length < 3) {
          return {
            ok: false,
            error: `rollback ${existing.status} → ${d.status} ต้องระบุเหตุผล (≥3 ตัว) — ใส่ใน rollback_reason`,
          };
        }
        // Stamp the reason into note_admin so it surfaces in admin UI thread.
        // Prepend (not replace) so prior notes survive.
        update.note_admin = `[ROLLBACK ${existing.status}→${d.status}] ${reason}`
          + (existing.note_admin && existing.note_admin !== d.note_admin
              ? `\n${existing.note_admin}` : (d.note_admin ? `\n${d.note_admin}` : ""));
      }

      update.status = d.status;
      statusChanged = true;
      const dateCol = STATUS_DATE_COL[d.status];
      if (dateCol) update[dateCol] = new Date().toISOString();
    }
    if (d.tracking_chn      != null) update.tracking_chn      = d.tracking_chn || null;
    if (d.tracking_th       != null) update.tracking_th       = d.tracking_th || null;
    if (d.cabinet_number    != null) update.cabinet_number    = d.cabinet_number || null;
    if (d.partner_warehouse != null) update.partner_warehouse = d.partner_warehouse;
    if (d.note_admin        != null && !isRollback) update.note_admin = d.note_admin || null;

    const { error } = await admin
      .from("forwarders")
      .update(update)
      .eq("id", existing.id);

    if (error) return { ok: false, error: error.message };

    // V-A2: audit log marks rollback distinctly from forward-update so reports
    // can flag rollback frequency per admin (governance signal).
    await logAdminAction(adminId, isRollback ? "forwarder.rollback" : "forwarder.update", "forwarder", existing.id, {
      f_no:      d.f_no,
      before:    { status: existing.status },
      after:     update,
      ...(isRollback && d.rollback_reason ? { rollback_reason: d.rollback_reason.trim() } : {}),
    });

    // Notify customer when status changes. V-A2: rollback gets a distinct
    // payload so the customer sees the reason + warning severity, not just
    // a plain "status changed" line.
    if (statusChanged && d.status) {
      if (isRollback && d.rollback_reason) {
        void sendNotification(existing.profile_id, {
          category: "forwarder",
          severity: "warning",
          title:    `ฝากนำเข้า ${d.f_no} ถูกย้อนสถานะ`,
          body:     `กลับเป็น ${d.status} · เหตุผล: ${d.rollback_reason.trim()}`,
          link_href: `/service-import/${d.f_no}`,
          reference_type: "forwarder",
          reference_id:   existing.id,
        });
      } else {
        void sendNotification(existing.profile_id, notify.forwarderStatusChanged({
          fNo:         d.f_no,
          status:      d.status,
          forwarderId: existing.id,
        }));
      }
    }

    revalidatePath("/admin/forwarders");
    revalidatePath(`/admin/forwarders/${d.f_no}`);
    return { ok: true };
  });
}

// ── Bulk status update ────────────────────────────────────────────────────────

const bulkSchema = z.object({
  f_nos:  z.array(z.string()).min(1).max(100),
  status: z.enum(STATUSES),
});

export async function adminBulkUpdateForwarderStatus(
  input: z.infer<typeof bulkSchema>,
): Promise<AdminActionResult & { updated?: number }> {
  const parsed = bulkSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const { f_nos, status } = parsed.data;

  return withAdmin(["ops"], async ({ adminId }) => {
    const admin = createAdminClient();

    const { data: existing, error: existingErr } = await admin
      .from("forwarders")
      .select("id, f_no, profile_id, status")
      .in("f_no", f_nos);
    if (existingErr) {
      console.error("[forwarders bulk status lookup] f_nos=", f_nos, { code: existingErr.code, message: existingErr.message });
      return { ok: false, error: `db_error:${existingErr.code}` };
    }
    if (!existing || existing.length === 0) return { ok: false, error: "not_found" };

    const dateCol = STATUS_DATE_COL[status];
    const update: Record<string, unknown> = {
      status,
      admin_id_update: adminId,
      ...(dateCol ? { [dateCol]: new Date().toISOString() } : {}),
    };

    const { error } = await admin
      .from("forwarders")
      .update(update)
      .in("f_no", f_nos);

    if (error) return { ok: false, error: error.message };

    await logAdminAction(adminId, "forwarder.bulk_update", "forwarder", "bulk", {
      f_nos, before_statuses: existing.map((r) => ({ f_no: r.f_no, status: r.status })), after: { status },
    });

    // Notify each customer
    for (const row of existing) {
      if (row.status === status) continue;
      void sendNotification(row.profile_id, notify.forwarderStatusChanged({
        fNo:         row.f_no,
        status,
        forwarderId: row.id,
      }));
    }

    revalidatePath("/admin/forwarders");
    return { ok: true, updated: existing.length };
  });
}

// ────────────────────────────────────────────────────────────
// adminMarkForwarderPaid — admin override mirror of
// `payForwarderFromWallet` (customer self-service, dave commit `2be9eb5`)
// ────────────────────────────────────────────────────────────
//
// Why this exists:
//   The customer-side `payForwarderFromWallet` closed the import loop for
//   self-pay-from-wallet, but admin still needs an override path for:
//     - Customer paid via bank transfer / cash / OOB → admin records it
//     - Customer can't self-pay (slow internet, technical issue, account
//       has zero balance + admin agreed to receive cash)
//
// Pattern is the EXACT mirror of `adminMarkServiceOrderPaid` (T-P1) with
// forwarder column names:
//   - kind = 'import_payment' (vs 'order_payment')
//   - reference_type = 'forwarder' (vs 'order_header')
//   - reference_id = f_no
//   - status flip: pending_payment → shipped_china (matches customer flow)
//
// Idempotency: existing completed (kind='import_payment', ref to f_no)
// → return { already_paid: true } without double-debit.
//
// Per ADR-0005 K-7: wallet movements gated by accounting role (super
// inherits all). Audit log captures override flag for compliance.

const markForwarderPaidSchema = z.object({
  f_no:           z.string(),
  allow_overdraw: z.boolean().optional(),
  // U1-3 admin-only escape hatch: bypass the arrival→billing gate when the
  // operator has confirmed the final CBM out-of-band (e.g. phone with MOMO).
  // Audited via `forwarder.pay_with_unverified_billing_override`.
  allow_unverified_billing: z.boolean().optional(),
});
export type AdminMarkForwarderPaidInput = z.infer<typeof markForwarderPaidSchema>;

type MarkForwarderPaidData = { tx_id: string; already_paid: boolean };

export async function adminMarkForwarderPaid(
  input: AdminMarkForwarderPaidInput,
): Promise<AdminActionResult<MarkForwarderPaidData>> {
  const parsed = markForwarderPaidSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const d = parsed.data;

  // 🪦 TOMBSTONE 2026-05-31 (Theme A · เดฟ · owner "ปิด money dead-write")
  // ---------------------------------------------------------------------------
  // The previous body was a money DEAD-WRITE: it read the REBUILT, prod-empty
  // `forwarders` table (→ `not_found` on every one of the 8,898 customers'
  // real `tb_forwarder` rows) and debited the REBUILT, prod-empty
  // `wallet_transactions` ledger. On prod it could never run; if a future
  // `[fNo]` repoint ever fed it a real row, it would debit the WRONG ledger
  // (the migrated balances live in `tb_wallet`), i.e. silently credit nothing.
  //
  // The FAITHFUL admin forwarder-payment already exists AND is reachable:
  //   `adminPayForwardersOnBehalf` (actions/admin/pay-user.ts) — debits the
  //   legacy `tb_wallet`, writes the settled `tb_wallet_hs` row
  //   (type='4' / typenew='6' / typeservice='2', reforder=fID), flips
  //   `tb_forwarder.fstatus` 5→6 (+ fdatestatus6/fdateadminstatus), with
  //   idempotency + rollback. Faithful to legacy pay-users.php L463-469.
  //   Wired to /admin/wallet/pay-user AND (2026-05-31) the [fNo] detail
  //   payment panel (TbForwarderPaymentPanel → adminPayForwardersOnBehalf).
  //
  // Keeping a SECOND money path through the rebuilt tables = double-spend risk
  // + the exact dead-write landmine the 2026-05-31 re-sweep flagged. So this is
  // now a HARD NO-OP that points the operator at the faithful path. The
  // signature is kept only so the dead rebuilt-branch importer
  // (`[fNo]/update-form.tsx`, which renders solely on the empty-UUID branch and
  // never on real rows) still compiles.
  void d;
  return {
    ok: false,
    error:
      "ปิดการใช้งานแล้ว — ใช้ปุ่ม 'บันทึกชำระเงิน (ตัดกระเป๋า)' ในหน้ารายละเอียดฝากนำเข้า " +
      "หรือหน้า 'ตัดเงินลูกค้า' (/admin/wallet/pay-user) ซึ่งเขียน tb_wallet / tb_wallet_hs จริง",
  };
}

// ── Bulk status update — tb_forwarder (Wave 5 P0) ────────────────────────────
//
// Mirrors `adminBulkUpdateForwarderStatus` (above, REBUILT `forwarders` table
// path) but mutates the legacy `tb_forwarder` table that the rewritten
// /admin/forwarders page actually reads from (Wave 3 P0 #1).
//
// Legacy columns (per migration 0081):
//   fstatus           varchar(2)  — '1'..'7' · '99'
//   fdateadminstatus  timestamp   — UPDATE on every admin status change
//   fdatestatusN      timestamp   — stamp the matching column for the new status
//   userid            varchar(10) — legacy text id (joins tb_users)
//
// Notification: the legacy `tb_users.userid` is a text key, not a `profile_id`
// uuid that sendNotification() expects. The bridge from userid → profile_id
// (`tb_user_id_to_profile`) is not yet built; for now we just log the intent
// and add a TODO. Status change still lands in the DB + audit log; customer
// just doesn't get an in-app push yet. This matches the trade-off in the
// page comments (`forwarders-table.tsx` L24-25).
//
// Keep the existing rebuilt-table `adminBulkUpdateForwarderStatus` until the
// last consumer migrates — both lanes coexist during the D1 transition.

const TB_FORWARDER_STATUSES = ["1", "2", "3", "4", "5", "6", "7", "99"] as const;
type TbForwarderStatus = (typeof TB_FORWARDER_STATUSES)[number];

const bulkTbSchema = z.object({
  fids:    z.array(z.number().int().positive()).min(1).max(100),
  fstatus: z.enum(TB_FORWARDER_STATUSES),
  // Wave 23 (2026-05-27 ภูม flag · live walkthrough): bulk + detail share
  // this action — optional fields below let single-row callers (the detail
  // page action panel) set tracking/cabinet/note in one go, AND let the
  // bulk-bar assign a common cabinet to a batch (e.g. "GZE-2026-001" for
  // all rows in one container). Each field is OPTIONAL — when absent the
  // column is NOT touched (legacy behaviour preserved · no accidental nulls).
  //
  // Why width 300 on cabinet_number? Matches the legacy
  // tb_forwarder.fcabinetnumber varchar(300) constraint (per migration 0081).
  // Why width 50 on tracking_th? Matches the legacy ftrackingth varchar(50).
  cabinet_number: z.string().trim().max(300).optional(),
  tracking_th:    z.string().trim().max(50).optional(),
  fnote:          z.string().trim().max(2000).optional(),
});

// `fdatestatusN` map — only stamp a column for statuses that have one
// (status '1' has no dedicated date column · '99' is "special" too).
const TB_STATUS_DATE_COL: Record<TbForwarderStatus, string | null> = {
  "1":  null,
  "2":  "fdatestatus2",
  "3":  "fdatestatus3",
  "4":  "fdatestatus4",
  "5":  "fdatestatus5",
  "6":  "fdatestatus6",
  "7":  "fdatestatus7",
  "99": null,
};

export async function adminBulkUpdateForwarderTbStatus(
  input: z.infer<typeof bulkTbSchema>,
): Promise<AdminActionResult<{ updated: number }>> {
  const parsed = bulkTbSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const { fids, fstatus, cabinet_number, tracking_th, fnote } = parsed.data;

  return withAdmin<{ updated: number }>(
    // Wave 26 G5 (2026-05-28 ดึก): page-level union widened from ["ops","super"]
    // to include every role that legacy hard-codes as an owner of SOME
    // transition. Per-row gate below filters to the SPECIFIC transition
    // the caller is attempting — Warehouse can call this action but only
    // for 3→4 / *→4 rows, Accounting only for *→5 / 5→6 etc. `super`
    // and `manager` retain the global override. See lib/auth/check-fstatus-transition.ts.
    ["ops", "super", "manager", "warehouse", "accounting", "driver"],
    async ({ adminId }) => {
    const admin = createAdminClient();

    // Snapshot before — for audit log + change detection + the cabinet-close
    // date back-fill (Wave 24 #192 · 2026-05-27 ดึก · see comment below).
    const { data: before, error: readErr } = await admin
      .from("tb_forwarder")
      .select("id, fstatus, userid, fidorco, fcabinetnumber, fdatecontainerclose")
      .in("id", fids);
    if (readErr) return { ok: false, error: readErr.message };
    if (!before || before.length === 0) return { ok: false, error: "not_found" };

    const beforeRows = before as unknown as Array<{
      id: number;
      fstatus: string;
      userid: string;
      fidorco: string | null;
      fcabinetnumber: string | null;
      fdatecontainerclose: string | null;
    }>;

    // Wave 26 G5 (2026-05-28 ดึก) — status-transition role gate.
    // Per-row check: every row in the bulk must satisfy the legacy
    // owner-role matrix for its own (from → to) transition. Mixed-status
    // bulks (e.g. 3 rows at fstatus=4 + 1 row at fstatus=99 → fstatus=5)
    // hit different matrix entries → the 99 row needs super/manager even
    // if the rest don't. Rather than partial-process (which the bulk-bill
    // action does), this top-level any-vs-all bulk REFUSES the whole batch
    // when any row fails — caller can split and retry.
    const callerRoles = (await getAdminRoles()) ?? [];
    const forbidden = beforeRows.filter(
      (r) => !canAnyRoleFlipFstatus(callerRoles, r.fstatus, fstatus),
    );
    if (forbidden.length > 0) {
      const sample = forbidden.slice(0, 5).map((r) => `#${r.id}(${r.fstatus}→${fstatus})`).join(", ");
      const more = forbidden.length > 5 ? ` (และอีก ${forbidden.length - 5} รายการ)` : "";
      return {
        ok: false,
        error: `forbidden_transition: บัญชีของคุณไม่มีสิทธิ์เปลี่ยนสถานะรายการต่อไปนี้ ${sample}${more}`,
      };
    }

    const nowIso = new Date().toISOString();
    const dateCol = TB_STATUS_DATE_COL[fstatus];
    // tb_forwarder.adminidupdate is varchar(10) — same legacy pcsc_main
    // constraint that bit /admin/forwarders/new (Wave 23 P0 fix 5254f8d).
    // Sister bug-fix 2026-05-27 — ภูม bulk-update of #51973 hit the same
    // ceiling because adminId ("admin_pasit_pap" etc) was inserted raw.
    const adminIdSafe = String(adminId).slice(0, 10);

    // 🚨 Wave 24 #192 (2026-05-27 ดึก · ภูม live walkthrough · order #51974):
    //
    // Legacy `report-cnt.php` filters the "เข้าโกดังไทยแล้ว" view by
    // DATE(fDateContainerClose) BETWEEN start AND end. Rows with NULL
    // fDateContainerClose are invisible on that report — even if fstatus is
    // already 4 (ถึงไทย) and the cabinet number is set.
    //
    // The legacy partner-API integrations (api-forwarder-cn.php · momo.php ·
    // gogo.php · api-sheets-* etc) ALL set fDateContainerClose at the same
    // time they set fCabinetNumber (when fStatus transitions to '3'). When
    // admin assigns a cabinet manually via our bulk-bar OR detail-panel
    // (Wave 24 #179/#180), we forgot the parallel fDateContainerClose write
    // → orders never surface on /admin/report-cnt.
    //
    // Fix: when admin sets `cabinet_number` for an order whose row currently
    // has NULL/empty fdatecontainerclose, stamp fdatecontainerclose=now().
    // Per-row decision: a multi-row bulk where some rows already have a
    // close-date keeps the EXISTING value (don't clobber legacy data).
    //
    // The legacy partner-API path used `manifest_date` from the carrier's
    // payload. Admin manual path has no manifest — `now()` is the honest
    // proxy ("the moment admin sealed/assigned the container"). When ภูม
    // later wires manifest_date through (Wave 25+), this back-fill becomes
    // an upper bound + can be overridden.
    const cabinetAssigned = cabinet_number !== undefined && cabinet_number.trim() !== "";
    const needsBackfillSet = cabinetAssigned
      ? new Set(beforeRows.filter((r) => !r.fdatecontainerclose).map((r) => r.id))
      : new Set<number>();

    const update: Record<string, unknown> = {
      fstatus,
      fdateadminstatus: nowIso,
      adminidupdate:    adminIdSafe,
      ...(dateCol ? { [dateCol]: nowIso } : {}),
      // Optional fields — only included when caller explicitly passed them.
      // Empty-string from the form means "explicitly clear" (legacy NOT NULL
      // varchar columns default to "" / "-"); undefined means "don't touch".
      ...(cabinet_number !== undefined ? { fcabinetnumber: cabinet_number } : {}),
      ...(tracking_th    !== undefined ? { ftrackingth: tracking_th || "-" } : {}),
      ...(fnote          !== undefined ? { fnote: fnote || null }            : {}),
    };

    // Path A — no back-fill rows: single bulk update covers everything.
    // Path B — some rows need fdatecontainerclose stamped: split into 2 updates
    //          (the back-fill subset gets the extra column; the rest don't).
    //          A 2-statement split is honest about which rows changed when,
    //          and keeps the audit log accurate. Cheaper than a per-row loop.
    if (needsBackfillSet.size === 0) {
      const { error: updErr } = await admin
        .from("tb_forwarder")
        .update(update)
        .in("id", fids);
      if (updErr) return { ok: false, error: updErr.message };
    } else {
      const backfillIds = Array.from(needsBackfillSet);
      const otherIds = fids.filter((id) => !needsBackfillSet.has(id));

      // 1) rows that need the close-date back-fill
      const { error: updWithCloseErr } = await admin
        .from("tb_forwarder")
        .update({ ...update, fdatecontainerclose: nowIso })
        .in("id", backfillIds);
      if (updWithCloseErr) return { ok: false, error: updWithCloseErr.message };

      // 2) rows that already had a close-date — keep it intact
      if (otherIds.length > 0) {
        const { error: updOthersErr } = await admin
          .from("tb_forwarder")
          .update(update)
          .in("id", otherIds);
        if (updOthersErr) return { ok: false, error: updOthersErr.message };
      }
    }

    await logAdminAction(adminId, "forwarder.bulk_update_tb", "tb_forwarder", "bulk", {
      fids,
      before_statuses: beforeRows.map((r) => ({ id: r.id, fstatus: r.fstatus })),
      after:           { fstatus },
    });

    // G8 (2026-05-28 ดึก): append one tb_log_forwarder_status row per
    // changed row. Legacy forwarder.php:1284 wrote this log inside the
    // admin-dropdown path; our bulk action was missing it. Best-effort —
    // a log insert failure does NOT roll back the UPDATE that already
    // succeeded above. The legacy report screens (status-history view)
    // depend on this trail being populated.
    const changed = beforeRows.filter((r) => r.fstatus !== fstatus);
    for (const row of changed) {
      await appendStatusLog(admin, row.id, row.fstatus, fstatus, adminIdSafe);
    }

    // Wave 16 follow-up A (2026-05-25): resolver wired. Bulk-resolve every
    // changed row's legacy userid → profiles.id, then fire status-change
    // notifications. Each call wrapped in try/catch so one failed delivery
    // doesn't block the bulk operation. (Same pattern as forwarder-check
    // action — uses `lib/auth/tb-users-resolver.ts` + sendNotification.)
    if (changed.length > 0) {
      try {
        const profileMap = await resolveProfileIdsForLegacyUserids(
          changed.map((r) => r.userid),
        );
        let notified = 0;
        let noProfile = 0;
        for (const row of changed) {
          const profileId = profileMap.get(row.userid);
          if (!profileId) { noProfile++; continue; }
          try {
            await sendNotification(profileId, notify.forwarderStatusChanged({
              fNo:         row.fidorco ?? String(row.id),
              status:      fstatus,
              forwarderId: String(row.id),
            }));
            notified++;
          } catch (err) {
            logger.warn("forwarder.bulk_update_tb", "notification failed (continuing bulk)", {
              fid:       row.id,
              profileId,
              error:     err instanceof Error ? err.message : String(err),
            });
          }
        }
        logger.info("forwarder.bulk_update_tb", `notifications fired ${notified}/${changed.length} (no profile: ${noProfile})`, {
          adminId:       redactId(adminId),
          fstatus,
          notified,
          no_profile:    noProfile,
        });
      } catch (err) {
        // Resolver-level failure (e.g. DB error during bulk lookup) —
        // log + continue. The bulk UPDATE already succeeded.
        logger.warn("forwarder.bulk_update_tb", "notification resolver failed (bulk update OK, notifications skipped)", {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // P1-5 earn-trigger (2026-05-30 night · ภูม · ADR-0019 D-B · master gap
    // P1-5 · cust-07 P0-2). When this bulk flipped any rows to fstatus='7'
    // (ส่งสำเร็จ · delivered), INSERT a tb_user_sales row for each one
    // whose customer's tb_users.coid is in the 4 VIP teams (THADA.VIP /
    // SIN.VIP / OOAEOM.VIP / SWAN). Idempotent — re-flipping the same row
    // won't double-accrue. Best-effort — a failed earn-trigger does NOT
    // roll back the status flip that already succeeded above.
    if (fstatus === "7" && changed.length > 0) {
      try {
        const earnResult = await fireUserSalesEarnTriggerOnDelivery(
          admin,
          changed.map((r) => r.id),
        );
        if (earnResult.errors.length > 0 || earnResult.inserted > 0) {
          logger.info("forwarder.bulk_update_tb", `tb_user_sales earn-trigger inserted=${earnResult.inserted} skipped=${earnResult.skipped} errors=${earnResult.errors.length}`, {
            adminId:  redactId(adminId),
            inserted: earnResult.inserted,
            skipped:  earnResult.skipped,
            errors:   earnResult.errors,
          });
        }
      } catch (err) {
        // Belt-and-suspenders: the helper already swallows its own errors
        // into the result envelope, but a thrown error here would still
        // not roll back the flip — log + continue.
        logger.warn("forwarder.bulk_update_tb", "tb_user_sales earn-trigger threw (bulk update OK, commission rows skipped)", {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    revalidatePath("/admin/forwarders");
    return { ok: true, data: { updated: beforeRows.length } };
  });
}

// ────────────────────────────────────────────────────────────
// V-C2: set bill_to_name_override on a forwarder
// ────────────────────────────────────────────────────────────
// Per cargo-ops-forensics ("ใส่ชื่อบริษัทผู้ซื้อจริงไม่ใช่ผู้ส่งของ"):
// real-world cases where the paying party differs from the shipping
// recipient. Empty string clears the override (NULL in DB). Audited.

const setForwarderBillToOverrideSchema = z.object({
  f_no:     z.string().trim().min(1),
  override: z.string().trim().max(200),     // "" allowed → clear
});
export type SetForwarderBillToOverrideInput = z.infer<typeof setForwarderBillToOverrideSchema>;

export async function adminSetForwarderBillToOverride(
  input: SetForwarderBillToOverrideInput,
): Promise<AdminActionResult<{ f_no: string; bill_to_name_override: string | null }>> {
  const parsed = setForwarderBillToOverrideSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const d = parsed.data;
  const next = d.override.length > 0 ? d.override : null;

  return withAdmin<{ f_no: string; bill_to_name_override: string | null }>(
    ["super", "ops", "accounting"],
    async ({ adminId }) => {
      const admin = createAdminClient();
      // Theme bill-to (2026-06-01): repointed from the rebuilt, prod-empty
      // `forwarders.bill_to_name_override` → the legacy `tb_forwarder.fbilltoname`
      // (migration 0132 · the faithful target). f_no resolves like the [fNo]
      // detail page: numeric → tb_forwarder.id, else fidorco.
      const asNum = Number(d.f_no);
      const isId = Number.isFinite(asNum) && Number.isInteger(asNum) && asNum > 0;
      let q = admin.from("tb_forwarder").select("id, fbilltoname").limit(1);
      q = isId ? q.eq("id", asNum) : q.eq("fidorco", d.f_no);
      const { data: before, error: readErr } = await q.maybeSingle<{ id: number; fbilltoname: string | null }>();
      if (readErr) {
        console.error(`[adminSetForwarderBillToOverride tb_forwarder read] failed`, { code: readErr.code, message: readErr.message, f_no: d.f_no });
        return { ok: false, error: readErr.message };
      }
      if (!before) return { ok: false, error: "not_found" };

      const { error: updErr } = await admin
        .from("tb_forwarder")
        .update({ fbilltoname: next })
        .eq("id", before.id);
      if (updErr) {
        console.error(`[adminSetForwarderBillToOverride update] failed`, { code: updErr.code, message: updErr.message, id: before.id });
        return { ok: false, error: updErr.message };
      }

      await logAdminAction(adminId, "forwarder.set_bill_to_override", "tb_forwarder", String(before.id), {
        f_no:   d.f_no,
        before: before.fbilltoname,
        after:  next,
      });

      revalidatePath(`/admin/forwarders/${d.f_no}`);
      // …/receipt redirects → …/invoice (live tb_forwarder⋈tb_receipt view).
      revalidatePath(`/service-import/${d.f_no}/invoice`);
      return { ok: true, data: { f_no: d.f_no, bill_to_name_override: next } };
    },
  );
}

// ────────────────────────────────────────────────────────────
// Wave 30.6 — box / address label print-status audit lift
// ────────────────────────────────────────────────────────────
// ภูม flag (2026-05-30): the legacy forwarder list's bottom-left toolbar
// has three buttons we were missing — "พิมพ์จากหน้ากล่อง" (box label),
// "พิมพ์ที่อยู่ส่งสินค้า" (address label), and "เพิ่มไปสถานะพิเศษ".
//
// Legacy `pcs-admin/printAll.php` marked a row as printed the moment the
// label PDF was generated:
//   case "1" (กล่อง)      → UPDATE tb_forwarder SET printStatus1='1' WHERE ID=…
//   case "4" (ที่อยู่ส่ง)  → UPDATE tb_forwarder SET printStatus4='1' WHERE ID=…
// Our HTML print pages (/admin/forwarders/print/{box,address}) render the
// labels + window.print(). This Server Action does the parallel flag write
// so the "พิมพ์แล้ว" audit trail matches legacy. The table's print buttons
// call it BEFORE window.open — idempotent (flag set to "1"; a re-print
// re-sets the same value, never toggles off).
//
// printstatus1 / printstatus4 are `character varying(1)` (migration 0081 ·
// default "0") — we write the STRING "1", never the number 1. Existing
// reads compare `=== "1"`.
const markPrintedSchema = z.object({
  fids:  z.array(z.number().int().positive()).min(1).max(300),
  which: z.union([z.literal(1), z.literal(4)]),   // 1 = box label · 4 = address label
});

export async function markForwarderPrinted(
  input: z.infer<typeof markPrintedSchema>,
): Promise<AdminActionResult<{ marked: number }>> {
  const parsed = markPrintedSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const { fids, which } = parsed.data;
  const col = which === 1 ? "printstatus1" : "printstatus4";

  return withAdmin<{ marked: number }>(
    ["super", "ops", "warehouse", "accounting"],
    async ({ adminId }) => {
      const admin = createAdminClient();
      const { error: updErr } = await admin
        .from("tb_forwarder")
        .update({ [col]: "1" })
        .in("id", fids);
      if (updErr) return { ok: false, error: updErr.message };

      await logAdminAction(adminId, "forwarder.mark_printed", "tb_forwarder", "bulk", {
        fids,
        which,
        column: col,
      });

      revalidatePath("/admin/forwarders");
      return { ok: true, data: { marked: fids.length } };
    },
  );
}

// ────────────────────────────────────────────────────────────
// Wave 30.6 — restore forwarder(s) FROM special-hold (fstatus '99')
// ────────────────────────────────────────────────────────────
// The "เพิ่มไปสถานะพิเศษ" move itself is just adminBulkUpdateForwarderTbStatus
// with fstatus="99" (already supported). This is the INVERSE — the
// "ย้ายกลับสถานะปกติ" button shown when the admin is filtering the special
// lane (?status=p). Port of legacy `forwarder.php` removeStatusTo99():
//   SELECT fStatusOld FROM tb_log_forwarder_status
//     WHERE fid=? AND fStatusNew='99'
//     ORDER BY fDateChange DESC LIMIT 1
//   → restore tb_forwarder.fStatus to that previous status
//   → if no such log row, fall back to '3' (กำลังส่งมาไทย)
//   → append a tb_log_forwarder_status row (99 → restored)
// We only act on rows whose CURRENT fstatus is '99' (a row already moved
// back is skipped, not re-flipped). Per-row permission via the same
// canAnyRoleFlipFstatus matrix the bulk action uses — restoring IS a status
// flip, so it obeys the legacy owner-role rules.
const restoreFromSpecialSchema = z.object({
  fids: z.array(z.number().int().positive()).min(1).max(100),
});

export async function adminRestoreForwarderFromSpecial(
  input: z.infer<typeof restoreFromSpecialSchema>,
): Promise<AdminActionResult<{ restored: number }>> {
  const parsed = restoreFromSpecialSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const { fids } = parsed.data;

  return withAdmin<{ restored: number }>(
    ["ops", "super", "manager", "warehouse", "accounting"],
    async ({ adminId }) => {
      const admin = createAdminClient();

      // Snapshot — only rows currently in special-hold are eligible.
      const { data: before, error: readErr } = await admin
        .from("tb_forwarder")
        .select("id, fstatus, userid, fidorco")
        .in("id", fids);
      if (readErr) return { ok: false, error: readErr.message };
      if (!before || before.length === 0) return { ok: false, error: "not_found" };

      const beforeRows = before as unknown as Array<{
        id: number;
        fstatus: string;
        userid: string;
        fidorco: string | null;
      }>;

      const eligible = beforeRows.filter((r) => r.fstatus === "99");
      if (eligible.length === 0) {
        return { ok: false, error: "no_special_rows: ไม่มีรายการที่อยู่ในสถานะพิเศษ (99)" };
      }

      const adminIdSafe = String(adminId).slice(0, 10);

      // Resolve each eligible row's restore-target from its most-recent
      // "→99" log row (fall back '3'). One query per row — the eligible
      // set is small (admin clears a handful of holds at a time).
      const restoreTargets = new Map<number, string>();
      for (const row of eligible) {
        const { data: logRow, error: logErr } = await admin
          .from("tb_log_forwarder_status")
          .select("fstatusold")
          .eq("fid", row.id)
          .eq("fstatusnew", "99")
          .order("fdatechange", { ascending: false })
          .limit(1)
          .maybeSingle<{ fstatusold: string | null }>();
        // §0c: don't silently swallow a log-lookup failure. It's non-fatal
        // here (the fallback '3' is a safe restore target), but log it so a
        // systemic tb_log_forwarder_status problem is visible, not hidden.
        if (logErr) {
          console.error("[adminRestoreForwarderFromSpecial] status-log lookup failed", {
            fid: row.id,
            code: logErr.code,
            message: logErr.message,
          });
        }
        const prev = logRow?.fstatusold;
        // Never restore back INTO "99" (corrupt log) — default to '3'.
        const target = prev && prev !== "99" ? prev : "3";
        restoreTargets.set(row.id, target);
      }

      // Per-row permission — restoring 99 → target is a status flip, so it
      // obeys the same legacy owner-role matrix the bulk action enforces.
      const callerRoles = (await getAdminRoles()) ?? [];
      const forbidden = eligible.filter(
        (r) => !canAnyRoleFlipFstatus(callerRoles, "99", restoreTargets.get(r.id) ?? "3"),
      );
      if (forbidden.length > 0) {
        const sample = forbidden
          .slice(0, 5)
          .map((r) => `#${r.id}(99→${restoreTargets.get(r.id) ?? "3"})`)
          .join(", ");
        const more = forbidden.length > 5 ? ` (และอีก ${forbidden.length - 5} รายการ)` : "";
        return {
          ok: false,
          error: `forbidden_transition: บัญชีของคุณไม่มีสิทธิ์นำรายการต่อไปนี้ออกจากสถานะพิเศษ ${sample}${more}`,
        };
      }

      // Group by target so we issue one UPDATE per distinct restore status.
      const byTarget = new Map<string, number[]>();
      for (const r of eligible) {
        const t = restoreTargets.get(r.id) ?? "3";
        const arr = byTarget.get(t) ?? [];
        arr.push(r.id);
        byTarget.set(t, arr);
      }

      const nowIso = new Date().toISOString();
      for (const [target, ids] of byTarget) {
        const { error: updErr } = await admin
          .from("tb_forwarder")
          .update({ fstatus: target, fdateadminstatus: nowIso, adminidupdate: adminIdSafe })
          .in("id", ids);
        if (updErr) return { ok: false, error: updErr.message };
      }

      await logAdminAction(adminId, "forwarder.restore_from_special", "tb_forwarder", "bulk", {
        fids:    eligible.map((r) => r.id),
        targets: Object.fromEntries(restoreTargets),
      });

      // Append the inverse status-log row per restored item (99 → target).
      // Best-effort — a log failure does NOT roll back the UPDATEs above.
      for (const r of eligible) {
        await appendStatusLog(admin, r.id, "99", restoreTargets.get(r.id) ?? "3", adminIdSafe);
      }

      revalidatePath("/admin/forwarders");
      return { ok: true, data: { restored: eligible.length } };
    },
  );
}

// ════════════════════════════════════════════════════════════
// adminSaveForwarderNote — forwarder.php saveNote (L1166-1231)
// ════════════════════════════════════════════════════════════
//
// re-sweep A2 #7 / P1-6. A NOTE-ONLY save (no status change) on a
// tb_forwarder row, WITH the push that legacy fired. The existing
// `adminBulkUpdateForwarderTbStatus` pushes only when fstatus changes,
// so a pure note edit never reached the customer/staff — this closes
// that gap. (The rebuilt-table `adminUpdateForwarder` writes the dead
// `forwarders.note_admin` and is unrelated.)
//
// Legacy flow (verbatim L1166-1231):
//   fNoteUser=1  → "เห็นเฉพาะแอดมิน" : fNoteUserRead=''   + push to staff LINE group
//   fNoteUser≠1  → "ลูกค้าและแอดมิน" : fNoteUserRead='1'  + push to the customer
//   UPDATE tb_forwarder SET fNoteDate=NOW(), fNoteUser, fNoteUserRead,
//                           fNote, adminIDUpdate WHERE ID=<ID>
//
// Pacred notify mapping (legacy LINE-Notify is dead — Apr-2025 EOL):
//   - admin-only note  → notifyStaffGroup() (no-op until LINE_STAFF_GROUP_ID
//     is set — same pluggable pattern as the yuan staff-notify, P1-24).
//   - customer note    → sendNotification() (in-app + LINE OA push + email),
//     resolving the legacy userid → profiles.id via the tb-users resolver.
//
// fnote=text · fnoteuser=varchar(1) NOT NULL · fnoteuserread=varchar(1)
// NOT NULL · fnotedate=timestamp · adminidupdate=varchar(10) NOT NULL
// (all lowercase — tb_forwarder is NOT in the camelCase family).

const saveForwarderNoteSchema = z.object({
  fID: z.union([z.string(), z.number()]).transform((v) => Number(v)).refine(
    (n) => Number.isFinite(n) && n > 0,
    { message: "fID ไม่ถูกต้อง" },
  ),
  /** หมายเหตุ — legacy `fNote` (text). Empty string allowed (legacy "แก้ไขเรียบร้อยแล้ว"). */
  fNote: z.string().trim().max(5000).default(""),
  /** "1" = เห็นเฉพาะแอดมิน · anything else = ลูกค้าและแอดมิน (legacy fNoteUser varchar(1)). */
  fNoteUser: z.union([z.string(), z.number()]).transform((v) => String(v).trim()).default("0"),
});
export type SaveForwarderNoteInput = z.input<typeof saveForwarderNoteSchema>;

export async function adminSaveForwarderNote(
  input: SaveForwarderNoteInput,
): Promise<AdminActionResult<{ fID: number; adminOnly: boolean }>> {
  const parsed = saveForwarderNoteSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const { fID, fNote } = parsed.data;
  const adminOnly = parsed.data.fNoteUser === "1";

  // Roles: a note can be added by any ops-floor role (legacy gated only on
  // being logged into pcs-admin). Mirror the wide bulk-update union.
  return withAdmin<{ fID: number; adminOnly: boolean }>(
    ["ops", "super", "manager", "warehouse", "accounting", "driver"],
    async ({ adminId }) => {
      const admin = createAdminClient();

      // Read the row for userid + identifiers (push targeting).
      const { data: row, error: rowErr } = await admin
        .from("tb_forwarder")
        .select("id, userid, fidorco")
        .eq("id", fID)
        .maybeSingle<{ id: number; userid: string | null; fidorco: string | null }>();
      if (rowErr) return { ok: false, error: rowErr.message };
      if (!row) return { ok: false, error: "not_found" };

      // Legacy fNoteUserRead: admin-only note → '' (customer never sees it);
      // customer note → '1' (customer has an UNREAD note).
      const fNoteUserRead = adminOnly ? "" : "1";
      const adminIdSafe = String(adminId).slice(0, 10);

      const { error: updErr } = await admin
        .from("tb_forwarder")
        .update({
          fnote:         fNote || null,
          fnoteuser:     adminOnly ? "1" : "0",
          fnoteuserread: fNoteUserRead,
          fnotedate:     new Date().toISOString(),
          adminidupdate: adminIdSafe,
        })
        .eq("id", fID);
      if (updErr) return { ok: false, error: updErr.message };

      await logAdminAction(adminId, "forwarder.save_note", "tb_forwarder", String(fID), {
        admin_only: adminOnly,
        has_note:   fNote.length > 0,
      });

      const fNo = row.fidorco ?? String(fID);
      const noteLine = fNote || "แก้ไขเรียบร้อยแล้ว";

      // Push — best-effort, never blocks the note save.
      if (adminOnly) {
        // Legacy fired the hardcoded LINE-Notify staff token (dead). Pacred
        // routes admin-only notes to the staff LINE OA group (no-op until
        // LINE_STAFF_GROUP_ID is configured — see staff-group.ts).
        void notifyStaffGroup(
          `รหัสสมาชิก : ${row.userid ?? "-"}\nรายละเอียด : ${noteLine}\nจากแอดมิน : ${adminIdSafe}`,
          {
            title:    `📝 หมายเหตุแอดมิน — ออเดอร์ ${fNo}`,
            url:      `/admin/forwarders/${fNo}`,
            urlLabel: "เปิดออเดอร์",
          },
        );
      } else {
        // Customer-visible note → in-app + LINE OA push + email.
        const legacyUserId = String(row.userid ?? "");
        if (legacyUserId) {
          try {
            const profileId = await resolveProfileIdForLegacyUserid(legacyUserId);
            if (profileId) {
              await sendNotification(profileId, {
                category:       "forwarder",
                severity:       "info",
                title:          `ฝากนำเข้า ${fNo} มีหมายเหตุใหม่`,
                body:           noteLine,
                link_href:      `/service-import/${fNo}`,
                reference_type: "forwarder",
                reference_id:   String(fID),
              });
            }
          } catch (err) {
            logger.warn("forwarder.save_note", "customer notify failed (note saved)", {
              fid:   fID,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }
      }

      revalidatePath("/admin/forwarders");
      revalidatePath(`/admin/forwarders/${fNo}`);
      return { ok: true, data: { fID, adminOnly } };
    },
  );
}
