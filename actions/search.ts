"use server";

import { createClient } from "@/lib/supabase/server";
import {
  saveSearchQuerySchema,
  type SaveSearchQueryInput,
} from "@/lib/validators/search";
import { logger } from "@/lib/logger";

/**
 * Search-history server actions (G8 — D1 customer-backend gap #8).
 *
 * Mirrors the legacy tb_history_key write (search.php L370-372 INSERT)
 * that the faithful Server-Component port of search.php deferred — see
 * the FLAGGED comment in app/[locale]/(protected)/search/page.tsx
 * around L220-228. The faithful port could not write from a render
 * (Next.js disallows mutations during SC render), so the log lives
 * here, called from the API route + future UI surfaces.
 *
 * Storage: public.tb_search_history (migration 0102).
 * RLS: owner-only read / insert / delete + super/ops read for the
 * legacy report-search.php aggregate.
 *
 * Design constraints:
 *   - saveSearchQuery() MUST NOT throw on failure. Logging a search
 *     is best-effort; if it breaks, the search itself must still
 *     succeed. All errors are caught + logged.
 *   - getMyRecentSearches() de-duplicates queries (latest wins) so
 *     the UI dropdown does not show "iphone, iphone, iphone".
 *   - clearMySearchHistory() deletes all rows for the current user.
 *
 * Anonymous-search posture: silently no-ops. The DB column is
 * nullable for future anonymous logging, but the RLS policy disallows
 * inserts with user_id = null. The action's auth check makes the
 * intent explicit + auditable.
 */

type ActionResult<T = void> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

export type RecentSearch = {
  query: string;
  source: string | null;
  created_at: string;
};

// ────────────────────────────────────────────────────────────
// saveSearchQuery — fire-and-forget log of a search
// ────────────────────────────────────────────────────────────
/**
 * Insert a search-history row. Silently no-ops for anonymous users
 * (no auth.uid → RLS would reject anyway). Never throws — wrap in
 * try/catch internally so the caller can do `void saveSearchQuery(...)`.
 *
 * Use a Promise so React's "use server" boundary is happy, but the
 * caller is encouraged to NOT await this (or to await with
 * `.catch(() => {})`) so a logging failure cannot stall the search
 * response.
 */
export async function saveSearchQuery(
  input: SaveSearchQueryInput,
): Promise<ActionResult> {
  try {
    const parsed = saveSearchQuerySchema.safeParse(input);
    if (!parsed.success) {
      // Invalid input — log + return ok:false but do NOT throw.
      // Search must still work even if the log was malformed.
      logger.warn("search-history", "saveSearchQuery: invalid input", {
        issue: parsed.error.issues[0]?.message,
      });
      return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
    }
    const d = parsed.data;

    const supabase = await createClient();
    const { data: { user }, error: dataErr } = await supabase.auth.getUser();
    if (dataErr) {
      console.error(`[supabase list] failed`, { code: dataErr.code, message: dataErr.message });
    }
    if (!user) {
      // Anonymous — silently no-op. The DB RLS would reject anyway
      // (insert policy requires user_id = auth.uid()).
      return { ok: false, error: "not_signed_in" };
    }

    const { error } = await supabase
      .from("tb_search_history")
      .insert({
        user_id:      user.id,
        query:        d.query,
        source:       d.source ?? null,
        result_count: d.resultCount ?? null,
      });

    if (error) {
      // Best-effort — log + return without throwing.
      logger.warn("search-history", "saveSearchQuery: insert failed", {
        message: error.message,
      });
      return { ok: false, error: error.message };
    }

    return { ok: true };
  } catch (err) {
    // Hard catch-all — search history is best-effort, never crash.
    logger.error("search-history", "saveSearchQuery: unexpected", err);
    return { ok: false, error: "unexpected_error" };
  }
}

// ────────────────────────────────────────────────────────────
// getMyRecentSearches — de-duped "recents" lookup
// ────────────────────────────────────────────────────────────
/**
 * Return the current user's most recent unique queries, newest first.
 * De-duplicated by query text (latest occurrence wins).
 *
 * Internally pulls `limit * 3` rows so even chatty users (who hammer
 * the same query) end up with `limit` unique entries; if the over-
 * fetch still yields fewer than `limit`, returns whatever it has.
 */
export async function getMyRecentSearches(
  limit = 10,
): Promise<ActionResult<RecentSearch[]>> {
  const clamped = Math.min(Math.max(1, limit | 0), 100);

  const supabase = await createClient();
  const { data: { user }, error: dataErr } = await supabase.auth.getUser();
  if (dataErr) {
    console.error(`[supabase list] failed`, { code: dataErr.code, message: dataErr.message });
  }
  if (!user) return { ok: false, error: "not_signed_in" };

  // Over-fetch to absorb dedup loss. 3x is empirical — a user typing
  // the same word three times runs through fast.
  const { data, error } = await supabase
    .from("tb_search_history")
    .select("query, source, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(clamped * 3);

  if (error) return { ok: false, error: error.message };

  const seen = new Set<string>();
  const out: RecentSearch[] = [];
  for (const row of (data ?? []) as RecentSearch[]) {
    const key = row.query;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
    if (out.length >= clamped) break;
  }
  return { ok: true, data: out };
}

// ────────────────────────────────────────────────────────────
// clearMySearchHistory — delete all rows for current user
// ────────────────────────────────────────────────────────────
/**
 * Delete every search-history row for the current user. RLS narrows
 * the DELETE to the owner's rows so the bare `.delete()` is safe
 * even without a `.eq("user_id", …)` filter — kept explicit
 * (defence-in-depth) so the intent reads at a glance.
 */
export async function clearMySearchHistory(): Promise<ActionResult<{ deleted: number }>> {
  const supabase = await createClient();
  const { data: { user }, error: dataErr } = await supabase.auth.getUser();
  if (dataErr) {
    console.error(`[supabase list] failed`, { code: dataErr.code, message: dataErr.message });
  }
  if (!user) return { ok: false, error: "not_signed_in" };

  const { error, count } = await supabase
    .from("tb_search_history")
    .delete({ count: "exact" })
    .eq("user_id", user.id);

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { deleted: count ?? 0 } };
}
