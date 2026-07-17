// READ-ONLY — พิสูจน์ rollup ต่อตู้ ด้วย PDF จริง ผ่าน assembleInvoiceText + parser ตัวจริง
// (momo-invoice-pdf.ts import "server-only" → เรียกตรงไม่ได้ · จึงต่อ unpdf เข้ากับ pure module
//  ตัวเดียวกันที่ action ใช้ = ไม่ก๊อปสูตรมาเขียนซ้ำ)
//   npx tsx scripts/probe-cabinet-rollup-2026-07-17.ts
import pg from "pg";
import { readFile } from "node:fs/promises";
import { parseMomoInvoiceText } from "../lib/admin/momo-invoice-parser";
import { assembleInvoiceText, type PdfTextItemLike } from "../lib/admin/momo-invoice-pdf-text";

const PDF = "C:/Users/Admin/Desktop/INV-20260708-0002.pdf";
const round2 = (n: number) => Math.round(n * 100) / 100;

async function extract(bytes: Uint8Array): Promise<string> {
  const { getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(bytes);
  const pages: PdfTextItemLike[][] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    pages.push(
      content.items.flatMap((i: unknown) =>
        i && typeof i === "object" && "str" in i && typeof (i as { str: unknown }).str === "string"
          ? [{ str: (i as { str: string }).str, hasEOL: (i as { hasEOL?: boolean }).hasEOL }]
          : [],
      ),
    );
  }
  return assembleInvoiceText(pages);
}

async function main() {
  const p = parseMomoInvoiceText(await extract(new Uint8Array(await readFile(PDF))));

  console.log(`\n════ ใบ ${p.invoiceNo} (PDF จริง → assembleInvoiceText → parser จริง) ════`);
  console.log(`  บรรทัด ${p.lines.length} · Σ ฿${p.linesTotal} · Sub-total ฿${p.subTotal} · ` +
    `${p.reconciles ? "ตรง ✓" : "ไม่ตรง ✗"} · WHT ฿${p.whtThb} · basis=${p.cbmBasis}`);

  const byCab = new Map<string, { n: number; sum: number }>();
  for (const l of p.lines) {
    const k = l.cabinet ?? "(ใบไม่ระบุตู้)";
    const cur = byCab.get(k) ?? { n: 0, sum: 0 };
    cur.n += 1; cur.sum += l.lineTotal;
    byCab.set(k, cur);
  }

  const c = new pg.Client({
    host: "aws-1-ap-southeast-1.pooler.supabase.com", port: 5432,
    user: "postgres.yzljakczhwrpbxflnmco", password: "DqOzfEZVXfMHIryz",
    database: "postgres", ssl: { rejectUnauthorized: false },
  });
  await c.connect();

  console.log(`\n════ rollup ต่อตู้ · เทียบระบบเรา (= ที่ byCabinet จะโชว์) ════`);
  for (const [cab, v] of byCab) {
    const { rows } = await c.query(
      `SELECT count(*)::int n, round(sum(coalesce(fcosttotalprice,0))::numeric,2) cost_sum
         FROM tb_forwarder WHERE fcabinetnumber = $1`, [cab]);
    const our = rows[0];
    const invSum = round2(v.sum);
    console.log(`\n  ตู้ ${cab}`);
    console.log(`    ใบรอบนี้บิล : ${String(v.n).padStart(2)} บรรทัด · Σ ฿${invSum.toFixed(2)}`);
    console.log(`    ระบบเรามี   : ${String(our.n).padStart(2)} แถว     · Σ ฿${Number(our.cost_sum ?? 0).toFixed(2)}`);
    if (Number(our.n) > 0) {
      const diff = round2(Number(our.cost_sum) - invSum);
      const partial = v.n < Number(our.n);
      console.log(`    partialRound=${partial} · roundDiff=฿${diff.toFixed(2)}` +
        (partial ? `  🔴 MOMO ยังบิลไม่ครบ → จ่ายทั้งตู้ = เกิน ฿${diff.toFixed(2)}` : ""));
    }
  }
  await c.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
