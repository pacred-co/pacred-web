/**
 * Shared admin-table pagination helpers (2026-06-03).
 *
 * Every admin list page used to pull 200–50,000 rows and render them all,
 * which is the per-page render cost that made navigation feel slow. These
 * helpers standardise server-side `.range()` pagination keyed on a `?page=N`
 * URL param so a page only ships one window of rows.
 *
 * Pattern (server component):
 *   const page = parsePage(sp.page);
 *   const { from, to } = pageRange(page);
 *   const { data, count } = await admin.from("X")
 *     .select("*", { count: "exact" })   // count = total for the pager
 *     .range(from, to);
 *   // pass { page, total: count ?? 0 } to <Pagination>
 */

export const DEFAULT_PAGE_SIZE = 50;

/** Parse a 1-based page number from a raw query value; clamps to ≥ 1. */
export function parsePage(raw: string | string[] | undefined): number {
  const v = Array.isArray(raw) ? raw[0] : raw;
  const n = Number(v);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}

/** Inclusive `[from, to]` row range for Supabase `.range()` (0-based). */
export function pageRange(
  page: number,
  pageSize: number = DEFAULT_PAGE_SIZE,
): { from: number; to: number } {
  const from = (page - 1) * pageSize;
  return { from, to: from + pageSize - 1 };
}

/** Total page count for a row total. */
export function pageCount(
  total: number,
  pageSize: number = DEFAULT_PAGE_SIZE,
): number {
  return Math.max(1, Math.ceil(total / pageSize));
}
