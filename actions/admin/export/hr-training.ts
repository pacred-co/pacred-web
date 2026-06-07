"use server";

/**
 * Export-all (CSV) for /admin/hr/training — the HR LEARNING & TRAINING view
 * (training_courses + training_enrollments).
 *
 * The page (app/[locale]/(admin)/admin/hr/training/page.tsx) renders every
 * training_course as a card, and inside each card a table of its enrollments
 * (one row per learner: employee · enrolled date · status · score · completed
 * date). There is NO filter, NO pagination — the page loads the FULL list of
 * courses + enrollments already. The on-screen "⬇ CSV" button downloads the
 * flattened enrollment rows currently on screen; this action backs the
 * "⬇ CSV ทั้งหมด" button — the ENTIRE enrollment list (capped at EXPORT_CAP) —
 * then writes an admin_export_log audit row (PII: employee names).
 *
 * DRIFT-FREE: this re-runs the EXACT same two queries the page runs
 *   training_courses          .select("*").order("created_at",{ascending:false})
 *   training_enrollments      .select(... profile join ...)
 * unpaginated, and flattens enrollments→one row each (course context + learner)
 * in the SAME column shape as the page's CsvButton cols. The page renders the
 * full set with no DB pagination, so the ONLY difference here is the EXPORT_CAP
 * guard + the audit log.
 *
 * RBAC matches the page: requireAdmin() (any admin role, same as the page).
 *
 * PLACEMENT (avoid parallel-edit races · AGENTS rule D): new co-located file;
 * the page wires it via an inline "use server" closure.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { logAdminExport } from "@/actions/admin/export-log";
import type { CsvRow } from "@/components/admin/csv-button";

// Safety cap for the "export all" path.
const EXPORT_CAP = 10000;

// Mirror the page's CAT_LABEL / STATUS_LABEL decoders (labels only).
const CAT_LABEL: Record<string, string> = {
  general: "ทั่วไป",
  operations: "ปฏิบัติการ",
  compliance: "Compliance",
  technical: "เทคนิค",
  soft_skills: "Soft skills",
  safety: "Safety",
};
const STATUS_LABEL: Record<string, string> = {
  enrolled: "ลงทะเบียน",
  in_progress: "กำลังเรียน",
  completed: "ผ่าน",
  failed: "ไม่ผ่าน",
  exempted: "ยกเว้น",
};

type Profile = {
  id: string;
  member_code: string | null;
  first_name: string | null;
  last_name: string | null;
};
type CourseRaw = {
  id: string;
  title: string;
  category: string;
  duration_hours: number;
  instructor: string | null;
  is_mandatory: boolean;
  is_active: boolean;
};
type EnrollRaw = {
  id: string;
  course_id: string;
  status: string;
  enrolled_at: string;
  completed_at: string | null;
  score: number | null;
  profile: Profile | Profile[] | null;
};

/** Slice an ISO date to YYYY-MM-DD (empty if absent). */
function ymd(v: string | null | undefined): string {
  return v ? String(v).slice(0, 10) : "";
}

/**
 * Export the entire training-enrollment list (one row per learner, with course
 * context, capped at EXPORT_CAP) as CSV rows for the "⬇ CSV ทั้งหมด" button.
 * Reuses the page's exact queries, unpaginated. Writes an admin_export_log row.
 */
export async function exportHrTrainingAll(): Promise<{
  rows: CsvRow[];
  truncated: boolean;
}> {
  // Same gate as the page: requireAdmin() (any admin role).
  await requireAdmin();
  const admin = createAdminClient();

  // ── Courses (SAME query as the page) ────────────────────────────
  const { data: coursesRaw, error: coursesErr } = await admin
    .from("training_courses")
    .select("id, title, category, duration_hours, instructor, is_mandatory, is_active")
    .order("created_at", { ascending: false });
  if (coursesErr) {
    console.error("[exportHrTrainingAll training_courses] failed", {
      code: coursesErr.code,
      message: coursesErr.message,
    });
    return { rows: [], truncated: false };
  }
  const courseMap = new Map<string, CourseRaw>();
  for (const c of (coursesRaw ?? []) as CourseRaw[]) courseMap.set(c.id, c);

  // ── Enrollments (SAME query as the page) ────────────────────────
  const { data: enrollsRaw, error: enrollsErr } = await admin
    .from("training_enrollments")
    .select(
      `id, course_id, status, enrolled_at, completed_at, score,
       profile:profiles!profile_id ( id, member_code, first_name, last_name )`,
    )
    .range(0, EXPORT_CAP); // 0..EXPORT_CAP = up to EXPORT_CAP+1 rows
  if (enrollsErr) {
    console.error("[exportHrTrainingAll training_enrollments] failed", {
      code: enrollsErr.code,
      message: enrollsErr.message,
    });
    return { rows: [], truncated: false };
  }

  const all = (enrollsRaw ?? []) as unknown as EnrollRaw[];
  const truncated = all.length > EXPORT_CAP;
  const enrolls = truncated ? all.slice(0, EXPORT_CAP) : all;

  const rows: CsvRow[] = enrolls.map((e) => {
    const c = courseMap.get(e.course_id);
    const p = Array.isArray(e.profile) ? e.profile[0] ?? null : e.profile;
    const fullName = `${p?.first_name ?? ""} ${p?.last_name ?? ""}`.trim() || "—";
    return {
      course: c?.title ?? "—",
      category: CAT_LABEL[c?.category ?? ""] ?? "ทั่วไป",
      mandatory: c?.is_mandatory ? "บังคับเรียน" : "",
      duration_hours: c?.duration_hours ?? "",
      instructor: c?.instructor ?? "",
      member_code: p?.member_code ?? "—",
      employee: fullName,
      enrolled_at: ymd(e.enrolled_at),
      status: STATUS_LABEL[e.status] ?? e.status,
      score: e.score != null ? `${e.score}` : "—",
      completed_at: ymd(e.completed_at),
    };
  });

  await logAdminExport({
    dataset: "hr-training",
    filters: {},
    rowCount: rows.length,
    truncated,
  });

  return { rows, truncated };
}
