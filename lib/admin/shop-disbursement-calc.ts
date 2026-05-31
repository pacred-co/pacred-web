/**
 * Pure helpers for the admin-PUSH "เบิกจ่ายค่าสินค้า" (shop-affiliate
 * disbursement) flow — re-sweep A2 #23, D1 / ADR-0017.
 *
 * Legacy source (the SQL handlers being modelled):
 *   - `pcs-admin/report-shops-profit-pay.php` L26-53      — the batch
 *     create POST handler (eligibility re-check + INSERT tb_shop_pay_h +
 *     N tb_shop_pay_sub + flip tb_header_order.hShopPay='1')
 *   - `pcs-admin/include/pages/report-shops-profit-pay/getListShop.php`
 *     — the "selected rows" modal: re-resolves `ID[]` → `hNo[]` and sums
 *     the per-order amounts (the amount POSTed to the create handler)
 *   - `pcs-admin/report-shops-profit-pay-history.php` L60, L175, L250-254
 *     — the batch history list + per-batch detail (tb_shop_pay_h +
 *     tb_shop_pay_sub join)
 *   - `pcs-admin/print-report-shop.php` L158-178                — the A4
 *     "รายงานภาษีขาย" (sales-tax report) margin math + VAT
 *
 * This module is PURE (no Supabase, no "use server") so it can be unit-
 * tested with `tsx` and imported by BOTH the server action AND the
 * page components without the Next-16 "use server" non-async-export
 * restriction biting.
 *
 * ── Amount math (verbatim from the legacy) ──────────────────────────
 * For each eligible shop order (`tb_header_order` row):
 *   priceUser = round_up((hTotalPriceCHN + hShippingCHN) * hRate, 2)
 *               = the customer-facing SALE price in THB
 *   pricePCS  = round_up(hRateCost * hCostAll, 2)
 *               = the China-side COST in THB
 *   profit    = priceUser - pricePCS          (the service fee / margin)
 *   vat7      = profit * 0.07                  (7% VAT on the margin)
 *
 * The batch `tb_shop_pay_h.amount` POSTed by the legacy modal
 * (getListShop.php) is `$priceUserAll` — the SUM of `priceUser` across
 * the selected orders. NOTE: the legacy modal's label says
 * "ต้นทุนรวม" (total cost) but the value bound to both the visible
 * (disabled) input AND the hidden `amount` input is `$priceUserAll`
 * (the SALE sum) — see getListShop.php `value="<?php echo
 * $priceUserAll;?>"`. We reproduce the VALUE faithfully (sale sum),
 * not the misleading label.
 *
 * Only orders with `hCostAll != 0` contribute to the profit/cost totals
 * in the legacy report (report-shops-profit-pay.php L227 / L268
 * `if($row['hCostAll']!=0)`), because pricePCS/profit are "รอคำนวณ"
 * (pending) until the cost is keyed in. For the batch AMOUNT the legacy
 * getListShop.php sums priceUser UNCONDITIONALLY (it doesn't gate on
 * hCostAll) — we mirror that for the batch amount, and expose the
 * cost-gated profit/VAT separately for the report views.
 */

/** PHP `round_up($number, $precision)` — CEIL to `precision` decimals.
 *  The legacy helper (pcs-admin/include/function.php) is:
 *    $fig = pow(10, $precision);
 *    return ceil($number * $fig) / $fig;
 *  i.e. a ceil-to-precision (always rounds UP, never down). We replicate
 *  so amounts match the legacy to the satang. A tiny epsilon guards
 *  against IEEE-754 float dust (e.g. 1.005*100 = 100.4999999…) pushing
 *  an exact boundary to the next satang. */
export function roundUp(value: number, precision = 2): number {
  if (!Number.isFinite(value)) return 0;
  const fig = Math.pow(10, precision);
  const scaled = value * fig;
  const eps = 1e-9 * Math.max(1, Math.abs(scaled));
  const result = Math.ceil(scaled - eps) / fig;
  // Normalize -0 → 0 (Math.ceil(-tiny) yields -0; avoids "-0.00" display
  // + assertion surprises downstream).
  return result === 0 ? 0 : result;
}

/** The numeric fields the math needs off a `tb_header_order` row. */
export type ShopOrderAmountInput = {
  hno: string;
  htotalpricechn: number | string | null;
  hshippingchn: number | string | null;
  hrate: number | string | null;
  hratecost: number | string | null;
  hcostall: number | string | null;
};

export type ShopOrderAmounts = {
  hno: string;
  /** round_up((hTotalPriceCHN + hShippingCHN) * hRate, 2) — sale THB. */
  priceUser: number;
  /** round_up(hRateCost * hCostAll, 2) — China cost THB (0 when hCostAll=0). */
  pricePCS: number;
  /** priceUser - pricePCS (the service fee). 0 when cost not yet keyed. */
  profit: number;
  /** profit * 0.07 — VAT on margin. */
  vat7: number;
  /** Whether cost has been keyed (legacy `hCostAll != 0`). When false the
   *  legacy report shows pricePCS/profit as "รอคำนวณ". */
  costKeyed: boolean;
};

function num(v: number | string | null | undefined): number {
  const n = typeof v === "string" ? Number(v) : (v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/** Round to 2dp, normalizing -0 → 0. */
function round2(v: number): number {
  const r = Math.round(v * 100) / 100;
  return r === 0 ? 0 : r;
}

/** Per-order margin math — verbatim from report-shops-profit-pay.php
 *  L227-234 / print-report-shop.php L158-165. */
export function computeShopOrderAmounts(row: ShopOrderAmountInput): ShopOrderAmounts {
  const priceUser = roundUp((num(row.htotalpricechn) + num(row.hshippingchn)) * num(row.hrate), 2);
  const costKeyed = num(row.hcostall) !== 0;
  const pricePCS = costKeyed ? roundUp(num(row.hratecost) * num(row.hcostall), 2) : 0;
  const profit = costKeyed ? priceUser - pricePCS : 0;
  const vat7 = profit * 0.07;
  return { hno: row.hno, priceUser, pricePCS, profit, vat7, costKeyed };
}

export type ShopDisbursementTotals = {
  /** SUM(priceUser) — the value POSTed to tb_shop_pay_h.amount. */
  priceUserAll: number;
  /** SUM(pricePCS) over cost-keyed orders. */
  pricePCSAll: number;
  /** SUM(profit) over cost-keyed orders. */
  profitAll: number;
  /** profitAll * 0.07. */
  vat7All: number;
  /** Per-order breakdown (same order as input). */
  rows: ShopOrderAmounts[];
};

/** Aggregate a set of selected orders into the batch totals.
 *  - `priceUserAll` is summed UNCONDITIONALLY (matches getListShop.php
 *    — the batch amount sums sale price for every selected row).
 *  - `pricePCSAll` / `profitAll` only accumulate cost-keyed rows (matches
 *    report L231-233 / L272-273). */
export function computeDisbursementTotals(
  rows: ShopOrderAmountInput[],
): ShopDisbursementTotals {
  const computed = rows.map(computeShopOrderAmounts);
  let priceUserAll = 0;
  let pricePCSAll = 0;
  let profitAll = 0;
  for (const r of computed) {
    priceUserAll += r.priceUser;
    if (r.costKeyed) {
      pricePCSAll += r.pricePCS;
      profitAll += r.profit;
    }
  }
  // Round the running sums to 2dp to avoid float-dust accumulation in
  // the POSTed amount (the legacy PHP sums pre-rounded priceUser values,
  // so the total is already satang-clean; we round defensively).
  priceUserAll = roundUp(priceUserAll, 2);
  pricePCSAll = roundUp(pricePCSAll, 2);
  profitAll = round2(profitAll);
  return {
    priceUserAll,
    pricePCSAll,
    profitAll,
    vat7All: round2(profitAll * 0.07),
    rows: computed,
  };
}

/**
 * Eligibility predicate — does a `tb_header_order` row qualify for
 * shop-disbursement selection (status side of the gate)?
 *
 * Legacy gate (report-shops-profit-pay.php L165-181 default + filter):
 *   - hStatus > 2  AND  hStatus <> 6   (paid/in-progress, not cancelled)
 *   - hShopPay IS NULL                  (not already disbursed)
 *   - settled wallet event: the LEFT JOIN tb_wallet_hs wh ON
 *     ho.hNo = wh.refOrder WHERE wh.status='2' — i.e. the order's
 *     payment has cleared (a settled wallet-history row exists).
 *
 * The date range filters on the SETTLED WALLET DATE (`wh.date`), NOT
 * the order date — `date` in the legacy `DATE(date)` resolves to
 * `tb_wallet_hs.date` because the FROM is `tb_header_order ho LEFT JOIN
 * tb_wallet_hs wh` and only `wh` has a bare `date` column (ho has
 * `hdate`). Confirmed by prod schema probe 2026-06-01.
 *
 * This predicate covers the in-memory hStatus/hShopPay gate; the
 * "settled wallet exists in range" part is resolved by the caller via a
 * second query (tb_wallet_hs status=2 + date range → hno set), because
 * there's no FK relationship for PostgREST to embed.
 */
export function isOrderStatusEligible(row: {
  hstatus: string | number | null;
  hshoppay: string | null;
}): boolean {
  const status = Number(row.hstatus);
  if (!Number.isFinite(status)) return false;
  // hShopPay IS NULL — already-disbursed rows ('1') are excluded. The
  // legacy column is varchar(1) nullable; treat empty-string as
  // not-disbursed too (defensive — legacy only ever writes '1' or NULL).
  const notDisbursed = row.hshoppay === null || row.hshoppay === "";
  return status > 2 && status !== 6 && notDisbursed;
}
