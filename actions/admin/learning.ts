"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";

const CATEGORY  = z.enum(["general", "operations", "compliance", "technical", "soft_skills", "safety"]);
const ENROLL_ST = z.enum(["enrolled", "in_progress", "completed", "failed", "exempted"]);

const slugify = (s: string) =>
  s.toLowerCase().trim()
    .replace(/[^\w฀-๿\s-]+/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 100) || `course-${Date.now()}`;

// ────────────────────────────────────────────────────────────
// COURSE — create / update
// ────────────────────────────────────────────────────────────
const upsertCourseSchema = z.object({
  id:             z.string().uuid().optional(),
  title:          z.string().trim().min(2).max(200),
  category:       CATEGORY,
  description:    z.string().trim().max(5000).optional().nullable(),
  duration_hours: z.coerce.number().min(0.25).max(500),
  instructor:     z.string().trim().max(200).optional().nullable(),
  materials_url:  z.string().trim().max(500).optional().nullable(),
  is_mandatory:   z.boolean().optional(),
  is_active:      z.boolean().optional(),
});

export async function adminUpsertCourse(input: z.infer<typeof upsertCourseSchema>): Promise<AdminActionResult<{ id: string }>> {
  const parsed = upsertCourseSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const d = parsed.data;

  return withAdmin(["super"], async ({ adminId }) => {
    const admin = createAdminClient();

    if (d.id) {
      const { error } = await admin
        .from("training_courses")
        .update({
          title:          d.title,
          category:       d.category,
          description:    d.description ?? null,
          duration_hours: d.duration_hours,
          instructor:     d.instructor ?? null,
          materials_url:  d.materials_url ?? null,
          is_mandatory:   d.is_mandatory ?? false,
          is_active:      d.is_active   ?? true,
        })
        .eq("id", d.id);
      if (error) return { ok: false, error: error.message };
      await logAdminAction(adminId, "training.course_update", "training_course", d.id, d);
      revalidatePath("/admin/hr/training");
      return { ok: true, data: { id: d.id } };
    }

    const slug = `${slugify(d.title)}-${Math.random().toString(36).slice(2, 6)}`;
    const { data, error } = await admin
      .from("training_courses")
      .insert({
        slug,
        title:          d.title,
        category:       d.category,
        description:    d.description ?? null,
        duration_hours: d.duration_hours,
        instructor:     d.instructor ?? null,
        materials_url:  d.materials_url ?? null,
        is_mandatory:   d.is_mandatory ?? false,
        is_active:      d.is_active   ?? true,
        created_by:     adminId,
      })
      .select("id")
      .single();
    if (error || !data) return { ok: false, error: error?.message ?? "insert_failed" };

    await logAdminAction(adminId, "training.course_create", "training_course", data.id, d);
    revalidatePath("/admin/hr/training");
    return { ok: true, data: { id: data.id } };
  });
}

const deleteCourseSchema = z.object({ id: z.string().uuid() });

export async function adminDeleteCourse(input: z.infer<typeof deleteCourseSchema>): Promise<AdminActionResult> {
  const parsed = deleteCourseSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  return withAdmin(["super"], async ({ adminId }) => {
    const admin = createAdminClient();
    const { error } = await admin.from("training_courses").delete().eq("id", parsed.data.id);
    if (error) return { ok: false, error: error.message };
    await logAdminAction(adminId, "training.course_delete", "training_course", parsed.data.id);
    revalidatePath("/admin/hr/training");
    return { ok: true };
  });
}

// ────────────────────────────────────────────────────────────
// ENROLLMENT — enroll one employee, bulk enroll all, mark completed
// ────────────────────────────────────────────────────────────
const enrollSchema = z.object({
  course_id:  z.string().uuid(),
  profile_id: z.string().uuid(),
});

export async function adminEnroll(input: z.infer<typeof enrollSchema>): Promise<AdminActionResult> {
  const parsed = enrollSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  return withAdmin(["super"], async ({ adminId }) => {
    const admin = createAdminClient();
    const { error } = await admin
      .from("training_enrollments")
      .upsert(
        { course_id: parsed.data.course_id, profile_id: parsed.data.profile_id, status: "enrolled", recorded_by: adminId },
        { onConflict: "course_id,profile_id" },
      );
    if (error) return { ok: false, error: error.message };
    await logAdminAction(adminId, "training.enroll", "training_enrollment", `${parsed.data.course_id}/${parsed.data.profile_id}`);
    revalidatePath("/admin/hr/training");
    return { ok: true };
  });
}

const bulkEnrollSchema = z.object({ course_id: z.string().uuid() });

export async function adminBulkEnrollActiveAdmins(input: z.infer<typeof bulkEnrollSchema>): Promise<AdminActionResult<{ inserted: number }>> {
  const parsed = bulkEnrollSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  return withAdmin(["super"], async ({ adminId }) => {
    const admin = createAdminClient();
    const { data: actives, error: activesErr } = await admin
      .from("admins")
      .select("profile_id")
      .eq("is_active", true);
    if (activesErr) {
      console.error(`[admins list] failed`, { code: activesErr.code, message: activesErr.message });
    }
    if (!actives || actives.length === 0) return { ok: true, data: { inserted: 0 } };

    const rows = actives.map((a) => ({
      course_id:  parsed.data.course_id,
      profile_id: a.profile_id,
      status:     "enrolled" as const,
      recorded_by: adminId,
    }));
    const { error, count } = await admin
      .from("training_enrollments")
      .upsert(rows, { onConflict: "course_id,profile_id", count: "exact", ignoreDuplicates: false });
    if (error) return { ok: false, error: error.message };

    await logAdminAction(adminId, "training.bulk_enroll", "training_course", parsed.data.course_id, { count: count ?? rows.length });
    revalidatePath("/admin/hr/training");
    return { ok: true, data: { inserted: count ?? rows.length } };
  });
}

const setEnrollStatusSchema = z.object({
  enrollment_id: z.string().uuid(),
  status:        ENROLL_ST,
  score:         z.coerce.number().min(0).max(100).optional().nullable(),
});

export async function adminSetEnrollmentStatus(input: z.infer<typeof setEnrollStatusSchema>): Promise<AdminActionResult> {
  const parsed = setEnrollStatusSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const d = parsed.data;

  return withAdmin(["super"], async ({ adminId }) => {
    const admin = createAdminClient();
    const patch: Record<string, unknown> = { status: d.status, score: d.score ?? null };
    if (d.status === "in_progress") patch.started_at = new Date().toISOString();
    if (d.status === "completed" || d.status === "failed") patch.completed_at = new Date().toISOString();
    const { error } = await admin.from("training_enrollments").update(patch).eq("id", d.enrollment_id);
    if (error) return { ok: false, error: error.message };
    await logAdminAction(adminId, `training.set_${d.status}`, "training_enrollment", d.enrollment_id, d);
    revalidatePath("/admin/hr/training");
    return { ok: true };
  });
}
