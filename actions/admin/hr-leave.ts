"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";

/**
 * HR การลา (item 4b · owner) — คำขอลา 2 ชั้น: HR อนุมัติก่อน → CEO อนุมัติปิดท้าย.
 *
 * เขียน `hr_leave_request` (mig 0294 · reference · ไม่แตะเงิน). ทุก transition
 * fold `.eq("status", <ที่คาดหวัง>)` เข้า UPDATE WHERE → กดค้าง/กดซ้ำข้ามชั้นไม่ได้
 * (stale click ข้ามด่านไม่ได้เชิงโครงสร้าง). RBAC:
 *   • ยื่นลา / HR อนุมัติ / ปฏิเสธ = super | accounting (ชั้น HR)
 *   • CEO อนุมัติ = super เท่านั้น (ชั้น CEO)
 */

const HR_ROLES = ["super", "accounting"] as const;   // ยื่น / HR อนุมัติ / ปฏิเสธ
const CEO_ROLES = ["super"] as const;                 // CEO อนุมัติ (ปิดท้าย)

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const createSchema = z
  .object({
    adminLoginId: z.string().trim().min(1).max(60),
    leaveType: z.enum(["ลากิจ", "ลาป่วย", "ลาพักร้อน", "อื่นๆ"]),
    startDate: z.string().trim().regex(DATE_RE, "รูปแบบวันที่ไม่ถูกต้อง"),
    endDate: z.string().trim().regex(DATE_RE, "รูปแบบวันที่ไม่ถูกต้อง"),
    reason: z.string().trim().max(1000).optional().default(""),
  })
  .refine((d) => d.endDate >= d.startDate, { message: "วันสิ้นสุดต้องไม่ก่อนวันเริ่ม", path: ["endDate"] });

export type CreateLeaveInput = z.infer<typeof createSchema>;

/** นับจำนวนวันลา รวมวันเริ่ม-สิ้นสุด (yyyy-mm-dd · UTC-safe) */
function inclusiveDays(start: string, end: string): number {
  const s = Date.parse(`${start}T00:00:00Z`);
  const e = Date.parse(`${end}T00:00:00Z`);
  if (Number.isNaN(s) || Number.isNaN(e)) return 1;
  return Math.floor((e - s) / 86_400_000) + 1;
}

/** พนักงาน/HR ยื่นใบลา — สร้างแถวสถานะ pending (รอ HR อนุมัติ) */
export async function createLeaveRequest(input: CreateLeaveInput): Promise<AdminActionResult> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const d = parsed.data;

  return withAdmin([...HR_ROLES], async ({ adminId: actor }) => {
    const admin = createAdminClient();

    // ผู้ยื่นต้องเป็นพนักงานที่ login ได้ (มี profiles active) — กัน center/คนออก
    const { data: prof, error: pErr } = await admin
      .from("profiles").select("id").eq("admin_login_id", d.adminLoginId).eq("is_active", true).maybeSingle();
    if (pErr) return { ok: false, error: `db_error:${pErr.code ?? "unknown"}` };
    if (!prof) return { ok: false, error: "staff_not_found_or_inactive" };

    const days = inclusiveDays(d.startDate, d.endDate);
    const { error } = await admin.from("hr_leave_request").insert({
      admin_login_id: d.adminLoginId,
      leave_type: d.leaveType,
      start_date: d.startDate,
      end_date: d.endDate,
      days,
      reason: d.reason || null,
      status: "pending",
    });
    if (error) return { ok: false, error: `db_error:${error.code ?? "unknown"}` };

    await logAdminAction(actor, "hr.leave_create", "hr_leave_request", d.adminLoginId, {
      leaveType: d.leaveType, startDate: d.startDate, endDate: d.endDate, days,
    });
    revalidatePath("/admin/hr/leave");
    return { ok: true };
  });
}

const idSchema = z.object({ id: z.string().uuid() });
export type LeaveIdInput = z.infer<typeof idSchema>;

/** ชั้น HR อนุมัติ — pending → hr_approved (fold status guard เข้า WHERE) */
export async function hrApproveLeave(input: LeaveIdInput): Promise<AdminActionResult> {
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  return withAdmin([...HR_ROLES], async ({ adminId: actor }) => {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("hr_leave_request")
      .update({ status: "hr_approved", hr_approved_by: actor, hr_approved_at: new Date().toISOString() })
      .eq("id", parsed.data.id)
      .eq("status", "pending")            // ← กัน stale/กดซ้ำ: ต้องเป็น pending เท่านั้น
      .select("id");
    if (error) return { ok: false, error: `db_error:${error.code ?? "unknown"}` };
    if (!data || data.length === 0) return { ok: false, error: "สถานะเปลี่ยนไปแล้ว (ต้องอยู่ที่ 'รอ HR')" };

    await logAdminAction(actor, "hr.leave_hr_approve", "hr_leave_request", parsed.data.id);
    revalidatePath("/admin/hr/leave");
    return { ok: true };
  });
}

/** ชั้น CEO อนุมัติปิดท้าย — hr_approved → approved (super เท่านั้น) */
export async function ceoApproveLeave(input: LeaveIdInput): Promise<AdminActionResult> {
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  return withAdmin([...CEO_ROLES], async ({ adminId: actor }) => {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("hr_leave_request")
      .update({ status: "approved", ceo_approved_by: actor, ceo_approved_at: new Date().toISOString() })
      .eq("id", parsed.data.id)
      .eq("status", "hr_approved")        // ← ต้องผ่าน HR มาก่อนเท่านั้น (ข้ามชั้นไม่ได้)
      .select("id");
    if (error) return { ok: false, error: `db_error:${error.code ?? "unknown"}` };
    if (!data || data.length === 0) return { ok: false, error: "สถานะเปลี่ยนไปแล้ว (ต้องอยู่ที่ 'รอ CEO')" };

    await logAdminAction(actor, "hr.leave_ceo_approve", "hr_leave_request", parsed.data.id);
    revalidatePath("/admin/hr/leave");
    return { ok: true };
  });
}

const rejectSchema = z.object({
  id: z.string().uuid(),
  reason: z.string().trim().max(1000).optional().default(""),
});
export type RejectLeaveInput = z.infer<typeof rejectSchema>;

/** ปฏิเสธคำขอลา — ได้ที่ชั้น pending หรือ hr_approved → rejected */
export async function rejectLeave(input: RejectLeaveInput): Promise<AdminActionResult> {
  const parsed = rejectSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  return withAdmin([...HR_ROLES], async ({ adminId: actor }) => {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("hr_leave_request")
      .update({ status: "rejected", reject_reason: parsed.data.reason || null })
      .eq("id", parsed.data.id)
      .in("status", ["pending", "hr_approved"])   // ← ปฏิเสธได้เฉพาะที่ยังไม่จบ
      .select("id");
    if (error) return { ok: false, error: `db_error:${error.code ?? "unknown"}` };
    if (!data || data.length === 0) return { ok: false, error: "คำขอนี้ปิดไปแล้ว (อนุมัติ/ปฏิเสธแล้ว)" };

    await logAdminAction(actor, "hr.leave_reject", "hr_leave_request", parsed.data.id, { reason: parsed.data.reason });
    revalidatePath("/admin/hr/leave");
    return { ok: true };
  });
}
