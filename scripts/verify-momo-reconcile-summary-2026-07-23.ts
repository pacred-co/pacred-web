/**
 * VERIFY: the new "สรุปเทียบใบนี้กับระบบ" block, against a REAL MOMO invoice + REAL prod rows.
 *
 * Owner (2026-07-23) asked the ingest screen to answer four questions when accounting drops
 * the PDF in: คิวในระบบ vs คิวที่ MOMO เรียกเก็บ (+ ดิฟ) · ต้นทุนที่ MOMO เก็บ · ราคาขาย ·
 * และ diff กำไร. This script runs the SAME pipeline the screen runs — real pdf.js extraction →
 * the real parser → the real matcher shape → `buildReconcileTotals` — and prints the block, so
 * the numbers can be checked against the invoice by hand before anyone trusts the screen.
 *
 *   npx tsx --tsconfig tsconfig.test.json scripts/verify-momo-reconcile-summary-2026-07-23.ts [file.pdf …]
 *
 * READ-ONLY. Zero writes: it SELECTs tb_forwarder and computes in memory. Needs
 * SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (pass --env-file=.env.local).
 *
 * WHY a script, not a unit test: the real invoices are live supplier documents (customer PR
 * codes · trackings · money) and must never be committed as fixtures — same reason as
 * verify-momo-invoice-pdf-2026-07-17.ts. The pure math is unit-locked separately in
 * lib/admin/momo-invoice-reconcile.test.ts (runs in `pnpm test:unit`); what this adds is the
 * half a fixture cannot cover — that the real file, the real matcher and the real prod rows
 * produce a summary that foots.
 */

import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { extractMomoInvoicePdfText } from "../lib/admin/momo-invoice-pdf";
import { parseMomoInvoiceText } from "../lib/admin/momo-invoice-parser";
import { invoiceLineCbm, buildReconcileTotals, type ReconcileRow } from "../lib/admin/momo-invoice-reconcile";
import { totalCbmOf } from "../lib/forwarder/quantities";

const DEFAULT_FILES = [
  "/Users/dev/Desktop/เดฟ/วางบิลต้นทุน MOMO/INV-20260618-0004 (1).pdf",
  "/Users/dev/Desktop/เดฟ/วางบิลต้นทุน MOMO/INV-20260618-0003 (1).pdf",
  "/Users/dev/Desktop/เดฟ/วางบิลต้นทุน MOMO/INV-20260623-0006.pdf",
  "/Users/dev/Desktop/เดฟ/วางบิลต้นทุน MOMO/INV-20260625-0003 (1).pdf",
];

const baht = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const cbm4 = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
const sgn = (n: number) => (n > 0 ? "+" : n < 0 ? "−" : "±");
const FIRST_BOX_RE = /^(.+)-1\/\d+$/;
const near = (a: number, b: number) => Math.abs(a - b) <= Math.max(0.02, Math.abs(b) * 0.01);

type Row = {
  id: number;
  ftrackingchn: string;
  fcosttotalprice: number;
  ftotalprice: number;
  fweight: number;
  fvolume: number;
  famount: number;
  famountcount: string | null;
};

async function main() {
  const files = process.argv.slice(2).length > 0 ? process.argv.slice(2) : DEFAULT_FILES;
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("ต้องมี SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (ใช้ --env-file=.env.local)");
  const db = createClient(url, key, { auth: { persistSession: false } });

  for (const file of files) {
    let buf: Buffer;
    try {
      buf = await readFile(file);
    } catch {
      console.log(`\n⏭  ข้าม (เปิดไฟล์ไม่ได้): ${file}`);
      continue;
    }

    const ex = await extractMomoInvoicePdfText(new Uint8Array(buf));
    if (!ex.ok) {
      console.log(`\n❌ แกะ PDF ไม่ได้: ${file}\n     ↳ ${ex.error}`);
      continue;
    }
    const parsed = parseMomoInvoiceText(ex.text);

    // Same lookup set the action builds: exact tracking + the "-1/N" bare base.
    const lookups = new Set<string>();
    for (const l of parsed.lines) {
      lookups.add(l.tracking);
      const base = l.tracking.match(FIRST_BOX_RE)?.[1];
      if (base) lookups.add(base);
    }
    const { data, error } = await db
      .from("tb_forwarder")
      .select("id, ftrackingchn, fcosttotalprice, ftotalprice, fweight, fvolume, famount, famountcount")
      .in("ftrackingchn", Array.from(lookups));
    if (error) throw new Error(`อ่าน tb_forwarder ไม่สำเร็จ: ${error.message}`);

    const byTracking = new Map<string, Row>();
    for (const r of (data ?? []) as Array<Record<string, unknown>>) {
      const t = r.ftrackingchn as string | null;
      if (!t || byTracking.has(t)) continue;
      byTracking.set(t, {
        id: r.id as number,
        ftrackingchn: t,
        fcosttotalprice: Number(r.fcosttotalprice ?? 0),
        ftotalprice: Number(r.ftotalprice ?? 0),
        fweight: Number(r.fweight ?? 0),
        fvolume: Number(r.fvolume ?? 0),
        famount: Number(r.famount ?? 0),
        famountcount: (r.famountcount as string | null) ?? null,
      });
    }

    const rows: ReconcileRow[] = parsed.lines.map((l) => {
      let hit = byTracking.get(l.tracking) ?? null;
      if (!hit) {
        const base = l.tracking.match(FIRST_BOX_RE)?.[1];
        const bare = base ? byTracking.get(base) : undefined;
        // corroborate exactly like the action does (kg/CBM must agree, no contradiction)
        if (bare) {
          const kgOk = l.kg > 0 && bare.fweight > 0 ? near(l.kg, bare.fweight) : null;
          const cbmOk = l.cbm > 0 && bare.fvolume > 0 ? near(l.cbm, bare.fvolume) : null;
          if (kgOk !== false && cbmOk !== false && (kgOk === true || cbmOk === true)) hit = bare;
        }
      }
      return {
        matched: !!hit,
        invoiceCbm: invoiceLineCbm(l, parsed.cbmBasis),
        ourCbm: hit ? totalCbmOf(hit) : null,
        invoiceCost: l.lineTotal,
        currentCost: hit ? hit.fcosttotalprice : null,
        ourSell: hit ? hit.ftotalprice : null,
      };
    });

    const t = buildReconcileTotals(rows);
    const name = file.split("/").pop();

    console.log(`\n${"═".repeat(74)}`);
    console.log(`📄 ${name}  ·  ${parsed.invoiceNo ?? "(ไม่มีเลขใบ)"}`);
    console.log(`${"═".repeat(74)}`);
    console.log(
      `   แกะได้ ${parsed.lines.length} บรรทัด · Σ ฿${baht(parsed.linesTotal)} vs Sub-total ` +
        `฿${parsed.subTotal == null ? "—" : baht(parsed.subTotal)} · foot=${parsed.reconciles ? "✅" : "🔴"}` +
        ` · basis=${parsed.cbmBasis ?? "n/a"}`,
    );
    console.log(`   จับคู่กับระบบได้ ${t.matchedLines}/${t.lines} บรรทัด`);

    console.log(`\n   ┌─ คิว (CBM) ─────────────────────────────────────`);
    console.log(`   │  ในระบบเรา      ${cbm4(t.ourCbm).padStart(12)}`);
    console.log(`   │  MOMO เรียกเก็บ ${cbm4(t.invoiceCbm).padStart(12)}`);
    console.log(`   │  ดิฟ            ${(sgn(t.cbmDiff) + cbm4(Math.abs(t.cbmDiff))).padStart(12)}`);
    console.log(`   ├─ ต้นทุน ────────────────────────────────────────`);
    console.log(`   │  MOMO เก็บเรา   ฿${baht(t.invoiceCost).padStart(13)}`);
    console.log(`   │  ระบบบันทึกไว้   ฿${baht(t.currentCost).padStart(13)}`);
    console.log(`   │  ดิฟ            ${(sgn(t.costDiff) + "฿" + baht(Math.abs(t.costDiff))).padStart(14)}`);
    console.log(`   ├─ ขาย ───────────────────────────────────────────`);
    console.log(`   │  ค่านำเข้าที่ขาย  ฿${baht(t.sell).padStart(13)}${t.sellMissingLines > 0 ? `   ⚠ ยังไม่ตั้งราคา ${t.sellMissingLines} รายการ` : ""}`);
    console.log(`   ├─ กำไร ──────────────────────────────────────────`);
    console.log(`   │  ตอนนี้          ฿${baht(t.profitNow).padStart(13)}`);
    console.log(`   │  หลังบันทึกใบนี้  ฿${baht(t.profitAfter).padStart(13)}`);
    console.log(`   │  ดิฟ            ${(sgn(t.profitDiff) + "฿" + baht(Math.abs(t.profitDiff))).padStart(14)}`);
    console.log(`   └─────────────────────────────────────────────────`);
    console.log(
      `   ยอดทั้งใบ ฿${baht(t.invoiceCostAll)}` +
        (t.unmatchedLines > 0
          ? `  ·  🔴 ยังเทียบไม่ได้ ${t.unmatchedLines} บรรทัด ฿${baht(t.unmatchedCost)}`
          : `  ·  ✅ เทียบได้ครบทุกบรรทัด`),
    );

    // ── invariants: the screen must never be able to contradict itself ──
    const problems: string[] = [];
    if (Math.abs(t.profitDiff + t.costDiff) > 0.005) problems.push("profitDiff ≠ −costDiff");
    if (Math.abs(t.invoiceCost + t.unmatchedCost - t.invoiceCostAll) > 0.02)
      problems.push("invoiceCost + unmatchedCost ≠ invoiceCostAll");
    if (Math.abs(t.sell - t.currentCost - t.profitNow) > 0.005) problems.push("ขาย − ต้นทุนปัจจุบัน ≠ profitNow");
    if (Math.abs(t.sell - t.invoiceCost - t.profitAfter) > 0.005) problems.push("ขาย − ต้นทุนใบ ≠ profitAfter");
    if (t.matchedLines + t.unmatchedLines !== t.lines) problems.push("จำนวนบรรทัดไม่ลงตัว");
    if (parsed.reconciles && Math.abs(t.invoiceCostAll - parsed.linesTotal) > 0.02)
      problems.push("Σ ของการ์ด ≠ Σ ที่ parser แกะได้");
    console.log(problems.length === 0 ? `   ✅ invariants ผ่านครบ` : `   🔴 ${problems.join(" · ")}`);
  }
  console.log("");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
