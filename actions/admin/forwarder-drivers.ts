"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";
import { sendNotification } from "@/lib/notifications";

/**
 * Admin actions on forwarder_driver assignments (P-18 + T-P1 cargo revenue path).
 * Admins can:
 *   - CREATE assignments via adminAssignDriverToForwarder (T-P1 — biggest cargo workflow gap)
 *   - Transition status via adminUpdateDriverAssignmentStatus (P-18)
 * Cron handles the auto 1→3 expiry (17h timeout).
 */

type Status = 1 | 2 | 3 | 4;

const updateSchema = z.object({
  id:        z.string().uuid(),
  status:    z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  note:      z.string().trim().max(500).optional(),
});
export type AdminUpdateDriverAssignmentInput = z.infer<typeof updateSchema>;

const STATUS_LABEL: Record<Status, string> = {
  1: "มอบหมายแล้ว (รอรับงาน)",
  2: "รับงานแล้ว",
  3: "หมดเวลารับงาน",
  4: "ส่งงานเสร็จ",
};

export async function adminUpdateDriverAssignmentStatus(
  input: AdminUpdateDriverAssignmentInput,
): Promise<AdminActionResult> {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  return withAdmin(["ops"], async ({ adminId }) => {
    const admin = createAdminClient();
    const { data: existing } = await admin
      .from("forwarder_driver")
      .select("id, status, profile_id, forwarder_id, fd_date, accepted_at, completed_at")
      .eq("id", d.id)
      .maybeSingle<{
        id: string;
        status: Status;
        profile_id: string;
        forwarder_id: string;
        fd_date: string;
        accepted_at: string | null;
        completed_at: string | null;
      }>();

    if (!existing) return { ok: false, error: "not_found" };
    if (existing.status === d.status) return { ok: true };  // no-op

    const update: Record<string, unknown> = { status: d.status };
    if (d.note !== undefined)               update.note         = d.note;
    if (d.status === 2 && !existing.accepted_at)  update.accepted_at  = new Date().toISOString();
    if (d.status === 4 && !existing.completed_at) update.completed_at = new Date().toISOString();

    const { error } = await admin
      .from("forwarder_driver")
      .update(update)
      .eq("id", existing.id);
    if (error) return { ok: false, error: error.message };

    await logAdminAction(
      adminId,
      "forwarder_driver.update_status",
      "forwarder_driver",
      existing.id,
      {
        forwarder_id: existing.forwarder_id,
        driver_id:    existing.profile_id,
        before:       { status: existing.status },
        after:        { status: d.status, label: STATUS_LABEL[d.status] },
      },
    );

    revalidatePath("/admin/drivers");
    revalidatePath(`/admin/drivers/${existing.id}`);
    return { ok: true };
  });
}

// ────────────────────────────────────────────────────────────
// T-P1: ASSIGN driver to forwarder (the missing-link from P-18)
// ────────────────────────────────────────────────────────────
//
// P-18 only built the status-transition action.  Admins still couldn't
// CREATE an assignment from the UI — they had to insert the row by hand
// in Supabase Table Editor.  Per Part T-P1 (cargo revenue path), this
// is one of the highest-leverage admin workflow gaps because every
// cargo shipment needs a driver before it can leave the warehouse.
//
// Driver identification: the schema allows any profile_id (no driver
// role flag).  In practice ops staff knows the driver by their member
// code (PR<5-digit>), so we accept member_code OR raw profile_id.
// Resolving by member_code is friendlier — typing UUIDs is error-prone.
//
// Re-assignment: if an open (status=1 or 2) assignment already exists
// for this forwarder, fail loud — admin should explicitly cancel the
// old one (mark status=3 expired or status=4 completed) before creating
// a new one.  Prevents accidental double-assignment.

const assignSchema = z.object({
  forwarder_id: z.string().uuid(),
  // Either provide member_code (friendlier) or profile_id (fallback).
  // At least one must be present.
  member_code:  z.string().trim().regex(/^PR\d{5}$/i, "member_code ต้องเป็นรูปแบบ PR00001").optional(),
  profile_id:   z.string().uuid().optional(),
  note:         z.string().trim().max(500).optional(),
}).refine(
  (d) => d.member_code || d.profile_id,
  { message: "ต้องระบุ member_code หรือ profile_id อย่างน้อย 1 อย่าง" },
);
export type AdminAssignDriverInput = z.infer<typeof assignSchema>;

export async function adminAssignDriverToForwarder(
  input: AdminAssignDriverInput,
): Promise<AdminActionResult<{ assignment_id: string }>> {
  const parsed = assignSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  return withAdmin(["ops"], async ({ adminId }) => {
    const admin = createAdminClient();

    // 1. Resolve driver profile_id ────────────────────────────
    let driverProfileId: string;
    if (d.profile_id) {
      driverProfileId = d.profile_id;
    } else {
      // member_code → profile_id lookup; case-insensitive (uppercase
      // stored, but admins might type lowercase).
      const code = d.member_code!.toUpperCase();
      const { data: prof } = await admin
        .from("profiles")
        .select("id")
        .eq("member_code", code)
        .maybeSingle<{ id: string }>();
      if (!prof) return { ok: false, error: `ไม่พบ profile member_code = ${code}` };
      driverProfileId = prof.id;
    }

    // 2. Verify forwarder exists + grab info for the notification ──
    const { data: forwarder } = await admin
      .from("forwarders")
      .select("id, f_no, profile_id, status")
      .eq("id", d.forwarder_id)
      .maybeSingle<{ id: string; f_no: string; profile_id: string; status: string }>();
    if (!forwarder) return { ok: false, error: "forwarder_not_found" };

    // 3. Reject if there's already an OPEN assignment ─────────
    const { data: existing } = await admin
      .from("forwarder_driver")
      .select("id, status")
      .eq("forwarder_id", d.forwarder_id)
      .in("status", [1, 2])  // 1=assigned, 2=accepted (open states)
      .maybeSingle<{ id: string; status: number }>();
    if (existing) {
      return {
        ok: false,
        error: `forwarder นี้มีคนขับมอบหมายอยู่แล้ว (assignment ${existing.id} status=${existing.status}). กรุณายกเลิกของเดิมก่อน`,
      };
    }

    // 4. Insert new assignment (status=1 = waiting for accept) ──
    const { data: created, error } = await admin
      .from("forwarder_driver")
      .insert({
        forwarder_id: d.forwarder_id,
        profile_id:   driverProfileId,
        status:       1,
        note:         d.note ?? null,
      })
      .select("id")
      .single<{ id: string }>();
    if (error) return { ok: false, error: error.message };

    await logAdminAction(
      adminId,
      "forwarder_driver.assign",
      "forwarder_driver",
      created.id,
      {
        forwarder_id: d.forwarder_id,
        f_no:         forwarder.f_no,
        driver_id:    driverProfileId,
        member_code:  d.member_code ?? null,
      },
    );

    // 5. Notify driver (LINE push if linked, else falls through to
    //    notifications table).  Driver has 17h to accept before cron
    //    auto-expires the assignment to status=3.
    // Reference type "forwarder" so the driver's notification deep-links
    // back to the shipment.  No "forwarder_driver" reference type in the
    // notification schema (drivers see assignments via /driver/jobs UI
    // which lists by status).
    void sendNotification(driverProfileId, {
      category: "forwarder",
      severity: "info",
      title:    `งานใหม่ — ${forwarder.f_no}`,
      body:     `มีงานขนส่งมอบหมายให้คุณ — กรุณารับงานภายใน 17 ชม.`,
      link_href: `/driver/jobs/${created.id}`,
      reference_type: "forwarder",
      reference_id:   forwarder.id,
    });

    revalidatePath(`/admin/forwarders/${forwarder.f_no}`);
    revalidatePath("/admin/drivers");
    return { ok: true, data: { assignment_id: created.id } };
  });
}
