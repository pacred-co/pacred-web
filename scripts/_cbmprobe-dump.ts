/* TEMP PROBE — delete when done. Dumps parsed lines from every real MOMO invoice PDF. */
import { readFile } from "node:fs/promises";
import { extractMomoInvoicePdfText } from "../lib/admin/momo-invoice-pdf";
import { parseMomoInvoiceText } from "../lib/admin/momo-invoice-parser";

const FILES = [
  "C:/Users/Admin/Desktop/INV-20260708-0002.pdf",
  "C:/Users/Admin/Desktop/วางบิลต้นทุน MOMO/INV-20260618-0003 (1).pdf",
  "C:/Users/Admin/Desktop/วางบิลต้นทุน MOMO/INV-20260618-0004 (1).pdf",
  "C:/Users/Admin/Desktop/วางบิลต้นทุน MOMO/INV-20260623-0006.pdf",
  "C:/Users/Admin/Desktop/วางบิลต้นทุน MOMO/INV-20260625-0003 (1).pdf",
  "C:/Users/Admin/Downloads/INV-20260714-0001.pdf",
  "C:/Users/Admin/Downloads/INV-20260714-0003.pdf",
  "C:/Users/Admin/Downloads/INV-20260717-0001.pdf",
  "C:/Users/Admin/Downloads/INV-20260718-0007.pdf",
];

const NEEDLE = process.argv[2] ?? "1783582423";

async function main() {
  for (const f of FILES) {
    let bytes: Uint8Array;
    try { bytes = new Uint8Array(await readFile(f)); } catch { console.log(`SKIP ${f}`); continue; }
    const ex = await extractMomoInvoicePdfText(bytes);
    if (!ex.ok) { console.log(`EXTRACT FAIL ${f}`); continue; }
    const p = parseMomoInvoiceText(ex.text);
    const hits = p.lines.filter((l) => l.tracking.includes(NEEDLE));
    console.log(`\n=== ${p.invoiceNo} (${p.lines.length} lines) basis=${p.cbmBasis} votes ${p.cbmBasisVotes.lineTotal}/${p.cbmBasisVotes.perBox} · hits(${NEEDLE})=${hits.length}`);
    if (hits.length === 0) continue;
    for (const l of p.lines) {
      const lt = +(l.unitPrice * l.cbm).toFixed(2);
      const pb = +(l.unitPrice * l.cbm * l.qty).toFixed(2);
      const disc = l.qty > 1 && l.unitPrice > 0 && l.cbm > 0 && l.lineTotal > 0;
      console.log(
        `  ${l.tracking.padEnd(24)} cbm=${String(l.cbm).padStart(9)} qty=${String(l.qty).padStart(3)} ` +
        `rate=${String(l.unitPrice).padStart(8)} total=${String(l.lineTotal).padStart(10)} ` +
        `| LT=${String(lt).padStart(10)} (d ${(lt - l.lineTotal).toFixed(2)}) ` +
        `| PB=${String(pb).padStart(11)} (d ${(pb - l.lineTotal).toFixed(2)}) ` +
        `${disc ? "DISC" : "    "} cab=${l.cabinet ?? "-"}`,
      );
    }
  }
}
void main();
