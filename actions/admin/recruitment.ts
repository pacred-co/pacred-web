"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";

const STAGE = z.enum(["applied", "screening", "interviewing", "offered", "hired", "rejected"]);
const STATUS = z.enum(["draft", "open", "paused", "closed"]);
const EMP_TYPE = z.enum(["full_time", "probation", "contract", "daily", "intern", "partner"]);
const SOURCE = z.enum(["walk_in", "website", "line", "facebook", "referral", "jobsdb", "other"]);

const slugify = (s: string) =>
  s.toLowerCase().trim()
    .replace(/[^\w฀-๿\s-]+/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 100) || `job-${Date.now()}`;

// ────────────────────────────────────────────────────────────
// CREATE posting
// ────────────────────────────────────────────────────────────
const createPostingSchema = z.object({
  title:             z.string().trim().min(2).max(200),
  position_id:       z.string().uuid().optional().nullable(),
  description:       z.string().trim().max(5000).optional().nullable(),
  status:            STATUS.optional(),
  openings_count:    z.coerce.number().int().min(1).max(99).optional(),
  salary_range_text: z.string().trim().max(100).optional().nullable(),
  location:          z.string().trim().max(200).optional().nullable(),
  employment_type:   EMP_TYPE.optional(),
});

export async function adminCreatePosting(input: z.infer<typeof createPostingSchema>): Promise<AdminActionResult<{ id: string; slug: string }>> {
  const parsed = createPostingSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const d = parsed.data;

  return withAdmin(["super"], async ({ adminId }) => {
    const admin = createAdminClient();
    const baseSlug = slugify(d.title);
    const slug = `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`;
    const status = d.status ?? "open";

    const { data, error } = await admin
      .from("job_postings")
      .insert({
        slug,
        title:             d.title,
        position_id:       d.position_id ?? null,
        description:       d.description ?? null,
        status,
        openings_count:    d.openings_count ?? 1,
        salary_range_text: d.salary_range_text ?? null,
        location:          d.location ?? null,
        employment_type:   d.employment_type ?? "full_time",
        posted_at:         status === "open" ? new Date().toISOString() : null,
        created_by:        adminId,
      })
      .select("id, slug")
      .single();
    if (error || !data) return { ok: false, error: error?.message ?? "insert_failed" };

    await logAdminAction(adminId, "recruitment.posting_create", "job_posting", data.id, d);
    revalidatePath("/admin/hr/recruitment");
    return { ok: true, data: { id: data.id, slug: data.slug } };
  });
}

// ────────────────────────────────────────────────────────────
// UPDATE posting (status flip / edit fields)
// ────────────────────────────────────────────────────────────
const updatePostingSchema = createPostingSchema.partial().extend({
  id: z.string().uuid(),
});

export async function adminUpdatePosting(input: z.infer<typeof updatePostingSchema>): Promise<AdminActionResult> {
  const parsed = updatePostingSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const { id, ...d } = parsed.data;

  return withAdmin(["super"], async ({ adminId }) => {
    const admin = createAdminClient();
    const patch: Record<string, unknown> = { ...d };

    // If status flips to closed, stamp closed_at; if reopens, clear it
    if (d.status === "closed") patch.closed_at = new Date().toISOString();
    if (d.status && d.status !== "closed") patch.closed_at = null;
    if (d.status === "open")   patch.posted_at = patch.posted_at ?? new Date().toISOString();

    const { error } = await admin.from("job_postings").update(patch).eq("id", id);
    if (error) return { ok: false, error: error.message };

    await logAdminAction(adminId, "recruitment.posting_update", "job_posting", id, d);
    revalidatePath("/admin/hr/recruitment");
    revalidatePath(`/admin/hr/recruitment/${id}`);
    return { ok: true };
  });
}

// ────────────────────────────────────────────────────────────
// CREATE applicant (walk-in / manual entry by HR)
// ────────────────────────────────────────────────────────────
const createApplicantSchema = z.object({
  posting_id:   z.string().uuid(),
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

    await logAdminAction(adminId, "recruitment.applicant_create", "job_applicant", data.id, d);
    revalidatePath(`/admin/hr/recruitment/${d.posting_id}`);
    return { ok: true, data: { id: data.id } };
  });
}

// ────────────────────────────────────────────────────────────
// Advance / move applicant stage
// ────────────────────────────────────────────────────────────
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

// ────────────────────────────────────────────────────────────
// Schedule interview (or update existing)
// ────────────────────────────────────────────────────────────
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

    // Auto-advance to interviewing if scheduling a future slot from applied/screening
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

// ────────────────────────────────────────────────────────────
// Delete applicant (rarely needed — prefer "rejected" stage)
// ────────────────────────────────────────────────────────────
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
