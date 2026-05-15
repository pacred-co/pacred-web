"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";

/**
 * Admin CRUD for the `carriers` table (U2-3).
 *
 * Per chat audit L-8: SPX/J&T/Flash/EMS/Lalamove asks happened ~4x in
 * 6 weeks. Admin can now add a carrier without dev escalation.
 *
 * Gate: super OR ops. Accounting NOT included — carriers are operational
 * config, not financial.
 *
 * Edit semantics:
 *   - `code` is immutable after creation (would orphan future FKs).
 *     Admin must create a new carrier + soft-delete (is_active=false)
 *     the old one if the code itself was wrong.
 *   - All other fields editable.
 *   - Soft-delete only (is_active=false). No hard delete to preserve
 *     references in audit logs / future shipment FK history.
 */

const codeRe = /^[a-z0-9_]{2,32}$/;

const upsertSchema = z.object({
  // For UPDATE, omit code (treat as immutable). For CREATE, required.
  id:                    z.string().uuid().optional(),
  code:                  z.string().regex(codeRe, "code: 2-32 ตัว, lowercase + ตัวเลข + _ เท่านั้น").optional(),
  name_th:               z.string().trim().min(1, "ชื่อภาษาไทยต้องระบุ").max(100),
  name_en:               z.string().trim().min(1, "ชื่อภาษาอังกฤษต้องระบุ").max(100),
  tracking_url_template: z.string().trim().max(500).optional().nullable(),
  is_active:             z.boolean().optional(),
  sort_order:            z.number().int().min(0).max(9999).optional(),
  note:                  z.string().trim().max(2000).optional().nullable(),
});
export type UpsertCarrierInput = z.infer<typeof upsertSchema>;

export async function adminUpsertCarrier(
  input: UpsertCarrierInput,
): Promise<AdminActionResult<{ id: string; created: boolean }>> {
  const parsed = upsertSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  // Tracking URL must be empty OR contain {tracking} placeholder
  if (d.tracking_url_template && !d.tracking_url_template.includes("{tracking}")) {
    return { ok: false, error: "tracking URL ต้องมี {tracking} placeholder" };
  }

  type UpsertResult = { id: string; created: boolean };
  return withAdmin<UpsertResult>(["super", "ops"], async ({ adminId }) => {
    const admin = createAdminClient();

    // Determine create vs update
    if (d.id) {
      // ── UPDATE ──
      const update: Record<string, unknown> = {
        name_th:    d.name_th,
        name_en:    d.name_en,
      };
      // Optional fields — undefined means "don't change"
      if (d.tracking_url_template !== undefined) update.tracking_url_template = d.tracking_url_template || null;
      if (d.is_active             !== undefined) update.is_active             = d.is_active;
      if (d.sort_order            !== undefined) update.sort_order            = d.sort_order;
      if (d.note                  !== undefined) update.note                  = d.note || null;

      const { error } = await admin.from("carriers").update(update).eq("id", d.id);
      if (error) return { ok: false, error: error.message };

      await logAdminAction(adminId, "carrier.update", "carrier", d.id, {
        fields_changed: Object.keys(update),
      });
      revalidatePath("/admin/carriers");
      return { ok: true, data: { id: d.id, created: false } };
    } else {
      // ── CREATE ──
      if (!d.code) return { ok: false, error: "code ต้องระบุเมื่อสร้างใหม่" };

      const { data, error } = await admin
        .from("carriers")
        .insert({
          code:                  d.code,
          name_th:               d.name_th,
          name_en:               d.name_en,
          tracking_url_template: d.tracking_url_template || null,
          is_active:             d.is_active ?? true,
          sort_order:            d.sort_order ?? 100,
          note:                  d.note || null,
        })
        .select("id")
        .single<{ id: string }>();
      if (error) {
        // Catch unique-constraint violation (code already exists)
        if (error.code === "23505") {
          return { ok: false, error: `code "${d.code}" มีอยู่แล้ว — ใช้ code อื่น หรือแก้ของเดิม` };
        }
        return { ok: false, error: error.message };
      }

      await logAdminAction(adminId, "carrier.create", "carrier", data.id, {
        code:    d.code,
        name_th: d.name_th,
        name_en: d.name_en,
      });
      revalidatePath("/admin/carriers");
      return { ok: true, data: { id: data.id, created: true } };
    }
  });
}

/**
 * Soft-delete shortcut — flips is_active=false. Keeps the row for
 * audit-log integrity + future FK references.
 */
export async function adminDeactivateCarrier(id: string): Promise<AdminActionResult> {
  if (typeof id !== "string" || id.length < 8) return { ok: false, error: "invalid_id" };
  return withAdmin(["super", "ops"], async ({ adminId }) => {
    const admin = createAdminClient();
    const { error } = await admin.from("carriers").update({ is_active: false }).eq("id", id);
    if (error) return { ok: false, error: error.message };
    await logAdminAction(adminId, "carrier.deactivate", "carrier", id);
    revalidatePath("/admin/carriers");
    return { ok: true };
  });
}
