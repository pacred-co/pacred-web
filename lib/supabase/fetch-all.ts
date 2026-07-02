import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * PostgREST caps a single SELECT at ~1000 rows unless a `Range` is set (the
 * `db.aggregates`/`max-rows` server default). A query like
 * `.from("tb_cart").in("id", ids)` therefore SILENTLY returns at most 1000
 * rows even when `ids` names 1500 — the classic "large order lost its items
 * + total" bug: the header inserts, only the first 1000 lines transfer, and
 * the rollup (`hcount` / `htotalpricechn`) sums the truncated set.
 *
 * `fetchAllRows` walks `.range(from, to)` in fixed-size pages until a short
 * page is returned, concatenating every row. Use it anywhere a query might
 * legitimately match more than ~1000 rows (cart → order carry-through, bulk
 * reconcile reads, etc.). It does NOT change per-unit math — it only makes
 * sure the read is complete so the sum/count is over the full set.
 *
 * @param buildQuery  called once per page; must apply the same filters each
 *                    time and return a PostgREST builder WITHOUT its own
 *                    range/limit (this helper owns the range). A stable
 *                    `.order(...)` on a unique/monotonic column (e.g. `id`)
 *                    is required so pages don't overlap or skip rows.
 * @param pageSize    rows per page (default 1000 — the PostgREST ceiling).
 */
export async function fetchAllRows<Row>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  buildQuery: () => any,
  pageSize = 1000,
): Promise<{ data: Row[]; error: { message: string; code?: string } | null }> {
  const all: Row[] = [];
  let from = 0;
  // Hard stop so a pathological caller can't loop forever (1000 pages ×
  // 1000 = 1,000,000 rows — far above any real single-customer cart).
  const MAX_PAGES = 1000;
  for (let page = 0; page < MAX_PAGES; page++) {
    const to = from + pageSize - 1;
    const { data, error } = await buildQuery().range(from, to);
    if (error) return { data: all, error };
    const rows = (data ?? []) as Row[];
    all.push(...rows);
    if (rows.length < pageSize) break; // short page → last page reached
    from += pageSize;
  }
  return { data: all, error: null };
}

// Re-export the client type so callers can annotate without importing from
// two places (keeps the "one import for the fetch-all pattern" ergonomic).
export type { SupabaseClient };
