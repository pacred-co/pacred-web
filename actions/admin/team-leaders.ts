"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";

const createSchema = z.object({
  profile_id:     z.string().uuid("profile_id ต้องเป็น uuid"),
  team_code:      z.string().trim().min(1, "เลือก team_code"),
  commission_pct: z.number().min(0).max(1, "commission_pct ต้องอยู่ระหว่าง 0-1 (เช่น 0.01 = 1%)"),
});
export type CreateTeamLeaderInput = z.infer<typeof createSchema>;

export async function adminCreateTeamLeader(input: CreateTeamLeaderInput): Promise<AdminActionResult> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const d = parsed.data;

  return withAdmin(["sales_admin"], async ({ adminId }) => {
    const admin = createAdminClient();

    // Verify the profile exists
    const { data: prof, error: profErr } = await admin.from("profiles").select("id, member_code").eq("id", d.profile_id).maybeSingle();
    if (profErr) {
      console.error(`[profiles mutation lookup] failed`, { code: profErr.code, message: profErr.message });
      return { ok: false, error: `db_error:${profErr.code ?? "unknown"}` };
    }
    if (!prof) return { ok: false, error: "ไม่พบ profile" };

    const { error } = await admin
      .from("team_leaders")
      .upsert(
        {
          profile_id:     d.profile_id,
          team_code:      d.team_code,
          commission_pct: d.commission_pct,
          is_active:      true,
        },
        { onConflict: "profile_id,team_code" },
      );

    if (error) return { ok: false, error: error.message };

    await logAdminAction(adminId, "team_leader.create", "team_leader", `${d.profile_id}/${d.team_code}`, d);
    revalidatePath("/admin/team-leaders");
    return { ok: true };
  });
}

const toggleSchema = z.object({
  id:         z.string().uuid(),
  is_active:  z.boolean(),
});
export async function adminToggleTeamLeader(input: z.infer<typeof toggleSchema>): Promise<AdminActionResult> {
  const parsed = toggleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  return withAdmin(["sales_admin"], async ({ adminId }) => {
    const admin = createAdminClient();
    const { error } = await admin
      .from("team_leaders")
      .update({ is_active: parsed.data.is_active })
      .eq("id", parsed.data.id);
    if (error) return { ok: false, error: error.message };

    await logAdminAction(adminId, "team_leader.toggle", "team_leader", parsed.data.id, { is_active: parsed.data.is_active });
    revalidatePath("/admin/team-leaders");
    return { ok: true };
  });
}

const updatePctSchema = z.object({
  id:             z.string().uuid(),
  commission_pct: z.number().min(0).max(1),
});
export async function adminUpdateTeamLeaderPct(input: z.infer<typeof updatePctSchema>): Promise<AdminActionResult> {
  const parsed = updatePctSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  return withAdmin(["sales_admin"], async ({ adminId }) => {
    const admin = createAdminClient();
    const { error } = await admin
      .from("team_leaders")
      .update({ commission_pct: parsed.data.commission_pct })
      .eq("id", parsed.data.id);
    if (error) return { ok: false, error: error.message };

    await logAdminAction(adminId, "team_leader.update_pct", "team_leader", parsed.data.id, { commission_pct: parsed.data.commission_pct });
    revalidatePath("/admin/team-leaders");
    return { ok: true };
  });
}
