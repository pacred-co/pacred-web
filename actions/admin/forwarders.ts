"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";
import { sendNotification } from "@/lib/notifications";
import { notify } from "@/lib/notifications/templates";

const STATUSES = [
  "pending_payment","shipped_china","in_transit","arrived_thailand",
  "out_for_delivery","delivered","cancelled",
] as const;

const updateForwarderSchema = z.object({
  f_no:             z.string(),
  status:           z.enum(STATUSES).optional(),
  tracking_chn:     z.string().trim().max(255).optional(),
  tracking_th:      z.string().trim().max(255).optional(),
  cabinet_number:   z.string().trim().max(255).optional(),
  partner_warehouse: z.enum(["sang","ctt","mk","mx","jmf"]).optional(),
  note_admin:       z.string().trim().max(2000).optional(),
});
export type UpdateForwarderInput = z.infer<typeof updateForwarderSchema>;

const STATUS_DATE_COL: Record<string, string | null> = {
  shipped_china:    "date_shipped_china",
  in_transit:       "date_in_transit",
  arrived_thailand: "date_arrived_thailand",
  out_for_delivery: "date_out_for_delivery",
  delivered:        "date_delivered",
};

export async function adminUpdateForwarder(input: UpdateForwarderInput): Promise<AdminActionResult> {
  const parsed = updateForwarderSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  return withAdmin(["ops"], async ({ adminId }) => {
    const admin = createAdminClient();

    // Fetch existing for diff + customer notification
    const { data: existing } = await admin
      .from("forwarders")
      .select("id, profile_id, status, total_price")
      .eq("f_no", d.f_no)
      .maybeSingle<{ id: string; profile_id: string; status: string; total_price: number }>();
    if (!existing) return { ok: false, error: "not_found" };

    const update: Record<string, unknown> = { admin_id_update: adminId };
    let statusChanged = false;

    if (d.status && d.status !== existing.status) {
      update.status = d.status;
      statusChanged = true;
      const dateCol = STATUS_DATE_COL[d.status];
      if (dateCol) update[dateCol] = new Date().toISOString();
    }
    if (d.tracking_chn      != null) update.tracking_chn      = d.tracking_chn || null;
    if (d.tracking_th       != null) update.tracking_th       = d.tracking_th || null;
    if (d.cabinet_number    != null) update.cabinet_number    = d.cabinet_number || null;
    if (d.partner_warehouse != null) update.partner_warehouse = d.partner_warehouse;
    if (d.note_admin        != null) update.note_admin        = d.note_admin || null;

    const { error } = await admin
      .from("forwarders")
      .update(update)
      .eq("id", existing.id);

    if (error) return { ok: false, error: error.message };

    await logAdminAction(adminId, "forwarder.update", "forwarder", existing.id, {
      f_no: d.f_no, before: { status: existing.status }, after: update,
    });

    // Notify customer when status changes
    if (statusChanged && d.status) {
      void sendNotification(existing.profile_id, notify.forwarderStatusChanged({
        fNo:         d.f_no,
        status:      d.status,
        forwarderId: existing.id,
      }));
    }

    revalidatePath("/admin/forwarders");
    revalidatePath(`/admin/forwarders/${d.f_no}`);
    return { ok: true };
  });
}

// ── Bulk status update ────────────────────────────────────────────────────────

const bulkSchema = z.object({
  f_nos:  z.array(z.string()).min(1).max(100),
  status: z.enum(STATUSES),
});

export async function adminBulkUpdateForwarderStatus(
  input: z.infer<typeof bulkSchema>,
): Promise<AdminActionResult & { updated?: number }> {
  const parsed = bulkSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const { f_nos, status } = parsed.data;

  return withAdmin(["ops"], async ({ adminId }) => {
    const admin = createAdminClient();

    const { data: existing } = await admin
      .from("forwarders")
      .select("id, f_no, profile_id, status")
      .in("f_no", f_nos);

    if (!existing || existing.length === 0) return { ok: false, error: "not_found" };

    const dateCol = STATUS_DATE_COL[status];
    const update: Record<string, unknown> = {
      status,
      admin_id_update: adminId,
      ...(dateCol ? { [dateCol]: new Date().toISOString() } : {}),
    };

    const { error } = await admin
      .from("forwarders")
      .update(update)
      .in("f_no", f_nos);

    if (error) return { ok: false, error: error.message };

    await logAdminAction(adminId, "forwarder.bulk_update", "forwarder", "bulk", {
      f_nos, before_statuses: existing.map((r) => ({ f_no: r.f_no, status: r.status })), after: { status },
    });

    // Notify each customer
    for (const row of existing) {
      if (row.status === status) continue;
      void sendNotification(row.profile_id, notify.forwarderStatusChanged({
        fNo:         row.f_no,
        status,
        forwarderId: row.id,
      }));
    }

    revalidatePath("/admin/forwarders");
    return { ok: true, updated: existing.length };
  });
}
