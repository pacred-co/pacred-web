import { OUTPUT_VAT_RATE } from "@/lib/payment/bank-accounts";
import { modeFromPref } from "@/lib/tax/tax-doc-mode";

/** Amount the customer must actually transfer and the slip ledger must store. */
export function computeShopOrderTransferAmount(
  baseTotalThb: number,
  taxDocPref: string | null | undefined,
): number {
  if (!Number.isFinite(baseTotalThb) || baseTotalThb <= 0) return NaN;
  const multiplier = modeFromPref(taxDocPref) === "tax_invoice"
    ? 1 + OUTPUT_VAT_RATE
    : 1;
  return Math.round(baseTotalThb * multiplier * 100) / 100;
}
