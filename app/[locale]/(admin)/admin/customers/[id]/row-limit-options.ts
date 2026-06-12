/**
 * Shared row-count options for the customer-detail activity tables. Plain
 * module (no "use client"/"use server") so both the server view (parsing the
 * URL param → SELECT .limit) and the client <RowLimitSelect> agree on the
 * allowed set — no drift.
 */

export const ROW_LIMIT_OPTIONS = [10, 25, 50, 100] as const;
export const DEFAULT_ROW_LIMIT = 10;

/** Clamp a raw URL-param value to an allowed option (else the default). */
export function parseRowLimit(raw: string | string[] | undefined): number {
  const n = Number(Array.isArray(raw) ? raw[0] : raw);
  return (ROW_LIMIT_OPTIONS as readonly number[]).includes(n) ? n : DEFAULT_ROW_LIMIT;
}
