/**
 * Pure helpers for the customer-side bulk-cancel + bulk-pay action bar on
 * `/service-order` (legacy `member/include/pages/shops/getList.php` modal).
 *
 * Why pure helpers (not inlined in the client island):
 *   - The eligibility checks are the SAME logic used by the per-row buttons
 *     (cancel only on hstatus 1/2 · pay only on hstatus 2 — these gates
 *     mirror the `cancelServiceOrder` + `payServiceOrderFromWallet` server
 *     actions). Centralising them here means the UI and the server can
 *     never silently disagree on "is this row cancelable / payable".
 *
 *   - The wallet pre-check (`canCoverBulkPay`) is the single place that
 *     decides whether the "ชำระเงิน N รายการ" button is enabled — same
 *     test runs on every selection change. Pure + tested = the tooltip
 *     copy + the disabled state can never drift apart.
 *
 *   - Per AGENTS.md §0e: bulk-pay must stop on first failure (don't keep
 *     draining wallet on partial failures), but bulk-cancel keeps going
 *     (best-effort). `summariseLoopResults` returns a discriminated union
 *     so the UI banner can render the right message in each mode.
 */

/** Subset of the customer order row used for bulk-action eligibility. */
export type OrderForBulk = {
  hno: string;
  hstatus: string | null;
  /** The display total in baht (from computeShopOrderPayableThb). */
  totalThb: number;
};

/** Filter the input list to rows the customer can cancel (hstatus '1' or '2'). */
export function getCancelableHNos(rows: OrderForBulk[]): string[] {
  return rows
    .filter((r) => {
      const s = (r.hstatus ?? "").trim();
      return s === "1" || s === "2";
    })
    .map((r) => r.hno);
}

/** Filter the input list to rows the customer can pay from wallet (hstatus '2'). */
export function getPayableHNos(rows: OrderForBulk[]): string[] {
  return rows
    .filter((r) => (r.hstatus ?? "").trim() === "2")
    .map((r) => r.hno);
}

/** Total amount in baht for a set of selected, payable rows. */
export function sumPayableTotals(args: {
  rows: OrderForBulk[];
  selectedHnos: string[];
}): number {
  const sel = new Set(args.selectedHnos);
  return args.rows
    .filter((r) => sel.has(r.hno) && (r.hstatus ?? "").trim() === "2")
    .reduce((acc, r) => acc + (Number.isFinite(r.totalThb) ? r.totalThb : 0), 0);
}

/**
 * Whether the wallet has enough balance to cover the selected payable rows.
 * The UI uses this to:
 *   - disable the "ชำระเงิน N รายการ" button when false
 *   - render the tooltip "ยอดเกินกระเป๋า · กรุณาชำระเงินก่อน"
 *
 * Returns `{ ok: true }` when affordable, `{ ok: false, shortfall }` otherwise.
 */
export type BulkPayCoverage =
  | { ok: true }
  | { ok: false; shortfall: number };

export function canCoverBulkPay(args: {
  walletBalance: number;
  totalRequired: number;
}): BulkPayCoverage {
  const have = Number.isFinite(args.walletBalance) ? args.walletBalance : 0;
  const need = Number.isFinite(args.totalRequired) ? args.totalRequired : 0;
  if (have >= need) return { ok: true };
  return { ok: false, shortfall: need - have };
}

/** Outcome shape used by bulk loops. */
export type LoopOutcome<E = string> =
  | { ok: true; hno: string }
  | { ok: false; hno: string; error: E };

/**
 * Summarise a list of per-row results into a UI banner kind + counts.
 * Caller decides which `mode` controls the banner copy.
 *
 * BULK-PAY semantic difference (AGENTS.md §0e): the caller must abort the
 * loop on first failure to avoid draining the wallet on partial failures.
 * `summariseLoopResults` itself doesn't enforce that — it just reports — but
 * the BulkPayBar's loop uses an explicit `for (...)` break instead of
 * `Promise.all` so a failed row halts the wallet drain.
 */
export type LoopSummary = {
  total:   number;
  ok:      number;
  failed:  number;
  firstError: string | null;
  firstFailedHno: string | null;
};

export function summariseLoopResults(results: LoopOutcome[]): LoopSummary {
  const total = results.length;
  let ok = 0;
  let failed = 0;
  let firstError: string | null = null;
  let firstFailedHno: string | null = null;
  for (const r of results) {
    if (r.ok) {
      ok++;
    } else {
      failed++;
      if (firstError == null) {
        firstError = r.error;
        firstFailedHno = r.hno;
      }
    }
  }
  return { total, ok, failed, firstError, firstFailedHno };
}
