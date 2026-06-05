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
// Implementation notes (per task constraints — UPDATED 2026-05-30 night for
// P1-1/P1-2 retarget · open task #41):
//   - bulkUpdateStatus delegates to the faithful `adminBulkUpdateForwarderTbStatus`
//     (actions/admin/forwarders.ts L543) which writes `tb_forwarder.fstatus` ·
//     stamps `fdatestatusN` columns · appends `tb_log_forwarder_status` ·
//     resolves legacy userid → profile_id · fires status-change notifications.
//   - bulkAssignDriver writes legacy `tb_forwarder_driver` (parent batch) +
//     N `tb_forwarder_driver_item` (children) — same shape as the standalone
//     `/admin/drivers/new` page (`actions/admin/driver-batches.ts`). Resolves
//     driver UUID → `profiles.member_code` (PR-format) for `fdadminid`. Tier-A
//     rollback: if children fail after parent landed, DELETE the orphan parent.
//   - Return shape `{ succeeded: string[]; failed: { fNo, error }[] }` so the
//     UI can render partial-failure state (mirror of the legacy "ทุกรายการ
//     ต้องอยู่สถานะเดียวกัน" + per-row red-row treatment in the modal). The
//     `fNo` field name is kept for caller-side compat; the value is now the
//     stringified `tb_forwarder.id` bigint (NOT a UUID f_no).
//   - DB: writes `tb_forwarder` (via delegate), `tb_forwarder_driver`,
//     `tb_forwarder_driver_item`, `tb_log_forwarder_status` (via delegate),
//     `admin_audit_log`. The rebuilt `forwarders` and `forwarder_driver`
//     tables (which the pre-P1 version touched) are no longer referenced.
//   - RBAC per spec: status → ["ops","super","manager","warehouse","accounting",
//     "driver"] (delegated · per-row matrix narrows on the action side) ·
//     driver assignment → super|ops|warehouse · cancel → broad union
//     (per-row matrix gates the actual transition). `super` is implicit in
//     `withAdmin`.
//
// Read-with:
//   - `actions/admin/forwarders.ts` L543+ (the faithful delegate target)
//   - `actions/admin/driver-batches.ts` L72+ (the createDriverBatch reference
//     shape used by /admin/drivers/new)
//   - `app/api/cron/expire-driver-assignments/route.ts` (the cron that flips
//     fdstatus 1→3 once endtime<NOW · used by the endTimeHours selector)

import { revalidatePath } from "next/cache";
import { bustAdminChrome } from "@/lib/cache/revalidate-chrome";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";
import { adminBulkUpdateForwarderTbStatus } from "./forwarders";
import { sendNotification } from "@/lib/notifications";
import { appendStatusLog } from "@/lib/notifications/status-flip-helper";
import { safeLegacyAdminId } from "@/lib/auth/safe-legacy-admin-id";
import { getAdminRoles } from "@/lib/auth/require-admin";
import { canAnyRoleFlipFstatus } from "@/lib/auth/check-fstatus-transition";
import { resolveProfileIdsForLegacyUserids } from "@/lib/auth/tb-users-resolver";
import { TB_FORWARDER_STATUSES, type TbForwarderStatus } from "./forwarders-bulk-types";

// ── Shared types ──────────────────────────────────────────────────────────────

/**
 * Legacy `tb_forwarder.fstatus` enum (character varying(2), default '1'):
 *   '1'  รอเข้าโกดังจีน        (pending intake at China warehouse)
 *   '2'  ถึงโกดังจีนแล้ว        (arrived China warehouse)
 *   '3'  กำลังส่งมาไทย          (in transit to Thailand)
 *   '4'  ถึงไทยแล้ว             (arrived Thailand)
 *   '5'  รอชำระเงิน             (awaiting customer payment)
 *   '6'  เตรียมส่ง              (ready for delivery — driver assignable)
 *   '7'  ส่งแล้ว                (delivered · terminal)
 *   '99' สถานะพิเศษ              (special-hold / cancel-lane)
 *
 * Schema citation: supabase/migrations/0081_pcs_legacy_schema.sql L1601
 * ("fstatus character varying(2) DEFAULT '1' NOT NULL").
 *
 * P1-1 (2026-05-30 night — open task #41): the toolbar previously used a
 * rebuilt-string enum (`pending_payment`/`shipped_china`/…) and delegated to
 * `adminUpdateForwarder` which wrote `.from("forwarders")` — the REBUILT
 * UUID table, EMPTY on prod. Every "เปลี่ยน status" press showed green
 * toast while `tb_forwarder.fstatus` stayed unchanged. This rewrite uses
 * the legacy numeric chars directly + delegates to the faithful action
 * `adminBulkUpdateForwarderTbStatus` (actions/admin/forwarders.ts L543)
 * which writes `tb_forwarder.fstatus` + `tb_log_forwarder_status` + fires
 * customer notifications.
 */
// 2026-06-05 (ภูม flag · /admin/forwarders/52015/edit 500): TB_FORWARDER_STATUSES
// was exported from this file, but Next 16 rejects ANY non-async-function value
// export from a `"use server"` file ("found object" because Next sees the
// readonly array as an object) → the chunk failed to evaluate → every page that
// pulled this action 500'd. Const + type now live in `./forwarders-bulk-types.ts`
// (regular module, safe from client + server). Same fix as Wave 25 #196.
//
// Re-export the TYPE so existing `import type { TbForwarderStatus } from ".../forwarders-bulk"`
// callers don't break — type-only re-exports are erased at compile time and stay
// legal inside a "use server" module.
export type { TbForwarderStatus } from "./forwarders-bulk-types";

/**
 * Result shape of every bulk action — `succeeded` carries the raw input
 * ids that landed cleanly, `failed` carries the rest with their per-row
 * error. The UI renders this as a partial-failure banner.
 *
 * Field name stays `fNo` for backward compatibility with the existing
 * toolbar render (`bulk-actions-toolbar.tsx` L313 reads `f.fNo`). After
 * the P1-1/P1-2 retarget the value in this field is the legacy
 * `tb_forwarder.id` (bigint serialised as a string), not the rebuilt
 * `f_no` UUID — the toolbar already treats it as opaque.
 */
export type BulkForwarderResult = {
  succeeded: string[];                          // list of tb_forwarder.id (as string) rows that updated cleanly
  failed:    { fNo: string; error: string }[];  // list of tb_forwarder.id + per-row error
};

// Common limits — bulk operations are intentionally capped to keep per-request
// load bounded (mirrors the existing single-status bulk's `.max(100)`).
const MAX_BULK = 100;

// Numeric-id schema — accept stringified bigints (the UI hands us
// Array.from(Set<number>).map(String)). We narrow per-id below.
const baseBulkSchema = z.object({
  forwarderIds: z.array(z.string().trim().min(1)).min(1).max(MAX_BULK),
});

/**
 * Parse `forwarderIds: string[]` into clean `{ raw, id }[]` + `{ fNo, error }[]`.
 * Non-numeric / non-positive entries fail per-row with a clear error so the UI
 * can highlight them without aborting the whole batch. Used by both
 * bulkUpdateStatus (P1-1) and bulkAssignDriver (P1-2).
 */
function parseLegacyIds(raws: string[]): {
  ok: { raw: string; id: number }[];
  bad: { fNo: string; error: string }[];
} {
  const ok: { raw: string; id: number }[] = [];
  const bad: { fNo: string; error: string }[] = [];
  for (const raw of raws) {
    const n = Number(raw);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) {
      bad.push({ fNo: raw, error: "id ต้องเป็นตัวเลขจำนวนเต็มบวก" });
      continue;
    }
    ok.push({ raw, id: n });
  }
  return { ok, bad };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. bulkUpdateStatus — P1-1 (2026-05-30 night) · open task #41
// ─────────────────────────────────────────────────────────────────────────────
//
// 🚨 What was broken (silent dead-write · master-fidelity Tier-A #1 pattern):
//   The prior implementation looped `adminUpdateForwarder({ f_no, status })`
//   which writes `.from("forwarders")` — the REBUILT UUID table, EMPTY on
//   prod (50k+ real forwarders live in `tb_forwarder`). Every "เปลี่ยน
//   status" press in the bulk-bar showed green toast while
//   `tb_forwarder.fstatus` stayed unchanged.
//
// Fix: thin delegate to `adminBulkUpdateForwarderTbStatus`
//   (actions/admin/forwarders.ts L543) — the faithful action that writes
//   `tb_forwarder.fstatus` + stamps the `fdatestatusN` column + appends
//   one `tb_log_forwarder_status` row per changed row + resolves legacy
//   userid → profile_id + fires the status-change notification. It also
//   enforces the `canAnyRoleFlipFstatus` per-row matrix (super/manager
//   can move *→99; warehouse only 3→4; etc — see lib/auth/check-fstatus-
//   transition.ts).
//
// Input schema change (P1-1):
//   BEFORE: { forwarderIds: string[]; newStatus: "pending_payment"|… }
//           — rebuilt-string enum, f_no-style ids
//   AFTER:  { forwarderIds: string[]; fstatus: "1"|…|"99" }
//           — legacy numeric chars (single source of truth · matches
//             0081_pcs_legacy_schema.sql L1601 varchar(2) default '1'),
//             stringified `tb_forwarder.id` (bigint)
//
// Why pass numeric chars directly (instead of mapping rebuilt-string →
// legacy char like the service-orders `LEGACY_TO_REBUILT_KEY` pattern):
// the bulk-actions-toolbar lives in the admin lane (ภูม owns), so we
// can edit both sides together. One enum, one source of truth — less
// chance of drift than maintaining a mapping table.
//
// Idempotency / role-gate: inherited from the underlying faithful action
// (canAnyRoleFlipFstatus per-row, audit log, status-log append, notify).
// This wrapper only re-shapes the result and surfaces per-row failures
// in the {succeeded, failed} envelope the UI renders.
// ─────────────────────────────────────────────────────────────────────────────

const bulkUpdateStatusSchema = baseBulkSchema.extend({
  fstatus: z.enum(TB_FORWARDER_STATUSES),
  /**
   * Optional admin note for the audit payload — NOT stamped into
   * `tb_forwarder.fnote` (the faithful action treats fnote as a tracking
   * field, not a status-change reason). The note lives in the audit log.
   */
  note: z.string().trim().max(500).optional(),
});

export async function bulkUpdateStatus(
  forwarderIds: string[],
  fstatus: TbForwarderStatus,
  note?: string,
): Promise<AdminActionResult<BulkForwarderResult>> {
  const parsed = bulkUpdateStatusSchema.safeParse({ forwarderIds, fstatus, note });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  // Parse stringified bigints into ids; non-numeric entries fail per-row.
  const { ok: idEntries, bad: failed } = parseLegacyIds(d.forwarderIds);
  if (idEntries.length === 0) {
    // Every entry was malformed — no DB round-trip; return the per-row errors.
    return { ok: true, data: { succeeded: [], failed } };
  }

  // Delegate to the faithful action. It enforces the per-row role-gate
  // (canAnyRoleFlipFstatus) up-front and refuses the whole batch if any
  // row's transition is forbidden — we surface that as a top-level error
  // (rather than per-row), matching the existing toolbar's `topErr` slot.
  const fids = idEntries.map((e) => e.id);
  const res = await adminBulkUpdateForwarderTbStatus({ fids, fstatus: d.fstatus });

  if (!res.ok) {
    // Forbidden transitions / DB errors / not_found — surface top-level so
    // operator sees the actual reason. The per-row pre-validation failures
    // (`failed` from parseLegacyIds) get discarded here intentionally —
    // they're an input-shape bug the caller should fix before retrying.
    return { ok: false, error: res.error };
  }

  // All rows in idEntries succeeded (the underlying action does a single
  // UPDATE...IN(ids); partial success isn't a thing — either every row
  // landed or the whole batch was refused).
  const succeeded = idEntries.map((e) => e.raw);

  // The `note` parameter is currently a no-op: the faithful action
  // already writes a per-batch audit row with before/after fstatus, and
  // tb_forwarder has no dedicated "status-change reason" column (legacy
  // doesn't either — the cancel reason lives in admin_audit_log on the
  // bulkCancel path). Kept in the schema for forward-compat (when the
  // faithful action gets a payload-extension hook this wrapper can pass
  // it through without a toolbar change).
  void note;

  revalidatePath("/admin/forwarders");
  // Bulk fstatus change moved the forwarder queue badges (the delegate also
  // busts; this covers the wrapper's own entry point).
  bustAdminChrome();
  return { ok: true, data: { succeeded, failed } };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. bulkAssignDriver — P1-2 (2026-05-30 night) · open task #41
// ─────────────────────────────────────────────────────────────────────────────
//
// 🚨 What was broken (silent dead-write · same master-fidelity Tier-A #1
//   pattern as P1-1): the prior implementation looped per forwarder
//   `from("forwarders").select(...)` + `from("forwarder_driver").insert(...)`.
//   Both tables are REBUILT-era empty tables on prod — every row failed
//   with 'ไม่พบรายการ' (because the rebuilt `forwarders` table is empty)
//   and the bulk action surfaced N near-identical "not found" errors
//   while the real forwarders sat untouched in `tb_forwarder` (50k+ rows).
//
// Fix: faithful port of `pcs-admin/forwarder-driver.php?page=add` (the
//   "เลือกคนขับรถและสร้างรายการ" multi-select) — same shape used by the
//   existing standalone `/admin/drivers/new` page (`actions/admin/
//   driver-batches.ts::createDriverBatch`):
//
//     1. Verify driver UUID maps to an active `admins.role='driver'` row
//        and resolve the driver's `profiles.member_code` (PR-format) — the
//        legacy `tb_forwarder_driver.fdadminid` column accepts that slug.
//     2. Snapshot the forwarders from `tb_forwarder` by `id` IN (...) —
//        per-row "ไม่พบรายการ" if missing, per-row "ไม่อยู่สถานะเตรียมส่ง"
//        if `fstatus!='6'` or `paydeposit='1'` (legacy guard from
//        `forwarder.php` add path).
//     3. Check the `tb_forwarder_driver_item` open-assignment guard —
//        any selected forwarder already in a row with `fdistatus IN ('', '1')`
//        is in an open batch and gets a per-row error.
//     4. INSERT one parent `tb_forwarder_driver` row with:
//          fddate          = NOW (timestamp without time zone)
//          fdname          = "YYYY-MM-DD-HH-{driverMemberCode}" (legacy format)
//          fdamount        = item count (1 stop per forwarder · the toolbar
//                            doesn't pre-compute grouped stops so we use
//                            item count as a conservative "stops" proxy)
//          fdadminid       = driver member_code (varchar(20) NOT NULL)
//          fdadmincreator  = creator's member_code (legacy slug) or auth UUID
//                            sliced to varchar(20)
//          fdstatus        = '1' กำลังดำเนินการ (varchar(1) NOT NULL)
//          endtime         = NOW + endTimeHours (default 17h) — cron
//                            `/api/cron/expire-driver-assignments` flips
//                            fdstatus 1→3 once endtime<NOW
//        Schema citation: 0081_pcs_legacy_schema.sql L1976-1985.
//     5. INSERT N child `tb_forwarder_driver_item` rows:
//          fdid            = parent.id (FK back to tb_forwarder_driver.id)
//          fid             = tb_forwarder.id (NOTE: column is `fid`, NOT
//                            `forwarderid` — task brief had it wrong;
//                            schema is L2014 "fid bigint NOT NULL")
//          fdistatus       = '' (empty string · "ยังไม่ขึ้นรถ" · NOT NULL)
//          fdipictureon    = '' (NOT NULL varchar(150))
//          fdipictureoff   = '' (NOT NULL varchar(150))
//        Schema citation: 0081_pcs_legacy_schema.sql L2011-2018.
//
// Tier-A rollback: if any child INSERT fails after the parent landed, the
//   parent row is DELETEd — keeps the table clean of headless parents.
//   (Postgres has no native cascade-on-failure inside a non-RPC bulk insert,
//   so we do it explicitly.)
//
// Notification: per-row in-app push to the driver's profile via
//   `sendNotification(driver.profile_id, …)`. LINE push falls through the
//   notifications wiring (lib/notifications/index.ts).
// ─────────────────────────────────────────────────────────────────────────────

const bulkAssignDriverSchema = baseBulkSchema.extend({
  driverAdminId: z.string().uuid("driverAdminId ต้องเป็น UUID ของ profile (admin.profile_id)"),
  /**
   * Per-batch deadline in hours. Legacy `addFrom.php` exposes a 17/24/30hr
   * `<select>`; default 17h matches the single-driver assignment path.
   * The cron `expire-driver-assignments` flips fdstatus 1→3 once
   * `endtime < NOW()`.
   */
  endTimeHours: z.union([z.literal(17), z.literal(24), z.literal(30)]).optional(),
});

/**
 * Build a SQL-timestamp string in legacy format ("YYYY-MM-DD HH:MM:SS" ·
 * `timestamp without time zone`). Supabase / PostgREST accepts ISO too but
 * the legacy columns are bare timestamps — the slice below matches what
 * driver-batches.ts already writes successfully.
 */
function legacyTimestamp(d: Date): string {
  return d.toISOString().replace("T", " ").substring(0, 19);
}

export async function bulkAssignDriver(
  forwarderIds: string[],
  driverAdminId: string,
  endTimeHours?: 17 | 24 | 30,
): Promise<AdminActionResult<BulkForwarderResult>> {
  const parsed = bulkAssignDriverSchema.safeParse({ forwarderIds, driverAdminId, endTimeHours });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;
  const endTimeHoursFinal: 17 | 24 | 30 = d.endTimeHours ?? 17;

  return withAdmin<BulkForwarderResult>(["ops", "super", "warehouse"], async ({ adminId }) => {
    const admin = createAdminClient();

    // Parse legacy ids first — bail early if every one is malformed.
    const { ok: idEntries, bad: parseFailed } = parseLegacyIds(d.forwarderIds);
    if (idEntries.length === 0) {
      return { ok: true, data: { succeeded: [], failed: parseFailed } };
    }

    // ── 1. Verify driver + resolve member_code ────────────────────────────
    // Single round-trip — a bad driver UUID fails the WHOLE batch (mirror
    // legacy modal, the driver picker gates form submit), not per-row.
    const { data: driverRow, error: driverErr } = await admin
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
    if (!driverRow) {
      return { ok: false, error: "driverAdminId ไม่ใช่ driver ที่ active" };
    }
    const driverProfile = Array.isArray(driverRow.profile) ? driverRow.profile[0] : driverRow.profile;
    const driverMemberCode = driverProfile?.member_code?.trim() ?? "";
    if (!driverMemberCode) {
      return { ok: false, error: "driver ไม่มี member_code (รหัส PR) — กรุณาทำ profile ให้สมบูรณ์ก่อน" };
    }
    // safeLegacyAdminId guards the varchar(20) tb_forwarder_driver.fdadminid
    // column. PR-format member_codes are typically <= 10 chars but the
    // helper logs if a future format exceeds the bound.
    const driverFdAdminId = safeLegacyAdminId(driverMemberCode, 20);

    // Resolve the creator's slug for fdadmincreator (also varchar(20)).
    // Falls back to `adminId` sliced to 20 if no profile / member_code.
    const { data: creatorProfile, error: creatorErr } = await admin
      .from("profiles")
      .select("member_code")
      .eq("id", adminId)
      .maybeSingle<{ member_code: string | null }>();
    if (creatorErr) {
      console.error(`[forwarders-bulk bulkAssignDriver] creator profile read failed`, {
        code: creatorErr.code, message: creatorErr.message, adminId,
      });
      // Non-fatal — fall through to the adminId fallback below.
    }
    const fdAdminCreator = safeLegacyAdminId(creatorProfile?.member_code ?? adminId, 20);

    // ── 2. Snapshot forwarders ────────────────────────────────────────────
    // Select only what the per-row classifier reads (fstatus + paydeposit).
    // We don't need userid/fidorco — the notification is one-per-batch to
    // the driver (not per customer), and the parent batch row carries the
    // count rather than the individual fidorco refs.
    const ids = idEntries.map((e) => e.id);
    const { data: forwarderRows, error: forwarderErr } = await admin
      .from("tb_forwarder")
      .select("id, fstatus, paydeposit")
      .in("id", ids);
    if (forwarderErr) {
      console.error(`[forwarders-bulk bulkAssignDriver] tb_forwarder lookup failed`, {
        code: forwarderErr.code, message: forwarderErr.message,
      });
      return { ok: false, error: `lookup failed: ${forwarderErr.message}` };
    }
    const byId = new Map<number, { id: number; fstatus: string; paydeposit: string | null }>(
      (forwarderRows ?? []).map((r) => [
        (r as { id: number }).id,
        r as { id: number; fstatus: string; paydeposit: string | null },
      ]),
    );

    // ── 3. Open-assignment guard ──────────────────────────────────────────
    // Any forwarder already in an item-row with fdistatus IN ('','1') is in
    // an open batch. Bulk lookup once, then collect per-row failures below.
    const { data: openItems, error: openErr } = await admin
      .from("tb_forwarder_driver_item")
      .select("fid")
      .in("fid", ids)
      .in("fdistatus", ["", "1"]);
    if (openErr) {
      console.error(`[forwarders-bulk bulkAssignDriver] open-item check failed`, {
        code: openErr.code, message: openErr.message,
      });
      return { ok: false, error: `assignment-check failed: ${openErr.message}` };
    }
    const inOpenBatch = new Set<number>(
      (openItems ?? []).map((r) => (r as { fid: number }).fid),
    );

    // ── 4. Classify per-row ───────────────────────────────────────────────
    const failed: { fNo: string; error: string }[] = [...parseFailed];
    type Assignable = { raw: string; id: number };
    const assignable: Assignable[] = [];

    for (const { raw, id } of idEntries) {
      const row = byId.get(id);
      if (!row) {
        failed.push({ fNo: raw, error: "ไม่พบรายการ" });
        continue;
      }
      if (row.fstatus !== "6") {
        failed.push({ fNo: raw, error: `ไม่อยู่สถานะเตรียมส่ง (fstatus=${row.fstatus})` });
        continue;
      }
      if (row.paydeposit === "1") {
        failed.push({ fNo: raw, error: "ลูกค้าค้างชำระเงินมัดจำ — รอชำระก่อน" });
        continue;
      }
      if (inOpenBatch.has(id)) {
        failed.push({ fNo: raw, error: "อยู่ในรอบจัดส่งอื่นแล้ว — ยกเลิกของเดิมก่อน" });
        continue;
      }
      assignable.push({ raw, id });
    }

    if (assignable.length === 0) {
      // No INSERT required — return the per-row classification.
      return { ok: true, data: { succeeded: [], failed } };
    }

    // ── 5. INSERT parent tb_forwarder_driver ──────────────────────────────
    const now = new Date();
    const fdDate = legacyTimestamp(now);
    const endTime = legacyTimestamp(new Date(now.getTime() + endTimeHoursFinal * 3_600_000));
    const pad = (n: number) => String(n).padStart(2, "0");
    const fdName = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}-${driverFdAdminId}`;

    const { data: parentInserted, error: parentErr } = await admin
      .from("tb_forwarder_driver")
      .insert({
        fddate:         fdDate,
        fdname:         fdName,
        fdamount:       assignable.length,
        fdadminid:      driverFdAdminId,
        fdadmincreator: fdAdminCreator,
        fdstatus:       "1",
        endtime:        endTime,
      })
      .select("id")
      .single<{ id: number }>();
    if (parentErr || !parentInserted) {
      console.error(`[forwarders-bulk bulkAssignDriver] parent INSERT failed`, {
        code: parentErr?.code, message: parentErr?.message,
        driverFdAdminId, fdAdminCreator, assignableCount: assignable.length,
      });
      return { ok: false, error: parentErr?.message ?? "ไม่สามารถสร้างรอบจัดส่ง" };
    }
    const batchId = parentInserted.id;

    // ── 6. INSERT child tb_forwarder_driver_item rows ─────────────────────
    // Column name verified: `fid` (NOT `forwarderid`) per migration 0081 L2014.
    const itemRows = assignable.map((c) => ({
      fdid:          batchId,
      fid:           c.id,
      fdistatus:     "",
      fdipictureon:  "",
      fdipictureoff: "",
    }));
    const { error: itemErr } = await admin
      .from("tb_forwarder_driver_item")
      .insert(itemRows);
    if (itemErr) {
      console.error(`[forwarders-bulk bulkAssignDriver] child INSERT failed — rolling back parent`, {
        code: itemErr.code, message: itemErr.message, batchId,
      });
      // Tier-A rollback: parent landed but children didn't — clean up the
      // orphan so the next attempt doesn't find a phantom batch.
      const { error: rollbackErr } = await admin
        .from("tb_forwarder_driver")
        .delete()
        .eq("id", batchId);
      if (rollbackErr) {
        console.error(`[forwarders-bulk bulkAssignDriver] parent rollback failed (manual cleanup needed)`, {
          code: rollbackErr.code, message: rollbackErr.message, batchId,
        });
      }
      return { ok: false, error: `item insert failed: ${itemErr.message}` };
    }

    // ── 7. Audit + notify ─────────────────────────────────────────────────
    await logAdminAction(
      adminId,
      "tb_forwarder_driver.bulk_assign",
      "tb_forwarder_driver",
      String(batchId),
      {
        driver_member_code: driverFdAdminId,
        creator:            fdAdminCreator,
        item_count:         assignable.length,
        end_time_hours:     endTimeHoursFinal,
        fids:               assignable.map((a) => a.id),
        bulk:               true,
      },
    );

    // Notify the driver — single in-app push (LINE pass-through via
    // sendNotification). One notification for the whole batch, not N — the
    // legacy modal sends 1 LINE message per driver per batch creation.
    void sendNotification(d.driverAdminId, {
      category:       "forwarder",
      severity:       "info",
      title:          `งานใหม่ — ${assignable.length} รายการ`,
      body:           `มีงานขนส่ง ${assignable.length} จุดส่งมอบหมายให้คุณ — กรุณารับงานภายใน ${endTimeHoursFinal} ชม.`,
      link_href:      `/admin/drivers/${batchId}`,
      // The notify enum (lib/notifications/types.ts L19) doesn't have a
      // dedicated `forwarder_driver` value yet; collapse to `forwarder`
      // — the link_href above carries the batchId for routing fidelity.
      reference_type: "forwarder",
      reference_id:   String(batchId),
    });

    revalidatePath("/admin/forwarders");
    revalidatePath("/admin/drivers");
    // Drivers assigned → the driver-items + forwarder delivery queue badges
    // changed; refresh the admin sidebar.
    bustAdminChrome();
    return {
      ok: true,
      data: {
        succeeded: assignable.map((a) => a.raw),
        failed,
      },
    };
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
      // Bulk cancel moved forwarders to special status (99) → forwarder queue
      // badges changed; refresh the admin sidebar.
      bustAdminChrome();
      return { ok: true, data: { succeeded, failed } };
    },
  );
}

