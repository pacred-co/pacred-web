"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";
import { getAdminLegacyId } from "@/lib/admin/default-queue-filter-server";
import { safeLegacyAdminId } from "@/lib/auth/safe-legacy-admin-id";

/**
 * D1 faithful port of `pcs-admin/time-attendance-system.php` — repointed from
 * the REBUILT empty twins (`attendance_logs` / `leave_requests`) to the
 * migrated legacy tables `tas_holiday` (annual holidays · 18 rows on prod) and
 * `tas_leave` (leave records). Re-sweep A2 #35.
 *
 * Legacy column casing is fully LOWERCASE (verified vs migration 0081 + a
 * read-only prod probe — `tas_*` are NOT in the camelCase set):
 *   tas_holiday: id, holidayname, holidaydate, adminidcreate, date, note
 *   tas_leave:   id, type, startdate, enddate, duration, reason, filename,
 *                adminid, date, status, adminidcreate, adminidceo, adminidhr
 *
 * Legacy code semantics (preserved verbatim, see migration 0081 COMMENTs):
 *   tas_leave.type     1=ลาป่วย 2=ลาพักผ่อน 3=ลากิจส่วนตัว 4=ลาคลอด
 *   tas_leave.duration 1=ทั้งวัน 2=ครึ่งวันเช้า 3=ครึ่งวันบ่าย
 *   tas_leave.status   1=รอ HR ตรวจสอบ 2=รอผู้บริหารอนุมัติ 3=อนุมัติ 4=ไม่อนุมัติ
 *
 * Admin-id columns are varchar(30) legacy strings (e.g. "admin_tam"). We write
 * the current admin's bridge legacy id when available (admin_contact_extras.
 * legacy_admin_id) and fall back to the auth UUID otherwise — the legacy
 * column is a free-text tag, so this is faithful-enough; safeLegacyAdminId
 * clips defensively. The leave subject (`adminid`) is chosen by HR from the
 * legacy tb_admin roster (faithful to leave-record/add.php which selects
 * tb_admin.adminID).
 */

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expect YYYY-MM-DD");

/** Resolve the acting admin's legacy id (bridge) or fall back to the UUID, clipped to varchar(30). */
async function actingLegacyId(userId: string): Promise<string> {
  const bridge = await getAdminLegacyId(userId);
  return safeLegacyAdminId(bridge ?? userId, 30);
}

// ────────────────────────────────────────────────────────────
// HOLIDAY — add (faithful: time-attendance-system.php case 'add-holiday')
//   dedupe on (holidayname, holidaydate); INSERT holidayname/holidaydate/
//   adminidcreate/date(now)/note
// ────────────────────────────────────────────────────────────
const addHolidaySchema = z.object({
  holiday_name: z.string().trim().min(1).max(255),
  holiday_date: dateOnly,
  note:         z.string().trim().max(2000).optional().nullable(),
});

export async function adminAddHoliday(input: z.infer<typeof addHolidaySchema>): Promise<AdminActionResult<{ id: number }>> {
  const parsed = addHolidaySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const d = parsed.data;

  return withAdmin(["super"], async ({ adminId }) => {
    const admin = createAdminClient();

    // Legacy dedupe: same name AND same date
    const { data: dupe, error: dupeErr } = await admin
      .from("tas_holiday")
      .select("id")
      .eq("holidayname", d.holiday_name)
      .eq("holidaydate", d.holiday_date)
      .maybeSingle();
    if (dupeErr) {
      console.error(`[tas_holiday dedupe] failed`, { code: dupeErr.code, message: dupeErr.message });
      return { ok: false, error: dupeErr.message };
    }
    if (dupe) return { ok: false, error: "duplicate" };

    const { data, error } = await admin
      .from("tas_holiday")
      .insert({
        holidayname:   d.holiday_name,
        holidaydate:   d.holiday_date,
        adminidcreate: await actingLegacyId(adminId),
        date:          new Date().toISOString(),
        note:          d.note ?? "",
      })
      .select("id")
      .single();
    if (error || !data) return { ok: false, error: error?.message ?? "insert_failed" };

    await logAdminAction(adminId, "attendance.holiday_add", "tas_holiday", String(data.id), d);
    revalidatePath("/admin/hr/attendance");
    return { ok: true, data: { id: data.id as number } };
  });
}

// ────────────────────────────────────────────────────────────
// HOLIDAY — delete (faithful: add-holiday/deleteHoliday.php — DELETE by ID)
// ────────────────────────────────────────────────────────────
const deleteHolidaySchema = z.object({ id: z.coerce.number().int().positive() });

export async function adminDeleteHoliday(input: z.infer<typeof deleteHolidaySchema>): Promise<AdminActionResult> {
  const parsed = deleteHolidaySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  return withAdmin(["super"], async ({ adminId }) => {
    const admin = createAdminClient();
    const { error } = await admin.from("tas_holiday").delete().eq("id", parsed.data.id);
    if (error) return { ok: false, error: error.message };

    await logAdminAction(adminId, "attendance.holiday_delete", "tas_holiday", String(parsed.data.id));
    revalidatePath("/admin/hr/attendance");
    return { ok: true };
  });
}

// ────────────────────────────────────────────────────────────
// LEAVE — create (faithful: leave-record case 'add')
//   INSERT type/duration/startdate/enddate/adminidcreate/adminid/date(now)/
//   reason/status. status defaults to '1' (รอ HR ตรวจสอบ) like legacy.
//   adminid = the employee taking leave (legacy tb_admin.adminID string).
// ────────────────────────────────────────────────────────────
const createLeaveSchema = z.object({
  admin_id_leave: z.string().trim().min(1).max(30),                  // tb_admin.adminID string of the employee on leave
  type:           z.enum(["1", "2", "3", "4"]),                      // legacy leave type code
  duration:       z.enum(["1", "2", "3"]),                           // legacy duration code
  start_date:     dateOnly,
  end_date:       dateOnly.optional().nullable(),
  reason:         z.string().trim().max(2000).optional().nullable(),
  status:         z.enum(["1", "2", "3", "4"]).optional(),           // HR can pre-set
});

export async function adminCreateLeave(input: z.infer<typeof createLeaveSchema>): Promise<AdminActionResult<{ id: number }>> {
  const parsed = createLeaveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const d = parsed.data;
  if (d.end_date && d.end_date < d.start_date) return { ok: false, error: "end_before_start" };

  return withAdmin(["super"], async ({ adminId }) => {
    const admin = createAdminClient();
    const acting = await actingLegacyId(adminId);
    const status = d.status ?? "1";
    const { data, error } = await admin
      .from("tas_leave")
      .insert({
        type:          d.type,
        duration:      d.duration,
        startdate:     d.start_date,
        enddate:       d.end_date || null,
        adminidcreate: acting,
        adminid:       safeLegacyAdminId(d.admin_id_leave, 30),
        date:          new Date().toISOString(),
        reason:        d.reason ?? "",
        status,
        // legacy columns NOT NULL with default ''
        filename:      "",
        adminidceo:    "",
        adminidhr:     "",
      })
      .select("id")
      .single();
    if (error || !data) return { ok: false, error: error?.message ?? "insert_failed" };

    await logAdminAction(adminId, `leave.create_status_${status}`, "tas_leave", String(data.id), d);
    revalidatePath("/admin/hr/attendance/leaves");
    revalidatePath("/admin/hr/attendance");
    return { ok: true, data: { id: data.id as number } };
  });
}

// ────────────────────────────────────────────────────────────
// LEAVE — decide (advance the legacy status 1→2→3 / reject →4)
//   Legacy flow: HR ตรวจสอบ (1) → ผู้บริหารอนุมัติ (2) → อนุมัติ (3) / ไม่อนุมัติ (4).
//   We stamp adminidhr / adminidceo with the acting admin per the stage.
// ────────────────────────────────────────────────────────────
const decideLeaveSchema = z.object({
  id:        z.coerce.number().int().positive(),
  to_status: z.enum(["1", "2", "3", "4"]),
});

export async function adminDecideLeave(input: z.infer<typeof decideLeaveSchema>): Promise<AdminActionResult> {
  const parsed = decideLeaveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const d = parsed.data;

  return withAdmin(["super"], async ({ adminId }) => {
    const admin = createAdminClient();
    const acting = await actingLegacyId(adminId);

    const patch: Record<string, unknown> = { status: d.to_status };
    // Stamp the approver column matching the stage transition (faithful intent).
    if (d.to_status === "2") patch.adminidhr = acting;       // HR forwarded to exec
    if (d.to_status === "3") patch.adminidceo = acting;      // exec approved
    if (d.to_status === "4") patch.adminidceo = acting;      // exec rejected

    const { error } = await admin.from("tas_leave").update(patch).eq("id", d.id);
    if (error) return { ok: false, error: error.message };

    await logAdminAction(adminId, `leave.status_${d.to_status}`, "tas_leave", String(d.id), d);
    revalidatePath("/admin/hr/attendance/leaves");
    revalidatePath("/admin/hr/attendance");
    return { ok: true };
  });
}
