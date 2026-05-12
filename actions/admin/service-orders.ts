"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";
import { sendNotification } from "@/lib/notifications";

const STATUSES = [
  "pending","awaiting_payment","ordered","awaiting_chn_dispatch","completed","cancelled",
] as const;

const updateSchema = z.object({
  h_no:    z.string(),
  status:  z.enum(STATUSES).optional(),
  note_admin: z.string().trim().max(2000).optional(),
});
export type AdminUpdateServiceOrderInput = z.infer<typeof updateSchema>;

const STATUS_LABEL: Record<string, string> = {
  pending: "รอดำเนินการ", awaiting_payment: "รอชำระเงิน", ordered: "สั่งสินค้าแล้ว",
  awaiting_chn_dispatch: "รอจีนจัดส่ง", completed: "สำเร็จ", cancelled: "ยกเลิก",
};
const STATUS_DATE_COL: Record<string, string | null> = {
  awaiting_payment: "date_awaiting_payment",
  ordered:          "date_ordered",
  awaiting_chn_dispatch: "date_dispatched",
  completed:        "date_completed",
};

export async function adminUpdateServiceOrder(input: AdminUpdateServiceOrderInput): Promise<AdminActionResult> {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const d = parsed.data;

  return withAdmin(["ops"], async ({ adminId }) => {
    const admin = createAdminClient();
    const { data: existing } = await admin
      .from("service_orders")
      .select("id, profile_id, status, total_thb")
      .eq("h_no", d.h_no)
      .maybeSingle<{ id: string; profile_id: string; status: string; total_thb: number }>();
    if (!existing) return { ok: false, error: "not_found" };

    const update: Record<string, unknown> = { admin_id_update: adminId };
    let statusChanged = false;
    if (d.status && d.status !== existing.status) {
      update.status = d.status;
      statusChanged = true;
      const dateCol = STATUS_DATE_COL[d.status];
      if (dateCol) update[dateCol] = new Date().toISOString();
    }
    if (d.note_admin != null) update.note_admin = d.note_admin || null;

    const { error } = await admin.from("service_orders").update(update).eq("id", existing.id);
    if (error) return { ok: false, error: error.message };

    await logAdminAction(adminId, "service_order.update", "service_order", existing.id, {
      h_no: d.h_no, before: { status: existing.status }, after: update,
    });

    if (statusChanged && d.status) {
      void sendNotification(existing.profile_id, {
        category: "order",
        severity: d.status === "cancelled" ? "warning" : "info",
        title:    `ฝากสั่ง ${d.h_no} อัพเดทแล้ว`,
        body:     `สถานะ: ${STATUS_LABEL[d.status] ?? d.status}`,
        link_href: `/service-order/${d.h_no}`,
        reference_type: "service_order",
        reference_id:   existing.id,
      });
    }

    revalidatePath("/admin/service-orders");
    revalidatePath(`/admin/service-orders/${d.h_no}`);
    return { ok: true };
  });
}
