"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";
import { getAdminLegacyId } from "@/lib/admin/default-queue-filter-server";
import { safeLegacyAdminId } from "@/lib/auth/safe-legacy-admin-id";

/**
 * D1 faithful port of `pcs-admin/post-job.php` + `post-job-hs.php` — repointed
 * from the REBUILT empty twin (`job_postings`) to the migrated legacy table
 * `tb_post_job` (1 row on prod). Re-sweep A2 #36.
 *
 * Legacy column casing is fully LOWERCASE (verified vs migration 0081 + a
 * read-only prod probe — `tb_post_job` is NOT in the camelCase set):
 *   id, companytype, admintype, department, section, jobtitle, amount,
 *   description, qualifications, welfarebenefit, workingtime, startdate,
 *   enddate, admincreate, date, salary
 *
 * Legacy INSERT (post-job-hs.php L19-20) writes every field; date=NOW(). The
 * status is DERIVED from the window (post-job-hs.php L124-127):
 *   กำลังประกาศ = startdate < now < enddate ; otherwise หมดเวลาแล้ว.
 *   There is NO status column — never invent one.
 *
 * company/dept/section codes come from the legacy cascade selects in
 * post-job.php (the values actually stored). NOTE: companyType options in the
 * legacy form are 1=PCS Cargo, 2=PCS Freight (post-job.php L93-94) — that's
 * what gets stored, even though the read-side nameCompanyType() helper maps
 * 1→"Freight & Cargo". We preserve the FORM mapping (= stored values).
 *
 * ⚠️ FLAG (not a gap): legacy `tb_post_job` has NO applicant-tracking table.
 * The Pacred ATS (`job_applicants` stages / interviews) is Pacred-original
 * with no legacy equivalent — kept as-is, NOT repointed. See
 * adminCreateApplicant / adminAdvanceApplicant / adminScheduleInterview /
 * adminDeleteApplicant below (still on `job_applicants`).
 */

const COMPANY_TYPE = z.enum(["1", "2"]);          // 1=PCS Cargo, 2=PCS Freight (post-job.php form)
const ADMIN_TYPE   = z.enum(["1", "2"]);          // 1=พนักงานประจำ, 2=เด็กฝึกงาน (post-job.php form)

const dateTimeLocal = z.string().trim().min(1).max(40);   // "YYYY-MM-DD HH:mm" from the legacy datetimepicker

// ────────────────────────────────────────────────────────────
// CREATE posting (faithful: post-job-hs.php POST 'add')
//   INSERT companytype/admintype/department/section/jobtitle/amount/
//   description/qualifications/welfarebenefit/workingtime/startdate/enddate/
//   admincreate/date(now)/salary
// ────────────────────────────────────────────────────────────
const createPostingSchema = z.object({
  company_type:    COMPANY_TYPE,
  admin_type:      ADMIN_TYPE,
  department:      z.string().trim().min(1).max(2),     // legacy cascade code (varchar(2))
  section:         z.string().trim().min(1).max(2),     // legacy cascade code (varchar(2))
  job_title:       z.string().trim().min(1).max(500),
  amount:          z.coerce.number().int().min(1).max(100),
  description:     z.string().trim().min(1).max(1000),
  qualifications:  z.string().trim().min(1).max(1000),
  welfare_benefit: z.string().trim().min(1).max(1000),
  working_time:    z.string().trim().min(1).max(1000),
  start_date:      dateTimeLocal,
  end_date:        dateTimeLocal,
  salary:          z.string().trim().max(500).optional().nullable(),
});

export async function adminCreatePosting(input: z.infer<typeof createPostingSchema>): Promise<AdminActionResult<{ id: number }>> {
  const parsed = createPostingSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const d = parsed.data;

  return withAdmin(["super"], async ({ adminId }) => {
    const admin = createAdminClient();
    const bridge = await getAdminLegacyId(adminId);
    const admincreate = safeLegacyAdminId(bridge ?? adminId, 30);

    const { data, error } = await admin
      .from("tb_post_job")
      .insert({
        companytype:    d.company_type,
        admintype:      d.admin_type,
        department:     d.department,
        section:        d.section,
        jobtitle:       d.job_title,
        amount:         d.amount,
        description:    d.description,
        qualifications: d.qualifications,
        welfarebenefit: d.welfare_benefit,
        workingtime:    d.working_time,
        startdate:      d.start_date,
        enddate:        d.end_date,
        admincreate,
        date:           new Date().toISOString(),
        salary:         d.salary ?? "",
      })
      .select("id")
      .single();
    if (error || !data) return { ok: false, error: error?.message ?? "insert_failed" };

    await logAdminAction(adminId, "recruitment.posting_create", "tb_post_job", String(data.id), d);
    revalidatePath("/admin/hr/recruitment");
    return { ok: true, data: { id: data.id as number } };
  });
}

// ────────────────────────────────────────────────────────────
// UPDATE posting (Pacred convenience — legacy has NO edit handler, only
//   create + the derived-status list. Kept as a faithful-superset edit on the
//   same legacy columns; safe because it only writes legacy fields.)
// ────────────────────────────────────────────────────────────
const updatePostingSchema = z.object({
  id:              z.coerce.number().int().positive(),
  company_type:    COMPANY_TYPE.optional(),
  admin_type:      ADMIN_TYPE.optional(),
  department:      z.string().trim().min(1).max(2).optional(),
  section:         z.string().trim().min(1).max(2).optional(),
  job_title:       z.string().trim().min(1).max(500).optional(),
  amount:          z.coerce.number().int().min(1).max(100).optional(),
  description:     z.string().trim().min(1).max(1000).optional(),
  qualifications:  z.string().trim().min(1).max(1000).optional(),
  welfare_benefit: z.string().trim().min(1).max(1000).optional(),
  working_time:    z.string().trim().min(1).max(1000).optional(),
  start_date:      dateTimeLocal.optional(),
  end_date:        dateTimeLocal.optional(),
  salary:          z.string().trim().max(500).optional().nullable(),
});

export async function adminUpdatePosting(input: z.infer<typeof updatePostingSchema>): Promise<AdminActionResult> {
  const parsed = updatePostingSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const { id, ...d } = parsed.data;

  const patch: Record<string, unknown> = {};
  if (d.company_type    !== undefined) patch.companytype    = d.company_type;
  if (d.admin_type      !== undefined) patch.admintype      = d.admin_type;
  if (d.department      !== undefined) patch.department     = d.department;
  if (d.section         !== undefined) patch.section        = d.section;
  if (d.job_title       !== undefined) patch.jobtitle       = d.job_title;
  if (d.amount          !== undefined) patch.amount         = d.amount;
  if (d.description      !== undefined) patch.description    = d.description;
  if (d.qualifications  !== undefined) patch.qualifications = d.qualifications;
  if (d.welfare_benefit !== undefined) patch.welfarebenefit = d.welfare_benefit;
  if (d.working_time    !== undefined) patch.workingtime    = d.working_time;
  if (d.start_date      !== undefined) patch.startdate      = d.start_date;
  if (d.end_date        !== undefined) patch.enddate        = d.end_date;
  if (d.salary          !== undefined) patch.salary         = d.salary ?? "";

  if (Object.keys(patch).length === 0) return { ok: false, error: "no_changes" };

  return withAdmin(["super"], async ({ adminId }) => {
    const admin = createAdminClient();
    const { error } = await admin.from("tb_post_job").update(patch).eq("id", id);
    if (error) return { ok: false, error: error.message };

    await logAdminAction(adminId, "recruitment.posting_update", "tb_post_job", String(id), d);
    revalidatePath("/admin/hr/recruitment");
    revalidatePath(`/admin/hr/recruitment/${id}`);
    return { ok: true };
  });
}

// ────────────────────────────────────────────────────────────
// DELETE posting (Pacred convenience — close/remove a posting row).
// ────────────────────────────────────────────────────────────
const deletePostingSchema = z.object({ id: z.coerce.number().int().positive() });

export async function adminDeletePosting(input: z.infer<typeof deletePostingSchema>): Promise<AdminActionResult> {
  const parsed = deletePostingSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  return withAdmin(["super"], async ({ adminId }) => {
    const admin = createAdminClient();
    const { error } = await admin.from("tb_post_job").delete().eq("id", parsed.data.id);
    if (error) return { ok: false, error: error.message };

    await logAdminAction(adminId, "recruitment.posting_delete", "tb_post_job", String(parsed.data.id));
    revalidatePath("/admin/hr/recruitment");
    return { ok: true };
  });
}

// ════════════════════════════════════════════════════════════════════════
// ⚠️ PACRED-ORIGINAL — NO LEGACY EQUIVALENT (flagged, NOT repointed)
// Legacy `tb_post_job` is a posting-only table; it has no applicant tracking.
// The functions below operate on the rebuilt `job_applicants` table (an
// applicant pipeline Pacred added on top). They are intentionally left on
// `job_applicants` — repointing them to a legacy table is impossible because
// none exists. The recruitment list/detail pages surface them as a Pacred
// enhancement banner. Decommission only if the ATS feature is dropped.
// ════════════════════════════════════════════════════════════════════════

const STAGE = z.enum(["applied", "screening", "interviewing", "offered", "hired", "rejected"]);
const SOURCE = z.enum(["walk_in", "website", "line", "facebook", "referral", "jobsdb", "other"]);

// CREATE applicant (walk-in / manual entry by HR)
const createApplicantSchema = z.object({
  posting_id:   z.coerce.number().int().positive(),
  first_name:   z.string().trim().min(1).max(100),
  last_name:    z.string().trim().max(100).optional().nullable(),
  nickname:     z.string().trim().max(50).optional().nullable(),
  phone:        z.string().trim().max(50).optional().nullable(),
  email:        z.string().trim().email().max(200).optional().nullable().or(z.literal("")),
  source:       SOURCE.optional(),
  source_note:  z.string().trim().max(200).optional().nullable(),
  notes:        z.string().trim().max(2000).optional().nullable(),
});

export async function adminCreateApplicant(input: z.infer<typeof createApplicantSchema>): Promise<AdminActionResult<{ id: string }>> {
  const parsed = createApplicantSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const d = parsed.data;

  return withAdmin(["super"], async ({ adminId }) => {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("job_applicants")
      .insert({
        posting_id:  d.posting_id,
        first_name:  d.first_name,
        last_name:   d.last_name   ?? null,
        nickname:    d.nickname    ?? null,
        phone:       d.phone       ?? null,
        email:       d.email || null,
        source:      d.source      ?? "walk_in",
        source_note: d.source_note ?? null,
        notes:       d.notes       ?? null,
      })
      .select("id")
      .single();
    if (error || !data) return { ok: false, error: error?.message ?? "insert_failed" };

    await logAdminAction(adminId, "recruitment.applicant_create", "job_applicant", String(data.id), d);
    revalidatePath(`/admin/hr/recruitment/${d.posting_id}`);
    return { ok: true, data: { id: String(data.id) } };
  });
}

// Advance / move applicant stage
const advanceSchema = z.object({
  applicant_id:     z.string().uuid(),
  to_stage:         STAGE,
  rejected_reason:  z.string().trim().max(500).optional().nullable(),
  hired_profile_id: z.string().uuid().optional().nullable(),
});

export async function adminAdvanceApplicant(input: z.infer<typeof advanceSchema>): Promise<AdminActionResult> {
  const parsed = advanceSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const d = parsed.data;

  return withAdmin(["super"], async ({ adminId }) => {
    const admin = createAdminClient();
    const patch: Record<string, unknown> = { stage: d.to_stage };
    const now = new Date().toISOString();
    if (d.to_stage === "hired") {
      patch.hired_at = now;
      patch.hired_profile_id = d.hired_profile_id ?? null;
    }
    if (d.to_stage === "rejected") {
      patch.rejected_at = now;
      patch.rejected_reason = d.rejected_reason ?? null;
    }

    const { data, error } = await admin
      .from("job_applicants")
      .update(patch)
      .eq("id", d.applicant_id)
      .select("posting_id")
      .single();
    if (error || !data) return { ok: false, error: error?.message ?? "update_failed" };

    await logAdminAction(adminId, `recruitment.applicant_stage_${d.to_stage}`, "job_applicant", d.applicant_id, d);
    revalidatePath(`/admin/hr/recruitment/${data.posting_id}`);
    return { ok: true };
  });
}

// Schedule interview (or update existing)
const scheduleSchema = z.object({
  applicant_id:           z.string().uuid(),
  interview_scheduled_at: z.string().optional().nullable(),                 // ISO; null = clear
  interview_location:     z.string().trim().max(200).optional().nullable(),
  interviewer_profile_id: z.string().uuid().optional().nullable(),
  notes:                  z.string().trim().max(2000).optional().nullable(),
});

export async function adminScheduleInterview(input: z.infer<typeof scheduleSchema>): Promise<AdminActionResult> {
  const parsed = scheduleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const d = parsed.data;

  return withAdmin(["super"], async ({ adminId }) => {
    const admin = createAdminClient();
    const patch: Record<string, unknown> = {
      interview_scheduled_at: d.interview_scheduled_at || null,
      interview_location:     d.interview_location     ?? null,
      interviewer_profile_id: d.interviewer_profile_id ?? null,
    };
    if (d.notes !== undefined) patch.notes = d.notes;

    if (d.interview_scheduled_at) {
      patch.stage = "interviewing";
    }

    const { data, error } = await admin
      .from("job_applicants")
      .update(patch)
      .eq("id", d.applicant_id)
      .select("posting_id")
      .single();
    if (error || !data) return { ok: false, error: error?.message ?? "update_failed" };

    await logAdminAction(adminId, "recruitment.applicant_schedule", "job_applicant", d.applicant_id, d);
    revalidatePath(`/admin/hr/recruitment/${data.posting_id}`);
    return { ok: true };
  });
}

// Delete applicant (rarely needed — prefer "rejected" stage)
const deleteApplicantSchema = z.object({ applicant_id: z.string().uuid() });

export async function adminDeleteApplicant(input: z.infer<typeof deleteApplicantSchema>): Promise<AdminActionResult> {
  const parsed = deleteApplicantSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  return withAdmin(["super"], async ({ adminId }) => {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("job_applicants")
      .delete()
      .eq("id", parsed.data.applicant_id)
      .select("posting_id")
      .single();
    if (error) return { ok: false, error: error.message };

    await logAdminAction(adminId, "recruitment.applicant_delete", "job_applicant", parsed.data.applicant_id);
    if (data?.posting_id) revalidatePath(`/admin/hr/recruitment/${data.posting_id}`);
    return { ok: true };
  });
}
