"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";

const updateSchema = z.object({
  service_fee:                 z.number().min(0).max(10000),
  juristic_discount_threshold: z.number().min(0).max(1000000),
  juristic_discount_pct:       z.number().min(0).max(1),       // 0-1 (e.g. 0.01 = 1%)
  qc_fee_per_item:             z.number().min(0).max(10000),
  crate_fee_base:              z.number().min(0).max(100000),
  free_shipping_enabled:       z.boolean(),
  free_shipping_threshold:     z.number().min(0).max(1000000).optional().nullable(),
  yuan_rate:                   z.number().positive().max(100),
});
export type AdminUpdateSettingsInput = z.infer<typeof updateSchema>;

export async function adminUpdateSettings(input: AdminUpdateSettingsInput): Promise<AdminActionResult> {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const d = parsed.data;

  return withAdmin(["super"], async ({ adminId }) => {
    const admin = createAdminClient();

    const { error } = await admin
      .from("settings")
      .update({
        service_fee:                 d.service_fee,
        juristic_discount_threshold: d.juristic_discount_threshold,
        juristic_discount_pct:       d.juristic_discount_pct,
        qc_fee_per_item:             d.qc_fee_per_item,
        crate_fee_base:              d.crate_fee_base,
        free_shipping_enabled:       d.free_shipping_enabled,
        free_shipping_threshold:     d.free_shipping_threshold ?? null,
        yuan_rate:                   d.yuan_rate,
      })
      .eq("id", 1);

    if (error) return { ok: false, error: error.message };

    await logAdminAction(adminId, "settings.update", "settings", "1", d);
    revalidatePath("/admin/settings");
    return { ok: true };
  });
}
