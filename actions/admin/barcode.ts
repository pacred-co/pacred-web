"use server";

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";

const scanSchema = z.object({
  mode: z.enum(["intake", "prepare", "driver"]),
  code: z.string().trim().min(1).max(200),
});

/**
 * Barcode scan handler — resolves the code to either:
 *   - A forwarder (by f_no, tracking_chn, tracking_th, or cabinet)
 *   - A service_order (by h_no)
 * Then transitions its status based on the scan mode:
 *   - intake   (รับเข้าโกดัง):  status → arrived_thailand
 *   - prepare  (เตรียมส่ง):     status → out_for_delivery
 *   - driver   (ปล่อยคนขับ):     status → out_for_delivery (or delivered if 2nd scan)
 */
export async function adminBarcodeScan(input: z.infer<typeof scanSchema>): Promise<AdminActionResult<{ message: string; ref_type: string; ref_no: string }>> {
  const parsed = scanSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const { mode, code } = parsed.data;

  return withAdmin(["ops"], async ({ adminId }) => {
    const admin = createAdminClient();

    // Try forwarder first
    const { data: f } = await admin
      .from("forwarders")
      .select("id, f_no, status, tracking_chn, tracking_th")
      .or(`f_no.eq.${code},tracking_chn.eq.${code},tracking_th.eq.${code},cabinet_number.eq.${code}`)
      .limit(1)
      .maybeSingle<{ id: string; f_no: string; status: string; tracking_chn: string | null; tracking_th: string | null }>();

    if (f) {
      const newStatus =
        mode === "intake"  ? "arrived_thailand" :
        mode === "prepare" ? "out_for_delivery" :
        f.status === "out_for_delivery" ? "delivered" : "out_for_delivery";

      const update: Record<string, unknown> = { status: newStatus, admin_id_update: adminId };
      if (newStatus === "arrived_thailand") update.date_arrived_thailand = new Date().toISOString();
      if (newStatus === "out_for_delivery") update.date_out_for_delivery = new Date().toISOString();
      if (newStatus === "delivered")        update.date_delivered        = new Date().toISOString();

      const { error } = await admin.from("forwarders").update(update).eq("id", f.id);
      if (error) return { ok: false, error: error.message };

      await logAdminAction(adminId, `barcode.${mode}`, "forwarder", f.id, { code, before: f.status, after: newStatus });
      return { ok: true, data: { message: `ฝากนำเข้า ${f.f_no} → ${newStatus}`, ref_type: "forwarder", ref_no: f.f_no } };
    }

    // Try service_order
    const { data: so } = await admin
      .from("service_orders")
      .select("id, h_no, status")
      .eq("h_no", code)
      .limit(1)
      .maybeSingle<{ id: string; h_no: string; status: string }>();

    if (so) {
      const newStatus = mode === "intake" ? "awaiting_chn_dispatch" : "completed";
      const update: Record<string, unknown> = { status: newStatus, admin_id_update: adminId };
      if (newStatus === "completed") update.date_completed = new Date().toISOString();
      const { error } = await admin.from("service_orders").update(update).eq("id", so.id);
      if (error) return { ok: false, error: error.message };

      await logAdminAction(adminId, `barcode.${mode}`, "service_order", so.id, { code, before: so.status, after: newStatus });
      return { ok: true, data: { message: `ฝากสั่ง ${so.h_no} → ${newStatus}`, ref_type: "service_order", ref_no: so.h_no } };
    }

    return { ok: false, error: "ไม่พบรายการนี้ในระบบ (ตรวจ f_no / h_no / tracking)" };
  });
}
