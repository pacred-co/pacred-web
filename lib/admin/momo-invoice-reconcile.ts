/**
 * MOMO supplier-invoice ⇄ our system — the RECONCILE MATH.
 *
 * Owner (2026-07-23, verbatim): *"เราอยากให้มีสรุปมาให้ครบกว่านี้ครับ เวลาบัญชีเขาเอาไฟล์ pdf
 *   มาใส่เทียบ ต้องขึ้น คิวในระบบ คิวที่ momo เรียกเก็บมา ดิฟกัน + - เท่าไร ต้นทุน MOMO เก็บเรา
 *   เท่าไร ระบบเรา ขายเขาไปเท่าไร มีช่องแสดงผล diff กำไร + - ให้ดูด้วยครับ แจงให้ถูก"*
 *
 * The ingest screen already matched each invoice line to our row and showed the per-line
 * cost delta — but it never rolled ANY of it up, and it never loaded the SELL side at all.
 * The accountant had to reach for a calculator to answer the four questions that decide
 * whether a MOMO round is even payable. This module is those four answers, and it is a
 * PURE module so the row table, the per-ตู้ rollup and the header Σ can never drift apart.
 *
 * ── The three numbers, and why THESE three ────────────────────────────────
 * Deliberately the SAME triple `/admin/report-cnt` has shown accounting for months
 * (cnt-list-table.tsx: "ต้นทุนตู้" / "ราคาขาย" / "กำไร"), so the two screens agree word
 * for word and baht for baht:
 *
 *   ต้นทุน  = tb_forwarder.fcosttotalprice   ← what the China→TH leg costs us
 *   ขาย     = tb_forwarder.ftotalprice        ← what we sell that SAME leg for (ค่านำเข้า)
 *   กำไร    = ขาย − ต้นทุน
 *
 * ⚠️ `ftotalprice` is the IMPORT-FREIGHT revenue only — NOT the customer's whole bill
 * (which also carries ค่าขนส่งในไทย · ตีลัง · จีน+ · อื่นๆ − ส่วนลด, via calcForwarderOutstanding).
 * That is the correct pairing here precisely BECAUSE it is narrow: MOMO invoices us for
 * the freight leg, so the freight leg is what it must be compared against. Folding in the
 * domestic legs would inflate "กำไร" against a cost that never included them. The UI must
 * label it ค่านำเข้า, never "ยอดลูกค้า".
 *
 * ── Two normalisations that are easy to get wrong (and are money-wrong if you do) ──
 *
 * 1. THE INVOICE's CBM COLUMN IS NOT ALWAYS THE LINE TOTAL. MOMO ships two templates;
 *    `cbmBasis` (resolved from the invoice's own arithmetic by the parser) says which:
 *      · line_total → the printed cbm IS the whole line   → total = cbm
 *      · per_box    → the printed cbm is ONE box          → total = cbm × qty
 *    Comparing a per_box invoice's raw column against our row total understates MOMO's
 *    billed CBM by a factor of qty and paints a fat fake "+diff" on every multi-box line.
 *
 * 2. OUR fvolume IS NOT ALWAYS THE ROW TOTAL either — the famountcount rule
 *    (lib/forwarder/quantities.ts · the 2026-07-19 quantity SOT): `famountcount='1'`
 *    means fvolume is already the row total (how MOMO-sourced rows are stored), anything
 *    else means it is PER BOX and must be × famount (manual/legacy/TTW rows). Callers pass
 *    `ourCbm` already resolved through `totalCbmOf` — never a raw fvolume.
 *
 * ── Honesty rules (§0f "อย่ามั่ว") ────────────────────────────────────────
 * · Σ over MATCHED rows only. You cannot compare a sell/cost for a line whose row we
 *   could not find — so `unmatchedLines` + `unmatchedCost` are reported ALONGSIDE, never
 *   folded in and never silently dropped. `invoiceCostAll` stays the whole bill.
 * · A matched row that has not been PRICED yet (ftotalprice = 0) would drag "กำไร" down
 *   as if we sold it for nothing. It is counted in `sellMissingLines` so the screen can
 *   say "ยังไม่ตั้งราคา N รายการ" instead of showing a scary fake loss.
 * · Nothing here is a threshold or a gate. This module DESCRIBES; it never decides
 *   whether a file may be saved (that stays with the parser's reconcile/cbmBasis gates).
 *
 * PURE — no I/O, no DB, no clock. Display-only: not one field feeds a write.
 */

/** How to read the invoice's CBM column (mirrors lib/admin/momo-invoice-parser.ts). */
export type MomoCbmBasis = "per_box" | "line_total";

const round2 = (n: number): number => Math.round(n * 100) / 100;
/** CBM keeps 6dp — we store 6dp and MOMO prints 4dp; rounding to 2 would invent a diff. */
const round6 = (n: number): number => Math.round(n * 1_000_000) / 1_000_000;
const num = (n: number | null | undefined): number => (Number.isFinite(Number(n)) ? Number(n) : 0);

/**
 * The CBM MOMO actually billed for this line, normalised to a LINE TOTAL.
 *
 * `basis === null` means the parser could not decide — which it only ever reports when
 * the reading cannot change any line (every line is 1 box) or when the file is being
 * refused anyway. Treating the column as the line total is then both arithmetically
 * identical and the conservative reading.
 */
export function invoiceLineCbm(
  line: { cbm: number | null | undefined; qty: number | null | undefined },
  basis: MomoCbmBasis | null,
): number {
  const cbm = num(line.cbm);
  if (cbm <= 0) return 0;
  if (basis !== "per_box") return round6(cbm);
  const qty = num(line.qty);
  return round6(cbm * (qty > 0 ? qty : 1));
}

/** One matched-or-not invoice line, already resolved against our row. */
export type ReconcileRow = {
  matched: boolean;
  /** MOMO's billed CBM for this line, normalised via `invoiceLineCbm`. */
  invoiceCbm: number;
  /** Our row's TOTAL CBM (already through `totalCbmOf`) · null when unmatched. */
  ourCbm: number | null;
  /** The line's "รวม (Total)" — what MOMO charges us for this tracking. */
  invoiceCost: number;
  /** tb_forwarder.fcosttotalprice as it stands right now · null when unmatched. */
  currentCost: number | null;
  /** tb_forwarder.ftotalprice — the import-freight SELL · null when unmatched. */
  ourSell: number | null;
};

export type ReconcileTotals = {
  lines: number;
  matchedLines: number;
  unmatchedLines: number;

  // ── คิว (CBM) ────────────────────────────────────────────
  /** Σ CBM MOMO billed across the WHOLE file (matched or not). */
  invoiceCbmAll: number;
  /** Σ CBM MOMO billed on MATCHED lines — the only figure comparable to ours. */
  invoiceCbm: number;
  /** Σ CBM our system holds for those same matched rows. */
  ourCbm: number;
  /** ourCbm − invoiceCbm · + = ระบบเรามีคิวมากกว่าที่ MOMO เรียกเก็บ. */
  cbmDiff: number;

  // ── ต้นทุน (COST) ────────────────────────────────────────
  /** Σ of every line on the bill — what MOMO wants for this round, full stop. */
  invoiceCostAll: number;
  /** Σ invoice cost on MATCHED lines. */
  invoiceCost: number;
  /** Σ invoice cost on UNMATCHED lines — billed to us but not landed anywhere yet. */
  unmatchedCost: number;
  /** Σ fcosttotalprice currently stored on those matched rows. */
  currentCost: number;
  /** invoiceCost − currentCost · + = MOMO เก็บมากกว่าที่ระบบบันทึกไว้ (ต้นทุนจะเพิ่ม). */
  costDiff: number;

  // ── ขาย + กำไร (SELL / PROFIT) ───────────────────────────
  /** Σ ftotalprice (ค่านำเข้า) on matched rows. */
  sell: number;
  /** Matched rows still unpriced (ftotalprice ≤ 0) — profit below is understated by these. */
  sellMissingLines: number;
  /** กำไรตามที่ระบบแสดงอยู่ตอนนี้ = sell − currentCost. */
  profitNow: number;
  /** กำไรหลังบันทึกต้นทุนจากใบนี้ = sell − invoiceCost. */
  profitAfter: number;
  /** profitAfter − profitNow (= −costDiff) · − = บันทึกใบนี้แล้วกำไรลด. */
  profitDiff: number;
};

/**
 * Roll a set of resolved invoice lines into the summary block the accountant reads
 * before deciding to save. Order-independent; safe on an empty list (all zeros).
 */
export function buildReconcileTotals(rows: readonly ReconcileRow[]): ReconcileTotals {
  let invoiceCbmAll = 0;
  let invoiceCbm = 0;
  let ourCbm = 0;
  let invoiceCostAll = 0;
  let invoiceCost = 0;
  let unmatchedCost = 0;
  let currentCost = 0;
  let sell = 0;
  let matchedLines = 0;
  let sellMissingLines = 0;

  for (const r of rows) {
    const lineCbm = num(r.invoiceCbm);
    const lineCost = num(r.invoiceCost);
    invoiceCbmAll += lineCbm;
    invoiceCostAll += lineCost;

    if (!r.matched) {
      unmatchedCost += lineCost;
      continue;
    }

    matchedLines += 1;
    invoiceCbm += lineCbm;
    invoiceCost += lineCost;
    ourCbm += num(r.ourCbm);
    currentCost += num(r.currentCost);

    const rowSell = num(r.ourSell);
    sell += rowSell;
    if (rowSell <= 0) sellMissingLines += 1;
  }

  const cbmDiff = round6(ourCbm - invoiceCbm);
  const costDiff = round2(invoiceCost - currentCost);
  const profitNow = round2(sell - currentCost);
  const profitAfter = round2(sell - invoiceCost);

  return {
    lines: rows.length,
    matchedLines,
    unmatchedLines: rows.length - matchedLines,

    invoiceCbmAll: round6(invoiceCbmAll),
    invoiceCbm: round6(invoiceCbm),
    ourCbm: round6(ourCbm),
    cbmDiff,

    invoiceCostAll: round2(invoiceCostAll),
    invoiceCost: round2(invoiceCost),
    unmatchedCost: round2(unmatchedCost),
    currentCost: round2(currentCost),
    costDiff,

    sell: round2(sell),
    sellMissingLines,
    profitNow,
    profitAfter,
    profitDiff: round2(profitAfter - profitNow),
  };
}
