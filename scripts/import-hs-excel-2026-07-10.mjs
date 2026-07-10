// Import the owner's HS-code Excel "1 . พิกัด อัพเดท.xlsx" into doc_bot_hs_codes
// (mig 0249 store + 0251 `source` col) so it shows MERGED with the 749 DOC BOT rows in
// the /admin/accounting/hs-library/bot browse. Owner 2026-07-10 "เอาออกมาให้ครบ · รวมกับ docbot".
//
// Source file lives in the owner's Google Drive; extracted to JSON first with openpyxl:
//   sheets คำศัพท์-คำแปล (Stat,Tariff,EN,TH,FE,NO) · nnb (HS,EN,TH,FE,NO,stat,เลี่ยง→note) · Vat.
//   → {hs_code,th,en,fe,no,stat,note,source(sheet)} · skip fully-empty rows.
//
// Idempotent: DELETES existing rows WHERE source LIKE 'ไฟล์:%' then re-inserts (never touches
// the 749 'doc_bot' rows). Run: node scripts/import-hs-excel-2026-07-10.mjs <extract.json> [--apply]
import pg from "pg";
import { readFileSync } from "node:fs";
const { Client } = pg;
const APPLY = process.argv.includes("--apply");
const jsonPath = process.argv.find((a) => a.endsWith(".json"));
if (!jsonPath) { console.error("usage: node scripts/import-hs-excel-2026-07-10.mjs <extract.json> [--apply]"); process.exit(1); }
const rows = JSON.parse(readFileSync(jsonPath, "utf8"));

const DESTS = [
  { ref: "yzljakczhwrpbxflnmco", pass: "DqOzfEZVXfMHIryz", label: "MAIN PROD" },
  { ref: "lozntlidlqqzzcaathnm", pass: "n61OKDy28QcrB1ZJ", label: "MAIN DEV" },
];
const HOSTS = ["aws-1-ap-southeast-1.pooler.supabase.com", "aws-0-ap-southeast-1.pooler.supabase.com"];
async function connect({ ref, pass, label }) {
  const enc = encodeURIComponent(pass);
  const attempts = HOSTS.flatMap((h) => [`postgresql://postgres.${ref}:${enc}@${h}:5432/postgres`, `postgresql://postgres.${ref}:${enc}@${h}:6543/postgres`]);
  for (const conn of attempts) {
    try { const c = new Client({ connectionString: conn, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10000 }); await c.connect(); return c; } catch {}
  }
  throw new Error(`cannot connect to ${label}`);
}

const clean = (v) => (v == null ? "" : String(v).trim());
const prepared = rows
  .map((r) => ({
    hs_code: clean(r.hs_code), th: clean(r.th), en: clean(r.en),
    fe: clean(r.fe), no: clean(r.no), stat: clean(r.stat), note: clean(r.note),
    source: "ไฟล์:" + clean(r.source),
  }))
  .filter((r) => r.th || r.hs_code || r.en);

console.log(`extracted rows: ${rows.length} · to insert: ${prepared.length}`);
const bySrc = {}; for (const r of prepared) bySrc[r.source] = (bySrc[r.source] ?? 0) + 1;
console.log("by source:", bySrc);

if (!APPLY) { console.log("\n(dry-run · เพิ่ม --apply เพื่อเขียนจริง prod+dev)"); process.exit(0); }

const COLS = ["hs_code", "th", "en", "fe", "no", "stat", "note", "source"];
const q = (c) => `"${c}"`;
for (const dest of DESTS) {
  const c = await connect(dest);
  console.log(`\nconnected: ${dest.label}`);
  const del = await c.query(`DELETE FROM public.doc_bot_hs_codes WHERE source LIKE 'ไฟล์:%'`);
  console.log(`  deleted prior file rows: ${del.rowCount}`);
  let ok = 0;
  for (let i = 0; i < prepared.length; i += 200) {
    const chunk = prepared.slice(i, i + 200);
    const params = [];
    const values = chunk.map((row) => `(${COLS.map((col) => { params.push(row[col]); return `$${params.length}`; }).join(",")})`).join(",");
    const res = await c.query(`INSERT INTO public.doc_bot_hs_codes (${COLS.map(q).join(",")}) VALUES ${values}`, params);
    ok += res.rowCount ?? 0;
  }
  const { rows: [{ n }] } = await c.query(`SELECT count(*)::int AS n FROM public.doc_bot_hs_codes`);
  const { rows: [{ f }] } = await c.query(`SELECT count(*)::int AS f FROM public.doc_bot_hs_codes WHERE source LIKE 'ไฟล์:%'`);
  console.log(`  inserted ${ok} · file rows now ${f} · TABLE TOTAL now ${n}`);
  await c.end();
}
console.log("\n✅ Excel HS codes imported (merged with DOC BOT) into prod + dev.");
