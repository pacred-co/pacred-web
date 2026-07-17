/**
 * VERIFY: the MOMO invoice PDF-upload path, against the REAL invoice files.
 *
 * Read-only. No DB. No writes. Run it whenever the PDF path is touched, and any time
 * MOMO sends a file that behaves oddly — it is the only check that exercises the real
 * pdf.js extraction on a real MOMO PDF.
 *
 *   npx tsx --tsconfig tsconfig.test.json scripts/verify-momo-invoice-pdf-2026-07-17.ts [file.pdf …]
 *
 * (`--tsconfig tsconfig.test.json` shims the build-time `server-only` marker so tsx can
 *  load the real module graph — same trick as billing-gate.test.ts.)
 *
 * WHY this is a script and not a unit test: the real invoices are live supplier documents
 * (customer PR codes · trackings · money), so they must never be committed as fixtures.
 * The pure half — the guards + the "hasEOL, never Y-grouping" row assembly — IS unit-locked
 * in lib/admin/momo-invoice-pdf-text.test.ts and runs in `pnpm test:unit`. This script covers
 * what a fixture cannot: that pdf.js actually hands us those items for a genuine MOMO file.
 *
 * PASS = every invoice's Σ(lineTotal) foots its own printed Sub-total, and the CBM basis is
 * usable — i.e. the upload path feeds the money gates exactly what the paste path fed them.
 *
 * ── Baseline recorded 2026-07-17 (all 5 real invoices · all PASS) ────────────────────
 *   INV-20260708-0002  4p  39 lines  Σ 21,626.89  basis line_total  votes 6/0
 *   INV-20260618-0003  2p  12 lines  Σ 23,097.30  basis line_total  votes 7/0   (1 real MOMO
 *                                    arithmetic slip flagged: 9822290862949 prints 1.80, 0.0008×2500=2.00)
 *   INV-20260618-0004  2p   8 lines  Σ  6,893.25  basis line_total  votes 2/0   (1 line prints rate 0.00)
 *   INV-20260623-0006  2p  19 lines  Σ  8,385.00  basis n/a (ทุกบรรทัด 1 กล่อง)  (16 lines print rate 0.00)
 *   INV-20260625-0003  2p   9 lines  Σ 28,175.00  basis n/a (ทุกบรรทัด 1 กล่อง)
 *   → 15 discriminating lines · 15 vote line_total · 0 vote per_box, across BOTH months.
 *     Extracted straight from the PDFs, this reproduces the evidence table independently of
 *     however those invoices were first transcribed — and is the standing refutation of the
 *     "มิ.ย. bills per-box" story (which came from one fabricated fixture, not from a file).
 */

import { readFile } from "node:fs/promises";
import { extractMomoInvoicePdfText } from "../lib/admin/momo-invoice-pdf";
import { parseMomoInvoiceText } from "../lib/admin/momo-invoice-parser";

const DEFAULT_FILES = [
  "C:/Users/Admin/Desktop/INV-20260708-0002.pdf",
  "C:/Users/Admin/Desktop/วางบิลต้นทุน MOMO/INV-20260618-0003 (1).pdf",
  "C:/Users/Admin/Desktop/วางบิลต้นทุน MOMO/INV-20260618-0004 (1).pdf",
  "C:/Users/Admin/Desktop/วางบิลต้นทุน MOMO/INV-20260623-0006.pdf",
  "C:/Users/Admin/Desktop/วางบิลต้นทุน MOMO/INV-20260625-0003 (1).pdf",
];

const money = (n: number | null | undefined) =>
  n == null ? "—" : n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

async function main() {
  const files = process.argv.slice(2).length > 0 ? process.argv.slice(2) : DEFAULT_FILES;
  let failed = 0;

  for (const f of files) {
    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(await readFile(f));
    } catch {
      console.log(`⚠️  SKIP (ไม่พบไฟล์): ${f}`);
      continue;
    }

    // the REAL product function — not a copy of it
    const ex = await extractMomoInvoicePdfText(bytes);
    if (!ex.ok) {
      failed++;
      console.log(`❌ EXTRACT FAILED: ${f}\n     ↳ ${ex.error}`);
      continue;
    }

    const p = parseMomoInvoiceText(ex.text);
    const pass = p.reconciles && p.cbmBasisUsable;
    if (!pass) failed++;

    console.log(
      `${pass ? "✅" : "❌"} ${String(p.invoiceNo ?? "?").padEnd(18)} ` +
        `${ex.pages}p ${String(p.lines.length).padStart(2)} lines · ` +
        `Σ ${money(p.linesTotal).padStart(10)} vs Sub-total ${money(p.subTotal).padStart(10)} · ` +
        `basis ${String(p.cbmBasis ?? "n/a").padEnd(10)} votes ${p.cbmBasisVotes.lineTotal}/${p.cbmBasisVotes.perBox} · ` +
        `flags: ยอดไม่ตรงสูตร ${p.lines.filter((l) => l.totalMismatch).length} · ไม่พิมพ์เรท ${p.lines.filter((l) => l.rateMissing).length}`,
    );
    if (!p.reconciles) {
      console.log(`     ↳ 🔴 ไม่ foot: ต่าง ฿${money(Math.abs((p.subTotal ?? 0) - p.linesTotal))} — ${f}`);
    }
    if (!p.cbmBasisUsable) console.log(`     ↳ 🔴 basis: ${p.cbmBasisReason}`);
  }

  console.log(failed === 0 ? "\n✅ PASS — ทุกใบ Σ ตรง Sub-total + อ่านวิธีคิดคิวได้" : `\n❌ FAIL — ${failed} ใบ`);
  process.exit(failed === 0 ? 0 : 1);
}

void main();
