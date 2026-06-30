/**
 * Import FREIGHT cost (ACC เบิกเงิน SEA/AIR/TRUCK + PACRED variants) → freight_shipments cost_*.
 * Owner 2026-07-01 Phase 3. Cost = AP (money-out · internal · NOT a customer charge → no double-charge
 * risk). Aggregate disbursements per SHIPMENT (job_no) · EXCLUDE customer-paid rows (ลค.ชำระเอง/
 * ลูกค้าจ่ายเอง — not our cost) · ยอดเบิก − ยอดคืน. Split china-freight vs local/service. SET (overwrite ·
 * idempotent). profit_margin = sell − cost ONLY when sell>0 (the freight sell is under-captured for recent
 * jobs → don't fabricate a negative · เนี๊ยบ). Matches only the already-imported freight_shipments by job_no.
 *   DRY-RUN: node --env-file=.env.local scripts/import-freight-cost-2026-07-01.mjs
 *   APPLY:   node ... --apply
 */
import pg from "pg"; import fs from "fs";
const { Client } = pg;
const APPLY = process.argv.includes("--apply");
const P = process.env.SUPABASE_DB_PASSWORD, REF = "yzljakczhwrpbxflnmco";
const SC = "/private/tmp/claude-501/-Users-dev-pacred-web--claude-worktrees-gifted-snyder-0a9cca/5af1ab1d-4a08-4ef2-a641-b90fc347ad66/scratchpad";
const rows = JSON.parse(fs.readFileSync(`${SC}/freight-cost-rows.json`, "utf8"));
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const CUSTOMER_PAID = /ลค.ชำระเอง|ลูกค้าจ่ายเอง/;
const IS_FREIGHT = /ขนส่ง|freight|จีน-ไทย|จีน - ไทย|ค่าตู้|ค่าระวาง|ค่าเรือ|shipping/i;

async function main() {
  let c;
  for (const h of ["aws-1-ap-southeast-1.pooler.supabase.com", "aws-0-ap-southeast-1.pooler.supabase.com"]) {
    try { c = new Client({ connectionString: `postgresql://postgres.${REF}:${encodeURIComponent(P)}@${h}:5432/postgres`, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000 }); await c.connect(); break; } catch { c = null; }
  }
  if (!c) { console.error("no DB"); process.exit(1); }

  // aggregate cost per job (exclude customer-paid)
  const agg = new Map(); // job → {china, local, total, rows, custPaid}
  for (const r of rows) {
    const a = agg.get(r.job) || { china: 0, local: 0, total: 0, rows: 0, custPaid: 0 };
    const net = round2(r.amt) - round2(r.refund);
    if (CUSTOMER_PAID.test(r.status || "")) { a.custPaid += net; agg.set(r.job, a); continue; } // not our cost
    if (IS_FREIGHT.test(`${r.cat} ${r.item}`)) a.china += net; else a.local += net;
    a.total += net; a.rows++;
    agg.set(r.job, a);
  }

  // imported freight_shipments (job_no → id, sell)
  const fs2 = await c.query(`select id, job_no, commercial_value_thb from freight_shipments where job_no is not null`);
  const ship = new Map(); for (const r of fs2.rows) ship.set(r.job_no, r);

  const plan = [], unmatched = [];
  for (const [job, a] of agg) {
    const s = ship.get(job);
    if (!s) { unmatched.push({ job, cost: round2(a.total) }); continue; }
    const sell = Number(s.commercial_value_thb) || 0;
    plan.push({ id: s.id, job, china: round2(a.china), local: round2(a.local), total: round2(a.total),
      sell, profit: sell > 0 ? round2(sell - a.total) : null });
  }

  console.log(`\n=== FREIGHT COST IMPORT (${APPLY ? "APPLY" : "DRY-RUN"}) ===`);
  console.log(`  cost jobs: ${agg.size} · matched to imported shipments: ${plan.length} · unmatched(job not in import): ${unmatched.length}`);
  console.log(`  Σ cost(matched): ฿${round2(plan.reduce((s, p) => s + p.total, 0)).toLocaleString()} (china ฿${round2(plan.reduce((s,p)=>s+p.china,0)).toLocaleString()} · local ฿${round2(plan.reduce((s,p)=>s+p.local,0)).toLocaleString()})`);
  console.log(`  shipments getting profit (sell>0): ${plan.filter(p => p.profit != null).length} · sell-missing (cost only): ${plan.filter(p => p.profit == null).length}`);
  if (unmatched.length) { console.log("  unmatched cost jobs (sample):"); unmatched.slice(0, 6).forEach((u) => console.log(`   · ${u.job} ฿${u.cost.toLocaleString()}`)); }
  plan.slice(0, 4).forEach((p) => console.log(`   ${p.job}: cost ฿${p.total.toLocaleString()} (จีน ${p.china}/local ${p.local}) · sell ฿${p.sell} · profit ${p.profit == null ? "—(รอ sell)" : "฿" + p.profit.toLocaleString()}`));
  fs.writeFileSync(`${SC}/freight-cost-plan.json`, JSON.stringify({ plan, unmatched }, null, 2));

  if (!APPLY) { console.log("\n(DRY-RUN · plan saved)"); await c.end(); return; }
  // Set COST only. profit_margin is intentionally LEFT NULL — the freight SELL is under-captured
  // for these recent jobs (sell ฿3,500 vs cost ฿19,981 = a fake −16k), so a stored profit would be
  // a fabricated negative (the exact cockpit-margin-bug the owner hates). Accounting completes the
  // sell at billing → profit then computes correctly. (เนี๊ยบ · ห้ามมั่ว.)
  let upd = 0;
  for (const p of plan) {
    await c.query(`update freight_shipments set cost_china_freight_thb=$1, cost_local_thb=$2, cost_total_thb=$3, updated_at=now() where id=$4`, [p.china, p.local, p.total, p.id]);
    upd++;
  }
  console.log(`\nAPPLIED: updated ${upd} shipments with cost (profit left NULL — sell under-captured · ห้ามมั่ว)`);
  await c.end();
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
