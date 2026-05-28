"use server";

// ─────────────────────────────────────────────────────────────────────────────
// V-G1 — Bulk forwarder actions (port-spec admin-polish-bundle.md §V-G1).
// ─────────────────────────────────────────────────────────────────────────────
//
// Legacy parity:
//   PHP `member/pcs-admin/forwarder-action.php` (L1-1192) drives the multi-row
//   admin forwarder list — DataTables w/ row checkboxes + AJAX shims that POST
//   the selected forwarder IDs to per-action endpoints under
//   `member/pcs-admin/include/pages/forwarder-action/` and
//   `member/pcs-admin/include/pages/forwarder/`. Concretely:
//
//     - Status flip (q=1..7 tabs) — `forwarder-action.php` L162-189 dispatches
//       a `fStatus='<n>'` UPDATE per the staff-picked tab; this is the
//       "เปลี่ยน status" bulk path the spec calls out.
//     - Driver assignment — `forwarder-driver.php` + `forwarder-driver-w.php`
//       chain off the same selection, writing `tb_forwarder_driver_item`
//       rows N×1 in one form post.
//     - Bulk cancel — `forwarder/getListForwarder.php` (L17, `moveStatusTo99`)
//       collects selected IDs into a hidden input and POSTs back to
//       `forwarder/?q=5` for the "ย้ายไปสถานะพิเศษ" (= cancel) handler.
//
// Implementation notes (per task constraints):
//   - Loop per row using each row's existing single-row action where one
//     exists (`adminUpdateForwarder` for status flips). One audit row per
//     affected forwarder — preserves grain so reports can reconstruct who
//     touched what when.
//   - Return shape `{ succeeded: string[]; failed: { fNo, error }[] }` so the
//     UI can render partial-failure state (mirror of the legacy "ทุกรายการ
//     ต้องอยู่สถานะเดียวกัน" + per-row red-row treatment in the modal).
//   - No DB migrations: every action wraps existing tables (`forwarders`,
//     `forwarder_driver`, `admin_audit_log`).
//   - RBAC per spec: status/cancel → super|ops; driver assignment →
//     super|ops|warehouse (warehouse staff manage the depot-side driver
//     dispatch in the legacy backoffice — see d1-audit-backoffice-2026-05-24
//     MOMO LCL tracking). `super` is implicit in `withAdmin`.
//
// Read-with:
//   - `actions/admin/forwarders.ts` (single-row update logic — loop reuses it)
//   - `actions/admin/forwarder-drivers.ts` (single-row driver assignment —
//     this file mirrors its insert + notify path but in a bulk loop)

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";
import { adminUpdateForwarder } from "./forwarders";
import { sendNotification } from "@/lib/notifications";

// ── Shared types ──────────────────────────────────────────────────────────────

const STATUSES = [
  "pending_payment","shipped_china","in_transit","arrived_thailand",
  "out_for_delivery","delivered","cancelled",
] as const;
export type ForwarderStatus = (typeof STATUSES)[number];

export type BulkForwarderResult = {
  succeeded: string[];                          // list of f_no values that updated cleanly
  failed:    { fNo: string; error: string }[];  // list of f_no values + reason for fail
};

// Common limits — bulk operations are intentionally capped to keep per-request
// load bounded (mirrors the existing single-status bulk's `.max(100)`).
const MAX_BULK = 100;

const baseBulkSchema = z.object({
  forwarderIds: z.array(z.string().trim().min(1)).min(1).max(MAX_BULK),
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. bulkUpdateStatus
// ─────────────────────────────────────────────────────────────────────────────
//
// Loops `adminUpdateForwarder({ f_no, status, note_admin? })` once per row.
// The single-row action already does:
//   - rollback-gate check (V-A2: requires `rollback_reason` ≥ 3 chars when
//     going backward in lifecycle — caller must pass `note` if any selected
//     row needs rollback, else those rows fail with a clear message)
//   - status-date stamping (`date_shipped_china`, `date_in_transit`, etc.)
//   - per-row audit (`forwarder.update` OR `forwarder.rollback`) + customer
//     notification — both inherited verbatim
//
// So this wrapper only:
//   - re-validates input shape
//   - iterates + buckets results into succeeded/failed
//   - revalidates the list path ONCE (not per row — saves N RSC re-renders)
// ─────────────────────────────────────────────────────────────────────────────

const bulkUpdateStatusSchema = baseBulkSchema.extend({
  newStatus: z.enum(STATUSES),
  note:      z.string().trim().max(500).optional(),
});

export async function bulkUpdateStatus(
  forwarderIds: string[],
  newStatus: ForwarderStatus,
  note?: string,
): Promise<AdminActionResult<BulkForwarderResult>> {
  const parsed = bulkUpdateStatusSchema.safeParse({ forwarderIds, newStatus, note });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  return withAdmin<BulkForwarderResult>(["ops"], async () => {
    const succeeded: string[] = [];
    const failed:    { fNo: string; error: string }[] = [];

    for (const fNo of d.forwarderIds) {
      // Reuse single-row action — inherits rollback guard + audit + notify.
      // The `rollback_reason` field doubles as the "bulk note" when going
      // backward; the legacy bulk modal forces the same single reason on
      // every selected row, so this mapping is faithful.
      const res = await adminUpdateForwarder({
        f_no:             fNo,
        status:           d.newStatus,
        rollback_reason:  d.note,
        note_admin:       d.note,
      });
      if (res.ok) succeeded.push(fNo);
      else        failed.push({ fNo, error: res.error });
    }

    revalidatePath("/admin/forwarders");
    return { ok: true, data: { succeeded, failed } };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. bulkAssignDriver
// ─────────────────────────────────────────────────────────────────────────────
//
// Faithful port of `forwarder-driver.php` multi-select: pick N forwarders + 1
// driver, insert N `forwarder_driver` rows in status=1 (waiting-to-accept).
// Per-row guards match the single-row `adminAssignDriverToForwarder`:
//   - Forwarder must exist
//   - Driver `admins.profile_id` must hold `role='driver'` AND `is_active=true`
//   - No open (status 1 or 2) assignment may already exist for that forwarder
//
// Driver verified ONCE (one round-trip instead of N). Failures stay per-row.
// ─────────────────────────────────────────────────────────────────────────────

const bulkAssignDriverSchema = baseBulkSchema.extend({
  driverAdminId: z.string().uuid("driverAdminId ต้องเป็น UUID ของ profile (admin.profile_id)"),
});

export async function bulkAssignDriver(
  forwarderIds: string[],
  driverAdminId: string,
): Promise<AdminActionResult<BulkForwarderResult>> {
  const parsed = bulkAssignDriverSchema.safeParse({ forwarderIds, driverAdminId });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  return withAdmin<BulkForwarderResult>(["ops", "warehouse"], async ({ adminId }) => {
    const admin = createAdminClient();

    // Verify driver eligibility ONCE up-front. A single bad driverAdminId
    // should fail the WHOLE batch (mirror legacy modal — the driver picker
    // gates the form submit), not produce N near-identical per-row errors.
    const { data: driver, error: driverErr } = await admin
      .from("admins")
      .select(`
        profile_id, role, is_active,
        profile:profiles!profile_id ( first_name, last_name, member_code )
      `)
      .eq("profile_id", d.driverAdminId)
      .eq("role", "driver")
      .eq("is_active", true)
      .maybeSingle<{
        profile_id: string;
        role: string;
        is_active: boolean;
        profile: { first_name: string | null; last_name: string | null; member_code: string | null }
               | Array<{ first_name: string | null; last_name: string | null; member_code: string | null }>
               | null;
      }>();
    if (driverErr) {
      console.error(`[forwarders-bulk bulkAssignDriver] driver lookup failed`, {
        code: driverErr.code, message: driverErr.message, driverAdminId: d.driverAdminId,
      });
      return { ok: false, error: `driver lookup failed: ${driverErr.message}` };
    }
    if (!driver) {
      return { ok: false, error: "driverAdminId ไม่ใช่ driver ที่ active" };
    }

    const succeeded: string[] = [];
    const failed:    { fNo: string; error: string }[] = [];

    for (const fNo of d.forwarderIds) {
      // 1. forwarder lookup
      const { data: forwarder, error: forwarderErr } = await admin
        .from("forwarders")
        .select("id, f_no, profile_id, status")
        .eq("f_no", fNo)
        .maybeSingle<{ id: string; f_no: string; profile_id: string; status: string }>();
      if (forwarderErr) {
        console.error(`[forwarders-bulk bulkAssignDriver] forwarder lookup failed`, {
          code: forwarderErr.code, message: forwarderErr.message, fNo,
        });
        failed.push({ fNo, error: `lookup failed: ${forwarderErr.message}` });
        continue;
      }
      if (!forwarder) {
        failed.push({ fNo, error: "ไม่พบรายการ" });
        continue;
      }

      // 2. open-assignment guard (status 1 = assigned-waiting, 2 = accepted)
      const { data: existing, error: existingErr } = await admin
        .from("forwarder_driver")
        .select("id, status")
        .eq("forwarder_id", forwarder.id)
        .in("status", [1, 2])
        .maybeSingle<{ id: string; status: number }>();
      if (existingErr) {
        console.error(`[forwarders-bulk bulkAssignDriver] open-assignment lookup failed`, {
          code: existingErr.code, message: existingErr.message, fNo, forwarderId: forwarder.id,
        });
        failed.push({ fNo, error: `assignment-check failed: ${existingErr.message}` });
        continue;
      }
      if (existing) {
        failed.push({
          fNo,
          error: `มีคนขับมอบหมายอยู่แล้ว (assignment ${existing.id}) — ยกเลิกของเดิมก่อน`,
        });
        continue;
      }

      // 3. insert
      const { data: created, error } = await admin
        .from("forwarder_driver")
        .insert({
          forwarder_id: forwarder.id,
          profile_id:   d.driverAdminId,
          status:       1,
          note:         `[BULK ${new Date().toISOString().slice(0, 10)}] บัลค์มอบหมายคนขับ`,
        })
        .select("id")
        .single<{ id: string }>();
      if (error) {
        failed.push({ fNo, error: error.message });
        continue;
      }

      // 4. audit per row (keeps grain — one audit row per affected forwarder)
      await logAdminAction(
        adminId,
        "forwarder_driver.bulk_assign",
        "forwarder_driver",
        created.id,
        {
          forwarder_id: forwarder.id,
          f_no:         forwarder.f_no,
          driver_id:    d.driverAdminId,
          bulk:         true,
        },
      );

      // 5. notify driver (LINE push fallthrough). Reuse the single-row template
      //    semantics — driver has 17h to accept before cron auto-expires.
      void sendNotification(d.driverAdminId, {
        category:       "forwarder",
        severity:       "info",
        title:          `งานใหม่ — ${forwarder.f_no}`,
        body:           `มีงานขนส่งมอบหมายให้คุณ — กรุณารับงานภายใน 17 ชม.`,
        link_href:      `/driver/jobs/${created.id}`,
        reference_type: "forwarder",
        reference_id:   forwarder.id,
      });

      succeeded.push(fNo);
    }

    revalidatePath("/admin/forwarders");
    revalidatePath("/admin/drivers");
    return { ok: true, data: { succeeded, failed } };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. bulkCancel
// ─────────────────────────────────────────────────────────────────────────────
//
// Faithful port of `moveStatusTo99` (forwarder/getListForwarder.php L17 +
// the legacy "ย้ายไป สถานะพิเศษ" handler — cancel-with-reason). Constraints:
//   - Reason required, ≥ 3 chars (matches V-A2 rollback gate semantics for
//     a forward→cancelled transition's audit trail expectations)
//   - Skip rows that are already `cancelled` (no-op, not an error) — legacy
//     PHP did the same via `WHERE fStatus<>'7'`
//   - Skip rows that are `delivered` — refuses with a clear error
//   - One audit row per affected forwarder (action: `forwarder.bulk_cancel`)
//   - Customer notification per row (severity: warning)
// ─────────────────────────────────────────────────────────────────────────────

const bulkCancelSchema = baseBulkSchema.extend({
  reason: z.string().trim().min(3, "เหตุผลต้องยาว ≥ 3 ตัวอักษร").max(500),
});

export async function bulkCancel(
  forwarderIds: string[],
  reason: string,
): Promise<AdminActionResult<BulkForwarderResult>> {
  const parsed = bulkCancelSchema.safeParse({ forwarderIds, reason });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  return withAdmin<BulkForwarderResult>(["ops"], async ({ adminId }) => {
    const admin = createAdminClient();
    const succeeded: string[] = [];
    const failed:    { fNo: string; error: string }[] = [];

    for (const fNo of d.forwarderIds) {
      const { data: existing, error: existingErr } = await admin
        .from("forwarders")
        .select("id, f_no, profile_id, status, note_admin")
        .eq("f_no", fNo)
        .maybeSingle<{ id: string; f_no: string; profile_id: string; status: string; note_admin: string | null }>();
      if (existingErr) {
        console.error(`[forwarders-bulk bulkCancel] forwarder lookup failed`, {
          code: existingErr.code, message: existingErr.message, fNo,
        });
        failed.push({ fNo, error: `lookup failed: ${existingErr.message}` });
        continue;
      }
      if (!existing) {
        failed.push({ fNo, error: "ไม่พบรายการ" });
        continue;
      }

      // Already cancelled → no-op (count as succeeded so the UI doesn't
      // misreport; legacy treated this as silent success).
      if (existing.status === "cancelled") {
        succeeded.push(fNo);
        continue;
      }

      // Refuse delivered — cancelling a settled shipment is a money-handling
      // operation that needs ATM-side reversal (refund flow), not a status flip.
      if (existing.status === "delivered") {
        failed.push({ fNo, error: "รายการส่งสำเร็จแล้ว — ใช้ flow คืนเงินแทน" });
        continue;
      }

      // Stamp cancel reason into note_admin (prepend, preserve prior notes).
      const stampedNote =
        `[CANCEL ${new Date().toISOString().slice(0, 10)}] ${d.reason}`
        + (existing.note_admin ? `\n${existing.note_admin}` : "");

      const { error } = await admin
        .from("forwarders")
        .update({
          status:           "cancelled",
          note_admin:       stampedNote,
          admin_id_update:  adminId,
        })
        .eq("id", existing.id);
      if (error) {
        failed.push({ fNo, error: error.message });
        continue;
      }

      await logAdminAction(
        adminId,
        "forwarder.bulk_cancel",
        "forwarder",
        existing.id,
        {
          f_no:   existing.f_no,
          before: { status: existing.status },
          after:  { status: "cancelled" },
          reason: d.reason,
          bulk:   true,
        },
      );

      void sendNotification(existing.profile_id, {
        category:       "forwarder",
        severity:       "warning",
        title:          `ฝากนำเข้า ${existing.f_no} ถูกยกเลิก`,
        body:           `เหตุผล: ${d.reason}`,
        link_href:      `/service-import/${existing.f_no}`,
        reference_type: "forwarder",
        reference_id:   existing.id,
      });

      succeeded.push(fNo);
    }

    revalidatePath("/admin/forwarders");
    return { ok: true, data: { succeeded, failed } };
  });
}

