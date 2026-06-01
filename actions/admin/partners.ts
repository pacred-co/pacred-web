"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";

/**
 * Admin CRUD for the `partners` table — the external logistics/business
 * partner directory (CLAUDE.md §PM-6 #3 · staff-CRUD gap).
 *
 * "Partner" = an external company in Pacred's supply chain — the
 * GOGO/JMF/TTP/MOMO/CargoThai-style consolidators, china/thai warehouse
 * partners (sang/ctt/mk/mx), customs brokers, messengers, API providers.
 * This is an admin-managed CRM-style company directory — NOT a partner-portal
 * login and NOT API-config wiring (see migration 0136 header + the morning
 * review note).
 *
 * Gate: super (per the build brief). Partner records touch the business
 * relationship + commercial terms → kept super-only for the MVP. (Easy to
 * widen to ["super","ops"] later if the owner wants ops staff to maintain it.)
 *
 * Edit semantics (mirrors carriers.ts):
 *   - `code` is immutable after creation (would orphan future links). To
 *     change a wrong code: create a new partner + delete/deactivate the old.
 *   - All other fields editable.
 *   - Soft-delete (is_active=false) is the safe default.
 *   - Hard-delete is ALSO supported (the staff-CRUD audit explicitly wanted
 *     it) — guarded super-only + double-confirmed in the UI.
 */

const codeRe = /^[a-z0-9_]{2,32}$/;

const PARTNER_TYPES = [
  "cargo_consolidator",
  "freight",
  "customs",
  "warehouse",
  "last_mile",
  "messenger",
  "api_provider",
  "other",
] as const;

const upsertSchema = z.object({
  // For UPDATE, pass id (code omitted = immutable). For CREATE, code required.
  id:            z.string().uuid().optional(),
  code:          z.string().regex(codeRe, "code: 2-32 ตัว, lowercase + ตัวเลข + _ เท่านั้น").optional(),
  name:          z.string().trim().min(1, "ชื่อพาร์ทเนอร์ต้องระบุ").max(150),
  name_en:       z.string().trim().max(150).optional().nullable(),
  partner_type:  z.enum(PARTNER_TYPES).optional(),
  contact_name:  z.string().trim().max(150).optional().nullable(),
  contact_phone: z.string().trim().max(50).optional().nullable(),
  contact_email: z.string().trim().max(200).optional().nullable(),
  note:          z.string().trim().max(2000).optional().nullable(),
  is_active:     z.boolean().optional(),
  sort:          z.number().int().min(0).max(9999).optional(),
});
export type UpsertPartnerInput = z.infer<typeof upsertSchema>;

export async function adminUpsertPartner(
  input: UpsertPartnerInput,
): Promise<AdminActionResult<{ id: string; created: boolean }>> {
  const parsed = upsertSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  type UpsertResult = { id: string; created: boolean };
  return withAdmin<UpsertResult>(["super"], async ({ adminId }) => {
    const admin = createAdminClient();

    if (d.id) {
      // ── UPDATE ──
      const update: Record<string, unknown> = { name: d.name };
      // Optional fields — undefined means "don't change".
      if (d.name_en       !== undefined) update.name_en       = d.name_en || null;
      if (d.partner_type  !== undefined) update.partner_type  = d.partner_type;
      if (d.contact_name  !== undefined) update.contact_name  = d.contact_name || null;
      if (d.contact_phone !== undefined) update.contact_phone = d.contact_phone || null;
      if (d.contact_email !== undefined) update.contact_email = d.contact_email || null;
      if (d.note          !== undefined) update.note          = d.note || null;
      if (d.is_active     !== undefined) update.is_active     = d.is_active;
      if (d.sort          !== undefined) update.sort          = d.sort;

      const { error } = await admin.from("partners").update(update).eq("id", d.id);
      if (error) return { ok: false, error: error.message };

      await logAdminAction(adminId, "partner.update", "partner", d.id, {
        fields_changed: Object.keys(update),
      });
      revalidatePath("/admin/partners");
      return { ok: true, data: { id: d.id, created: false } };
    } else {
      // ── CREATE ──
      if (!d.code) return { ok: false, error: "code ต้องระบุเมื่อสร้างใหม่" };

      const { data, error } = await admin
        .from("partners")
        .insert({
          code:          d.code,
          name:          d.name,
          name_en:       d.name_en || null,
          partner_type:  d.partner_type ?? "other",
          contact_name:  d.contact_name || null,
          contact_phone: d.contact_phone || null,
          contact_email: d.contact_email || null,
          note:          d.note || null,
          is_active:     d.is_active ?? true,
          sort:          d.sort ?? 100,
        })
        .select("id")
        .single<{ id: string }>();
      if (error) {
        if (error.code === "23505") {
          return { ok: false, error: `code "${d.code}" มีอยู่แล้ว — ใช้ code อื่น หรือแก้ของเดิม` };
        }
        return { ok: false, error: error.message };
      }

      await logAdminAction(adminId, "partner.create", "partner", data.id, {
        code:         d.code,
        name:         d.name,
        partner_type: d.partner_type ?? "other",
      });
      revalidatePath("/admin/partners");
      return { ok: true, data: { id: data.id, created: true } };
    }
  });
}

/**
 * Soft-delete shortcut — flips is_active. Keeps the row for history.
 */
export async function adminSetPartnerActive(
  id: string,
  isActive: boolean,
): Promise<AdminActionResult> {
  if (typeof id !== "string" || id.length < 8) return { ok: false, error: "invalid_id" };
  return withAdmin(["super"], async ({ adminId }) => {
    const admin = createAdminClient();
    const { error } = await admin.from("partners").update({ is_active: isActive }).eq("id", id);
    if (error) return { ok: false, error: error.message };
    await logAdminAction(adminId, isActive ? "partner.activate" : "partner.deactivate", "partner", id);
    revalidatePath("/admin/partners");
    return { ok: true };
  });
}

/**
 * Hard-delete — permanently removes the row (the staff-CRUD audit explicitly
 * asked for hard-delete; today most admin tables only soft-delete). super-only;
 * the UI double-confirms. Best-effort audit log BEFORE the delete so the
 * action is still recorded even though the target row will be gone.
 */
export async function adminDeletePartner(id: string): Promise<AdminActionResult> {
  if (typeof id !== "string" || id.length < 8) return { ok: false, error: "invalid_id" };
  return withAdmin(["super"], async ({ adminId }) => {
    const admin = createAdminClient();
    // Log first (target_id will be dangling after delete — that's expected).
    await logAdminAction(adminId, "partner.delete", "partner", id);
    const { error } = await admin.from("partners").delete().eq("id", id);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/admin/partners");
    return { ok: true };
  });
}
