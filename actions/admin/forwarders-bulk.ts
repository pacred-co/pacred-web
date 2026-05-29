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
import { appendStatusLog } from "@/lib/notifications/status-flip-helper";
import { safeLegacyAdminId } from "@/lib/auth/safe-legacy-admin-id";
import { getAdminRoles } from "@/lib/auth/require-admin";
import { canAnyRoleFlipFstatus } from "@/lib/auth/check-fstatus-transition";
import { resolveProfileIdsForLegacyUserids } from "@/lib/auth/tb-users-resolver";

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
// 3. bulkCancel — Tier A3 "silent dead-write" fix (2026-05-29 master fidelity audit)
// ─────────────────────────────────────────────────────────────────────────────
//
// 🚨 What was broken (the dead-write pattern — #1 root cause across 5 systems):
//   The prior implementation wrote `UPDATE forwarders SET status='cancelled' …`
//   against the REBUILT-era `forwarders` table — which is EMPTY on prod
//   (`tb_forwarder` is the populated legacy table holding ~52k rows of real
//   cargo state). Every "bulk cancel" looked successful in the UI (no rows
//   matched → 0 rows updated → no error) while the actual forwarder records
//   carried on at their original status. Customers got delivered packages
//   they'd been told were cancelled. See `docs/audit/master-fidelity-2026-05-30-evening.md`
//   Tier-A pattern #1.
//
// Faithful port of `moveStatusTo99` (legacy `pcs-admin/forwarder.php` L4-19 +
// the "ย้ายไป สถานะพิเศษ" handler invoked from
// `pcs-admin/include/pages/forwarder/getListForwarder.php` L87). Legacy SQL:
//
//     UPDATE tb_forwarder SET fStatus='99' WHERE ID IN ('<ids>');
//     INSERT INTO tb_log_forwarder_status (fID, fStatusOld, fStatusNew,
//             adminIDChange, fDateChange)
//          SELECT ID, '99', '99', <admin>, NOW()
//          FROM tb_forwarder WHERE ID IN ('<ids>');
//
// Pacred port semantics:
//   - Input `forwarderIds: string[]` is treated as legacy `tb_forwarder.id`
//     values (bigint serialised as strings — matches the active page
//     /admin/forwarders/forwarders-table.tsx which keeps `id: number` for
//     the same selection model). Non-numeric / NaN entries fail per-row.
//   - Reason required, ≥ 3 chars (Pacred enhancement — legacy stored no
//     reason at all; we keep one on the audit_log payload so accounting
//     can reconcile when refunding). Legacy column-set has no
//     `fCancelReason` / `fCancelBy` / `fCancelDate` fields — the cancel
//     stamp lives entirely in `tb_log_forwarder_status` + `adminidupdate`
//     + `fdateadminstatus`. Do NOT invent extra columns.
//   - Target status is the legacy '99' bucket ("ย้ายไปสถานะพิเศษ" — the
//     soft-cancel "special hold" lane), NOT '7' (delivered). The active
//     forwarders-table.tsx exposes the inverse via
//     adminRestoreForwarderFromSpecial — paired cancel/restore loop.
//   - Skip rows that are already `fstatus='99'` (no-op, count as success
//     to mirror legacy "WHERE fStatus<>'99'" idempotency).
//   - Refuse rows at `fstatus='7'` (delivered terminal) — cancelling a
//     delivered shipment needs a money-side refund, not a status flip.
//   - Per-row permission via `canAnyRoleFlipFstatus(roles, fstatus, '99')`
//     — same matrix the active bulk path uses
//     (lib/auth/check-fstatus-transition.ts §Rule 2: → 99 is super/manager
//     only). Mixed-status batches enforce the most restrictive rule across
//     rows and refuse the whole batch if any row's transition is forbidden
//     for the caller's roles. This matches the active path's "refuse the
//     whole batch on any forbidden row" stance — partial-process would let
//     a non-super admin silently cancel half a batch.
//   - One `tb_log_forwarder_status` row per affected forwarder (legacy
//     wrote one log row per row in the batch — preserved here).
//   - One `admin_audit_log` row per affected forwarder (Pacred extra —
//     the legacy log table has no payload field, so the cancel reason
//     lives in admin_audit_log.payload.reason for reconciliation).
//   - Customer notification per row (Pacred enhancement — legacy fired
//     NO notification on cancel. The status-flip CHANNEL_MATRIX treats
//     *→99 as log-only, but we send an in-app warning so customers don't
//     find out by checking the order page later).
//
// What we deliberately don't do:
//   - Set `note_admin` / refund the wallet / void invoices — those are
//     separate handlers in legacy (`pcs-admin/wallet-cancel.php`,
//     `acc-payment-cancel.php`). The cancel-with-refund path is the
//     refund flow at /admin/refunds (per the "delivered → ใช้ flow คืนเงิน
//     แทน" branch below).
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

  return withAdmin<BulkForwarderResult>(
    // Same role union the active /admin/forwarders bulk path uses
    // (forwarders.ts adminBulkUpdateForwarderTbStatus). The per-row
    // canAnyRoleFlipFstatus check below narrows → 99 transitions to
    // super/manager only (per check-fstatus-transition.ts Rule 2).
    ["ops", "super", "manager", "warehouse", "accounting", "driver"],
    async ({ adminId }) => {
      const admin = createAdminClient();
      const adminIdSafe = safeLegacyAdminId(adminId, 10);

      // ── Pre-flight: caller role gate (for → 99 transition matrix) ─────────
      // We check the matrix per-row below, but a caller with zero qualifying
      // roles fails the whole batch fast (no DB round-trip).
      const callerRoles = (await getAdminRoles()) ?? [];

      // ── Parse + bucket the input ids ──────────────────────────────────────
      // tb_forwarder.id is bigint — accept numeric strings only. Non-numeric
      // entries fail per-row with a clear error so the UI can highlight them.
      const succeeded: string[] = [];
      const failed:    { fNo: string; error: string }[] = [];

      const idEntries: { raw: string; id: number }[] = [];
      for (const raw of d.forwarderIds) {
        const n = Number(raw);
        if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) {
          failed.push({ fNo: raw, error: "id ต้องเป็นตัวเลขจำนวนเต็มบวก" });
          continue;
        }
        idEntries.push({ raw, id: n });
      }
      if (idEntries.length === 0) {
        return { ok: true, data: { succeeded, failed } };
      }

      // ── Snapshot the current state (one round-trip) ───────────────────────
      // We need fstatus (for the no-op + delivered + log columns) and
      // userid (for notification resolution) + fidorco (for the display
      // reference used in the in-app push).
      const ids = idEntries.map((e) => e.id);
      const { data: beforeRows, error: readErr } = await admin
        .from("tb_forwarder")
        .select("id, fstatus, userid, fidorco")
        .in("id", ids);
      if (readErr) {
        console.error(`[forwarders-bulk bulkCancel] tb_forwarder lookup failed`, {
          code: readErr.code, message: readErr.message,
        });
        return { ok: false, error: `lookup failed: ${readErr.message}` };
      }

      const byId = new Map<number, { id: number; fstatus: string; userid: string; fidorco: string | null }>(
        (beforeRows ?? []).map((r) => [
          (r as { id: number }).id,
          r as { id: number; fstatus: string; userid: string; fidorco: string | null },
        ]),
      );

      // ── First pass: classify + collect cancellable rows ───────────────────
      type Cancellable = {
        raw:    string;
        id:     number;
        fstatus: string;
        userid: string;
        fidorco: string | null;
      };
      const cancellable: Cancellable[] = [];

      for (const { raw, id } of idEntries) {
        const row = byId.get(id);
        if (!row) {
          failed.push({ fNo: raw, error: "ไม่พบรายการ" });
          continue;
        }

        // Already cancelled → no-op (legacy SQL was idempotent · `WHERE fStatus<>'99'`).
        if (row.fstatus === "99") {
          succeeded.push(raw);
          continue;
        }

        // Refuse delivered — cancelling a settled shipment is a money-handling
        // operation that needs ATM-side reversal (the legacy refund flow).
        if (row.fstatus === "7") {
          failed.push({ fNo: raw, error: "รายการส่งสำเร็จแล้ว — ใช้ flow คืนเงินแทน" });
          continue;
        }

        // Per-row permission for the (fstatus → 99) transition.
        if (!canAnyRoleFlipFstatus(callerRoles, row.fstatus, "99")) {
          failed.push({
            fNo:   raw,
            error: `forbidden_transition: บัญชีของคุณไม่มีสิทธิ์ย้ายรายการที่ fstatus=${row.fstatus} ไปยังสถานะพิเศษ (99) — super/manager เท่านั้น`,
          });
          continue;
        }

        cancellable.push({ raw, id, fstatus: row.fstatus, userid: row.userid, fidorco: row.fidorco });
      }

      if (cancellable.length === 0) {
        return { ok: true, data: { succeeded, failed } };
      }

      // ── Bulk UPDATE (one statement covers every cancellable row) ──────────
      // Legacy SQL hit every row at once via `WHERE ID IN ('<ids>')`. We do
      // the same — single round-trip — and the per-row `fstatus_before` we
      // already captured above feeds the audit + status-log rows.
      const nowIso = new Date().toISOString();
      const cancellableIds = cancellable.map((c) => c.id);

      const { error: updErr } = await admin
        .from("tb_forwarder")
        .update({
          fstatus:           "99",
          fdateadminstatus:  nowIso,
          adminidupdate:     adminIdSafe,
        })
        .in("id", cancellableIds);
      if (updErr) {
        // The bulk UPDATE failed atomically — surface a top-level error.
        // Any per-row failures we already classified above are still in
        // `failed`; we leave them there for the UI partial-failure render.
        console.error(`[forwarders-bulk bulkCancel] bulk UPDATE failed`, {
          code: updErr.code, message: updErr.message, ids: cancellableIds,
        });
        return { ok: false, error: `update failed: ${updErr.message}` };
      }

      // ── Per-row side-effects ──────────────────────────────────────────────
      // 1. Status log (legacy tb_log_forwarder_status) — best-effort
      // 2. admin_audit_log (Pacred · keeps cancel reason)
      // 3. Customer notification (Pacred enhancement · legacy was silent)
      //
      // Notifications resolve legacy userid → profile_id in one round-trip,
      // then dispatch per row inside try/catch so one failed push doesn't
      // block the rest.
      const profileMap = await resolveProfileIdsForLegacyUserids(
        cancellable.map((c) => c.userid),
      ).catch((err) => {
        console.error(`[forwarders-bulk bulkCancel] profile resolver failed`, {
          error: err instanceof Error ? err.message : String(err),
        });
        return new Map<string, string>();
      });

      for (const c of cancellable) {
        // Status log — legacy semantics: one row per affected forwarder.
        // appendStatusLog is best-effort; a failure does NOT roll back the
        // UPDATE that already succeeded above (matches the active path).
        await appendStatusLog(admin, c.id, c.fstatus, "99", adminIdSafe);

        // Audit log — Pacred · carries the cancel reason.
        await logAdminAction(
          adminId,
          "forwarder.bulk_cancel",
          "tb_forwarder",
          String(c.id),
          {
            id:     c.id,
            fidorco: c.fidorco,
            before: { fstatus: c.fstatus },
            after:  { fstatus: "99" },
            reason: d.reason,
            bulk:   true,
          },
        );

        // In-app push (no SMS — legacy CHANNEL_MATRIX treats *→99 as log-only).
        const profileId = profileMap.get(c.userid);
        if (profileId) {
          const fNoDisplay = c.fidorco ?? String(c.id);
          try {
            await sendNotification(profileId, {
              category:       "forwarder",
              severity:       "warning",
              title:          `ฝากนำเข้า ${fNoDisplay} ถูกย้ายไปสถานะพิเศษ`,
              body:           `เหตุผล: ${d.reason}`,
              link_href:      `/service-import/${fNoDisplay}`,
              reference_type: "forwarder",
              reference_id:   String(c.id),
            });
          } catch (err) {
            console.error(`[forwarders-bulk bulkCancel] notification failed`, {
              id: c.id, profileId,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }

        succeeded.push(c.raw);
      }

      revalidatePath("/admin/forwarders");
      return { ok: true, data: { succeeded, failed } };
    },
  );
}

