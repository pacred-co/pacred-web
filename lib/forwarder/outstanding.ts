/**
 * Forwarder ยอดค้างชำระ (outstanding balance) — port of legacy
 * `calPriceForwarderMain()` from `pcs-admin/include/function.php` L1878.
 *
 * Wave 15 P0-3 (2026-05-25) — addresses fidelity-gap-2026-05-24.md row
 * "Column ยอดค้างชำระ (computed via calPriceForwarderMain helper)" which
 * the legacy `/admin/forwarders` shows inline so operators can chase
 * money. Pacred was missing this column entirely.
 *
 * Legacy formula:
 *   priceFull = (fTotalPrice + fTransportPrice + fPriceUpdate +
 *                fShippingService + priceCrate + fTransportPriceCHNTHB +
 *                priceOther) - fDiscount
 *   if (fUserCompany == 1) {
 *     // Juristic-person (นิติบุคคล) gets a 1% allowance off the grand total
 *     fUserCompany1Per = priceFull * 0.01
 *   }
 *   price = priceFull - fUserCompany1Per
 *
 * Inputs are mostly numeric columns on `tb_forwarder`, but legacy schema
 * stores some as `varchar` (a/k/a `string | number | null`). We coerce
 * defensively. Output is rounded to 2 satang.
 *
 * NOTE: this is the LIST-page total · NOT the per-row discount engine.
 * `lib/forwarder/calc-price.ts` is the rate-resolution + tier-pricing
 * engine for the order-create flow. Different concerns, kept separate.
 */

export interface ForwarderPriceFields {
  ftotalprice:           number | string | null;
  ftransportprice:       number | string | null;
  fpriceupdate:          number | string | null;
  fshippingservice:      number | string | null;   // legacy varchar
  pricecrate:            number | string | null;
  ftransportpricechnthb: number | string | null;
  priceother:            number | string | null;
  fdiscount:             number | string | null;
  fusercompany:          number | string | null;   // legacy varchar; '1' = juristic
  /**
   * D1 (2026-07-13 · MONEY) — '1'=ต้นทาง (prepaid) · '2'=ปลายทาง (COD, courier collects
   * the domestic leg at the door). A COD row's ftransportprice is the AT-DOOR amount, so
   * it must NOT be folded into the Pacred upfront bill/outstanding (else the domestic leg
   * is double-billed: once on the ใบวางบิล + once by the courier). Mirrors the customer
   * self-pay helper (forwarder-collect-total.ts). OPTIONAL: absent/undefined → treated as
   * prepaid → the domestic leg is added as before (no regression for callers that don't
   * SELECT paymethod).
   */
  paymethod?:            number | string | null;
}

function toNumber(v: number | string | null | undefined): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * The GROSS composite the customer owes — Σ 7 price columns − discount, with
 * NO juristic 1% allowance applied. This is the legacy `priceFull` BEFORE the
 * `fUserCompany1Per` step (forwarder function.php L1878).
 *
 * Use this in the ใบวางบิล (billing-run) flow: the bill stores GROSS line/
 * subtotal/total and shows the หัก ณ ที่จ่าย 1% as its OWN line, then a net
 * payable — the standard Thai tax-document layout (and what the auto-issued
 * ใบเสร็จ already does · lib/admin/auto-issue-receipt.ts `pricePayBase`). The
 * 1% is then applied EXACTLY ONCE at display time via `computeBillWht(gross)`.
 *
 * Do NOT use this for the "ยอดค้างชำระ / ยอดเก็บจริง" operational figures on the
 * forwarders list, forwarder-check, credit + AR reports — those keep showing
 * the NET `calcForwarderOutstanding` (the cash we actually collect, legacy
 * `calPriceForwarderMain`). The 1% gap between the two is the withholding, not
 * a discrepancy.
 */
export function calcForwarderGross(row: ForwarderPriceFields): number {
  const safe = forwarderPriceFull(row);
  return Math.round((safe > 0 ? safe : 0) * 100) / 100;
}

/** Σ 7 price columns − discount (the legacy `priceFull`, pre-allowance · raw). */
function forwarderPriceFull(row: ForwarderPriceFields): number {
  // D1 (2026-07-13 · MONEY) — the DOMESTIC leg (ftransportprice) is billed upfront ONLY
  // for a prepaid (ต้นทาง) row. A COD (ปลายทาง · paymethod='2') row's ftransportprice is
  // collected at the door by the courier, so it is NOT folded into the Pacred bill/
  // outstanding (else double-charge). Absent paymethod ⇒ prepaid ⇒ unchanged. Mirrors
  // forwarder-collect-total.ts (the customer self-pay path) so the two never drift.
  const domesticLeg = toNumber(row.paymethod) === 2 ? 0 : toNumber(row.ftransportprice);
  return (
    toNumber(row.ftotalprice) +
    domesticLeg +
    toNumber(row.fpriceupdate) +
    toNumber(row.fshippingservice) +
    toNumber(row.pricecrate) +
    toNumber(row.ftransportpricechnthb) +
    toNumber(row.priceother) -
    toNumber(row.fdiscount)
  );
}

export function calcForwarderOutstanding(row: ForwarderPriceFields): number {
  const priceFull = forwarderPriceFull(row);

  // Juristic-person (นิติบุคคล) 1% allowance — fusercompany='1' on legacy
  const isJuristic =
    (typeof row.fusercompany === "string"
      ? row.fusercompany.trim() === "1"
      : row.fusercompany === 1);
  const allowance = isJuristic ? priceFull * 0.01 : 0;

  const final = priceFull - allowance;
  // Never display a negative outstanding (would mean overpaid · the
  // refund flow handles that as a wallet credit, not a forwarder field).
  const safe = final > 0 ? final : 0;
  return Math.round(safe * 100) / 100;
}
