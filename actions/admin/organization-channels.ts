"use server";

/**
 * Admin > "ช่องทางองค์กร" (organization channels) — Server Actions.
 *
 * 1:1 transcription of the POST handlers in the legacy
 * `pcs-admin/organization-{tell,line,wechat,domainname}.php` files.
 * Each legacy file is a small CRUD dispatcher with the same shape as
 * `organization-email.php` (already ported in `organization-email.ts`):
 *   `if(isset($_POST['add']))`    → add{Channel}()
 *   `if(isset($_POST['update']))` → update{Channel}()
 * plus a `delete{Channel}()` for the row "ลบรายการ" button (the legacy
 * delete handler lived in a sibling include; we transcribe the
 * equivalent hard-delete — none of these 4 tables has a soft-delete
 * column, identical to the email port's decision).
 *
 * Mutation gate (matches the home.php $departmentKey check —
 * HR || ITDT || CEO): closest Pacred V3 RBAC = `super`, identical to
 * `organization-email.ts`.
 *
 * Audit: legacy `saveHistory($sql, <code>)` — mirrored via
 * `logAdminAction(...)` with the same status code preserved in the
 * payload for grep-ability. Status codes per the legacy comments:
 *   tell:   42 add · 44 update          (organization-tell.php L60,L99)
 *   line:   48 add · 49 update          (organization-line.php L51,L99)
 *   wechat: 54 add · 55 update          (organization-wechat.php L51,L98)
 *   domain: (legacy saveHistory commented out — we still audit the
 *           action, just without a legacy code; see notes below)
 *
 * ⚠️ SECRETS: line / wechat carry a password column (passline /
 * passwechat). These are NEVER written into the audit payload — the
 * payload carries only the natural key (the line/wechat handle) per the
 * task's redaction rule. The values still persist to the row faithfully.
 *
 * Column casing — confirmed against supabase/migrations/0081_pcs_legacy_schema.sql:
 *   tb_organization_tell:       id,date,dateupdate,tell,nameequipment,
 *                               numberequipment,adminidcreate,adminidupdate,note
 *   tb_organization_line:       id,date,dateupdate,line,emailline,telline,
 *                               passline,adminidcreate,adminidupdate,note
 *   tb_organization_wechat:     id,date,dateupdate,wechat,emailwechat,telwechat,
 *                               passwechat,adminidcreate,adminidupdate,note
 *   tb_organization_domainname: id,domain,start_date,end_date,pay_date,note,
 *                               adminidcreate,date,dateupdate,adminidupdate
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";

const PAGE_PATH = "/admin/organization-channels";

// ────────────────────────────────────────────────────────────────────────
// tb_organization_tell — "เบอร์โทรในองค์กร"
// legacy organization-tell.php: add requires tell + nameEquipment +
// numberEquipment; update dup-checks tell<>tellOld.
// ────────────────────────────────────────────────────────────────────────

const addTellSchema = z.object({
  tell:            z.string().trim().min(1, "กรุณากรอกเบอร์โทร").max(20),
  nameEquipment:   z.string().trim().min(1, "กรุณากรอกชื่ออุปกรณ์").max(255),
  numberEquipment: z.string().trim().min(1, "กรุณากรอกหมายเลขอุปกรณ์").max(255),
  note:            z.string().trim().max(2000).optional(),
});
export type AddOrgTellInput = z.infer<typeof addTellSchema>;

const updateTellSchema = addTellSchema.extend({
  ID:      z.coerce.number().int().positive(),
  tellOld: z.string().trim().min(1).max(20),
});
export type UpdateOrgTellInput = z.infer<typeof updateTellSchema>;

const deleteSchema = z.object({ ID: z.coerce.number().int().positive() });
export type DeleteOrgChannelInput = z.infer<typeof deleteSchema>;

/** 1:1 of legacy add handler (organization-tell.php L33-65). saveHistory($sql,42). */
export async function addOrgTell(
  input: AddOrgTellInput,
): Promise<AdminActionResult<{ id: number }>> {
  const parsed = addTellSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const d = parsed.data;

  return withAdmin(["super"], async ({ adminId }) => {
    const admin = createAdminClient();

    // Dup check — legacy L41-44
    const { data: dup, error: dupErr } = await admin
      .from("tb_organization_tell")
      .select("id")
      .eq("tell", d.tell)
      .limit(1)
      .maybeSingle<{ id: number }>();
    if (dupErr) console.error(`[tb_organization_tell dup] failed`, { code: dupErr.code, message: dupErr.message });
    if (dup) return { ok: false, error: "eDuplicate" };

    const now = new Date().toISOString();
    const { data: row, error } = await admin
      .from("tb_organization_tell")
      .insert({
        date:            now,
        tell:            d.tell,
        nameequipment:   d.nameEquipment,
        numberequipment: d.numberEquipment,
        adminidcreate:   adminId,
        adminidupdate:   "",
        note:            d.note ?? "",
      })
      .select("id")
      .single<{ id: number }>();
    if (error || !row) return { ok: false, error: error?.message ?? "eSQL" };

    await logAdminAction(adminId, "tb_organization_tell.add", "tb_organization_tell", String(row.id), {
      legacy_history_status: 42,
      tell: d.tell,
    });
    revalidatePath(PAGE_PATH);
    return { ok: true, data: { id: row.id } };
  });
}

/** 1:1 of legacy update handler (organization-tell.php L66-107). saveHistory($sql,44). */
export async function updateOrgTell(input: UpdateOrgTellInput): Promise<AdminActionResult> {
  const parsed = updateTellSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const d = parsed.data;

  return withAdmin(["super"], async ({ adminId }) => {
    const admin = createAdminClient();

    // Existence — legacy L78-81
    const { data: existing, error: existingErr } = await admin
      .from("tb_organization_tell")
      .select("id")
      .eq("id", d.ID)
      .limit(1)
      .maybeSingle<{ id: number }>();
    if (existingErr) {
      console.error(`[tb_organization_tell lookup] failed`, { code: existingErr.code, message: existingErr.message });
      return { ok: false, error: `db_error:${existingErr.code ?? "unknown"}` };
    }
    if (!existing) return { ok: false, error: "eSQL" };

    // Dup-on-rename — legacy L84-86
    if (d.tell !== d.tellOld) {
      const { data: dup, error: dupErr } = await admin
        .from("tb_organization_tell")
        .select("id")
        .eq("tell", d.tell)
        .neq("tell", d.tellOld)
        .limit(1)
        .maybeSingle<{ id: number }>();
      if (dupErr) console.error(`[tb_organization_tell dup] failed`, { code: dupErr.code, message: dupErr.message });
      if (dup) return { ok: false, error: "eDuplicate" };
    }

    const now = new Date().toISOString();
    const { error } = await admin
      .from("tb_organization_tell")
      .update({
        tell:            d.tell,
        nameequipment:   d.nameEquipment,
        numberequipment: d.numberEquipment,
        dateupdate:      now,
        note:            d.note ?? "",
        adminidupdate:   adminId,
      })
      .eq("id", d.ID);
    if (error) return { ok: false, error: error.message };

    await logAdminAction(adminId, "tb_organization_tell.update", "tb_organization_tell", String(d.ID), {
      legacy_history_status: 44,
      tell: d.tell,
    });
    revalidatePath(PAGE_PATH);
    return { ok: true };
  });
}

export async function deleteOrgTell(input: DeleteOrgChannelInput): Promise<AdminActionResult> {
  const parsed = deleteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  return withAdmin(["super"], async ({ adminId }) => {
    const admin = createAdminClient();
    const { error } = await admin.from("tb_organization_tell").delete().eq("id", parsed.data.ID);
    if (error) return { ok: false, error: error.message };
    await logAdminAction(adminId, "tb_organization_tell.delete", "tb_organization_tell", String(parsed.data.ID));
    revalidatePath(PAGE_PATH);
    return { ok: true };
  });
}

// ────────────────────────────────────────────────────────────────────────
// tb_organization_line — "ไลน์ในองค์กร"  (carries passline — REDACTED in audit)
// legacy organization-line.php: add requires only `line`; optional
// emailLine / passLine / telLine / note.
// ────────────────────────────────────────────────────────────────────────

const addLineSchema = z.object({
  line:      z.string().trim().min(1, "กรุณากรอกไลน์").max(255),
  emailLine: z.string().trim().max(30).optional(),
  telLine:   z.string().trim().max(30).optional(),
  passLine:  z.string().trim().max(255).optional(),
  note:      z.string().trim().max(2000).optional(),
});
export type AddOrgLineInput = z.infer<typeof addLineSchema>;

const updateLineSchema = addLineSchema.extend({
  ID:      z.coerce.number().int().positive(),
  lineOld: z.string().trim().min(1).max(255),
});
export type UpdateOrgLineInput = z.infer<typeof updateLineSchema>;

/** 1:1 of legacy add handler (organization-line.php L15-56). saveHistory($sql,48). */
export async function addOrgLine(
  input: AddOrgLineInput,
): Promise<AdminActionResult<{ id: number }>> {
  const parsed = addLineSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const d = parsed.data;

  return withAdmin(["super"], async ({ adminId }) => {
    const admin = createAdminClient();

    const { data: dup, error: dupErr } = await admin
      .from("tb_organization_line")
      .select("id")
      .eq("line", d.line)
      .limit(1)
      .maybeSingle<{ id: number }>();
    if (dupErr) console.error(`[tb_organization_line dup] failed`, { code: dupErr.code, message: dupErr.message });
    if (dup) return { ok: false, error: "eDuplicate" };

    const now = new Date().toISOString();
    const { data: row, error } = await admin
      .from("tb_organization_line")
      .insert({
        date:          now,
        line:          d.line,
        passline:      d.passLine  ?? "",
        emailline:     d.emailLine ?? "",
        telline:       d.telLine   ?? "",
        adminidcreate: adminId,
        adminidupdate: "",
        note:          d.note      ?? "",
      })
      .select("id")
      .single<{ id: number }>();
    if (error || !row) return { ok: false, error: error?.message ?? "eSQL" };

    // saveHistory($sql,48) — pass column NOT logged (secret redaction).
    await logAdminAction(adminId, "tb_organization_line.add", "tb_organization_line", String(row.id), {
      legacy_history_status: 48,
      line: d.line,
    });
    revalidatePath(PAGE_PATH);
    return { ok: true, data: { id: row.id } };
  });
}

/** 1:1 of legacy update handler (organization-line.php L57-107). saveHistory($sql,49). */
export async function updateOrgLine(input: UpdateOrgLineInput): Promise<AdminActionResult> {
  const parsed = updateLineSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const d = parsed.data;

  return withAdmin(["super"], async ({ adminId }) => {
    const admin = createAdminClient();

    const { data: existing, error: existingErr } = await admin
      .from("tb_organization_line")
      .select("id")
      .eq("id", d.ID)
      .limit(1)
      .maybeSingle<{ id: number }>();
    if (existingErr) {
      console.error(`[tb_organization_line lookup] failed`, { code: existingErr.code, message: existingErr.message });
      return { ok: false, error: `db_error:${existingErr.code ?? "unknown"}` };
    }
    if (!existing) return { ok: false, error: "eSQL" };

    if (d.line !== d.lineOld) {
      const { data: dup, error: dupErr } = await admin
        .from("tb_organization_line")
        .select("id")
        .eq("line", d.line)
        .neq("line", d.lineOld)
        .limit(1)
        .maybeSingle<{ id: number }>();
      if (dupErr) console.error(`[tb_organization_line dup] failed`, { code: dupErr.code, message: dupErr.message });
      if (dup) return { ok: false, error: "eDuplicate" };
    }

    const now = new Date().toISOString();
    const { error } = await admin
      .from("tb_organization_line")
      .update({
        line:          d.line,
        note:          d.note      ?? "",
        telline:       d.telLine   ?? "",
        emailline:     d.emailLine ?? "",
        passline:      d.passLine  ?? "",
        dateupdate:    now,
        adminidupdate: adminId,
      })
      .eq("id", d.ID);
    if (error) return { ok: false, error: error.message };

    await logAdminAction(adminId, "tb_organization_line.update", "tb_organization_line", String(d.ID), {
      legacy_history_status: 49,
      line: d.line,
    });
    revalidatePath(PAGE_PATH);
    return { ok: true };
  });
}

export async function deleteOrgLine(input: DeleteOrgChannelInput): Promise<AdminActionResult> {
  const parsed = deleteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  return withAdmin(["super"], async ({ adminId }) => {
    const admin = createAdminClient();
    const { error } = await admin.from("tb_organization_line").delete().eq("id", parsed.data.ID);
    if (error) return { ok: false, error: error.message };
    await logAdminAction(adminId, "tb_organization_line.delete", "tb_organization_line", String(parsed.data.ID));
    revalidatePath(PAGE_PATH);
    return { ok: true };
  });
}

// ────────────────────────────────────────────────────────────────────────
// tb_organization_wechat — "We Chat ในองค์กร"  (carries passwechat — REDACTED)
// legacy organization-wechat.php: add requires only `wechat`; optional
// emailWechat / telWechat / passWechat / note.
// ────────────────────────────────────────────────────────────────────────

const addWechatSchema = z.object({
  wechat:      z.string().trim().min(1, "กรุณากรอก WeChat").max(255),
  emailWechat: z.string().trim().max(30).optional(),
  telWechat:   z.string().trim().max(30).optional(),
  passWechat:  z.string().trim().max(255).optional(),
  note:        z.string().trim().max(2000).optional(),
});
export type AddOrgWechatInput = z.infer<typeof addWechatSchema>;

const updateWechatSchema = addWechatSchema.extend({
  ID:        z.coerce.number().int().positive(),
  wechatOld: z.string().trim().min(1).max(255),
});
export type UpdateOrgWechatInput = z.infer<typeof updateWechatSchema>;

/** 1:1 of legacy add handler (organization-wechat.php L15-56). saveHistory($sql,54). */
export async function addOrgWechat(
  input: AddOrgWechatInput,
): Promise<AdminActionResult<{ id: number }>> {
  const parsed = addWechatSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const d = parsed.data;

  return withAdmin(["super"], async ({ adminId }) => {
    const admin = createAdminClient();

    const { data: dup, error: dupErr } = await admin
      .from("tb_organization_wechat")
      .select("id")
      .eq("wechat", d.wechat)
      .limit(1)
      .maybeSingle<{ id: number }>();
    if (dupErr) console.error(`[tb_organization_wechat dup] failed`, { code: dupErr.code, message: dupErr.message });
    if (dup) return { ok: false, error: "eDuplicate" };

    const now = new Date().toISOString();
    const { data: row, error } = await admin
      .from("tb_organization_wechat")
      .insert({
        date:          now,
        wechat:        d.wechat,
        emailwechat:   d.emailWechat ?? "",
        telwechat:     d.telWechat   ?? "",
        passwechat:    d.passWechat  ?? "",
        adminidcreate: adminId,
        adminidupdate: "",
        note:          d.note        ?? "",
      })
      .select("id")
      .single<{ id: number }>();
    if (error || !row) return { ok: false, error: error?.message ?? "eSQL" };

    // saveHistory($sql,54) — pass column NOT logged (secret redaction).
    await logAdminAction(adminId, "tb_organization_wechat.add", "tb_organization_wechat", String(row.id), {
      legacy_history_status: 54,
      wechat: d.wechat,
    });
    revalidatePath(PAGE_PATH);
    return { ok: true, data: { id: row.id } };
  });
}

/** 1:1 of legacy update handler (organization-wechat.php L57-106). saveHistory($sql,55). */
export async function updateOrgWechat(input: UpdateOrgWechatInput): Promise<AdminActionResult> {
  const parsed = updateWechatSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const d = parsed.data;

  return withAdmin(["super"], async ({ adminId }) => {
    const admin = createAdminClient();

    const { data: existing, error: existingErr } = await admin
      .from("tb_organization_wechat")
      .select("id")
      .eq("id", d.ID)
      .limit(1)
      .maybeSingle<{ id: number }>();
    if (existingErr) {
      console.error(`[tb_organization_wechat lookup] failed`, { code: existingErr.code, message: existingErr.message });
      return { ok: false, error: `db_error:${existingErr.code ?? "unknown"}` };
    }
    if (!existing) return { ok: false, error: "eSQL" };

    if (d.wechat !== d.wechatOld) {
      const { data: dup, error: dupErr } = await admin
        .from("tb_organization_wechat")
        .select("id")
        .eq("wechat", d.wechat)
        .neq("wechat", d.wechatOld)
        .limit(1)
        .maybeSingle<{ id: number }>();
      if (dupErr) console.error(`[tb_organization_wechat dup] failed`, { code: dupErr.code, message: dupErr.message });
      if (dup) return { ok: false, error: "eDuplicate" };
    }

    const now = new Date().toISOString();
    const { error } = await admin
      .from("tb_organization_wechat")
      .update({
        wechat:        d.wechat,
        note:          d.note        ?? "",
        telwechat:     d.telWechat   ?? "",
        emailwechat:   d.emailWechat ?? "",
        passwechat:    d.passWechat  ?? "",
        dateupdate:    now,
        adminidupdate: adminId,
      })
      .eq("id", d.ID);
    if (error) return { ok: false, error: error.message };

    await logAdminAction(adminId, "tb_organization_wechat.update", "tb_organization_wechat", String(d.ID), {
      legacy_history_status: 55,
      wechat: d.wechat,
    });
    revalidatePath(PAGE_PATH);
    return { ok: true };
  });
}

export async function deleteOrgWechat(input: DeleteOrgChannelInput): Promise<AdminActionResult> {
  const parsed = deleteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  return withAdmin(["super"], async ({ adminId }) => {
    const admin = createAdminClient();
    const { error } = await admin.from("tb_organization_wechat").delete().eq("id", parsed.data.ID);
    if (error) return { ok: false, error: error.message };
    await logAdminAction(adminId, "tb_organization_wechat.delete", "tb_organization_wechat", String(parsed.data.ID));
    revalidatePath(PAGE_PATH);
    return { ok: true };
  });
}

// ────────────────────────────────────────────────────────────────────────
// tb_organization_domainname — "โดเมนเนม ขององค์กร"  (NO password column)
// legacy organization-domainname.php: add requires only `domainname`;
// optional start_date / end_date / date_pay (→ pay_date) / note.
// NOTE — legacy quirks transcribed faithfully:
//   • add inserts pay_date (from POST `date_pay`); update does NOT touch
//     pay_date (legacy UPDATE omits it — L90) → we mirror that exactly.
//   • legacy saveHistory is COMMENTED OUT for both add+update (L53,L97);
//     we still record an audit row (action-tracking) but without a
//     legacy_history_status code, matching "no legacy code assigned".
// ────────────────────────────────────────────────────────────────────────

// HTML <input type="date"> emits "YYYY-MM-DD"; allow empty.
const dateOpt = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "วันที่ไม่ถูกต้อง").optional().or(z.literal(""));

const addDomainSchema = z.object({
  domainname: z.string().trim().min(1, "กรุณากรอกโดเมนเนม").max(255),
  start_date: dateOpt,
  end_date:   dateOpt,
  date_pay:   dateOpt,
  note:       z.string().trim().max(2000).optional(),
});
export type AddOrgDomainInput = z.infer<typeof addDomainSchema>;

const updateDomainSchema = z.object({
  ID:         z.coerce.number().int().positive(),
  domain:     z.string().trim().min(1, "กรุณากรอกโดเมนเนม").max(255),
  domainOld:  z.string().trim().min(1).max(255),
  start_date: dateOpt,
  end_date:   dateOpt,
  note:       z.string().trim().max(2000).optional(),
});
export type UpdateOrgDomainInput = z.infer<typeof updateDomainSchema>;

/** null when blank — legacy stored NULL for empty optional dates. */
function dateOrNull(v: string | undefined): string | null {
  return v && v.length > 0 ? v : null;
}

/** 1:1 of legacy add handler (organization-domainname.php L15-57). saveHistory commented out. */
export async function addOrgDomain(
  input: AddOrgDomainInput,
): Promise<AdminActionResult<{ id: number }>> {
  const parsed = addDomainSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const d = parsed.data;

  return withAdmin(["super"], async ({ adminId }) => {
    const admin = createAdminClient();

    // Dup check — legacy L21-24 (column is `domain`, POST key is `domainname`)
    const { data: dup, error: dupErr } = await admin
      .from("tb_organization_domainname")
      .select("id")
      .eq("domain", d.domainname)
      .limit(1)
      .maybeSingle<{ id: number }>();
    if (dupErr) console.error(`[tb_organization_domainname dup] failed`, { code: dupErr.code, message: dupErr.message });
    if (dup) return { ok: false, error: "eDuplicate" };

    const now = new Date().toISOString();
    const { data: row, error } = await admin
      .from("tb_organization_domainname")
      .insert({
        date:          now,
        domain:        d.domainname,
        start_date:    dateOrNull(d.start_date),
        end_date:      dateOrNull(d.end_date),
        pay_date:      dateOrNull(d.date_pay),
        adminidcreate: adminId,
        adminidupdate: "",
        note:          d.note ?? "",
      })
      .select("id")
      .single<{ id: number }>();
    if (error || !row) return { ok: false, error: error?.message ?? "eSQL" };

    // Legacy saveHistory is commented out for domainname — audit anyway (no legacy code).
    await logAdminAction(adminId, "tb_organization_domainname.add", "tb_organization_domainname", String(row.id), {
      domain: d.domainname,
    });
    revalidatePath(PAGE_PATH);
    return { ok: true, data: { id: row.id } };
  });
}

/** 1:1 of legacy update handler (organization-domainname.php L58-104). saveHistory commented out.
 *  Legacy UPDATE does NOT touch pay_date — mirrored faithfully. */
export async function updateOrgDomain(input: UpdateOrgDomainInput): Promise<AdminActionResult> {
  const parsed = updateDomainSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const d = parsed.data;

  return withAdmin(["super"], async ({ adminId }) => {
    const admin = createAdminClient();

    const { data: existing, error: existingErr } = await admin
      .from("tb_organization_domainname")
      .select("id")
      .eq("id", d.ID)
      .limit(1)
      .maybeSingle<{ id: number }>();
    if (existingErr) {
      console.error(`[tb_organization_domainname lookup] failed`, { code: existingErr.code, message: existingErr.message });
      return { ok: false, error: `db_error:${existingErr.code ?? "unknown"}` };
    }
    if (!existing) return { ok: false, error: "eSQL" };

    if (d.domain !== d.domainOld) {
      const { data: dup, error: dupErr } = await admin
        .from("tb_organization_domainname")
        .select("id")
        .eq("domain", d.domain)
        .neq("domain", d.domainOld)
        .limit(1)
        .maybeSingle<{ id: number }>();
      if (dupErr) console.error(`[tb_organization_domainname dup] failed`, { code: dupErr.code, message: dupErr.message });
      if (dup) return { ok: false, error: "eDuplicate" };
    }

    const now = new Date().toISOString();
    const { error } = await admin
      .from("tb_organization_domainname")
      .update({
        domain:        d.domain,
        note:          d.note ?? "",
        start_date:    dateOrNull(d.start_date),
        end_date:      dateOrNull(d.end_date),
        dateupdate:    now,
        adminidupdate: adminId,
      })
      .eq("id", d.ID);
    if (error) return { ok: false, error: error.message };

    await logAdminAction(adminId, "tb_organization_domainname.update", "tb_organization_domainname", String(d.ID), {
      domain: d.domain,
    });
    revalidatePath(PAGE_PATH);
    return { ok: true };
  });
}

export async function deleteOrgDomain(input: DeleteOrgChannelInput): Promise<AdminActionResult> {
  const parsed = deleteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  return withAdmin(["super"], async ({ adminId }) => {
    const admin = createAdminClient();
    const { error } = await admin.from("tb_organization_domainname").delete().eq("id", parsed.data.ID);
    if (error) return { ok: false, error: error.message };
    await logAdminAction(adminId, "tb_organization_domainname.delete", "tb_organization_domainname", String(parsed.data.ID));
    revalidatePath(PAGE_PATH);
    return { ok: true };
  });
}
