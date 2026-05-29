/**
 * Pure helpers for the customer-side wallet-paid yuan-payment flow.
 *
 * Lives outside any "use server" boundary so it can:
 *   1. Be re-exported as `export const` (Next 16 "use server" rejects
 *      non-async-function value exports — see docs/learnings/nextjs-16-quirks.md
 *      [2026-05-28] entry).
 *   2. Be unit-tested directly without going through `tsx --env-file`.
 *
 * Used by `actions/payment-tb.ts::createYuanPaymentFromWallet` and its
 * test `actions/payment-tb.test.ts`.
 *
 * The math mirrors the legacy `pcs-admin/payment.php` L11-93 contract
 * + ADR-0018 §D-2 rule 1 (customer DEBIT-on-submit).
 */

/**
 * payTHB = round(yuan × rate, 2 dp).
 * Mirrors PHP `number_format($payRate * $payYuan, 2, '.', '')`.
 */
export function computePayThb(yuan: number, rate: number): number {
  return Math.round(yuan * rate * 100) / 100;
}

/**
 * Wallet overdraw check.
 * Legacy: `if ($payTHB <= $walletTotal && $payTHB > 0)`.
 *
 * The `payTHB > 0` half is also enforced by Zod (yuan_amount + rate
 * must be positive); this helper covers the wallet-coverage half so
 * the action's `if (!canDebit(...))` reads cleanly.
 */
export function canDebit(walletTotal: number, payTHB: number): boolean {
  return payTHB > 0 && walletTotal >= payTHB;
}

/**
 * newBalance = round(walletTotal − payTHB, 2 dp).
 * Mirrors legacy `$walletTotal = $walletTotal - $payTHB` post-rounding.
 */
export function computeNewBalance(walletTotal: number, payTHB: number): number {
  return Math.round((walletTotal - payTHB) * 100) / 100;
}
