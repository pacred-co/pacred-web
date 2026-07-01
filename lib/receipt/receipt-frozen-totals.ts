/**
 * Pure money-math for rendering a receipt as a FROZEN document-of-record
 * (task 4a · ภูม 2026-07-01 · "บิล 2,135.43 vs ใบเสร็จ 2,057").
 *
 * A receipt is a snapshot: its printed totals must equal what was stored at
 * issuance (`tb_receipt.totalbeforewithholding` / `.ramount`, incl เหมาๆ) — the
 * same numbers on its ใบวางบิล. The old render RE-SUMMED the current forwarder
 * rows LIVE, so a receipt drifted whenever a price was edited AFTER it was
 * issued. This function picks the frozen stored figures when the header carries
 * them, and only falls back to the live per-line sum for legacy receipts whose
 * header was never populated.
 *
 * Split out of `lib/receipt/load-receipt-document.ts` (which is `server-only`)
 * so it can be unit-tested without the server bundle.
 */

export type FrozenTotalsInput = {
  /** tb_receipt.totalbeforewithholding — frozen pre-WHT total (incl เหมาๆ). */
  headerTotalBefore: number;
  /** tb_receipt.ramount — frozen post-WHT net (what the customer paid). */
  headerRamount: number;
  /** Live per-line sum incl เหมาๆ (fallback only). */
  lineSumWithMao: number;
  /** Corporate + total ≥ 1000 → this receipt withholds 1%. */
  showWht: boolean;
  /** True when tb_receipt_item rows are absent but the header has an amount. */
  itemsMissing: boolean;
};

export type FrozenTotals = {
  /** The pre-WHT total to print ("มูลค่าไม่มีหรือยกเว้นภาษี / จำนวนเงินทั้งสิ้น"). */
  preTaxTotal: number;
  /** The WHT amount to print ("จำนวนเงินที่ถูกหัก ณ ที่จ่าย"). */
  whtAmount: number;
  /** The net paid to print ("จำนวนเงินที่ชำระ") — matches the ใบวางบิล. */
  grandTotal: number;
  /** Whether the frozen header values drove the totals (vs the live fallback). */
  usedFrozen: boolean;
};

/**
 * Resolve the three receipt totals from the frozen header when available,
 * else from the live per-line sum. Never re-derives a total that drifts from
 * the stored document-of-record.
 */
export function resolveReceiptFrozenTotals(input: FrozenTotalsInput): FrozenTotals {
  const { headerTotalBefore, headerRamount, lineSumWithMao, showWht, itemsMissing } = input;

  // The header was populated at issuance (auto-issue writes both cols). ANY >0
  // means we hold the frozen doc value. Legacy 0/blank headers → live fallback.
  const hasFrozenTotals = headerTotalBefore > 0 || headerRamount > 0;
  const usedFrozen = itemsMissing || hasFrozenTotals;

  const whtAmount = (() => {
    if (itemsMissing) return Math.max(0, headerTotalBefore - headerRamount);
    if (hasFrozenTotals) {
      // Frozen WHT = the exact stored difference (pre-WHT − net). A personal
      // receipt has ramount == totalbeforewithholding so the diff is 0 anyway.
      return showWht ? Math.max(0, headerTotalBefore - headerRamount) : 0;
    }
    // Legacy fallback: re-apply the 1% rule on the live sum (unchanged).
    return showWht ? lineSumWithMao * 0.01 : 0;
  })();

  const grandTotal = usedFrozen
    ? headerRamount                 // frozen net (matches the bill)
    : lineSumWithMao - whtAmount;   // legacy fallback

  const preTaxTotal = usedFrozen
    ? headerTotalBefore             // frozen pre-WHT total
    : lineSumWithMao;               // legacy fallback

  return { preTaxTotal, whtAmount, grandTotal, usedFrozen };
}
