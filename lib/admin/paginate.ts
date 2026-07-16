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

/**
 * Selectable rows-per-page values for the shared <PageSizeSelect> control.
 * "all" is offered too (see parsePageSize) but is hard-capped at
 * ALL_PAGE_SIZE_CAP so a list can never pull 9000+ rows unbounded.
 */
export const ALLOWED_PAGE_SIZES = [50, 100, 250, 500, 1000] as const;

/** Hard cap for the "ทั้งหมด" (all) page size — never fetch more than this. */
export const ALL_PAGE_SIZE_CAP = 5000;

/** Parse a 1-based page number from a raw query value; clamps to ≥ 1. */
export function parsePage(raw: string | string[] | undefined): number {
  const v = Array.isArray(raw) ? raw[0] : raw;
  const n = Number(v);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}

/**
 * Parse a `?size=` query value → a clamped page size.
 * - "all" → ALL_PAGE_SIZE_CAP (the safe hard cap · UI labels it ทั้งหมด สูงสุด 5000)
 * - a value in ALLOWED_PAGE_SIZES → that value
 * - anything else (missing/garbage) → DEFAULT_PAGE_SIZE
 */
export function parsePageSize(
  raw: string | string[] | undefined,
  allowed: readonly number[] = ALLOWED_PAGE_SIZES,
): number {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (v === "all") return ALL_PAGE_SIZE_CAP;
  const n = Number(v);
  return allowed.includes(n) ? n : DEFAULT_PAGE_SIZE;
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
