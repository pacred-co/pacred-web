/**
 * backfill-cost-momo-ttw-2026-07-19.ts — owner 2026-07-19:
 *   "ไปปรับ fill ใส่ต้นทุน ทั้งระบบด้วยเลย … บัญชีคอยกดตั้งต้นทุนตู้ตอนตรวจตู้ด้วย เผื่อเปลี่ยนแปลง".
 *
 * Re-derive every non-cancelled forwarder row's COST through the canonical
 * `resolveRowCost` waterfall (tier-1 tb_cost_container accounting rate ALWAYS
 * wins → any container the accountant already rated is preserved; tier-2 =
 * the tb_settings default just filled: MOMO(8) กวางโจว 2500/4700 · TTW(9) อี้อู 2600/5300).
 *
 * WHY it's safe on ANY status: COST is INTERNAL (never on a customer invoice —
 * money-NEUTRAL to customers; the bill uses ftotalprice/sell) and is editable at
 * any status incl. paid (memory cost-editable-sell-locked). Transport (car/ship)
 * is taken from the container CODE (resolveTransportMode · GZS/YWS=sea, GZE/YWE=road)
 * not the unreliable stored ftransporttype.
 *
 * GUARDS: only writes when the new cost is POSITIVE and differs >0.01; a row whose
 * resolver yields rate 0 (no tier-1 + no tier-2 cell) is SKIPPED + flagged (never
 * zeroes a real stored cost). dry-run + backup.
 *
 * RUN: SUPABASE_DB_PASSWORD='…' ./node_modules/.bin/tsx scripts/backfill-cost-momo-ttw-2026-07-19.ts [--apply]
 */
import pg from "pg";
import { writeFileSync } from "node:fs";
import { resolveRowCost } from "../lib/forwarder/resolve-cost";
import { resolveTransportMode } from "../lib/forwarder/cabinet-transport";

const APPLY = process.argv.includes("--apply");
const PW = process.env.SUPABASE_DB_PASSWORD;

async function main() {
  if (!PW) { console.error("SUPABASE_DB_PASSWORD required"); process.exit(1); }
  const c = new pg.Client({
    connectionString: `postgresql://postgres:${encodeURIComponent(PW)}@db.yzljakczhwrpbxflnmco.supabase.co:5432/postgres`,
    ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000,
  });
  await c.connect();

  const settings = (await c.query(`SELECT * FROM tb_settings LIMIT 1`)).rows[0] as Record<string, unknown>;
  const ccRows = (await c.query(
    `SELECT fcabinetnumber cab, fproductstype1 p1, fproductstype2 p2, fproductstype3 p3, fproductstype4 p4 FROM tb_cost_container`)).rows;
  const ccByCab = new Map<string, { fproductstype1: number; fproductstype2: number; fproductstype3: number; fproductstype4: number }>();
  for (const r of ccRows) ccByCab.set(String(r.cab), { fproductstype1: +r.p1, fproductstype2: +r.p2, fproductstype3: +r.p3, fproductstype4: +r.p4 });

  const { rows } = await c.query(
    `SELECT id, fwarehousename wh, fwarehousechina wc, ftransporttype tt, fproductstype pt,
            COALESCE(fweight,0)::float w, COALESCE(fvolume,0)::float v,
            fcabinetnumber cab, COALESCE(fcosttotalprice,0)::float stored, fstatus,
            EXISTS(SELECT 1 FROM tb_forwarder_invoice_item ii WHERE ii.forwarder_id = tb_forwarder.id) billed
     FROM tb_forwarder WHERE fstatus<>'99'`);

  const changes: { id: string; cab: string; wh: string; wc: string; old: number; neu: number; rate: number; src: string; mode: string; billed: boolean; fstatus: string }[] = [];
  const flags: { id: string; cab: string; wh: string; stored: number }[] = [];
  for (const r of rows) {
    const mode = resolveTransportMode(r.cab, r.tt); // "1" road | "2" sea | "3" air
    const rc = resolveRowCost(
      { fwarehousename: r.wh, fwarehousechina: r.wc, ftransporttype: mode, fproductstype: r.pt, fweight: r.w, fvolume: r.v },
      settings,
      ccByCab.get(String(r.cab)) ?? null,
    );
    if (rc.cost <= 0) { if (r.stored > 0) flags.push({ id: r.id, cab: r.cab, wh: r.wh, stored: r.stored }); continue; }
    if (Math.abs(rc.cost - r.stored) > 0.01)
      changes.push({ id: r.id, cab: r.cab || "(ว่าง)", wh: r.wh, wc: r.wc, old: r.stored, neu: rc.cost, rate: rc.rate, src: rc.source, mode, billed: r.billed, fstatus: r.fstatus });
  }

  const sumOld = changes.reduce((s, x) => s + x.old, 0), sumNew = changes.reduce((s, x) => s + x.neu, 0);
  const ttw = changes.filter((x) => x.wh === "9"), momo = changes.filter((x) => x.wh === "8"), billed = changes.filter((x) => x.billed);
  console.log(`\n=== COST BACKFILL — ${rows.length} rows scanned ===`);
  console.log(`changed: ${changes.length}  (TTW/9: ${ttw.length} · MOMO/8: ${momo.length} · billed: ${billed.length})`);
  console.log(`Σ cost  old ${sumOld.toFixed(2)} → new ${sumNew.toFixed(2)}  (Δ ${(sumNew - sumOld).toFixed(2)})`);
  console.log(`flagged (resolver rate=0 but stored>0 · SKIPPED · need accounting rate): ${flags.length}`);
  console.table(changes.slice(0, 18).map((x) => ({ id: x.id, cab: x.cab, wh: x.wh, wc: x.wc, mode: x.mode, old: x.old, new: x.neu, rate: x.rate, src: x.src, billed: x.billed })));
  if (flags.length) console.table(flags.slice(0, 10));

  // The -100 loss row + its container
  const five = changes.find((x) => x.id === "52177");
  if (five) console.log(`\n52177 (GZS260625-5T · the -100): cost ${five.old} → ${five.neu} @ ${five.rate} (${five.src})`);

  if (!APPLY) { console.log(`\n(dry-run — --apply · backup first)`); await c.end(); return; }

  writeFileSync(`/tmp/backup-cost-backfill-2026-07-19.json`, JSON.stringify({ changes, flags }, null, 2));
  await c.query("BEGIN");
  for (const x of changes) await c.query(`UPDATE tb_forwarder SET fcosttotalprice=$1 WHERE id=$2`, [x.neu, x.id]);
  await c.query("COMMIT");
  console.log(`\n✅ updated ${changes.length} rows · backup /tmp/backup-cost-backfill-2026-07-19.json`);
  await c.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
