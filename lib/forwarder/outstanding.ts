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
}

function toNumber(v: number | string | null | undefined): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

export function calcForwarderOutstanding(row: ForwarderPriceFields): number {
  const priceFull =
    toNumber(row.ftotalprice) +
    toNumber(row.ftransportprice) +
    toNumber(row.fpriceupdate) +
    toNumber(row.fshippingservice) +
    toNumber(row.pricecrate) +
    toNumber(row.ftransportpricechnthb) +
    toNumber(row.priceother) -
    toNumber(row.fdiscount);

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
