"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";

/**
 * Admin actions on forwarder_driver assignments (P-18).
 * Admins can transition status manually for ops adjustments —
 * cron handles the auto 1→3 expiry.
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
