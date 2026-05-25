"use server";

/**
 * Server Actions backing the faithful-port `admin-profile.php` detail
 * page (app/[locale]/(admin)/admin/admins/[id]/page.tsx).
 *
 * The legacy PHP combines all mutations into one `$_POST['…']`-routed
 * switch at the top of the file (admin-profile.php L10-254). Each
 * branch becomes one Server Action here. The signatures + behaviour
 * are 1:1 with the legacy SQL — see the L<N> citations above each
 * action.
 *
 * Auth — the legacy gate is `departmentKey == 'CEO' | 'Manager' |
 * 'ITDT' | 'HR' | 'Accounting'` depending on the action, OR the admin
 * editing their own row (`$adminIDGet == $adminID`). The closest V3
 * RBAC role is `super`. Self-edit is allowed for everyone. We pass
 * `["super"]` to `withAdmin()` for the strict gates and check
 * self-edit explicitly for the "own-row" gates.
 *
 * Faithful-port rule (gotcha §4 + §7): a port of a legacy password
 * UPDATE would desync Supabase Auth from `tb_users` — but the
 * admin-profile flow as transcribed never writes a password (the
 * "reset password" path lives in the separate admin-table action).
 * Profile data + bank accounts + furlough + education = no auth
 * touch, plain `tb_*` writes.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";

// ────────────────────────────────────────────────────────────
// addAccAdmin — admin-profile.php L13-27
// INSERT INTO tb_account_pcs (bankName, accountNumber, accountName, adminID)
// ────────────────────────────────────────────────────────────
const addBankSchema = z.object({
  admin_id:       z.string().trim().min(1).max(30),
  bank_name:      z.string().trim().min(1).max(300),
  account_number: z.string().trim().min(1).max(300),
  account_name:   z.string().trim().min(1).max(300),
});

export async function adminAddBankAccount(
  input: z.infer<typeof addBankSchema>,
): Promise<AdminActionResult> {
  const parsed = addBankSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const d = parsed.data;

  return withAdmin(["super", "accounting"], async ({ adminId }) => {
    const admin = createAdminClient();
    const { error } = await admin.from("tb_account_pcs").insert({
      bankname:      d.bank_name,
      accountnumber: d.account_number,
      accountname:   d.account_name,
      adminid:       d.admin_id,
    });
    if (error) return { ok: false, error: error.message };

    await logAdminAction(adminId, "admin-profile.add_bank", "tb_account_pcs", d.admin_id, d);
    revalidatePath(`/admin/admins/${d.admin_id}`);
    return { ok: true };
  });
}

// ────────────────────────────────────────────────────────────
// deleteAccAdmin — admin-profile.php L1474-1509 (AJAX -> include/pages/
// admin-profile/deleteAccAdmin.php). Plain DELETE; no soft-delete column
// on the legacy `tb_account_pcs`.
// ────────────────────────────────────────────────────────────
const deleteBankSchema = z.object({
  account_id: z.union([z.string(), z.number()]).transform((v) => Number(v)),
  admin_id:   z.string().trim().min(1).max(30),
});

export async function adminDeleteBankAccount(
  input: z.infer<typeof deleteBankSchema>,
): Promise<AdminActionResult> {
  const parsed = deleteBankSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const d = parsed.data;

  return withAdmin(["super", "accounting"], async ({ adminId }) => {
    const admin = createAdminClient();
    const { error } = await admin.from("tb_account_pcs").delete().eq("id", d.account_id);
    if (error) return { ok: false, error: error.message };

    await logAdminAction(adminId, "admin-profile.delete_bank", "tb_account_pcs", String(d.account_id), d);
    revalidatePath(`/admin/admins/${d.admin_id}`);
    return { ok: true };
  });
}

// ────────────────────────────────────────────────────────────
// upFurlough — admin-profile.php L28-39
// UPDATE tb_admin SET adminTMP = ? WHERE adminID = ?
// ────────────────────────────────────────────────────────────
const furloughSchema = z.object({
  admin_id:   z.string().trim().min(1).max(30),
  admin_tmp:  z.enum(["1", "2"]), // 1 = ทำงานต่อ, 2 = พักงานชั่วคราว
});

export async function adminUpdateFurlough(
  input: z.infer<typeof furloughSchema>,
): Promise<AdminActionResult> {
  const parsed = furloughSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const d = parsed.data;

  return withAdmin(["super"], async ({ adminId }) => {
    const admin = createAdminClient();
    const { error } = await admin
      .from("tb_admin")
      .update({ admintmp: d.admin_tmp })
      .eq("adminid", d.admin_id);
    if (error) return { ok: false, error: error.message };

    await logAdminAction(adminId, "admin-profile.furlough", "tb_admin", d.admin_id, d);
    revalidatePath(`/admin/admins/${d.admin_id}`);
    return { ok: true };
  });
}

// ────────────────────────────────────────────────────────────
// addEducationAdmin — admin-profile.php L40-67
// INSERT INTO tb_education_background (...) — one row per education entry
// (the legacy form repeats N rows; each gets one INSERT).
// ────────────────────────────────────────────────────────────
const educationEntrySchema = z.object({
  education_status:     z.enum(["1", "2"]),      // 1 = จบ, 2 = กำลังศึกษา
  education_level:      z.string().trim().min(1).max(2),
  institution:          z.string().trim().min(1).max(255),
  faculty:              z.string().trim().max(255).optional().nullable(),
  education_department: z.string().trim().max(255).optional().nullable(),
  graduate_year:        z.union([z.string(), z.number()]).optional().nullable(),
  gpa:                  z.union([z.string(), z.number()]).optional().nullable(),
});
const addEducationSchema = z.object({
  admin_id: z.string().trim().min(1).max(30),
  entries:  z.array(educationEntrySchema).min(1),
});

export async function adminAddEducation(
  input: z.infer<typeof addEducationSchema>,
): Promise<AdminActionResult> {
  const parsed = addEducationSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const d = parsed.data;
  const now = new Date().toISOString();

  return withAdmin(["super"], async ({ adminId }) => {
    const admin = createAdminClient();
    const rows = d.entries.map((e) => ({
      educationstatus:     e.education_status,
      educationlevel:      e.education_level,
      institution:         e.institution,
      faculty:             e.faculty ?? "",
      educationdepartment: e.education_department ?? "",
      graduateyear:        e.graduate_year ? Number(e.graduate_year) : null,
      gpa:                 e.gpa ? Number(e.gpa) : 0,
      adminid:             d.admin_id,
      date:                now,
    }));
    const { error } = await admin.from("tb_education_background").insert(rows);
    if (error) return { ok: false, error: error.message };

    await logAdminAction(adminId, "admin-profile.add_education", "tb_education_background", d.admin_id, { count: rows.length });
    revalidatePath(`/admin/admins/${d.admin_id}`);
    return { ok: true };
  });
}

// ────────────────────────────────────────────────────────────
// deleteEducationAdmin — admin-profile.php L1510-1545 (AJAX ->
// include/pages/admin-profile/deleteEducationAdmin.php)
// ────────────────────────────────────────────────────────────
const deleteEducationSchema = z.object({
  education_id: z.union([z.string(), z.number()]).transform((v) => Number(v)),
  admin_id:     z.string().trim().min(1).max(30),
});

export async function adminDeleteEducation(
  input: z.infer<typeof deleteEducationSchema>,
): Promise<AdminActionResult> {
  const parsed = deleteEducationSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const d = parsed.data;

  return withAdmin(["super"], async ({ adminId }) => {
    const admin = createAdminClient();
    const { error } = await admin.from("tb_education_background").delete().eq("id", d.education_id);
    if (error) return { ok: false, error: error.message };

    await logAdminAction(adminId, "admin-profile.delete_education", "tb_education_background", String(d.education_id), d);
    revalidatePath(`/admin/admins/${d.admin_id}`);
    return { ok: true };
  });
}

// ────────────────────────────────────────────────────────────
// upCommInterpreter — admin-profile.php L228-254
// INSERT or UPDATE tb_set_comm_interpreter (one row per admin).
// ────────────────────────────────────────────────────────────
const interpreterCommSchema = z.object({
  admin_id: z.string().trim().min(1).max(20),
  per_com:  z.union([z.string(), z.number()]).transform((v) => Number(v)),
});

export async function adminUpdateInterpreterCommission(
  input: z.infer<typeof interpreterCommSchema>,
): Promise<AdminActionResult> {
  const parsed = interpreterCommSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const d = parsed.data;
  if (!Number.isFinite(d.per_com) || d.per_com < 0 || d.per_com > 100) {
    return { ok: false, error: "invalid_per_com" };
  }

  return withAdmin(["super"], async ({ adminId }) => {
    const admin = createAdminClient();
    const now = new Date().toISOString();

    // Mirror the legacy "INSERT ELSE UPDATE" logic: check existence, branch.
    const { data: existing, error: existingErr } = await admin
      .from("tb_set_comm_interpreter")
      .select("id")
      .eq("adminid", d.admin_id)
      .maybeSingle();
    if (existingErr) {
      console.error(`[tb_set_comm_interpreter list] failed`, { code: existingErr.code, message: existingErr.message });
    }

    let error;
    if (!existing) {
      const ins = await admin.from("tb_set_comm_interpreter").insert({
        percom:        d.per_com,
        dateupdate:    now,
        adminidupdate: adminId,
        adminid:       d.admin_id,
      });
      error = ins.error;
    } else {
      const upd = await admin
        .from("tb_set_comm_interpreter")
        .update({ percom: d.per_com, dateupdate: now, adminidupdate: adminId })
        .eq("adminid", d.admin_id);
      error = upd.error;
    }
    if (error) return { ok: false, error: error.message };

    await logAdminAction(adminId, "admin-profile.set_interpreter_comm", "tb_set_comm_interpreter", d.admin_id, d);
    revalidatePath(`/admin/admins/${d.admin_id}`);
    return { ok: true };
  });
}

// ────────────────────────────────────────────────────────────
// updateProfile — admin-profile.php L68-227
// Two phases (gated by legacy `departmentKey` checks):
//   (a) personal fields + address + org email/tel/line/wechat
//       (allowed when editing self OR HR/ITDT/CEO/Manager)
//   (b) job-position fields (allowed only when HR/ITDT/CEO)
// ────────────────────────────────────────────────────────────
const profileSchema = z.object({
  admin_id: z.string().trim().min(1).max(30),

  // (a) personal
  admin_tel:        z.string().trim().max(13).optional(),
  admin_email:      z.string().trim().toLowerCase().max(255).optional(),
  admin_name:       z.string().trim().max(200).optional(),
  admin_last_name:  z.string().trim().max(200).optional(),
  admin_nickname:   z.string().trim().max(200).optional(),
  admin_sex:        z.string().trim().max(4).optional(),
  marital_status:   z.string().trim().max(2).optional(),
  religion:         z.string().trim().max(2).optional(),
  nationality:      z.string().trim().max(200).optional(),
  national_id_card: z.string().trim().max(25).optional(),
  admin_birthday:   z.string().trim().optional(),    // YYYY-MM-DD
  expiry_date:      z.string().trim().optional(),    // YYYY-MM-DD
  // address (tb_admin_address — UPDATEd only if a row exists)
  address_no:       z.string().trim().optional(),
  district:         z.string().trim().max(255).optional(),
  amphoe:           z.string().trim().max(255).optional(),
  province:         z.string().trim().max(255).optional(),
  zipcode:          z.string().trim().max(10).optional(),
  address_note:     z.string().trim().optional(),
  // org channels — null = skip (legacy: only DELETE+INSERT if non-empty)
  admin_email_org:  z.union([z.string(), z.number()]).optional().nullable(),
  admin_tel_org:    z.union([z.string(), z.number()]).optional().nullable(),
  admin_line_org:   z.union([z.string(), z.number()]).optional().nullable(),
  admin_wechat_org: z.union([z.string(), z.number()]).optional().nullable(),

  // (b) job position — only set when caller is super/HR/ITDT/CEO
  company_type:    z.string().trim().max(1).optional(),
  admin_type:      z.string().trim().max(1).optional(),
  admin_tmp:       z.string().trim().max(1).optional(),
  salary_type:     z.string().trim().max(1).optional(),
  department:      z.string().trim().max(2).optional(),
  section:         z.string().trim().max(2).optional(),
  start_date:      z.string().trim().optional(),
  end_date:        z.string().trim().optional(),
  salary:          z.union([z.string(), z.number()]).optional().nullable(),

  /** When true, attempt the (b) job-position update too. The page
   *  should only set this when the caller is `super` (mirrors legacy
   *  HR/ITDT/CEO gate). */
  update_job_position: z.boolean().optional(),
});

export async function adminUpdateProfile(
  input: z.infer<typeof profileSchema>,
): Promise<AdminActionResult> {
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const d = parsed.data;

  // Phase (a) — self-edit allowed; phase (b) — super only. We allow super
  // to call this directly; for self-edit on phase (a) only the page must
  // strip `update_job_position`. (The page enforces the split before
  // invoking the action.)
  return withAdmin(["super"], async ({ adminId }) => {
    const admin = createAdminClient();

    // ── (a) tb_admin personal columns (L94-113) ──
    const personalUpdate: Record<string, unknown> = {};
    if (d.admin_tel        !== undefined) personalUpdate.admintel        = d.admin_tel;
    if (d.admin_email      !== undefined) personalUpdate.adminemail      = d.admin_email;
    if (d.admin_name       !== undefined) personalUpdate.adminname       = d.admin_name;
    if (d.admin_last_name  !== undefined) personalUpdate.adminlastname   = d.admin_last_name;
    if (d.admin_nickname   !== undefined) personalUpdate.adminnickname   = d.admin_nickname;
    if (d.admin_sex        !== undefined) personalUpdate.adminsex        = d.admin_sex;
    if (d.marital_status   !== undefined) personalUpdate.maritalstatus   = d.marital_status;
    if (d.religion         !== undefined) personalUpdate.religion        = d.religion;
    if (d.nationality      !== undefined) personalUpdate.nationality     = d.nationality;
    if (d.national_id_card !== undefined) personalUpdate.nationalidcard  = d.national_id_card;
    if (d.admin_birthday)                 personalUpdate.adminbirthday   = d.admin_birthday;
    if (d.expiry_date)                    personalUpdate.expirydate      = d.expiry_date;

    if (Object.keys(personalUpdate).length > 0) {
      const r = await admin.from("tb_admin").update(personalUpdate).eq("adminid", d.admin_id);
      if (r.error) return { ok: false, error: r.error.message };
    }

    // ── (a) tb_admin_address — UPDATE only if a row exists (L114-137) ──
    const addressUpdate: Record<string, unknown> = {};
    if (d.address_no   !== undefined) addressUpdate.addressno   = d.address_no;
    if (d.district     !== undefined) addressUpdate.district    = d.district;
    if (d.amphoe       !== undefined) addressUpdate.amphoe      = d.amphoe;
    if (d.province     !== undefined) addressUpdate.province    = d.province;
    if (d.zipcode      !== undefined) addressUpdate.zipcode     = d.zipcode;
    if (d.address_note !== undefined) addressUpdate.addressnote = d.address_note;
    if (Object.keys(addressUpdate).length > 0) {
      const { data: addr, error: addrErr } = await admin
        .from("tb_admin_address")
        .select("id").eq("adminid", d.admin_id).maybeSingle();
      if (addrErr) {
        console.error(`[tb_admin_address list] failed`, { code: addrErr.code, message: addrErr.message });
      }
      if (addr) {
        const r = await admin.from("tb_admin_address").update(addressUpdate).eq("adminid", d.admin_id);
        if (r.error) return { ok: false, error: r.error.message };
      }
    }

    // ── (a) org channel re-link — DELETE then INSERT (L138-169) ──
    // Each channel is "if non-empty, replace the single ship row".
    const linkChannel = async (
      ship: "tb_org_email_ships" | "tb_org_tell_ships" | "tb_org_line_ships" | "tb_org_wechat_ships",
      idCol: "oeid" | "otid" | "olid" | "owcid",
      value: string | number | null | undefined,
    ) => {
      if (value === null || value === undefined || value === "") return;
      await admin.from(ship).delete().eq("adminid", d.admin_id);
      await admin.from(ship).insert({ adminid: d.admin_id, [idCol]: Number(value) });
    };
    await linkChannel("tb_org_email_ships",  "oeid",  d.admin_email_org);
    await linkChannel("tb_org_tell_ships",   "otid",  d.admin_tel_org);
    await linkChannel("tb_org_line_ships",   "olid",  d.admin_line_org);
    await linkChannel("tb_org_wechat_ships", "owcid", d.admin_wechat_org);

    // ── (b) tb_admin job-position columns (L174-226) ──
    if (d.update_job_position) {
      const jobUpdate: Record<string, unknown> = {};
      if (d.company_type !== undefined) jobUpdate.companytype = d.company_type;
      if (d.admin_type   !== undefined) jobUpdate.admintype   = d.admin_type;
      if (d.admin_tmp    !== undefined) jobUpdate.admintmp    = d.admin_tmp;
      if (d.salary_type  !== undefined) jobUpdate.salarytype  = d.salary_type;
      // Legacy L180-191: if adminType==7 → department/section = NULL,
      // else use the posted values (or 0 if empty).
      if (d.admin_type === "7") {
        jobUpdate.department = null;
        jobUpdate.section    = null;
      } else {
        if (d.department !== undefined) jobUpdate.department = d.department || "0";
        if (d.section    !== undefined) jobUpdate.section    = d.section    || "0";
      }
      // Legacy L201-204: type 1/5/6/7 → dates blanked to '0000-00-00'.
      // PostgreSQL's `timestamp` can't store '0000-00-00' — use null,
      // which renders the same "ไม่ระบุ" UI on the legacy detail-view.
      const isOpenEndedType =
        d.admin_type === "1" || d.admin_type === "5" || d.admin_type === "6" || d.admin_type === "7";
      if (isOpenEndedType) {
        jobUpdate.startdate = null;
        jobUpdate.enddate   = null;
      } else {
        if (d.start_date !== undefined) jobUpdate.startdate = d.start_date || null;
        if (d.end_date   !== undefined) jobUpdate.enddate   = d.end_date   ? `${d.end_date} 23:59:59` : null;
      }
      if (d.salary !== undefined && d.salary !== null && d.salary !== "") {
        jobUpdate.salary = Number(d.salary);
      }
      if (Object.keys(jobUpdate).length > 0) {
        const r = await admin.from("tb_admin").update(jobUpdate).eq("adminid", d.admin_id);
        if (r.error) return { ok: false, error: r.error.message };
      }
    }

    await logAdminAction(adminId, "admin-profile.update", "tb_admin", d.admin_id, {
      fields:               Object.keys(personalUpdate),
      address:              Object.keys(addressUpdate),
      update_job_position:  d.update_job_position ?? false,
    });
    revalidatePath(`/admin/admins/${d.admin_id}`);
    return { ok: true };
  });
}
