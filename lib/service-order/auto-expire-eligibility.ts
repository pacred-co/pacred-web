/**
 * Pure, DB-free eligibility guard for the shop-order auto-cancel. Lives in its
 * own module (no Supabase / no `server-only` import) so it can be unit-tested
 * under tsx — the action wrapper `autoExpireOverdueShopOrder` (./auto-expire)
 * re-exports it and does the DB write.
 *
 * Faithful to legacy detail.php L73-78 / update.php L72-78.
 */

/** The header fields the auto-expire guard reads. */
export type ShopOrderExpireHeader = {
  id: number;
  hstatus: string | null;
  hdatepayment: string | null;
};

/**
 * Returns true ONLY when an order should flip to hStatus '6' (ยกเลิก):
 *   - hstatus is exactly '2' (รอชำระเงิน) — any other status is never expired
 *   - hdatepayment is present + a parseable date
 *   - that due date is strictly in the PAST relative to `now`
 *
 * `now` is injected (defaults to Date.now()) so a test can pin "now" without
 * touching the clock. A due-date exactly equal to `now` is NOT expired (the
 * legacy `due >= now → keep` boundary is preserved).
 */
export function isShopOrderAutoExpireEligible(
  header: ShopOrderExpireHeader,
  now: number = Date.now(),
): boolean {
  if (header.hstatus !== "2") return false;
  const raw = header.hdatepayment;
  if (!raw) return false;

  const due = new Date(raw).getTime();
  if (!Number.isFinite(due) || due >= now) return false;
  return true;
}
