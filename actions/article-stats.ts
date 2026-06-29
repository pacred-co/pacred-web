"use server";

/**
 * Public view + like counters for the article pages (สาระน่ารู้ · ข่าวสาร ·
 * ผลงานของเรา). Owner 2026-06-29: a real, shared, persisted counter — 1 page
 * visit = +1 view; like works without login and persists; counts climb forever.
 *
 * Backed by `article_stats` (migration 0224). All access via the service-role
 * client + atomic RPCs (article_stat_view / article_stat_like) so concurrent
 * visitors never lose a count and the anon client can't write the table directly.
 *
 * Key = `<category>:<slug>` — the stable permalink, shared by the listing card
 * and the detail page so the number is the same everywhere.
 */

import { createAdminClient } from "@/lib/supabase/admin";

export type ArticleStat = { views: number; likes: number };

// Only our 3 categories + a slug-ish tail. Keeps a public-callable action from
// being used to spam arbitrary keys into the table.
const KEY_RE = /^(knowledge|news|our_work):[^\s]{1,160}$/;

function clean(row: { views: number | string; likes: number | string } | undefined): ArticleStat {
  if (!row) return { views: 0, likes: 0 };
  return { views: Number(row.views) || 0, likes: Number(row.likes) || 0 };
}

/** Read the current totals (no increment) — for listing cards. */
export async function getArticleStats(statKey: string): Promise<ArticleStat> {
  if (!KEY_RE.test(statKey)) return { views: 0, likes: 0 };
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("article_stats")
      .select("views, likes")
      .eq("stat_key", statKey)
      .maybeSingle<{ views: number; likes: number }>();
    if (error) {
      console.error("[article stats read] failed", { statKey, message: error.message });
      return { views: 0, likes: 0 };
    }
    return clean(data ?? undefined);
  } catch {
    return { views: 0, likes: 0 };
  }
}

/** +1 view (every page visit) → returns the new totals. */
export async function registerArticleView(statKey: string): Promise<ArticleStat> {
  if (!KEY_RE.test(statKey)) return { views: 0, likes: 0 };
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("article_stat_view", { p_key: statKey });
    if (error) {
      console.error("[article view] failed", { statKey, message: error.message });
      return { views: 0, likes: 0 };
    }
    return clean((data as { views: number; likes: number }[] | null)?.[0]);
  } catch {
    return { views: 0, likes: 0 };
  }
}

/** Like (+1) or un-like (-1) — anonymous, floored at 0 → returns the new totals. */
export async function likeArticle(statKey: string, delta: 1 | -1): Promise<ArticleStat> {
  if (!KEY_RE.test(statKey) || (delta !== 1 && delta !== -1)) return { views: 0, likes: 0 };
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("article_stat_like", { p_key: statKey, p_delta: delta });
    if (error) {
      console.error("[article like] failed", { statKey, message: error.message });
      return { views: 0, likes: 0 };
    }
    return clean((data as { views: number; likes: number }[] | null)?.[0]);
  } catch {
    return { views: 0, likes: 0 };
  }
}
