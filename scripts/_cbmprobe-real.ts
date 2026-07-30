/* TEMP PROBE — READ-ONLY. delete when done. Runs the REAL pipeline on the owner's invoice. */
import { createClient } from "@supabase/supabase-js";
import { extractMomoInvoicePdfText } from "../lib/admin/momo-invoice-pdf";
import { parseMomoInvoiceText } from "../lib/admin/momo-invoice-parser";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

const PATH = "momo-invoice/INV-20260723-0006/1785393686543-3.pdf";

async function main() {
  const { data, error } = await sb.storage.from("csv-imports").download(PATH);
  if (error || !data) { console.log("download failed:", error?.message); return; }
  const bytes = new Uint8Array(await data.arrayBuffer());
  console.log(`downloaded ${bytes.length} bytes`);

  const ex = await extractMomoInvoicePdfText(bytes);
  if (!ex.ok) { console.log("extract failed:", ex.error); return; }

  const p = parseMomoInvoiceText(ex.text);
  console.log(`\ninvoice ${p.invoiceNo} · ${p.lines.length} lines · Σ ${p.linesTotal} vs sub ${p.subTotal} · reconciles=${p.reconciles}`);
  console.log(`BASIS = ${p.cbmBasis} · votes ${p.cbmBasisVotes.lineTotal}/${p.cbmBasisVotes.perBox} · usable=${p.cbmBasisUsable} · material=${p.cbmBasisMaterial}`);
  console.log(`reason: ${p.cbmBasisReason}\n`);

  console.log("tracking                qty  printedCbm     rate    total | LT-fit  PB-fit | billedCbm(=tot/rate)  printed==billed*qty? | mismatch");
  let inflated = 0, mism = 0, sumInflation = 0;
  for (const l of p.lines) {
    const lt = Math.abs(+(l.unitPrice * l.cbm).toFixed(2) - l.lineTotal) <= 0.02;
    const pb = Math.abs(+(l.unitPrice * l.cbm * l.qty).toFixed(2) - l.lineTotal) <= 0.02;
    const billed = l.unitPrice > 0 ? l.lineTotal / l.unitPrice : NaN;
    const isInf = l.qty > 1 && l.unitPrice > 0 && l.lineTotal > 0 && l.cbm > 0
      && Math.abs(l.cbm - billed * l.qty) <= 0.0005;
    if (isInf) { inflated++; sumInflation += l.cbm - billed; }
    if (l.totalMismatch) mism++;
    console.log(
      `${l.tracking.padEnd(22)} ${String(l.qty).padStart(3)} ${l.cbm.toFixed(4).padStart(11)} ${String(l.unitPrice).padStart(8)} ${l.lineTotal.toFixed(2).padStart(9)} |` +
      ` ${lt ? "Y" : "."}      ${pb ? "Y" : "."}     | ${Number.isFinite(billed) ? billed.toFixed(6).padStart(12) : "         n/a"}   ${isInf ? "INFLATED <<<" : "            "} | ${l.totalMismatch ? "MISMATCH" : ""}`,
    );
  }
  console.log(`\ninflated-CBM lines: ${inflated} · totalMismatch lines: ${mism} · Σ CBM over-printed: ${sumInflation.toFixed(6)}`);
}
void main();
