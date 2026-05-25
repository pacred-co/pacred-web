"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";

const STATUSES = ["new", "read", "replied", "closed"] as const;

const updateSchema = z.object({
  id:     z.string().uuid(),
  status: z.enum(STATUSES),
});
export type AdminUpdateContactStatusInput = z.infer<typeof updateSchema>;

/**
 * Update a contact_message status (triage workflow).
 *   new → read → replied → closed
 * Idempotent — no-op if already at target status. Audit logged.
 */
export async function adminUpdateContactStatus(
  input: AdminUpdateContactStatusInput,
): Promise<AdminActionResult> {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  return withAdmin(["ops"], async ({ adminId }) => {
    const admin = createAdminClient();
    const { data: existing, error: existingErr } = await admin
      .from("contact_messages")
      .select("id, status")
      .eq("id", d.id)
      .maybeSingle<{ id: string; status: string }>();
    if (existingErr) {
      console.error(`[contact_messages mutation lookup] failed`, { code: existingErr.code, message: existingErr.message });
      return { ok: false, error: `db_error:${existingErr.code ?? "unknown"}` };
    }
    if (!existing) return { ok: false, error: "not_found" };
    if (existing.status === d.status) return { ok: true };

    const { error } = await admin
      .from("contact_messages")
      .update({ status: d.status })
      .eq("id", existing.id);
    if (error) return { ok: false, error: error.message };

    await logAdminAction(adminId, "contact_message.update_status", "contact_message", existing.id, {
      before: { status: existing.status },
      after:  { status: d.status },
    });

    revalidatePath("/admin/contact-messages");
    return { ok: true };
  });
}
