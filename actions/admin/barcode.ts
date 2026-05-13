"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";
import { sendNotification } from "@/lib/notifications";

const scanSchema = z.object({
  mode: z.enum(["intake", "prepare", "driver"]),
  code: z.string().trim().min(1).max(200),
});

const STATUS_LABEL: Record<string, string> = {
  arrived_thailand:  "เข้าโกดังไทยแล้ว",
  out_for_delivery:  "กำลังจัดส่ง",
  delivered:         "ส่งสำเร็จ",
  awaiting_chn_dispatch: "รอจัดส่งจากจีน",
  completed:         "สำเร็จ",
};

export type BarcodeScanResult = {
  message: string;
  ref_type: "forwarder" | "service_order";
  ref_no: string;
  member_code: string | null;
  customer_name: string | null;
  before_status: string;
  after_status: string;
};

export async function adminBarcodeScan(
  input: z.infer<typeof scanSchema>,
): Promise<AdminActionResult<BarcodeScanResult>> {
  const parsed = scanSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const { mode, code } = parsed.data;

  return withAdmin(["ops"], async ({ adminId }): Promise<AdminActionResult<BarcodeScanResult>> => {
    const admin = createAdminClient();

    // ── Try forwarder ──────────────────────────────────────────────────────
    const { data: f } = await admin
      .from("forwarders")
      .select(`
        id, f_no, status, profile_id,
        profile:profiles!profile_id ( member_code, first_name, last_name )
      `)
      .or(`f_no.eq.${code},tracking_chn.eq.${code},tracking_th.eq.${code},cabinet_number.eq.${code}`)
      .limit(1)
      .maybeSingle<{
        id: string; f_no: string; status: string; profile_id: string;
        profile: { member_code: string | null; first_name: string | null; last_name: string | null } | null;
      }>();

    if (f) {
      const newStatus =
        mode === "intake"  ? "arrived_thailand"  :
        mode === "prepare" ? "out_for_delivery"  :
        f.status === "out_for_delivery" ? "delivered" : "out_for_delivery";

      // Skip if already at target status
      if (f.status === newStatus) {
        return { ok: false, error: `${f.f_no} อยู่ที่สถานะ "${STATUS_LABEL[newStatus] ?? newStatus}" แล้ว` };
      }

      const update: Record<string, unknown> = { status: newStatus, admin_id_update: adminId };
      if (newStatus === "arrived_thailand") update.date_arrived_thailand = new Date().toISOString();
      if (newStatus === "out_for_delivery") update.date_out_for_delivery = new Date().toISOString();
      if (newStatus === "delivered")        update.date_delivered        = new Date().toISOString();

      const { error } = await admin.from("forwarders").update(update).eq("id", f.id);
      if (error) return { ok: false, error: error.message };

      await logAdminAction(adminId, `barcode.${mode}`, "forwarder", f.id, {
        code, before: f.status, after: newStatus,
      });

      void sendNotification(f.profile_id, {
        category: "forwarder",
        severity: newStatus === "delivered" ? "success" : "info",
        title:    `ฝากนำเข้า ${f.f_no} อัพเดทแล้ว`,
        body:     `สถานะ: ${STATUS_LABEL[newStatus] ?? newStatus}`,
        link_href: `/service-import/${f.f_no}`,
        reference_type: "forwarder",
        reference_id:   f.id,
      });

      revalidatePath("/admin/forwarders");
      revalidatePath("/admin/barcode");

      const profile = Array.isArray(f.profile) ? f.profile[0] ?? null : f.profile;
      return {
        ok: true,
        data: {
          message:       `${f.f_no} → ${STATUS_LABEL[newStatus] ?? newStatus}`,
          ref_type:      "forwarder",
          ref_no:        f.f_no,
          member_code:   profile?.member_code ?? null,
          customer_name: [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || null,
          before_status: f.status,
          after_status:  newStatus,
        },
      };
    }

    // ── Try service_order ──────────────────────────────────────────────────
    const { data: so } = await admin
      .from("service_orders")
      .select(`
        id, h_no, status, profile_id,
        profile:profiles!profile_id ( member_code, first_name, last_name )
      `)
      .eq("h_no", code)
      .limit(1)
      .maybeSingle<{
        id: string; h_no: string; status: string; profile_id: string;
        profile: { member_code: string | null; first_name: string | null; last_name: string | null } | null;
      }>();

    if (so) {
      const newStatus = mode === "intake" ? "awaiting_chn_dispatch" : "completed";
      if (so.status === newStatus) {
        return { ok: false, error: `${so.h_no} อยู่ที่สถานะ "${STATUS_LABEL[newStatus] ?? newStatus}" แล้ว` };
      }

      const update: Record<string, unknown> = { status: newStatus, admin_id_update: adminId };
      if (newStatus === "completed") update.date_completed = new Date().toISOString();

      const { error } = await admin.from("service_orders").update(update).eq("id", so.id);
      if (error) return { ok: false, error: error.message };

      await logAdminAction(adminId, `barcode.${mode}`, "service_order", so.id, {
        code, before: so.status, after: newStatus,
      });

      void sendNotification(so.profile_id, {
        category: "order",
        severity: "info",
        title:    `ฝากสั่ง ${so.h_no} อัพเดทแล้ว`,
        body:     `สถานะ: ${STATUS_LABEL[newStatus] ?? newStatus}`,
        link_href: `/service-order/${so.h_no}`,
        reference_type: "service_order",
        reference_id:   so.id,
      });

      revalidatePath("/admin/service-orders");
      revalidatePath("/admin/barcode");

      const profile = Array.isArray(so.profile) ? so.profile[0] ?? null : so.profile;
      return {
        ok: true,
        data: {
          message:       `${so.h_no} → ${STATUS_LABEL[newStatus] ?? newStatus}`,
          ref_type:      "service_order",
          ref_no:        so.h_no,
          member_code:   profile?.member_code ?? null,
          customer_name: [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || null,
          before_status: so.status,
          after_status:  newStatus,
        },
      };
    }

    return { ok: false, error: "ไม่พบรายการนี้ (ลอง f_no / h_no / tracking CN / tracking TH)" };
  });
}
