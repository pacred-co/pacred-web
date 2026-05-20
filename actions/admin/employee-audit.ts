"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";

const TYPE = z.enum(["praise", "note", "warning", "disciplinary", "training", "review", "other"]);
const SEV  = z.enum(["info", "low", "medium", "high", "critical"]);

const createSchema = z.object({
  profile_id:  z.string().uuid(),
  entry_type:  TYPE,
  severity:    SEV.optional(),
  title:       z.string().trim().min(2).max(200),
  description: z.string().trim().max(5000).optional().nullable(),
  related_at:  z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
});

export async function adminCreateAuditEntry(input: z.infer<typeof createSchema>): Promise<AdminActionResult<{ id: string }>> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const d = parsed.data;

  return withAdmin(["super"], async ({ adminId }) => {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("employee_audit_entries")
      .insert({
        profile_id:  d.profile_id,
        entry_type:  d.entry_type,
        severity:    d.severity ?? "info",
        title:       d.title,
        description: d.description ?? null,
        related_at:  d.related_at ?? null,
        created_by:  adminId,
      })
      .select("id")
      .single();
    if (error || !data) return { ok: false, error: error?.message ?? "insert_failed" };
    await logAdminAction(adminId, `employee_audit.${d.entry_type}`, "employee_audit_entry", data.id, d);
    revalidatePath("/admin/hr/audit");
    revalidatePath(`/admin/admins/${d.profile_id}`);
    return { ok: true, data: { id: data.id } };
  });
}

const deleteSchema = z.object({ id: z.string().uuid() });

export async function adminDeleteAuditEntry(input: z.infer<typeof deleteSchema>): Promise<AdminActionResult> {
  const parsed = deleteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  return withAdmin(["super"], async ({ adminId }) => {
    const admin = createAdminClient();
    const { error } = await admin.from("employee_audit_entries").delete().eq("id", parsed.data.id);
    if (error) return { ok: false, error: error.message };
    await logAdminAction(adminId, "employee_audit.delete", "employee_audit_entry", parsed.data.id);
    revalidatePath("/admin/hr/audit");
    return { ok: true };
  });
}
