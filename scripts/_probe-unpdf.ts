// scratch probe — real extractor + real parser vs all 5 real PDFs.
import { readFile } from "node:fs/promises";
import { getDocumentProxy } from "unpdf";
import { parseMomoInvoiceText } from "../lib/admin/momo-invoice-parser";

const FILES = [
  "C:/Users/Admin/Desktop/INV-20260708-0002.pdf",
  "C:/Users/Admin/Desktop/วางบิลต้นทุน MOMO/INV-20260618-0003 (1).pdf",
  "C:/Users/Admin/Desktop/วางบิลต้นทุน MOMO/INV-20260618-0004 (1).pdf",
  "C:/Users/Admin/Desktop/วางบิลต้นทุน MOMO/INV-20260623-0006.pdf",
  "C:/Users/Admin/Desktop/วางบิลต้นทุน MOMO/INV-20260625-0003 (1).pdf",
];

// mirrors lib/admin/momo-invoice-pdf.ts extraction exactly
async function extract(bytes: Uint8Array) {
  const pdf = await getDocumentProxy(bytes);
  let out = "";
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const tc = await page.getTextContent();
    for (const it of tc.items) {
      if (!("str" in it)) continue;
      out += it.str;
      if (it.hasEOL) out += "\n";
    }
    out += "\n";
  }
  return { text: out, pages: pdf.numPages };
}

async function main() {
let allOk = true;
for (const f of FILES) {
  const { text, pages } = await extract(new Uint8Array(await readFile(f)));
  const p = parseMomoInvoiceText(text);
  const foot = p.reconciles ? "✅" : "❌";
  if (!p.reconciles || !p.cbmBasisUsable) allOk = false;
  console.log(
    `${foot} ${String(p.invoiceNo).padEnd(20)} pages=${pages} lines=${String(p.lines.length).padStart(2)} ` +
    `Σ=${String(p.linesTotal.toFixed(2)).padStart(10)} sub=${String(p.subTotal?.toFixed(2)).padStart(10)} ` +
    `basis=${String(p.cbmBasis).padEnd(10)} votes=${p.cbmBasisVotes.lineTotal}/${p.cbmBasisVotes.perBox} ` +
    `usable=${p.cbmBasisUsable} mismatch=${p.lines.filter((l) => l.totalMismatch).length} rateMissing=${p.lines.filter((l) => l.rateMissing).length}`,
  );
  if (!p.reconciles) console.log(`     ↳ diff ฿${((p.subTotal ?? 0) - p.linesTotal).toFixed(2)}  file=${f}`);
}
console.log(allOk ? "\n✅ ALL 5 FOOT + BASIS USABLE" : "\n❌ SOMETHING FAILED");
}
void main();
