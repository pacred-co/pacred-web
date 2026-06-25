"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUserWithProfile } from "@/lib/auth/get-user";
import { postCaseCommentSchema } from "@/lib/validators/case-comment";

/**
 * Public case-study comments on /our-work/[id] (ปอน 2026-06-25).
 *
 * Reads/writes go through the service-role client (the `case_comments` table has
 * RLS enabled with NO permissive policy — 0204 pattern). Posting is login-gated
 * via getCurrentUserWithProfile. Both calls fail SOFT if the table doesn't exist
 * yet (migration 0210 not applied) so the page never crashes.
 */

export type CaseComment = {
  id: number;
  authorName: string;
  authorAvatar: string | null;
  body: string;
  createdAt: string;
};

type Row = {
  id: number;
  author_name: string | null;
  author_avatar: string | null;
  body: string | null;
  created_at: string;
};

const toComment = (r: Row): CaseComment => ({
  id: r.id,
  authorName: r.author_name || "ลูกค้า Pacred",
  authorAvatar: r.author_avatar || null,
  body: r.body || "",
  createdAt: r.created_at,
});

/** Public-read the visible comments for a case (newest first). [] on any error. */
export async function listCaseComments(caseSlug: string): Promise<CaseComment[]> {
  if (!caseSlug) return [];
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("case_comments")
      .select("id, author_name, author_avatar, body, created_at")
      .eq("case_slug", caseSlug)
      .eq("status", "visible")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error || !data) return [];
    return (data as Row[]).map(toComment);
  } catch {
    return [];
  }
}

/** Post a comment — requires a signed-in session. */
export async function postCaseComment(
  input: unknown,
): Promise<{ ok: true; comment: CaseComment } | { ok: false; error: string }> {
  const session = await getCurrentUserWithProfile();
  if (!session?.user) {
    return { ok: false, error: "กรุณาเข้าสู่ระบบก่อนแสดงความคิดเห็น" };
  }

  const parsed = postCaseCommentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" };
  }

  const { user, profile } = session;
  const name =
    [profile?.first_name, profile?.last_name].filter(Boolean).join(" ").trim() ||
    profile?.member_code ||
    "ลูกค้า Pacred";

  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("case_comments")
      .insert({
        case_slug: parsed.data.caseSlug,
        author_profile_id: user.id,
        author_name: name,
        author_avatar: profile?.avatar_url ?? null,
        body: parsed.data.body,
        status: "visible",
      })
      .select("id, author_name, author_avatar, body, created_at")
      .single();
    if (error || !data) {
      return { ok: false, error: "ส่งความคิดเห็นไม่สำเร็จ — ระบบคอมเมนต์ยังไม่เปิด (รอ migration)" };
    }
    return { ok: true, comment: toComment(data as Row) };
  } catch {
    return { ok: false, error: "ส่งความคิดเห็นไม่สำเร็จ กรุณาลองใหม่" };
  }
}
