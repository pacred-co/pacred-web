"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";

const ATT_STATUS = z.enum(["present", "late", "early_leave", "absent", "leave", "holiday", "off"]);
const LEAVE_TYPE = z.enum(["vacation", "sick", "personal", "maternity", "marriage", "funeral", "unpaid", "other"]);
const LEAVE_STATUS = z.enum(["pending", "approved", "rejected", "cancelled"]);

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expect YYYY-MM-DD");

// ────────────────────────────────────────────────────────────
// UPSERT attendance log (HR manually fills clock_in/out or status)
// ────────────────────────────────────────────────────────────
const upsertAttSchema = z.object({
  profile_id:   z.string().uuid(),
  work_date:    dateOnly,
  clock_in:     z.string().optional().nullable(),                    // ISO datetime
  clock_out:    z.string().optional().nullable(),
  status:       ATT_STATUS.optional(),                               // only honored for 'leave'/'holiday'/'off' overrides
  expected_in:  z.string().regex(/^\d{2}:\d{2}$/).optional(),
  expected_out: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  location:     z.string().trim().max(200).optional().nullable(),
  note:         z.string().trim().max(1000).optional().nullable(),
});

export async function adminUpsertAttendance(input: z.infer<typeof upsertAttSchema>): Promise<AdminActionResult> {
  const parsed = upsertAttSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const d = parsed.data;

  return withAdmin(["super"], async ({ adminId }) => {
    const admin = createAdminClient();
    const { error } = await admin
      .from("attendance_logs")
      .upsert(
        {
          profile_id:   d.profile_id,
          work_date:    d.work_date,
          clock_in:     d.clock_in || null,
          clock_out:    d.clock_out || null,
          expected_in:  d.expected_in ?? "08:30",
          expected_out: d.expected_out ?? "17:30",
          status:       d.status ?? "absent",
          location:     d.location ?? null,
          note:         d.note ?? null,
          recorded_by:  adminId,
          source:       "manual",
        },
        { onConflict: "profile_id,work_date" },
      );
    if (error) return { ok: false, error: error.message };

    await logAdminAction(adminId, "attendance.upsert", "attendance_log", `${d.profile_id}/${d.work_date}`, d);
    revalidatePath("/admin/hr/attendance");
    return { ok: true };
  });
}

// ────────────────────────────────────────────────────────────
// Quick mark — buttons for "clock-in now" / "clock-out now"
// ────────────────────────────────────────────────────────────
const quickSchema = z.object({
  profile_id: z.string().uuid(),
  work_date:  dateOnly,
  field:      z.enum(["clock_in", "clock_out"]),
});

export async function adminQuickClock(input: z.infer<typeof quickSchema>): Promise<AdminActionResult> {
  const parsed = quickSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const d = parsed.data;

  return withAdmin(["super"], async ({ adminId }) => {
    const admin = createAdminClient();
    const now = new Date().toISOString();

    // Read existing row to preserve the other timestamp
    const { data: existing } = await admin
      .from("attendance_logs")
      .select("clock_in, clock_out, expected_in, expected_out")
      .eq("profile_id", d.profile_id)
      .eq("work_date", d.work_date)
      .maybeSingle();

    const row = {
      profile_id:   d.profile_id,
      work_date:    d.work_date,
      clock_in:     d.field === "clock_in"  ? now : existing?.clock_in  ?? null,
      clock_out:    d.field === "clock_out" ? now : existing?.clock_out ?? null,
      expected_in:  existing?.expected_in  ?? "08:30",
      expected_out: existing?.expected_out ?? "17:30",
      source:       "manual",
      recorded_by:  adminId,
    };

    const { error } = await admin
      .from("attendance_logs")
      .upsert(row, { onConflict: "profile_id,work_date" });
    if (error) return { ok: false, error: error.message };

    await logAdminAction(adminId, `attendance.${d.field}`, "attendance_log", `${d.profile_id}/${d.work_date}`);
    revalidatePath("/admin/hr/attendance");
    return { ok: true };
  });
}

// ────────────────────────────────────────────────────────────
// CREATE leave request (HR on behalf of employee, OR employee self via
// /me/leaves once that ships — currently admin only)
// ────────────────────────────────────────────────────────────
const createLeaveSchema = z.object({
  profile_id:  z.string().uuid(),
  leave_type:  LEAVE_TYPE,
  start_date:  dateOnly,
  end_date:    dateOnly,
  days_count:  z.coerce.number().min(0.5).max(365),
  reason:      z.string().trim().max(2000).optional().nullable(),
  status:      LEAVE_STATUS.optional(),                              // HR can pre-approve
});

export async function adminCreateLeave(input: z.infer<typeof createLeaveSchema>): Promise<AdminActionResult<{ id: string }>> {
  const parsed = createLeaveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const d = parsed.data;
  if (d.end_date < d.start_date) return { ok: false, error: "end_before_start" };

  return withAdmin(["super"], async ({ adminId }) => {
    const admin = createAdminClient();
    const status = d.status ?? "pending";
    const { data, error } = await admin
      .from("leave_requests")
      .insert({
        profile_id:  d.profile_id,
        leave_type:  d.leave_type,
        start_date:  d.start_date,
        end_date:    d.end_date,
        days_count:  d.days_count,
        reason:      d.reason ?? null,
        status,
        approved_by: status === "approved" ? adminId : null,
        approved_at: status === "approved" ? new Date().toISOString() : null,
      })
      .select("id")
      .single();
    if (error || !data) return { ok: false, error: error?.message ?? "insert_failed" };

    await logAdminAction(adminId, `leave.create_${status}`, "leave_request", data.id, d);
    revalidatePath("/admin/hr/attendance");
    revalidatePath("/admin/hr/attendance/leaves");
    return { ok: true, data: { id: data.id } };
  });
}

// ────────────────────────────────────────────────────────────
// Approve / Reject / Cancel leave
// ────────────────────────────────────────────────────────────
const decideSchema = z.object({
  id:            z.string().uuid(),
  to_status:     z.enum(["approved", "rejected", "cancelled"]),
  approval_note: z.string().trim().max(500).optional().nullable(),
});

export async function adminDecideLeave(input: z.infer<typeof decideSchema>): Promise<AdminActionResult> {
  const parsed = decideSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const d = parsed.data;

  return withAdmin(["super"], async ({ adminId }) => {
    const admin = createAdminClient();
    const { error } = await admin
      .from("leave_requests")
      .update({
        status:        d.to_status,
        approved_by:   adminId,
        approved_at:   new Date().toISOString(),
        approval_note: d.approval_note ?? null,
      })
      .eq("id", d.id);
    if (error) return { ok: false, error: error.message };

    await logAdminAction(adminId, `leave.${d.to_status}`, "leave_request", d.id, d);
    revalidatePath("/admin/hr/attendance");
    revalidatePath("/admin/hr/attendance/leaves");
    return { ok: true };
  });
}
