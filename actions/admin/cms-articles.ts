"use server";

/**
 * No-code article CMS — admin server actions (owner 2026-06-23).
 * Backs /admin/articles (Extensions → "เขียนบทความ").
 *
 * Flow: a writer drafts → submits → **Ultra Admin Z** approves → the article is
 * PUBLISHED and appears on the matching public page (/knowledge · /news ·
 * /our-work), appended to the existing static cards.
 *
 * Roles:
 *   WRITE_ROLES — write/list/edit/submit + upload a cover.
 *   approve/reject/unpublish — ULTRA only (owner: "ultra admin z อนุมัติ"); the
 *   action is reachable by seniors but enforces `ultra` inside.
 *
 * All access via createAdminClient (RLS bypass · cms_articles has no policy).
 */

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { uploadToBucket } from "@/lib/storage/upload";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";
import {
  saveCmsArticleSchema,
  cmsArticleIdSchema,
  rejectCmsArticleSchema,
  CMS_CATEGORIES,
  type CmsStatus,
} from "@/lib/validators/cms-article";

const TABLE = "cms_articles";
const COVER_BUCKET = "avatars"; // PUBLIC bucket (public read → <img> with no signed URL)
const COVER_PREFIX = "articles";

// Staff who may write/edit articles. Approval is gated to `ultra` separately.
const WRITE_ROLES = ["super", "ultra", "manager", "sales_admin", "sales", "ops"] as const;

function isUltra(roles: readonly string[]): boolean {
  return roles.includes("ultra");
}

export type AdminArticle = {
  id: number;
  category: string;
  title: string;
  slug: string;
  excerpt: string;
  coverUrl: string;
  body: string;
  subCategory: string;
  metaTitle: string;
  metaDescription: string;
  tags: string[];
  status: CmsStatus;
  authorAdminId: string | null;
  approvedBy: string | null;
  rejectNote: string;
  publishedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

const SELECT_COLS =
  "id, category, title, slug, excerpt, cover_url, body, sub_category, status, " +
  "meta_title, meta_description, tags, " +
  "author_admin_id, approved_by, reject_note, published_at, created_at, updated_at";

type Row = {
  id: number;
  category: string;
  title: string | null;
  slug: string | null;
  excerpt: string | null;
  cover_url: string | null;
  body: string | null;
  sub_category: string | null;
  meta_title: string | null;
  meta_description: string | null;
  tags: string[] | null;
  status: string | null;
  author_admin_id: string | null;
  approved_by: string | null;
  reject_note: string | null;
  published_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

function mapRow(r: Row): AdminArticle {
  return {
    id: r.id,
    category: r.category ?? "knowledge",
    title: r.title ?? "",
    slug: r.slug ?? "",
    excerpt: r.excerpt ?? "",
    coverUrl: r.cover_url ?? "",
    body: r.body ?? "",
    subCategory: r.sub_category ?? "",
    metaTitle: r.meta_title ?? "",
    metaDescription: r.meta_description ?? "",
    tags: r.tags ?? [],
    status: (r.status as CmsStatus) ?? "draft",
    authorAdminId: r.author_admin_id,
    approvedBy: r.approved_by,
    rejectNote: r.reject_note ?? "",
    publishedAt: r.published_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/** A url-safe, unique-ish slug. Latin titles → slugified; Thai (no ascii) →
 *  "article-<rand>". The 6-char random keeps it collision-safe; insert retries
 *  once on the UNIQUE index just in case. */
function genSlug(title: string): string {
  const base = (title ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 48);
  const rand = Math.random().toString(36).slice(2, 8);
  return base ? `${base}-${rand}` : `article-${rand}`;
}

/** Revalidate the public surface for a category + the admin list. */
function revalidateForCategory(category: string): void {
  revalidatePath("/admin/articles");
  if (category === "knowledge") revalidatePath("/knowledge");
  else if (category === "news") revalidatePath("/news");
  else if (category === "our_work") revalidatePath("/our-work");
}

// ════════════════════════════════════════════════════════════════════════
// listCmsArticles — the back-office list (all statuses · optional filters)
// ════════════════════════════════════════════════════════════════════════
export async function listCmsArticles(input?: {
  category?: string;
  status?: string;
}): Promise<AdminActionResult<{ articles: AdminArticle[] }>> {
  return withAdmin<{ articles: AdminArticle[] }>([...WRITE_ROLES], async () => {
    const admin = createAdminClient();
    let q = admin.from(TABLE).select(SELECT_COLS).order("updated_at", { ascending: false }).limit(1000);
    if (input?.category && (CMS_CATEGORIES as readonly string[]).includes(input.category)) {
      q = q.eq("category", input.category);
    }
    if (input?.status) q = q.eq("status", input.status);
    const { data, error } = await q;
    if (error) {
      console.error("[cms list] failed", { code: error.code, message: error.message });
      return { ok: false, error: `query_failed: ${error.message}` };
    }
    return { ok: true, data: { articles: ((data ?? []) as unknown as Row[]).map(mapRow) } };
  });
}

/** Load one article for the editor. */
export async function getCmsArticle(input: unknown): Promise<AdminActionResult<{ article: AdminArticle }>> {
  const parsed = cmsArticleIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  return withAdmin<{ article: AdminArticle }>([...WRITE_ROLES], async () => {
    const admin = createAdminClient();
    const { data, error } = await admin.from(TABLE).select(SELECT_COLS).eq("id", parsed.data.id).maybeSingle<Row>();
    if (error) {
      console.error("[cms get] failed", { code: error.code, message: error.message });
      return { ok: false, error: `query_failed: ${error.message}` };
    }
    if (!data) return { ok: false, error: "not_found" };
    return { ok: true, data: { article: mapRow(data) } };
  });
}

// ════════════════════════════════════════════════════════════════════════
// saveCmsArticle — create (→ draft) or update content
// ════════════════════════════════════════════════════════════════════════
// A published article edited by a NON-ultra reverts to 'pending' (re-review), so
// unreviewed content never stays live. Ultra edits keep it published.
export async function saveCmsArticle(input: unknown): Promise<AdminActionResult<{ id: number }>> {
  const parsed = saveCmsArticleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const d = parsed.data;

  return withAdmin<{ id: number }>([...WRITE_ROLES], async ({ adminId, roles }) => {
    const admin = createAdminClient();
    const nowIso = new Date().toISOString();

    if (d.id) {
      // ── update ──
      const { data: cur, error: curErr } = await admin
        .from(TABLE).select("status, category").eq("id", d.id).maybeSingle<{ status: string; category: string }>();
      if (curErr) {
        console.error("[cms save:read] failed", { code: curErr.code, message: curErr.message });
        return { ok: false, error: `query_failed: ${curErr.message}` };
      }
      if (!cur) return { ok: false, error: "not_found" };

      const patch: Record<string, unknown> = {
        category: d.category,
        title: d.title,
        excerpt: d.excerpt,
        cover_url: d.coverUrl,
        body: d.body,
        sub_category: d.subCategory,
        meta_title: d.metaTitle,
        meta_description: d.metaDescription,
        tags: d.tags,
        updated_at: nowIso,
      };
      // Editing a live article without ultra rights → back to pending review.
      if (cur.status === "published" && !isUltra(roles)) patch.status = "pending";

      const { error: updErr } = await admin.from(TABLE).update(patch).eq("id", d.id);
      if (updErr) {
        console.error("[cms save:update] failed", { code: updErr.code, message: updErr.message });
        return { ok: false, error: `save_failed: ${updErr.message}` };
      }
      void logAdminAction(adminId, "cms_article.save", TABLE, String(d.id), { category: d.category });
      revalidateForCategory(d.category);
      if (cur.category !== d.category) revalidateForCategory(cur.category);
      return { ok: true, data: { id: d.id } };
    }

    // ── create (draft) — generate a unique slug, retry once on the UNIQUE index ──
    for (let attempt = 0; attempt < 2; attempt++) {
      const slug = genSlug(d.title);
      const { data, error } = await admin
        .from(TABLE)
        .insert({
          category: d.category,
          title: d.title,
          slug,
          excerpt: d.excerpt,
          cover_url: d.coverUrl,
          body: d.body,
          sub_category: d.subCategory,
          meta_title: d.metaTitle,
          meta_description: d.metaDescription,
          tags: d.tags,
          status: "draft",
          author_admin_id: adminId,
        })
        .select("id")
        .maybeSingle<{ id: number }>();
      if (!error && data) {
        void logAdminAction(adminId, "cms_article.create", TABLE, String(data.id), { category: d.category });
        revalidateForCategory(d.category);
        return { ok: true, data: { id: data.id } };
      }
      if (error && error.code !== "23505") {
        console.error("[cms save:insert] failed", { code: error.code, message: error.message });
        return { ok: false, error: `save_failed: ${error.message}` };
      }
      // 23505 (slug collision) → loop retries with a fresh slug
    }
    return { ok: false, error: "slug_conflict" };
  });
}

// ════════════════════════════════════════════════════════════════════════
// submitCmsArticle — draft/rejected → pending (ask ultra to review)
// ════════════════════════════════════════════════════════════════════════
export async function submitCmsArticle(input: unknown): Promise<AdminActionResult> {
  const parsed = cmsArticleIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  return withAdmin([...WRITE_ROLES], async ({ adminId }) => {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from(TABLE)
      .update({ status: "pending", reject_note: "", updated_at: new Date().toISOString() })
      .eq("id", parsed.data.id)
      .in("status", ["draft", "rejected"])
      .select("id, category")
      .maybeSingle<{ id: number; category: string }>();
    if (error) {
      console.error("[cms submit] failed", { code: error.code, message: error.message });
      return { ok: false, error: "update_failed" };
    }
    if (!data) return { ok: false, error: "not_submittable" }; // already pending/published
    void logAdminAction(adminId, "cms_article.submit", TABLE, String(parsed.data.id), {});
    revalidateForCategory(data.category);
    return { ok: true };
  });
}

// ════════════════════════════════════════════════════════════════════════
// approveCmsArticle — ULTRA only → publish (goes live on the public page)
// ════════════════════════════════════════════════════════════════════════
export async function approveCmsArticle(input: unknown): Promise<AdminActionResult> {
  const parsed = cmsArticleIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  return withAdmin([...WRITE_ROLES], async ({ adminId, roles }) => {
    if (!isUltra(roles)) return { ok: false, error: "approve_requires_ultra" };
    const admin = createAdminClient();
    const nowIso = new Date().toISOString();
    // Set published_at only the first time (keep the original publish date on re-approve).
    const { data: cur, error: curErr } = await admin.from(TABLE).select("published_at, category").eq("id", parsed.data.id).maybeSingle<{ published_at: string | null; category: string }>();
    if (curErr) console.error("[cms approve:read] failed", { code: curErr.code, message: curErr.message });
    const { data, error } = await admin
      .from(TABLE)
      .update({
        status: "published",
        approved_by: adminId,
        reject_note: "",
        published_at: cur?.published_at ?? nowIso,
        updated_at: nowIso,
      })
      .eq("id", parsed.data.id)
      .in("status", ["pending", "draft", "rejected"])
      .select("id, category")
      .maybeSingle<{ id: number; category: string }>();
    if (error) {
      console.error("[cms approve] failed", { code: error.code, message: error.message });
      return { ok: false, error: "update_failed" };
    }
    if (!data) return { ok: false, error: "already_published" };
    void logAdminAction(adminId, "cms_article.approve", TABLE, String(parsed.data.id), {});
    revalidateForCategory(data.category);
    return { ok: true };
  });
}

// ════════════════════════════════════════════════════════════════════════
// rejectCmsArticle — ULTRA only → send back with a note
// ════════════════════════════════════════════════════════════════════════
export async function rejectCmsArticle(input: unknown): Promise<AdminActionResult> {
  const parsed = rejectCmsArticleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  return withAdmin([...WRITE_ROLES], async ({ adminId, roles }) => {
    if (!isUltra(roles)) return { ok: false, error: "approve_requires_ultra" };
    const admin = createAdminClient();
    const { data, error } = await admin
      .from(TABLE)
      .update({ status: "rejected", reject_note: parsed.data.note, updated_at: new Date().toISOString() })
      .eq("id", parsed.data.id)
      .select("id, category")
      .maybeSingle<{ id: number; category: string }>();
    if (error) {
      console.error("[cms reject] failed", { code: error.code, message: error.message });
      return { ok: false, error: "update_failed" };
    }
    if (!data) return { ok: false, error: "not_found" };
    void logAdminAction(adminId, "cms_article.reject", TABLE, String(parsed.data.id), { note: parsed.data.note });
    revalidateForCategory(data.category);
    return { ok: true };
  });
}

// ════════════════════════════════════════════════════════════════════════
// unpublishCmsArticle — ULTRA only → pull a live article back to draft
// ════════════════════════════════════════════════════════════════════════
export async function unpublishCmsArticle(input: unknown): Promise<AdminActionResult> {
  const parsed = cmsArticleIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  return withAdmin([...WRITE_ROLES], async ({ adminId, roles }) => {
    if (!isUltra(roles)) return { ok: false, error: "approve_requires_ultra" };
    const admin = createAdminClient();
    const { data, error } = await admin
      .from(TABLE)
      .update({ status: "draft", updated_at: new Date().toISOString() })
      .eq("id", parsed.data.id)
      .eq("status", "published")
      .select("id, category")
      .maybeSingle<{ id: number; category: string }>();
    if (error) {
      console.error("[cms unpublish] failed", { code: error.code, message: error.message });
      return { ok: false, error: "update_failed" };
    }
    if (!data) return { ok: false, error: "not_published" };
    void logAdminAction(adminId, "cms_article.unpublish", TABLE, String(parsed.data.id), {});
    revalidateForCategory(data.category);
    return { ok: true };
  });
}

// ════════════════════════════════════════════════════════════════════════
// deleteCmsArticle — ultra (any) OR author of an unpublished draft
// ════════════════════════════════════════════════════════════════════════
export async function deleteCmsArticle(input: unknown): Promise<AdminActionResult> {
  const parsed = cmsArticleIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  return withAdmin([...WRITE_ROLES], async ({ adminId, roles }) => {
    const admin = createAdminClient();
    const { data: cur, error: curErr } = await admin
      .from(TABLE).select("status, author_admin_id, category").eq("id", parsed.data.id)
      .maybeSingle<{ status: string; author_admin_id: string | null; category: string }>();
    if (curErr) {
      console.error("[cms delete:read] failed", { code: curErr.code, message: curErr.message });
      return { ok: false, error: "query_failed" };
    }
    if (!cur) return { ok: false, error: "not_found" };
    const ownDraft = cur.author_admin_id === adminId && cur.status !== "published";
    if (!isUltra(roles) && !ownDraft) return { ok: false, error: "delete_forbidden" };

    const { error } = await admin.from(TABLE).delete().eq("id", parsed.data.id);
    if (error) {
      console.error("[cms delete] failed", { code: error.code, message: error.message });
      return { ok: false, error: "delete_failed" };
    }
    void logAdminAction(adminId, "cms_article.delete", TABLE, String(parsed.data.id), { status: cur.status });
    revalidateForCategory(cur.category);
    return { ok: true };
  });
}

// ════════════════════════════════════════════════════════════════════════
// uploadCmsCover — upload a cover image, return its PUBLIC url
// ════════════════════════════════════════════════════════════════════════
export async function uploadCmsCover(formData: FormData): Promise<AdminActionResult<{ url: string }>> {
  return withAdmin<{ url: string }>([...WRITE_ROLES], async ({ adminId }) => {
    const file = formData.get("file");
    if (!(file instanceof File)) return { ok: false, error: "ไม่พบไฟล์" };
    if (!/^image\//i.test(file.type)) return { ok: false, error: `ต้องเป็นไฟล์รูปภาพ (${file.type || "unknown"})` };

    const up = await uploadToBucket(file, COVER_BUCKET, COVER_PREFIX);
    if (!up.ok) return { ok: false, error: up.error };

    const admin = createAdminClient();
    const { data } = admin.storage.from(COVER_BUCKET).getPublicUrl(up.filename);
    const url = data?.publicUrl ?? "";
    if (!url) return { ok: false, error: "ไม่สามารถสร้าง URL รูปได้" };

    void logAdminAction(adminId, "cms_article.upload_cover", "storage", up.filename, { bucket: COVER_BUCKET });
    return { ok: true, data: { url } };
  });
}
