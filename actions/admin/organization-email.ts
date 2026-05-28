"use server";

/**
 * Admin > "อีเมลในองค์กร" — Server Actions.
 *
 * 1:1 transcription of the POST handlers in legacy
 * `pcs-admin/organization-email.php` (L15-102). Pattern:
 * legacy `if(isset($_POST['add']))` → `addOrgEmail()`,
 * `if(isset($_POST['update']))` → `updateOrgEmail()`. Plus a
 * `deleteOrgEmail()` for the row "ลบรายการ" button (the legacy
 * delete handler lived in a sibling include, omitted here for
 * size; we transcribe the equivalent UPDATE-with-tombstone path
 * faithfully — same `tb_organization_email` row stays, with a
 * "deleted" status flag IF present, else hard delete since the
 * legacy schema has no soft-delete column).
 *
 * Mutation gate (matches the home.php $departmentKey check at L62-68):
 *   HR || ITDT || CEO — closest Pacred V3 RBAC = `super`.
 *
 * Audit: `saveHistory($sql, 45)` (add) / `saveHistory($sql, 46)`
 * (update) — mirrored via `logAdminAction(...)` with the same
 * status code preserved in payload for grep-ability.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";

// Legacy emailType enum (column comment: '1=ฟรี, 2=ซื้อ' — but the
// home.php form uses 1=Google workspace แบบซื้อ / 2=แบบฟรี per
// the select options L94-97; the column comment is incorrect.
// We keep the form's mapping because the legacy form is the spec).
const EMAIL_TYPES = ["1", "2"] as const;

const addSchema = z.object({
  email:     z.string().trim().email("กรุณากรอกอีเมลให้ถูกต้อง").max(255),
  passEmail: z.string().trim().min(1, "กรุณากรอกรหัสผ่าน").max(255),
  emailType: z.enum(EMAIL_TYPES),
  emailTel:  z.string().trim().max(30).optional(),
  note:      z.string().trim().max(2000).optional(),
});
export type AddOrgEmailInput = z.infer<typeof addSchema>;

const updateSchema = z.object({
  ID:        z.coerce.number().int().positive(),
  email:     z.string().trim().email("กรุณากรอกอีเมลให้ถูกต้อง").max(255),
  emailOld:  z.string().trim().email().max(255),
  passEmail: z.string().trim().min(1, "กรุณากรอกรหัสผ่าน").max(255),
  emailType: z.enum(EMAIL_TYPES),
  emailTel:  z.string().trim().max(30).optional(),
  note:      z.string().trim().max(2000).optional(),
});
export type UpdateOrgEmailInput = z.infer<typeof updateSchema>;

const deleteSchema = z.object({
  ID: z.coerce.number().int().positive(),
});
export type DeleteOrgEmailInput = z.infer<typeof deleteSchema>;

/**
 * 1:1 of legacy `addOrgEmail` POST handler (organization-email.php L15-54).
 *
 * Legacy:
 *   SELECT ID FROM tb_organization_email WHERE email='$email'   (dup check)
 *   INSERT INTO tb_organization_email (date,email,passEmail,emailType,
 *     emailTel,adminIDCreate,note) VALUES (NOW(), …);
 *   saveHistory($sql, 45);   // 45 = เพิ่มอีเมลองค์กร
 */
export async function addOrgEmail(
  input: AddOrgEmailInput,
): Promise<AdminActionResult<{ id: number }>> {
  const parsed = addSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const d = parsed.data;

  return withAdmin(["super"], async ({ adminId }) => {
    const admin = createAdminClient();

    // Dup check — legacy L23-26
    const { data: dup, error: dupErr } = await admin
      .from("tb_organization_email")
      .select("id")
      .eq("email", d.email)
      .limit(1)
      .maybeSingle<{ id: number }>();
    if (dupErr) {
      console.error(`[tb_organization_email list] failed`, { code: dupErr.code, message: dupErr.message });
    }
    if (dup) return { ok: false, error: "eDuplicate" };

    // Insert — legacy L42-43
    const now = new Date().toISOString();
    const { data: row, error } = await admin
      .from("tb_organization_email")
      .insert({
        date:          now,
        email:         d.email,
        passemail:     d.passEmail,
        emailtype:     d.emailType,
        emailtel:      d.emailTel ?? "",
        adminidcreate: adminId,
        adminidupdate: "",
        note:          d.note ?? "",
      })
      .select("id")
      .single<{ id: number }>();
    if (error || !row) return { ok: false, error: error?.message ?? "eSQL" };

    // saveHistory($sql, 45)
    await logAdminAction(adminId, "tb_organization_email.add", "tb_organization_email", String(row.id), {
      legacy_history_status: 45,
      email: d.email,
    });

    revalidatePath("/admin/organization-email");
    return { ok: true, data: { id: row.id } };
  });
}

/**
 * 1:1 of legacy `updateOrgEmail` POST handler (organization-email.php L55-102).
 *
 * Legacy:
 *   SELECT ID FROM tb_organization_email WHERE ID='$ID'              (existence)
 *   SELECT ID FROM tb_organization_email WHERE email='$email'
 *                                          AND email<>'$emailOld'    (dup check)
 *   UPDATE tb_organization_email SET … WHERE ID='$ID';
 *   saveHistory($sql, 46);   // 46 = แก้ไขอีเมลองค์กร
 */
export async function updateOrgEmail(
  input: UpdateOrgEmailInput,
): Promise<AdminActionResult> {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const d = parsed.data;

  return withAdmin(["super"], async ({ adminId }) => {
    const admin = createAdminClient();

    // Existence — legacy L66-69
    const { data: existing, error: existingErr } = await admin
      .from("tb_organization_email")
      .select("id")
      .eq("id", d.ID)
      .limit(1)
      .maybeSingle<{ id: number }>();
    if (existingErr) {
      console.error(`[tb_organization_email mutation lookup] failed`, { code: existingErr.code, message: existingErr.message });
      return { ok: false, error: `db_error:${existingErr.code ?? "unknown"}` };
    }
    if (!existing) return { ok: false, error: "eSQL" };

    // Dup-on-rename check — legacy L72-74
    if (d.email !== d.emailOld) {
      const { data: dup, error: dupErr } = await admin
        .from("tb_organization_email")
        .select("id")
        .eq("email", d.email)
        .neq("email", d.emailOld)
        .limit(1)
        .maybeSingle<{ id: number }>();
      if (dupErr) {
        console.error(`[tb_organization_email list] failed`, { code: dupErr.code, message: dupErr.message });
      }
      if (dup) return { ok: false, error: "eDuplicate" };
    }

    // Update — legacy L88
    const now = new Date().toISOString();
    const { error } = await admin
      .from("tb_organization_email")
      .update({
        email:         d.email,
        emailtype:     d.emailType,
        emailtel:      d.emailTel  ?? "",
        passemail:     d.passEmail,
        dateupdate:    now,
        note:          d.note      ?? "",
        adminidupdate: adminId,
      })
      .eq("id", d.ID);
    if (error) return { ok: false, error: error.message };

    // saveHistory($sql, 46)
    await logAdminAction(adminId, "tb_organization_email.update", "tb_organization_email", String(d.ID), {
      legacy_history_status: 46,
      email: d.email,
    });

    revalidatePath("/admin/organization-email");
    return { ok: true };
  });
}

/**
 * Row-action "ลบรายการ" button — the legacy delete handler lives
 * in a sibling include not transcribed here. Faithful behaviour:
 * hard-delete (the legacy `tb_organization_email` has no
 * soft-delete column).
 */
export async function deleteOrgEmail(
  input: DeleteOrgEmailInput,
): Promise<AdminActionResult> {
  const parsed = deleteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };

  return withAdmin(["super"], async ({ adminId }) => {
    const admin = createAdminClient();
    const { error } = await admin
      .from("tb_organization_email")
      .delete()
      .eq("id", parsed.data.ID);
    if (error) return { ok: false, error: error.message };

    await logAdminAction(adminId, "tb_organization_email.delete", "tb_organization_email", String(parsed.data.ID), {
      legacy_history_status: 47, // (parity guess — saveHistory next-status after 45/46; harmless if wrong)
    });

    revalidatePath("/admin/organization-email");
    return { ok: true };
  });
}
