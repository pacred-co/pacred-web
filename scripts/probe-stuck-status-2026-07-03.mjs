// READ-ONLY probe (2026-07-03) — diagnose "แทรครอเข้าโกดังจีน แต่ MOMO Live = กำลังส่งมาไทย".
import pg from "pg";
const PROJECT_REF = "yzljakczhwrpbxflnmco"; // PROD
const PASSWORD = process.env.SUPABASE_DB_PASSWORD;
if (!PASSWORD) { console.error("SUPABASE_DB_PASSWORD not set"); process.exit(1); }
const HOSTS = ["aws-1-ap-southeast-1.pooler.supabase.com", "aws-0-ap-southeast-1.pooler.supabase.com"];
const USER = `postgres.${PROJECT_REF}`;
async function connect() {
  for (const h of HOSTS) {
    const cl = new pg.Client({ connectionString: `postgresql://${USER}:${encodeURIComponent(PASSWORD)}@${h}:5432/postgres` });
    try { await cl.connect(); console.log(`connected via ${h}:5432`); return cl; }
    catch (e) { console.error(`  ${h}:5432 → ${e.code ?? e.message}`); }
  }
  throw new Error("all hosts failed");
}
const c = await connect();
const q = (sql, p) => c.query(sql, p).then((r) => r.rows);
const TRACK = "YT2590231382196";

console.log(`\n=== tb_order columns (tracking/status-ish) ===`);
console.log((await q(
  `SELECT column_name FROM information_schema.columns
    WHERE table_name='tb_order' AND (column_name ILIKE '%track%' OR column_name ILIKE '%status%' OR column_name ILIKE '%store%' OR column_name ILIKE '%hno%')
    ORDER BY column_name`)).map(r => r.column_name).join(", "));

console.log(`\n=== rows in tb_order LIKE ${TRACK}% (raw *) ===`);
const rows = await q(`SELECT * FROM tb_order WHERE "ctrackingnumber" LIKE $1 LIMIT 5`, [`${TRACK}%`]);
for (const r of rows) {
  // print only the relevant subset
  console.log({ id: r.id, hno: r.hno, ctrackingnumber: r.ctrackingnumber, cstorename: r.cstorename,
    ostatus: r.ostatus, status: r.status, cstatus: r.cstatus, userid: r.userid });
}
console.log(`(found ${rows.length} tb_order rows)`);

console.log(`\n=== tb_header_order P22328 ===`);
console.log(await q(`SELECT hno, hstatus, userid FROM tb_header_order WHERE hno=$1`, ["P22328"]));

console.log(`\n=== tb_forwarder fstatus distribution ===`);
console.log(await q(`SELECT fstatus, COUNT(*)::int AS n FROM tb_forwarder GROUP BY fstatus ORDER BY fstatus`));

await c.end();
console.log("\ndone.");
