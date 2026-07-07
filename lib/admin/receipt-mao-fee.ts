/**
 * resolveReceiptMaoFee — pick the เหมาๆ (mao_fee) for an auto-issued receipt.
 *
 * Default = live-recomputed (direct-slip / wallet type-4). Override (billing-run
 * mark-paid, 2026-07-07) = the bill's stored tb_forwarder_invoice.mao_fee_thb
 * (mig 0209) so a receipt issued FROM a paid ใบวางบิล mirrors the bill to the
 * satang — incl 0 (a bill with เหมาๆ removed → receipt shows 0). A negative or
 * undefined override is ignored → recompute. Pure · rounded to 2 satang.
 */
export function resolveReceiptMaoFee(recomputed: number, override?: number): number {
  if (override !== undefined && override >= 0) {
    return Math.round(override * 100) / 100;
  }
  return recomputed;
}
