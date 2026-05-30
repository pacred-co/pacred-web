/**
 * lib/sales-commission/calc.ts — the pure customer-commission math, lifted
 * out of the server actions so it is unit-testable under `tsx` (no Next
 * bundler, no "use server" non-async-export restriction).
 *
 * D1 / ADR-0017 + ADR-0020 (`docs/decisions/0020-commission-sot.md`).
 *
 * Legacy reference — the commission breakdown is inlined identically in all
 * four sales screens:
 *   - `member/include/pages/report-user-sales/getListForwarder.php` L166-174
 *   - `pcs-admin/report-user-sales.php` L316-319
 *   - `pcs-admin/report-user-sales-history.php` L405-407
 *
 *   $priceUserAllCHN = Σ( fTotalPrice − fDiscount )   // raw China-shipping total
 *   share   = $priceUserAllCHN * $percen              // 1% commission ($percen=0.01)
 *   wht     = share * 0.03                            // 3% withholding
 *   net     = share − wht                             // what gets paid out
 *   gate    : net >= 1000                             // min withdrawal
 *
 * `$percen` is 0.01 for all four VIP teams (THADA.VIP / SIN.VIP / OOAEOM.VIP
 * / SWAN — report-user-sales-history.php L46-55 + team-map.ts). It is passed
 * in so the legacy "per-team rate" remains a single point of truth.
 *
 * Pure: no IO, no Supabase, no Next imports — safe to import from both the
 * server action and the tsx test.
 */

/** The 3% withholding-tax rate the legacy hardcodes (`*0.03`). */
export const SALES_WHT_RATE = 0.03;

/** The min net withdrawal the legacy enforces (`>= 1000` — getListForwarder.php L174). */
export const SALES_MIN_WITHDRAWAL_THB = 1000;

/** The commission breakdown for a set of earned forwarder rows. */
export type CommissionBreakdown = {
  /** Σ(fTotalPrice − fDiscount) over the selected forwarders — the raw China total. */
  gross: number;
  /** the 1% (or per-team `percen`) commission before WHT. */
  commission: number;
  /** the 3% withholding tax on the commission. */
  wht: number;
  /** commission − wht — the amount actually paid out (stored in tb_user_sales_admin_pay.amount). */
  net: number;
  /** net >= 1000 — the legacy min-withdrawal gate. */
  eligible: boolean;
};

/**
 * Compute the legacy commission breakdown.
 *
 * @param gross  Σ(fTotalPrice − fDiscount) over the chosen delivered forwarders.
 * @param percen the per-team commission rate (0.01 for all four VIP teams).
 */
export function computeCommission(gross: number, percen: number): CommissionBreakdown {
  // The legacy never rounds intermediate steps — number_format only formats
  // for display. We round each money figure to 2dp (Thai baht) so the stored
  // `amount` matches what the customer saw, and so float dust never pushes a
  // boundary case (e.g. 999.9999999) across the 1,000 gate the wrong way.
  const safeGross = Number.isFinite(gross) ? gross : 0;
  const commission = round2(safeGross * percen);
  const wht = round2(commission * SALES_WHT_RATE);
  const net = round2(commission - wht);
  return {
    gross: round2(safeGross),
    commission,
    wht,
    net,
    eligible: net >= SALES_MIN_WITHDRAWAL_THB,
  };
}

/** Σ(fTotalPrice − fDiscount) — the legacy `$priceUserAllCHN` accumulator. */
export function sumGross(
  rows: ReadonlyArray<{ ftotalprice: number | string | null; fdiscount: number | string | null }>,
): number {
  let total = 0;
  for (const r of rows) {
    total += Number(r.ftotalprice ?? 0) - Number(r.fdiscount ?? 0);
  }
  return round2(total);
}

/** Round to 2 decimals, dodging float-representation surprises. */
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
