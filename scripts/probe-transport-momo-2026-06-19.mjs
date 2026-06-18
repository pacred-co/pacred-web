// READ-ONLY — (1) scope of ftransporttype rows that disagree with the cabinet
// name convention (GZS/SEA=sea '2', GZE=road '1', EK/AIR=air '3'); (2) the
// tb_settings MOMO cost cells (sea vs road); (3) the MO20260523-SEA02 row.
import pg from "pg";
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
  if (n.includes("GZE")) return "1";
  if (n.includes("EK") || n.includes("AIR")) return "3";
  return null; // no token → can't判
}

// 1) mismatches by container
const rows = await q(
  `select fcabinetnumber, ftransporttype, count(*)::int n
     from tb_forwarder
    where coalesce(fcabinetnumber,'') not in ('','0')
      and fstatus <> '99'
    group by fcabinetnumber, ftransporttype order by fcabinetnumber`);
const mism = [];
for (const r of rows) {
  const exp = expected(r.fcabinetnumber);
  if (exp && String(r.ftransporttype ?? "") !== exp) mism.push({ ...r, exp });
}
console.log(`\n=== ${mism.length} container/type groups MISMATCH the name convention ===`);
let totalRows = 0;
for (const m of mism) { console.log(`  ${m.fcabinetnumber}: stored=${m.ftransporttype} → expected=${m.exp} (${m.n} rows)`); totalRows += m.n; }
console.log(`  total forwarder rows affected: ${totalRows}`);

// 2) MOMO cost cells in tb_settings (sea vs road, type1, gwangzhou + yiwu)
const s = (await q(`select * from tb_settings limit 1`))[0] ?? {};
console.log(`\n=== tb_settings MOMO cost cells ===`);
for (const col of ["fcostship1defaultmomo","fcostship2defaultmomo","fcostship3defaultmomo","fcostship4defaultmomo",
                   "fcostcar1defaultmomo","fcostcar2defaultmomo","fcostcar3defaultmomo","fcostcar4defaultmomo",
                   "fcostship1defaultmomo2","fcostcar1defaultmomo2"]) {
  if (col in s) console.log(`  ${col} = ${s[col]}`);
}

// 3) MO20260523-SEA02 row(s)
const mo = await q(
  `select id, ftrackingchn, fcabinetnumber, ftransporttype, fwarehousename, fwarehousechina,
          fweight, fvolume, fcosttotalprice, ftotalprice, fproductstype
     from tb_forwarder where fcabinetnumber = 'MO20260523-SEA02'`);
console.log(`\n=== MO20260523-SEA02 rows ===`);
for (const r of mo) console.log("  ", JSON.stringify(r));

await c.end();
console.log("\ndone (read-only).");
