import "server-only";

/**
 * CMS articles — read side for the PUBLIC pages (/knowledge, /news, /our-work)
 * + the public detail route /articles/[slug]. Owner 2026-06-23.
 *
 * Reads the `cms_articles` table (migration 0204) via the service-role client.
 * Only PUBLISHED rows are ever returned here — drafts/pending never leak to the
 * public surfaces. Every read is FAIL-SOFT: a query error (e.g. the table not
 * yet applied on an environment) returns []/null so the public page degrades to
 * "just the static cards" instead of 500-ing.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import type { CmsCategory } from "@/lib/validators/cms-article";

export type CmsArticle = {
  id: number;
  category: CmsCategory;
  title: string;
  slug: string;
  excerpt: string;
  coverUrl: string;
  body: string;
  subCategory: string;
  publishedAt: string | null;
};

const COLS =
  "id, category, title, slug, excerpt, cover_url, body, sub_category, published_at";

type Row = {
  id: number;
  category: string;
  title: string | null;
  slug: string | null;
  excerpt: string | null;
  cover_url: string | null;
  body: string | null;
  sub_category: string | null;
  published_at: string | null;
};

function mapRow(r: Row): CmsArticle {
  return {
    id: r.id,
    category: (r.category as CmsCategory) ?? "knowledge",
    title: r.title ?? "",
    slug: r.slug ?? "",
    excerpt: r.excerpt ?? "",
    coverUrl: r.cover_url ?? "",
    body: r.body ?? "",
    subCategory: r.sub_category ?? "",
    publishedAt: r.published_at,
  };
}

/** Published articles for a category, newest published first. Fail-soft → []. */
export async function getPublishedArticles(category: CmsCategory): Promise<CmsArticle[]> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("cms_articles")
      .select(COLS)
      .eq("category", category)
      .eq("status", "published")
      .order("published_at", { ascending: false, nullsFirst: false })
      .limit(500);
    if (error) {
      console.error("[cms getPublished] failed", { category, code: error.code, message: error.message });
      return [];
    }
    return ((data ?? []) as unknown as Row[]).map(mapRow);
  } catch (e) {
    console.error("[cms getPublished] threw", { category, message: (e as Error)?.message });
    return [];
  }
}

/** A single published article by slug (for /articles/[slug]). Fail-soft → null. */
export async function getPublishedArticleBySlug(slug: string): Promise<CmsArticle | null> {
  const key = (slug ?? "").trim();
  if (!key) return null;
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("cms_articles")
      .select(COLS)
      .eq("slug", key)
      .eq("status", "published")
      .maybeSingle<Row>();
    if (error) {
      console.error("[cms getBySlug] failed", { slug: key, code: error.code, message: error.message });
      return null;
    }
    return data ? mapRow(data) : null;
  } catch (e) {
    console.error("[cms getBySlug] threw", { slug: key, message: (e as Error)?.message });
    return null;
  }
}
