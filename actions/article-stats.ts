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

export type ArticleStat = { views: number; likes: number; shares: number };

// Only our 3 categories + a slug-ish tail. Keeps a public-callable action from
// being used to spam arbitrary keys into the table.
const KEY_RE = /^(knowledge|news|our_work):[^\s]{1,160}$/;

const EMPTY: ArticleStat = { views: 0, likes: 0, shares: 0 };

type StatRow = { views: number | string; likes: number | string; shares?: number | string };

function clean(row: StatRow | undefined): ArticleStat {
  if (!row) return EMPTY;
  return { views: Number(row.views) || 0, likes: Number(row.likes) || 0, shares: Number(row.shares) || 0 };
}

/** Read the current totals (no increment) — for listing cards. */
export async function getArticleStats(statKey: string): Promise<ArticleStat> {
  if (!KEY_RE.test(statKey)) return EMPTY;
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("article_stats")
      .select("views, likes, shares")
      .eq("stat_key", statKey)
      .maybeSingle<StatRow>();
    if (error) {
      console.error("[article stats read] failed", { statKey, message: error.message });
      return EMPTY;
    }
    return clean(data ?? undefined);
  } catch {
    return EMPTY;
  }
}

/** +1 view (every page visit) → returns the new totals. */
export async function registerArticleView(statKey: string): Promise<ArticleStat> {
  if (!KEY_RE.test(statKey)) return EMPTY;
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("article_stat_view", { p_key: statKey });
    if (error) {
      console.error("[article view] failed", { statKey, message: error.message });
      return EMPTY;
    }
    return clean((data as StatRow[] | null)?.[0]);
  } catch {
    return EMPTY;
  }
}

/** Like (+1) or un-like (-1) — anonymous, floored at 0 → returns the new totals. */
export async function likeArticle(statKey: string, delta: 1 | -1): Promise<ArticleStat> {
  if (!KEY_RE.test(statKey) || (delta !== 1 && delta !== -1)) return EMPTY;
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("article_stat_like", { p_key: statKey, p_delta: delta });
    if (error) {
      console.error("[article like] failed", { statKey, message: error.message });
      return EMPTY;
    }
    return clean((data as StatRow[] | null)?.[0]);
  } catch {
    return EMPTY;
  }
}

/**
 * +1 share — CUMULATIVE, not a toggle (แชร์เข้า LINE แล้วแชร์ต่อเข้า FB = 2 ครั้ง).
 * Fired only after the browser confirms a real share/copy happened, so a cancelled
 * native share sheet does NOT inflate the number.
 */
export async function shareArticle(statKey: string): Promise<ArticleStat> {
  if (!KEY_RE.test(statKey)) return EMPTY;
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("article_stat_share", { p_key: statKey });
    if (error) {
      console.error("[article share] failed", { statKey, message: error.message });
      return EMPTY;
    }
    return clean((data as StatRow[] | null)?.[0]);
  } catch {
    return EMPTY;
  }
}
