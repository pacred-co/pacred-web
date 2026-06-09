/**
 * Pure helpers for the shop-order refund-history page (E6).
 *
 * Extracted out of `actions/admin/service-orders-refund-history.ts` so the
 * unit tests can exercise the date / pagination / search-match math
 * without transitively pulling in `lib/supabase/admin.ts` (which depends
 * on the runtime-only `server-only` module that errors under `tsx`).
 *
 * The action re-exports these for ergonomic use at the call site.
 */

/**
 * Wall-clock helper — wrapped so React-component render bodies don't
 * directly call `new Date()` (Next 16 react-hooks/purity rule for
 * Server Components per AGENTS.md project conventions).
 */
export function nowIso(): string {
  return new Date().toISOString();
}

/**
 * `N` days ago in ISO date-only form `YYYY-MM-DD`. Used to seed the
 * default 30-day filter on the refund history page.
 */
export function daysAgoIso(n: number, refNow?: Date): string {
  const ref = refNow ?? new Date();
  const d = new Date(ref);
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

/**
 * Today as `YYYY-MM-DD`.
 */
export function todayIso(refNow?: Date): string {
  const ref = refNow ?? new Date();
  return ref.toISOString().slice(0, 10);
}

/**
 * Default window — 30 days. Owner asks "ขอดูประวัติคืนเงิน" usually means
 * "this month-ish", so 30d is the right out-of-the-box.
 */
export const DEFAULT_REFUND_WINDOW_DAYS = 30;

/**
 * Make a date-only filter inclusive of the entire selected end-day.
 * Mirrors `/admin/service-orders/page.tsx` contract.
 */
export function endOfDayTs(dateIso: string): string {
  return `${dateIso}T23:59:59`;
}

/**
 * Pagination math — 1-based page number + page size → 0-based
 * `.range()` window. Defensive against NaN/0/negative inputs.
 */
export function refundHistoryRange(
  page: number,
  pageSize: number,
): { from: number; to: number } {
  const p = Number.isFinite(page) && page >= 1 ? Math.floor(page) : 1;
  const sz =
    Number.isFinite(pageSize) && pageSize >= 1 ? Math.floor(pageSize) : 50;
  const from = (p - 1) * sz;
  return { from, to: from + sz - 1 };
}

/**
 * Search-term match — given a raw `keyword` and a candidate `(hno,
 * userid)`, return true when the candidate row should be returned.
 * Pure helper so we can prove the filter rule without DB. Mirrors the
 * server-side `.or(hno.ilike|userid.ilike)` predicate semantics.
 */
export function refundHistoryMatches(
  keyword: string | null | undefined,
  candidate: { hno: string | null; userid: string | null },
): boolean {
  const k = (keyword ?? "").trim().toLowerCase();
  if (!k) return true;
  const hno = (candidate.hno ?? "").toLowerCase();
  const uid = (candidate.userid ?? "").toLowerCase();
  return hno.includes(k) || uid.includes(k);
}
