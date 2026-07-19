/**
 * backfill-momo-ttw-cost-2026-07-19.mjs — owner 2026-07-19 "fill ใส่ต้นทุน ทั้งระบบ".
 *
 * Recompute stored tb_forwarder.fcosttotalprice for UNBILLED MOMO(8)/TTW(9) rows
 * to match the current cost config (mirrors lib/forwarder/resolve-cost.ts EXACTLY):
 *   - waterfall: tier1 tb_cost_container[cab][fproductsN] (accountant's ตรวจตู้ rate,
 *     always wins) → tier2 tb_settings `fcost{car|ship}{N}defaultmomo{2}` cell.
 *   - wh 8 (MOMO/กวางโจว) → …defaultmomo (2500 sea / 4700 road).
 *     wh 9 (TTW/อี้อู · fwarehousechina='2') → …defaultmomo2 (2600 sea / 5300 road).
 *   - basis = CBM (fvolume) for both 8 & 9. transport from the CONTAINER CODE
 *     (GZS/YWS=sea · GZE/YWE/EK=road · SOT, ftransporttype is unreliable). Air = skip.
 *   - cost = round2(fvolume × rate).
 *
 * SELF-LIMITING: a row whose stored cost already equals the recomputed value is
 * skipped → only stale rows (the แสง→8/9 relabel + อี้อู 2600/5300 + cost=0) change;
 * the stable MOMO rows show 0 delta. SCOPE: fstatus IN (1,2,3,4) ONLY — NEVER re-cost
 * a billed/paid/delivered row (5/6/7). Cost is INTERNAL (money-neutral to customers).
 * dry-run + backup. RUN: SUPABASE_DB_PASSWORD='…' node scripts/backfill-momo-ttw-cost-2026-07-19.mjs [--apply]
 */
import pg from "pg";
import { writeFileSync } from "node:fs";
const APPLY = process.argv.includes("--apply");
const PW = process.env.SUPABASE_DB_PASSWORD;
if (!PW) { console.error("SUPABASE_DB_PASSWORD required"); process.exit(1); }

const round2 = (n) => Math.round(n * 100) / 100;
const pos = (v) => { const n = Number(v ?? 0); return Number.isFinite(n) && n > 0 ? n : 0; };
const idxOf = (t) => { const s = (t ?? "").trim(); return s === "2" ? 2 : s === "3" ? 3 : s === "4" ? 4 : 1; };
// container code → transport mode (mirror cabinet-transport.ts)
function transportOf(cab) {
  const u = (cab ?? "").toUpperCase();
  if (/^GZS|^YWS|^SEA/.test(u)) return "ship";
  if (/^GZE|^YWE|^EK/.test(u)) return "car";
  if (/^GZA|^YWA/.test(u)) return "air";
  return null; // unknown → skip
}

async function main() {
  const c = new pg.Client({
    host: "aws-1-ap-southeast-1.pooler.supabase.com", port: 5432,
    user: "postgres.yzljakczhwrpbxflnmco", password: PW, database: "postgres",
    ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000,
  });
  await c.connect();

  const settings = (await c.query(`SELECT * FROM tb_settings LIMIT 1`)).rows[0];
  const ccRows = (await c.query(`SELECT fcabinetnumber cab, fproductstype1 p1, fproductstype2 p2, fproductstype3 p3, fproductstype4 p4 FROM tb_cost_container`)).rows;
  const ccByCab = new Map(ccRows.map((r) => [r.cab, r]));

  const rows = (await c.query(
    `SELECT id, fwarehousename wh, fwarehousechina wc, fcabinetnumber cab, fproductstype pt, fvolume, famount, famountcount, fcosttotalprice cost
       FROM tb_forwarder
      WHERE fwarehousename IN ('8','9') AND fstatus IN ('1','2','3','4')`)).rows;

  const plan = [];
  let skipAir = 0, skipNoRate = 0, unchanged = 0;
  for (const r of rows) {
    const transport = transportOf(r.cab);
    if (transport === "air") { skipAir++; continue; }
    if (!transport) { skipNoRate++; continue; }
    const prefix = transport === "car" ? "fcostcar" : "fcostship";
    const citySuffix = r.wc === "2" ? "2" : "";
    const idx = idxOf(r.pt);
    const col = `${prefix}${idx}defaultmomo${citySuffix}`;
    // tier1 container rate wins, else tier2 settings cell
    const cc = ccByCab.get(r.cab);
    const tier1 = cc ? pos(cc[`p${idx}`]) : 0;
    const rate = tier1 > 0 ? tier1 : pos(settings[col]);
    // row-TOTAL CBM (famountcount rule · mirrors lib/forwarder/quantities.ts):
    // '1' = fvolume already total · else fvolume × max(famount,1)
    const isTotal = String(r.famountcount ?? "").trim() === "1";
    const dim = isTotal ? pos(r.fvolume) : pos(r.fvolume) * Math.max(pos(r.famount), 1);
    const newCost = rate > 0 && dim > 0 ? round2(dim * rate) : 0;
    const oldCost = round2(Number(r.cost ?? 0) || 0);
    if (Math.abs(newCost - oldCost) < 0.01) { unchanged++; continue; }
    plan.push({ id: r.id, wh: r.wh, cab: r.cab || "(ว่าง)", pt: r.pt, cbm: dim, rate, src: tier1 > 0 ? "ตู้" : "ตั้งค่า", old: oldCost, new: newCost, delta: round2(newCost - oldCost) });
  }

  console.log(`scanned ${rows.length} unbilled MOMO/TTW rows · unchanged ${unchanged} · air-skip ${skipAir} · no-rate-skip ${skipNoRate} · TO CHANGE ${plan.length}`);
  const totalDelta = round2(plan.reduce((s, p) => s + p.delta, 0));
  console.log(`Σ cost delta = ฿${totalDelta.toLocaleString()}`);
  console.table(plan.slice(0, 25).map((p) => ({ id: p.id, wh: p.wh, cab: p.cab, pt: p.pt, cbm: p.cbm, rate: p.rate, src: p.src, old: p.old, new: p.new, delta: p.delta })));

  if (!APPLY) { console.log(`\n(dry-run — --apply · backup first · ${plan.length} rows)`); await c.end(); return; }
  if (plan.length === 0) { console.log("nothing to change."); await c.end(); return; }

  writeFileSync(`/tmp/backup-backfill-momo-ttw-cost-2026-07-19.json`, JSON.stringify(plan, null, 2));
  await c.query("BEGIN");
  for (const p of plan) {
    await c.query(`UPDATE tb_forwarder SET fcosttotalprice=$1 WHERE id=$2 AND fstatus IN ('1','2','3','4')`, [p.new, p.id]);
  }
  await c.query("COMMIT");
  console.log(`\n✅ backfilled ${plan.length} rows · Σ delta ฿${totalDelta.toLocaleString()} · backup /tmp/backup-backfill-momo-ttw-cost-2026-07-19.json`);
  await c.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
