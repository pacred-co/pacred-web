/**
 * ttw-rates-and-relabel-2026-07-19.mjs — owner 2026-07-19:
 *   "กวางโจว = MOMO ต้นทุน เรือ 2500 รถ 4700 · อี้อู = TTW ต้นทุน เรือ 2600 รถ 5300 ·
 *    เอาโกดังอื่นออก · แสง นี่ก็ TTW · ตรวจดูดีๆ"
 *
 * Step A (config + label · NO row-cost recompute — that's the separate backfill):
 *   1. tb_settings อี้อู (…defaultmomo2) cells → เรือ 2600 / รถ 5300 (all 4 product types).
 *      MOMO กวางโจว (…defaultmomo) stays 2500/4700 (mig 0260 · untouched).
 *   2. Relabel every fwarehousename='1' (แสง · a retired label) by ORIGIN — the origin
 *      (fwarehousechina) is the truth, and operator must match origin:
 *        fwarehousechina='2' (อี้อู) → '9' (TTW)   · fwarehousechina='1' (กวางโจว) → '8' (MOMO).
 *      (owner said "แสง=TTW"; the 7 อี้อู rows ARE TTW, but 32 rows carry a กวางโจว POD +
 *       KY4/8xx trackings = MOMO — reported for the owner to override if wrong.)
 *
 * SAFETY: fwarehousename/tb_settings are display/rate CONFIG (relabel is display-only until
 * the cost backfill re-derives). dry-run + backup. NOT touching billed rows' fstatus/money.
 * RUN: SUPABASE_DB_PASSWORD='…' node scripts/ttw-rates-and-relabel-2026-07-19.mjs [--apply]
 */
import pg from "pg";
import { writeFileSync } from "node:fs";
const APPLY = process.argv.includes("--apply");
const PW = process.env.SUPABASE_DB_PASSWORD;
if (!PW) { console.error("SUPABASE_DB_PASSWORD required"); process.exit(1); }

async function main() {
  const c = new pg.Client({
    connectionString: `postgresql://postgres:${encodeURIComponent(PW)}@db.yzljakczhwrpbxflnmco.supabase.co:5432/postgres`,
    ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000,
  });
  await c.connect();

  // ── 1. อี้อู rate cells (…defaultmomo2) ──
  const shipCols = [1, 2, 3, 4].map((i) => `fcostship${i}defaultmomo2`);   // เรือ 2600
  const carCols = [1, 2, 3, 4].map((i) => `fcostcar${i}defaultmomo2`);     // รถ 5300
  const before = (await c.query(
    `SELECT ${[...shipCols, ...carCols].map((x) => `"${x}"`).join(",")} FROM tb_settings LIMIT 1`)).rows[0];
  console.log("อี้อู (momo2) cells BEFORE:", before);
  console.log("→ SET เรือ(ship)=2600 · รถ(car)=5300 (all 4 product types)");

  // ── 2. แสง(1) relabel by origin ──
  const { rows: sang } = await c.query(
    `SELECT id, userid, fcabinetnumber cab, fwarehousechina wc, ftrackingchn FROM tb_forwarder WHERE fwarehousename='1' AND fstatus<>'99'`);
  const toTtw = sang.filter((r) => r.wc === "2");   // อี้อู → TTW(9)
  const toMomo = sang.filter((r) => r.wc !== "2");  // กวางโจว → MOMO(8)
  console.log(`\nแสง(1) rows: ${sang.length} → TTW(9) [อี้อู]: ${toTtw.length} · MOMO(8) [กวางโจว]: ${toMomo.length}`);
  console.table(toMomo.slice(0, 12).map((r) => ({ id: r.id, cab: r.cab || "(ว่าง)", wc: r.wc, trk: (r.ftrackingchn || "").slice(0, 12) })));

  if (!APPLY) { console.log("\n(dry-run — --apply · backup first)"); await c.end(); return; }

  writeFileSync(`/tmp/backup-ttw-rates-relabel-2026-07-19.json`, JSON.stringify({ settings_before: before, sang_rows: sang }, null, 2));
  await c.query("BEGIN");
  const setSql = [...shipCols.map((x) => `"${x}"=2600`), ...carCols.map((x) => `"${x}"=5300`)].join(", ");
  await c.query(`UPDATE tb_settings SET ${setSql}`);
  const r9 = await c.query(`UPDATE tb_forwarder SET fwarehousename='9' WHERE fwarehousename='1' AND fwarehousechina='2' AND fstatus<>'99'`);
  const r8 = await c.query(`UPDATE tb_forwarder SET fwarehousename='8' WHERE fwarehousename='1' AND (fwarehousechina<>'2' OR fwarehousechina IS NULL) AND fstatus<>'99'`);
  await c.query("COMMIT");
  console.log(`\n✅ อี้อู rates set (2600/5300) · relabel: ${r9.rowCount}→TTW(9) · ${r8.rowCount}→MOMO(8) · แสง(1) ตอนนี้ = 0`);
  console.log(`📦 backup → /tmp/backup-ttw-rates-relabel-2026-07-19.json`);
  await c.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
