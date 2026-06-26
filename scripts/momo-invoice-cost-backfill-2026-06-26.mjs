#!/usr/bin/env node
/**
 * MOMO supplier-invoice → tb_forwarder.fcosttotalprice backfill (2026-06-26).
 *
 * Owner asked to ingest the 4 real MOMO (ฮุย ไท่ต๋า) invoices + backfill the
 * retroactive cost. This mirrors actions/admin/momo-invoice-ingest.ts EXACTLY
 * (match by ftrackingchn · write ONLY fcosttotalprice + fprofittotal=0 · skip
 * PAID cabinets · idempotent .neq) but runs over all 4 invoices at once with a
 * read-only dry-run default.
 *
 *   DRY-RUN (default):  SUPABASE_DB_PASSWORD='<pw>' node scripts/momo-invoice-cost-backfill-2026-06-26.mjs
 *   APPLY:              SUPABASE_DB_PASSWORD='<pw>' node scripts/momo-invoice-cost-backfill-2026-06-26.mjs --apply
 *
 * Reads the parsed invoices from %TEMP%/momo_invoices.json (written by the
 * Python pypdf extractor). The parser regex is copied verbatim from
 * lib/admin/momo-invoice-parser.ts and RECONCILED against each invoice's
 * printed Sub-total as a correctness gate (refuses to proceed on a mismatch).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import pg from "pg";

const APPLY = process.argv.includes("--apply");
const { Client } = pg;
const PROJECT_REF = "yzljakczhwrpbxflnmco";
const PASSWORD = process.env.SUPABASE_DB_PASSWORD || process.env.PG_PASSWORD;
if (!PASSWORD) { console.error("FATAL: SUPABASE_DB_PASSWORD not set"); process.exit(1); }

// ---- parser (verbatim from lib/admin/momo-invoice-parser.ts) ----
const num = (s) => Number(String(s).replace(/,/g, "").trim());
const round2 = (n) => Math.round(n * 100) / 100;
const TRACK_RE = /^(\S+)\s+([\d.]+)\s*KG\s*\/\s*([\d.]+)\s*CBM$/i;
const PRICE_RE = /(\d+)\s+([\d,]+\.\d{2})\s*$/;
const MONEY_ONLY_RE = /^([\d,]+\.\d{2})$/;
function parseMomoInvoiceText(text) {
  const rows = (text ?? "").split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  const invoiceNo = (text.match(/INV-\d{8}-\d{4}/) ?? [null])[0];
  const gt = text.match(/(?:Grand Total|ยอดสุทธิ)[^\d]*([\d,]+\.\d{2})/i);
  const grandTotal = gt ? num(gt[1]) : null;
  const st = text.match(/(?:Sub-total|ค่าขนส่งทั้งหมด)[^\d]*([\d,]+\.\d{2})/i);
  const subTotal = st ? num(st[1]) : null;
  const lines = [];
  const seen = new Set();
  for (let i = 0; i < rows.length; i++) {
    const m = rows[i].match(TRACK_RE);
    if (!m) continue;
    const tracking = m[1]; const kg = num(m[2]); const cbm = num(m[3]);
    let qty = 1, unitPrice = 0, lineTotal = 0;
    for (let j = i + 1; j < Math.min(i + 6, rows.length); j++) {
      const ln = rows[j];
      if (unitPrice === 0) { const pm = ln.match(PRICE_RE); if (pm) { qty = Number(pm[1]) || 1; unitPrice = num(pm[2]); continue; } }
      if (/คิดตาม\s*CBM/i.test(ln)) { const tm = (rows[j + 1] ?? "").match(MONEY_ONLY_RE); if (tm) lineTotal = num(tm[1]); break; }
      const mo = ln.match(MONEY_ONLY_RE); if (mo && unitPrice !== 0) { lineTotal = num(mo[1]); break; }
    }
    if (seen.has(tracking)) continue;
    seen.add(tracking);
    const expected = round2(unitPrice * cbm * qty);
    lines.push({ tracking, kg, cbm, qty, unitPrice, lineTotal, totalMismatch: lineTotal > 0 && Math.abs(expected - lineTotal) > 0.02 });
  }
  return { invoiceNo, grandTotal, subTotal, lines };
}

// ---- load invoices ----
const jsonPath = path.join(os.tmpdir(), "momo_invoices.json");
const invoices = JSON.parse(fs.readFileSync(jsonPath, "utf-8")).map((o) => ({ ...o, parsed: parseMomoInvoiceText(o.text) }));

console.log(`\n${"=".repeat(72)}\nMOMO invoice cost backfill — ${APPLY ? "APPLY" : "DRY-RUN"} · ${invoices.length} invoices\n${"=".repeat(72)}`);

// reconcile gate: Σ lineTotal must == printed Sub-total per invoice
let gateOk = true;
for (const inv of invoices) {
  const sum = round2(inv.parsed.lines.reduce((a, l) => a + l.lineTotal, 0));
  const sub = inv.parsed.subTotal;
  const ok = sub != null && Math.abs(sum - sub) < 0.02;
  if (!ok) gateOk = false;
  console.log(`  ${inv.parsed.invoiceNo}: ${inv.parsed.lines.length} lines · Σ=${sum.toFixed(2)} vs Sub-total=${sub?.toFixed(2)} ${ok ? "✓" : "✗ MISMATCH"}`);
}
if (!gateOk) { console.error("\nFATAL: parse reconciliation failed — refusing to proceed (parser drift?)."); process.exit(1); }
console.log("  reconcile gate ✓ — parse matches every invoice Sub-total\n");

// ---- connect prod ----
const POOLER_HOSTS = ["aws-1-ap-southeast-1.pooler.supabase.com", "aws-0-ap-southeast-1.pooler.supabase.com"];
let client = null;
for (const h of POOLER_HOSTS) {
  try {
    const c = new Client({ connectionString: `postgresql://postgres.${PROJECT_REF}:${encodeURIComponent(PASSWORD)}@${h}:5432/postgres`, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10_000 });
    await c.connect(); client = c; console.log(`✓ connected ${h}\n`); break;
  } catch (e) { console.log(`  ${h} failed: ${e.message}`); }
}
if (!client) { console.error("FATAL: could not connect prod"); process.exit(1); }

// all trackings across the 4 invoices
const allLines = invoices.flatMap((inv) => inv.parsed.lines.map((l) => ({ ...l, invoiceNo: inv.parsed.invoiceNo })));
const trackings = Array.from(new Set(allLines.map((l) => l.tracking)));

const fRes = await client.query(
  `select id, ftrackingchn, fcabinetnumber, userid, fcosttotalprice, fstatus from tb_forwarder where ftrackingchn = any($1::text[])`,
  [trackings]
);
const fByTracking = new Map();
for (const r of fRes.rows) if (r.ftrackingchn && !fByTracking.has(r.ftrackingchn)) fByTracking.set(r.ftrackingchn, r);

const cabs = Array.from(new Set([...fByTracking.values()].map((v) => v.fcabinetnumber).filter(Boolean)));
const paidCabs = new Set();
if (cabs.length) {
  const pRes = await client.query(`select distinct "fCabinetNumber" from tb_cnt_item where "fCabinetNumber" = any($1::text[])`, [cabs]);
  for (const r of pRes.rows) if (r.fCabinetNumber) paidCabs.add(r.fCabinetNumber);
}

// ---- build rows + report ----
const report = [];
for (const l of allLines) {
  const f = fByTracking.get(l.tracking) ?? null;
  const cabinetPaid = f?.fcabinetnumber ? paidCabs.has(f.fcabinetnumber) : false;
  const currentCost = f ? Number(f.fcosttotalprice ?? 0) : null;
  const willApply = !!f && !cabinetPaid && Math.abs((currentCost ?? 0) - l.lineTotal) > 0.005;
  report.push({ invoiceNo: l.invoiceNo, tracking: l.tracking, newCost: l.lineTotal, currentCost, matched: !!f, fid: f?.id ?? null, cabinet: f?.fcabinetnumber ?? null, userid: f?.userid ?? null, fstatus: f?.fstatus ?? null, cabinetPaid, willApply });
}

const fmt = (n) => (n == null ? "—" : Number(n).toFixed(2).padStart(10));
console.log("INVOICE          TRACKING                CUR-COST    NEW-COST   STATUS  ACTION");
console.log("-".repeat(92));
for (const r of report) {
  let action;
  if (!r.matched) action = "✗ unmatched (no tb_forwarder row)";
  else if (r.cabinetPaid) action = `⏸ skip (ตู้ ${r.cabinet} จ่ายแล้ว)`;
  else if (!r.willApply) action = "= already set";
  else action = `→ APPLY (fid ${r.fid}${r.cabinet ? " · " + r.cabinet : ""})`;
  console.log(`${(r.invoiceNo ?? "").padEnd(17)}${r.tracking.padEnd(22)} ${fmt(r.currentCost)} ${fmt(r.newCost)}   ${(r.fstatus ?? "-").toString().padStart(3)}    ${action}`);
}

const sum = (pred) => report.filter(pred).length;
console.log("-".repeat(92));
console.log(`TOTAL ${report.length} lines · matched ${sum((r)=>r.matched)} · willApply ${sum((r)=>r.willApply)} · unmatched ${sum((r)=>!r.matched)} · paid-skip ${sum((r)=>r.matched&&r.cabinetPaid)} · already-set ${sum((r)=>r.matched&&!r.cabinetPaid&&!r.willApply)}`);

// ---- backup + apply ----
const willApply = report.filter((r) => r.willApply);
if (willApply.length) {
  const backupPath = path.join(process.cwd(), `momo-cost-backfill-backup-2026-06-26.json`);
  fs.writeFileSync(backupPath, JSON.stringify(willApply.map((r) => ({ fid: r.fid, tracking: r.tracking, before: r.currentCost, after: r.newCost })), null, 2));
  console.log(`\nbackup (before-values) → ${backupPath}`);
}

if (APPLY) {
  let applied = 0;
  for (const r of willApply) {
    const res = await client.query(`update tb_forwarder set fcosttotalprice=$1, fprofittotal=0 where id=$2 and fcosttotalprice <> $1`, [r.newCost, r.fid]);
    applied += res.rowCount;
  }
  console.log(`\n✅ APPLIED ${applied} rows (fcosttotalprice set from invoice · fprofittotal=0)`);
} else {
  console.log(`\n(dry-run — re-run with --apply to write the ${willApply.length} willApply rows)`);
}
await client.end();
