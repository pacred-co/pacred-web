"use server";

import { revalidatePath } from "next/cache";
import { bustAdminChrome } from "@/lib/cache/revalidate-chrome";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";
import { advanceLinkedShopOrder } from "@/lib/admin/advance-linked-shop-order";
import { transportModeFromCabinetName } from "@/lib/forwarder/cabinet-transport";
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

// ─────────────────────────────────────────────────────────────────────────────
// Rebuilt → legacy field mappings used by the Tier-A pivot below.
// adminUpdateForwarder accepts rebuilt-style status/warehouse strings (the
// UI in /admin/forwarders/[fNo]/update-form.tsx still ships them) but writes
// `tb_forwarder` columns — the legacy table where the 47k+ real rows live.
// ─────────────────────────────────────────────────────────────────────────────
const REBUILT_TO_TB_STATUS: Record<typeof STATUSES[number], "1"|"2"|"3"|"4"|"5"|"6"|"7"|"99"> = {
  pending_payment:  "5",   // รอชำระเงิน (legacy '5')
  shipped_china:    "3",   // ออกจากจีน → in_transit to TH (legacy '3')
  in_transit:       "3",
  arrived_thailand: "4",   // ถึงไทยแล้ว
  out_for_delivery: "6",   // เตรียมส่ง / driver assignable
  delivered:        "7",   // ส่งสำเร็จ (terminal)
  cancelled:        "99",  // สถานะพิเศษ / soft-cancel
};
// Per migration 0081 L1779: fwarehousename character varying(1)
//   1=แสง, 2=CTT, 3=MK, 4=MX, 5=JMF, 6=GOGO, 7=CargoCenter, 8=MOMO
const PARTNER_WAREHOUSE_TO_TB: Record<"sang"|"ctt"|"mk"|"mx"|"jmf", string> = {
  sang: "1",
  ctt:  "2",
  mk:   "3",
  mx:   "4",
  jmf:  "5",
};

export async function adminUpdateForwarder(input: UpdateForwarderInput): Promise<AdminActionResult> {
  const parsed = updateForwarderSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  return withAdmin(["ops"], async ({ adminId }) => {
    const admin = createAdminClient();

    // ─────────────────────────────────────────────────────────────────────────
    // 🚨 Tier-A "silent dead-write" fix (2026-06-02 · master-fidelity #1 pattern):
    //   Prior implementation read + wrote `.from("forwarders")` — the REBUILT
    //   UUID table, EMPTY on prod. Every admin "บันทึก" press in
    //   /admin/forwarders/[fNo]/update-form.tsx showed green toast while the
    //   real `tb_forwarder` row sat untouched (47k+ live rows). Staff
    //   reported "edit ไม่ติด".
    //
    // Fix: pivot to `tb_forwarder` (lookup by fidorco, the legacy f_no equivalent
    //   used by /admin/forwarders/[fNo]/page.tsx renderLegacyForwarderView).
    //   For status changes we DELEGATE to the canonical bulk action so the
    //   matching faithful side-effects fire (date stamps · tb_log_forwarder_status
    //   append · status-change notification with userid→profile_id resolution ·
    //   per-role canAnyRoleFlipFstatus matrix). For pure metadata changes
    //   (tracking_chn / tracking_th / cabinet_number / partner_warehouse /
    //   note_admin) we write tb_forwarder directly with the legacy column names.
    //
    // The UI passes rebuilt-style status strings ("pending_payment", …) and
    // rebuilt warehouse codes ("sang"/"ctt"/…) — we map them to legacy
    // numeric chars via REBUILT_TO_TB_STATUS + PARTNER_WAREHOUSE_TO_TB above.
    // ─────────────────────────────────────────────────────────────────────────

    // Fetch existing tb_forwarder row by fidorco (legacy f_no analog).
    // Returns full state for diff (status change detection, rollback note
    // merging, notification payload).
    const { data: existing, error: existingErr } = await admin
      .from("tb_forwarder")
      .select("id, fidorco, userid, fstatus, fnote")
      .eq("fidorco", d.f_no)
      .maybeSingle<{ id: number; fidorco: string | null; userid: string; fstatus: string; fnote: string | null }>();
    if (existingErr) {
      console.error("[forwarders mutation lookup tb_forwarder] f_no=", d.f_no, { code: existingErr.code, message: existingErr.message });
      return { ok: false, error: `db_error:${existingErr.code}` };
    }
    if (!existing) return { ok: false, error: "not_found" };

    // Tier-A safety: adminidupdate is varchar(10) — match Wave 23 P0 5254f8d.
    const adminIdSafe = String(adminId).slice(0, 10);
    const nowIso = new Date().toISOString();

    let isRollback   = false;
    let rolledNote: string | undefined;

    // ── A. Status change branch (delegate to faithful bulk action) ─────────
    let statusChanged = false;
    if (d.status) {
      const tbStatus = REBUILT_TO_TB_STATUS[d.status];
      if (tbStatus !== existing.fstatus) {
        statusChanged = true;
        // Rebuilt-side rollback detection mirrored to legacy semantics. We
        // compute it against the ORIGINAL rebuilt-string the UI sent so the
        // user-facing reason wording stays consistent with what the operator
        // typed. (Mapping back to the rebuilt label for existing.fstatus is
        // not needed — we already know `d.status` is the target and we only
        // care whether it's a backward move.)
        // Inferred rebuilt-equivalent of the legacy fstatus for the reverse-
        // mapping check (best-effort — uses TB_TO_REBUILT lookup below).
        const reverseStatus = (() => {
          for (const [k, v] of Object.entries(REBUILT_TO_TB_STATUS)) {
            if (v === existing.fstatus) return k as typeof STATUSES[number];
          }
          return undefined;
        })();
        if (reverseStatus) {
          isRollback = isStatusRollback(reverseStatus, d.status);
          if (isRollback) {
            const reason = (d.rollback_reason ?? "").trim();
            if (reason.length < 3) {
              return {
                ok: false,
                error: `rollback ${reverseStatus} → ${d.status} ต้องระบุเหตุผล (≥3 ตัว) — ใส่ใน rollback_reason`,
              };
            }
            rolledNote = `[ROLLBACK ${reverseStatus}→${d.status}] ${reason}`
              + (existing.fnote && existing.fnote !== d.note_admin
                  ? `\n${existing.fnote}` : (d.note_admin ? `\n${d.note_admin}` : ""));
          }
        }

        // Delegate to the faithful bulk action. It enforces the per-role
        // canAnyRoleFlipFstatus matrix, stamps fdatestatusN, appends
        // tb_log_forwarder_status, and fires the customer notification.
        const bulkRes = await adminBulkUpdateForwarderTbStatus({
          fids:    [existing.id],
          fstatus: tbStatus,
          // Pass through any cabinet number that came with this update so
          // the faithful action handles the fdatecontainerclose back-fill
          // (Wave 24 #192 logic) in the SAME write — no double UPDATE.
          ...(d.cabinet_number != null ? { cabinet_number: d.cabinet_number } : {}),
          ...(d.tracking_th    != null ? { tracking_th:    d.tracking_th    } : {}),
          // fnote: rollback note prepend, else the user's note_admin
          ...(rolledNote != null
              ? { fnote: rolledNote }
              : (d.note_admin != null ? { fnote: d.note_admin } : {})),
        });
        if (!bulkRes.ok) return { ok: false, error: bulkRes.error };
      }
    }

    // ── B. Metadata-only branch (no status change) ─────────────────────────
    // Status delegate above already handled cabinet/tracking/note when it
    // ran — we only fire this when status didn't change OR the delegate
    // didn't run. For tracking_chn (which the bulk schema doesn't accept)
    // and partner_warehouse we always need this branch.
    const metaUpdate: Record<string, unknown> = {};
    if (d.tracking_chn != null) metaUpdate.ftrackingchn = d.tracking_chn || "";
    if (d.partner_warehouse != null) {
      metaUpdate.fwarehousename = PARTNER_WAREHOUSE_TO_TB[d.partner_warehouse];
    }
    // If status DIDN'T change, the delegate above never ran — write the
    // metadata fields that overlap (cabinet/tracking_th/note) here too.
    if (!statusChanged) {
      if (d.cabinet_number != null) metaUpdate.fcabinetnumber = d.cabinet_number || "";
      if (d.tracking_th    != null) metaUpdate.ftrackingth    = d.tracking_th    || "-";
      if (rolledNote != null) {
        metaUpdate.fnote = rolledNote;
      } else if (d.note_admin != null && !isRollback) {
        metaUpdate.fnote = d.note_admin || null;
      }
    }

    if (Object.keys(metaUpdate).length > 0) {
      metaUpdate.adminidupdate    = adminIdSafe;
      metaUpdate.fdateadminstatus = nowIso;

      const { error: metaErr } = await admin
        .from("tb_forwarder")
        .update(metaUpdate)
        .eq("id", existing.id);
      if (metaErr) {
        console.error(`[forwarders metadata UPDATE tb_forwarder] id=${existing.id}`, {
          code: metaErr.code, message: metaErr.message,
        });
        return { ok: false, error: metaErr.message };
      }
    }

    // ── C. Audit log (every mutation, regardless of status change) ─────────
    await logAdminAction(
      adminId,
      isRollback ? "forwarder.rollback" : "forwarder.update",
      "tb_forwarder",
      String(existing.id),
      {
        f_no:    d.f_no,
        before:  { fstatus: existing.fstatus },
        after:   {
          ...(d.status ? { fstatus: REBUILT_TO_TB_STATUS[d.status] } : {}),
          ...metaUpdate,
        },
        ...(isRollback && d.rollback_reason ? { rollback_reason: d.rollback_reason.trim() } : {}),
      },
    );

    revalidatePath("/admin/forwarders");
    revalidatePath(`/admin/forwarders/${d.f_no}`);
    // Forwarder fstatus changed → the forwarder queue badges changed; refresh
    // the admin sidebar.
    bustAdminChrome();
    return { ok: true };
  });
}

// ── Bulk status update (TOMBSTONED 2026-06-02 · Tier-A "silent dead-write" fix) ──
//
// 🚨 Why this is dead:
//   The original adminBulkUpdateForwarderStatus wrote `.from("forwarders")` —
//   the REBUILT UUID table, EMPTY on prod. Every "bulk status update" was a
//   silent no-op (0 rows matched → 0 rows updated → no error → green toast).
//   Zero callers in app/ — this exported function existed only as dead code
//   from the pre-D1 era.
//
// Replacement: `adminBulkUpdateForwarderTbStatus` (defined below at L380+).
//   Writes `tb_forwarder.fstatus` faithfully · stamps fdatestatusN ·
//   appends tb_log_forwarder_status · enforces canAnyRoleFlipFstatus per-row
//   · fires customer notifications with userid→profile_id resolution.
//
// The export is kept as a thin reject-all stub so any future caller that
// reimports it gets a clear error rather than a silent no-op. To call
// the faithful action, use `adminBulkUpdateForwarderTbStatus({ fids, fstatus })`.

const bulkSchema = z.object({
  f_nos:  z.array(z.string()).min(1).max(100),
  status: z.enum(STATUSES),
});

export async function adminBulkUpdateForwarderStatus(
  _input: z.infer<typeof bulkSchema>,
): Promise<AdminActionResult & { updated?: number }> {
  // Reject loudly — silent dead-write is the bug we're closing.
  // Callers should use adminBulkUpdateForwarderTbStatus({ fids, fstatus }) instead.
  console.warn(
    "[forwarders] adminBulkUpdateForwarderStatus called — this is the tombstoned rebuilt-table writer. "
    + "Use adminBulkUpdateForwarderTbStatus({ fids, fstatus }) — writes tb_forwarder (the 47k+ live rows).",
  );
  return {
    ok: false,
    error: "tombstoned: use adminBulkUpdateForwarderTbStatus({ fids, fstatus }) — writes tb_forwarder",
  };
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
  // B4 · backlog #259 (migration 0150 · 2026-06-08): per-row lock flag
  // that tells MOMO/partner sync to SKIP fcabinetnumber on this row.
  // Defensive belt — when admin manually corrects a cabinet that MOMO
  // got wrong (e.g. 2026-05-29 routing-batch incident), checking this
  // box prevents the next cron from overwriting the fix. Undefined =
  // don't touch (existing rows keep their flag); explicit true/false
  // = write the new value.
  cabinet_locked: z.boolean().optional(),
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
  const { fids, fstatus, cabinet_number, tracking_th, fnote, cabinet_locked } = parsed.data;

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
    // date back-fill (Wave 24 #192 · 2026-05-27 ดึก · see comment below) +
    // the cabinet-lock audit (B4 · backlog #259 · 2026-06-08).
    const { data: before, error: readErr } = await admin
      .from("tb_forwarder")
      .select("id, fstatus, userid, fidorco, fcabinetnumber, fdatecontainerclose, fcabinet_locked, reforder, ftrackingchn")
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
      fcabinet_locked: boolean | null;
      reforder: string | null;
      ftrackingchn: string | null;
    }>;

    // ── V-C3 — "ตัดตู้" enforce + explain (2026-06-10) ─────────────────────
    // Forensics C3 (docs/audit/cargo-ops-forensics-2026-05-16.md §C): assigning
    // parcels to a container that's already been cut/locked failed SILENTLY in
    // legacy ("ค้นหาไม่เจอ"). The model here: fcabinet_locked=true means staff
    // deliberately locked the cabinet (migration 0150 — protects a manual
    // correction from partner-sync overwrite). Until now that lock only fenced
    // out MOMO/partner sync — an admin's OWN bulk-bar cabinet-assign would
    // silently CLOBBER a locked cabinet. Block it instead, with a clear Thai
    // message naming the locked rows, so the operator unlocks deliberately
    // first. Only fires when the caller is actually CHANGING the cabinet on a
    // locked row → unlocked rows + lock-toggle-only calls are unaffected
    // (backward-safe: prod has 0 locked rows until staff lock one).
    if (cabinet_number !== undefined && cabinet_number.trim() !== "") {
      const newCabinet = cabinet_number.trim();
      const lockedConflicts = beforeRows.filter(
        (r) =>
          r.fcabinet_locked === true &&
          (r.fcabinetnumber ?? "").trim() !== "" &&
          (r.fcabinetnumber ?? "").trim() !== newCabinet,
      );
      if (lockedConflicts.length > 0) {
        const sample = lockedConflicts
          .slice(0, 5)
          .map((r) => `#${r.id} (ตู้เดิม ${r.fcabinetnumber})`)
          .join(", ");
        const more =
          lockedConflicts.length > 5
            ? ` และอีก ${lockedConflicts.length - 5} รายการ`
            : "";
        return {
          ok: false,
          error:
            `cabinet_locked: รายการต่อไปนี้ถูกล็อกเลขตู้ไว้ (กันการเขียนทับ) — ${sample}${more}. ` +
            `กรุณาปลดล็อกตู้ของรายการนั้นก่อน ถ้าต้องการย้ายไปตู้ "${newCabinet}" จริง ๆ`,
        };
      }
    }

    // 2026-06-05 (ภูม flag — "ถ้าใส่เลขตู้ ก็เปลี่ยนสถานะให้เลยงี้ได้มั้ย"):
    // forward-only fstatus auto-advance based on which fields the caller
    // actually populated. Mirrors the MOMO partner-sync rule
    // (lib/integrations/momo-isolated/propagate.ts:71-90):
    //   - cabinet_number set (ลงตู้แล้ว)           → fstatus ≥ "3" กำลังส่งมาไทย
    //   - tracking_th  set (พัสดุไทย · ออกขนส่ง)  → fstatus ≥ "6" เตรียมส่ง
    // The admin no longer has to remember to bump the dropdown when they
    // type a cabinet — typing the field IS the signal.
    //
    // Forward-only guard: if ANY row in the batch is already past the
    // implied phase, we KEEP the admin's explicitly-submitted fstatus
    // (= no auto-advance) so a single mistyped cabinet on a delivered row
    // can't roll a "7" back to a "3". The form is single-row in practice
    // (tb-action-panel) so this edge only kicks in for the bulk-bar; the
    // bulk-bar doesn't expose cabinet/tracking inputs → derivedFstatus
    // stays equal to fstatus there.
    const FSTATUS_ORDER_AUTOADV: Record<string, number> = {
      "1": 1, "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "99": 0,
    };
    const rankFs = (v: string): number => FSTATUS_ORDER_AUTOADV[v] ?? 0;
    let derivedFstatus = fstatus;
    if (cabinet_number !== undefined && cabinet_number.trim() !== "") {
      if (rankFs(derivedFstatus) < 3) derivedFstatus = "3";
    }
    if (tracking_th !== undefined && tracking_th.trim() !== "" && tracking_th.trim() !== "-") {
      if (rankFs(derivedFstatus) < 6) derivedFstatus = "6";
    }
    if (derivedFstatus !== fstatus) {
      // Forward-only safety: if any row is already at a later phase than
      // the derived target, skip the auto-advance (use admin's explicit
      // dropdown choice instead — keeps the bulk-bar behavior intact).
      const wouldDemote = beforeRows.some(
        (r) => rankFs(r.fstatus) > rankFs(derivedFstatus),
      );
      if (wouldDemote) derivedFstatus = fstatus;
    }

    // Wave 26 G5 (2026-05-28 ดึก) — status-transition role gate.
    // Per-row check: every row in the bulk must satisfy the legacy
    // owner-role matrix for its own (from → to) transition. Mixed-status
    // bulks (e.g. 3 rows at fstatus=4 + 1 row at fstatus=99 → fstatus=5)
    // hit different matrix entries → the 99 row needs super/manager even
    // if the rest don't. Rather than partial-process (which the bulk-bill
    // action does), this top-level any-vs-all bulk REFUSES the whole batch
    // when any row fails — caller can split and retry.
    //
    // 2026-06-05: gate checked against `derivedFstatus` (the value we'll
    // actually write) so the auto-advance can't bypass the role matrix.
    const callerRoles = (await getAdminRoles()) ?? [];
    const forbidden = beforeRows.filter(
      (r) => !canAnyRoleFlipFstatus(callerRoles, r.fstatus, derivedFstatus),
    );
    if (forbidden.length > 0) {
      const sample = forbidden.slice(0, 5).map((r) => `#${r.id}(${r.fstatus}→${derivedFstatus})`).join(", ");
      const more = forbidden.length > 5 ? ` (และอีก ${forbidden.length - 5} รายการ)` : "";
      return {
        ok: false,
        error: `forbidden_transition: บัญชีของคุณไม่มีสิทธิ์เปลี่ยนสถานะรายการต่อไปนี้ ${sample}${more}`,
      };
    }

    const nowIso = new Date().toISOString();
    const dateCol = TB_STATUS_DATE_COL[derivedFstatus];
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
      fstatus:          derivedFstatus,
      fdateadminstatus: nowIso,
      adminidupdate:    adminIdSafe,
      ...(dateCol ? { [dateCol]: nowIso } : {}),
      // Optional fields — only included when caller explicitly passed them.
      // Empty-string from the form means "explicitly clear" (legacy NOT NULL
      // varchar columns default to "" / "-"); undefined means "don't touch".
      ...(cabinet_number !== undefined ? { fcabinetnumber: cabinet_number } : {}),
      // Auto-derive transport mode from the cabinet NAME when assigning one
      // (GZS=เรือ · GZE/EK=รถ · GZA=อากาศ · owner 2026-06-19) so ftransporttype —
      // which the cost-basis (car vs ship) + the list filter read — is always
      // correct without hand-entry. Only when the name carries a mode token.
      ...(cabinet_number !== undefined && transportModeFromCabinetName(cabinet_number)
        ? { ftransporttype: transportModeFromCabinetName(cabinet_number) }
        : {}),
      ...(tracking_th    !== undefined ? { ftrackingth: tracking_th || "-" } : {}),
      ...(fnote          !== undefined ? { fnote: fnote || null }            : {}),
      // B4 · backlog #259 (migration 0150 · 2026-06-08): only persist the
      // lock flag when the caller explicitly passed it. The role gate is the
      // SAME as for cabinet_number (already checked above by withAdmin +
      // canAnyRoleFlipFstatus) — anyone allowed to touch the cabinet is
      // allowed to lock/unlock it.
      ...(cabinet_locked !== undefined ? { fcabinet_locked: cabinet_locked } : {}),
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

    // ─── Shop-order advance (2026-06-19 · unstick ฝากสั่งซื้อ on the MANUAL path) ──
    // When a forwarder LINKED to a ฝากสั่งซื้อ order reaches the china warehouse or
    // beyond (fstatus ≥ 2), advance the linked tb_header_order 4 (รอร้านจีนจัดส่ง)
    // → 40 (ถึงโกดังจีน) so the shop order doesn't stay stuck. The helper links by
    // reforder OR by the recorded China tracking (MOMO-created rows have
    // reforder=""). UNGATED here — unlike the MOMO cron's Option-B statusGate —
    // because this is a DELIBERATE admin status change + status-only (no money).
    // Best-effort (errors are logged inside the helper; never roll back).
    const shopOrdersAdvanced: string[] = [];
    if (rankFs(derivedFstatus) >= rankFs("2")) {
      const seenKey = new Set<string>();
      for (const row of beforeRows) {
        const key = (row.reforder?.trim() || row.ftrackingchn?.trim() || "").toLowerCase();
        if (!key || seenKey.has(key)) continue;
        seenKey.add(key);
        const advanced = await advanceLinkedShopOrder(
          admin,
          { reforder: row.reforder, ftrackingchn: row.ftrackingchn },
          nowIso,
        );
        if (advanced) shopOrdersAdvanced.push(advanced);
      }
    }

    // B4 · backlog #259 (2026-06-08): capture the lock-flag changes so staff
    // can audit "who locked/unlocked which cabinet · when · why" — important
    // because the lock changes what the next MOMO cron will do for the row.
    const lockChanges =
      cabinet_locked === undefined
        ? undefined
        : beforeRows
            .filter((r) => (r.fcabinet_locked === true) !== cabinet_locked)
            .map((r) => ({
              id: r.id,
              from: r.fcabinet_locked === true,
              to:   cabinet_locked,
              cabinet_at_lock: r.fcabinetnumber ?? null,
            }));

    await logAdminAction(adminId, "forwarder.bulk_update_tb", "tb_forwarder", "bulk", {
      fids,
      before_statuses: beforeRows.map((r) => ({ id: r.id, fstatus: r.fstatus })),
      after:           {
        fstatus:           derivedFstatus,
        submitted_fstatus: fstatus !== derivedFstatus ? fstatus : undefined,
        auto_advanced:     fstatus !== derivedFstatus ? true : undefined,
        cabinet_locked:    cabinet_locked,
      },
      ...(lockChanges && lockChanges.length > 0 ? { cabinet_lock_changes: lockChanges } : {}),
      ...(shopOrdersAdvanced.length > 0 ? { shop_orders_advanced_to_40: shopOrdersAdvanced } : {}),
    });

    // G8 (2026-05-28 ดึก): append one tb_log_forwarder_status row per
    // changed row. Legacy forwarder.php:1284 wrote this log inside the
    // admin-dropdown path; our bulk action was missing it. Best-effort —
    // a log insert failure does NOT roll back the UPDATE that already
    // succeeded above. The legacy report screens (status-history view)
    // depend on this trail being populated.
    const changed = beforeRows.filter((r) => r.fstatus !== derivedFstatus);
    for (const row of changed) {
      await appendStatusLog(admin, row.id, row.fstatus, derivedFstatus, adminIdSafe);
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
              status:      derivedFstatus,
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
          fstatus:       derivedFstatus,
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
    if (derivedFstatus === "7" && changed.length > 0) {
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
    // Bulk forwarder fstatus change → the forwarder queue badges changed;
    // refresh the admin sidebar.
    bustAdminChrome();
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
      // Forwarders restored from special status (99→prior) → forwarder queue
      // badges changed; refresh the admin sidebar.
      bustAdminChrome();
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
      // Forwarder note changed → the "หมายเหตุนำเข้า" note-queue badge (counts
      // fnote <> '') changed; refresh the admin sidebar.
      bustAdminChrome();
      return { ok: true, data: { fID, adminOnly } };
    },
  );
}
