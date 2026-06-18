// Correct tb_forwarder.ftransporttype to match the cabinet-name convention
// (owner 2026-06-19: GZS/SEA = ทางเรือ '2', GZE = ทางรถ '1', EK/AIR = ทางอากาศ '3';
// the stored ftransporttype is unreliable). DRY-RUN by default; --apply to write.
// Backs up affected rows first. Touches ONLY ftransporttype (does NOT touch
// stored cost — the live display recomputes cost from the corrected transport).
import pg from "pg";
import { writeFileSync } from "node:fs";
const APPLY = process.argv.includes("--apply");
const PASSWORD = process.env.SUPABASE_DB_PASSWORD;
if (!PASSWORD) { console.error("SUPABASE_DB_PASSWORD not set"); process.exit(1); }
const HOSTS = ["aws-1-ap-southeast-1.pooler.supabase.com", "aws-0-ap-southeast-1.pooler.supabase.com"];
const USER = "postgres.yzljakczhwrpbxflnmco";
async function connect() {
  for (const h of HOSTS) {
    const cl = new pg.Client({ connectionString: `postgresql://${USER}:${encodeURIComponent(PASSWORD)}@${h}:5432/postgres` });
    try { await cl.connect(); console.log(`connected ${h}`); return cl; } catch (e) { console.error(`  ${h} ${e.code ?? e.message}`); }
  }
  throw new Error("all hosts failed");
}
const c = await connect();
const q = (s, p) => c.query(s, p).then((r) => r.rows);
function expected(name) {
  const n = (name ?? "").toUpperCase();
  if (n.includes("GZS") || n.includes("SEA")) return "2";
  if (n.includes("GZA") || n.includes("AIR")) return "3";
  if (n.includes("GZE") || n.includes("EK")) return "1";
  return null;
}
const rows = await q(
  `select id, fcabinetnumber, ftransporttype
     from tb_forwarder
    where coalesce(fcabinetnumber,'') not in ('','0') and fstatus <> '99'`);
const fix = [];
for (const r of rows) {
  const exp = expected(r.fcabinetnumber);
  if (exp && String(r.ftransporttype ?? "") !== exp) fix.push({ id: r.id, cab: r.fcabinetnumber, from: r.ftransporttype, to: exp });
}
console.log(`\n${fix.length} rows to correct:`);
const byCab = {};
for (const f of fix) byCab[f.cab] = (byCab[f.cab] || { from: f.from, to: f.to, n: 0 }), byCab[f.cab].n++;
for (const [cab, v] of Object.entries(byCab)) console.log(`  ${cab}: ${v.from} → ${v.to} (${v.n} rows)`);
if (fix.length === 0) { await c.end(); console.log("nothing to fix."); process.exit(0); }

writeFileSync(`/tmp/fix-transport-backup-${APPLY ? "apply" : "dryrun"}.json`,
  JSON.stringify(fix.map((f) => ({ id: f.id, cab: f.cab, ftransporttype: f.from })), null, 2));
console.log(`backup: /tmp/fix-transport-backup-${APPLY ? "apply" : "dryrun"}.json`);
if (!APPLY) { await c.end(); console.log("\nDRY-RUN — re-run with --apply to commit."); process.exit(0); }
let n = 0;
for (const f of fix) {
  const res = await c.query(`update tb_forwarder set ftransporttype=$1 where id=$2 and ftransporttype is distinct from $1`, [f.to, f.id]);
  if (res.rowCount === 1) n++;
}
await c.end();
console.log(`\nAPPLIED ${n}/${fix.length}.`);
