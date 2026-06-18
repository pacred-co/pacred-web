// Correct STORED fcosttotalprice on tb_forwarder rows whose cost is demonstrably
// weight-basis for a CBM carrier (cost == round2(rate×kg), != round2(rate×cbm)).
// Reuses the rigorous detector from probe-cost-basis. DRY-RUN by default; pass
// --apply to write. Backs up affected rows to /tmp BEFORE any update.
// Touches ONLY fcosttotalprice (+ fprofittotal=0 so reports re-derive) — never
// frefprice (that flag is the sell basis here) or any other column.
import pg from "pg";
import { writeFileSync } from "node:fs";

const APPLY = process.argv.includes("--apply");
const PROJECT_REF = "yzljakczhwrpbxflnmco"; // PROD
const PASSWORD = process.env.SUPABASE_DB_PASSWORD;
if (!PASSWORD) { console.error("SUPABASE_DB_PASSWORD not set"); process.exit(1); }
const HOSTS = ["aws-1-ap-southeast-1.pooler.supabase.com", "aws-0-ap-southeast-1.pooler.supabase.com"];
const USER = `postgres.${PROJECT_REF}`;

async function connect() {
  for (const h of HOSTS) {
    const cl = new pg.Client({ connectionString: `postgresql://${USER}:${encodeURIComponent(PASSWORD)}@${h}:5432/postgres` });
    try { await cl.connect(); console.log(`connected via ${h}:5432`); return cl; } catch (e) { console.error(`  ${h} → ${e.code ?? e.message}`); }
  }
  throw new Error("all hosts failed");
}
const c = await connect();
const q = (sql, p) => c.query(sql, p).then((r) => r.rows);
const r2 = (n) => Math.round(n * 100) / 100;

const CBM_WH = ["2", "3", "5", "6", "7", "8"];
function costColumn(wh, idx, transport, china) {
  const prefix = transport === "1" ? "fcostcar" : "fcostship";
  const city = china === "2" ? "2" : "";
  const seg = { "1": "sang", "2": "", "3": "mkcargo", "4": "mkcargo", "5": "jmf", "6": "gogo", "7": "cargocenter", "8": "momo" }[wh];
  return seg === undefined ? null : `${prefix}${idx}default${seg}${city}`;
}
const typeIdx = (t) => { const s = (t ?? "").trim(); return s === "2" ? 2 : s === "3" ? 3 : s === "4" ? 4 : 1; };

const settings = (await q(`select * from tb_settings limit 1`))[0] ?? {};
const custom = new Map();
for (const r of await q(`select fcabinetnumber, fproductstype1, fproductstype2, fproductstype3, fproductstype4 from tb_cost_container`)) custom.set(r.fcabinetnumber, r);

const rows = await q(
  `select id, ftrackingchn, userid, fcabinetnumber, fwarehousename, fwarehousechina, ftransporttype,
          fproductstype, fweight, fvolume, fcosttotalprice, fprofittotal, ftotalprice
     from tb_forwarder
    where fwarehousename = any($1) and coalesce(fcosttotalprice,0)>0
      and coalesce(fweight,0)>0 and coalesce(fvolume,0)>0`,
  [CBM_WH],
);

const wrong = [];
for (const r of rows) {
  const wh = String(r.fwarehousename), transport = String(r.ftransporttype) === "1" ? "1" : "2", idx = typeIdx(r.fproductstype);
  let rate = 0; const cr = custom.get(r.fcabinetnumber);
  if (cr) rate = Number(cr[`fproductstype${idx}`]) || 0;
  if (!rate) { const col = costColumn(wh, idx, transport, String(r.fwarehousechina ?? "")); rate = col ? Number(settings[col]) || 0 : 0; }
  if (!rate) continue;
  const w = Number(r.fweight), v = Number(r.fvolume), cost = Number(r.fcosttotalprice);
  if (Math.abs(cost - r2(rate * w)) < 0.02 && Math.abs(cost - r2(rate * v)) >= 0.02) {
    wrong.push({ ...r, rate, newCost: r2(rate * v) });
  }
}

console.log(`\n${wrong.length} weight-basis rows to correct:\n`);
for (const w of wrong) console.log(`  fid ${w.id} ${w.ftrackingchn} ${w.userid} cab=${w.fcabinetnumber}: ฿${Number(w.fcosttotalprice).toFixed(2)} → ฿${w.newCost.toFixed(2)} (rate ${w.rate} × cbm ${w.fvolume})`);

if (wrong.length === 0) { await c.end(); console.log("\nnothing to fix."); process.exit(0); }

// backup BEFORE any write
const backup = wrong.map((w) => ({ id: w.id, ftrackingchn: w.ftrackingchn, fcabinetnumber: w.fcabinetnumber, fcosttotalprice: w.fcosttotalprice, fprofittotal: w.fprofittotal }));
const bpath = `/tmp/fix-cost-basis-backup-${APPLY ? "apply" : "dryrun"}.json`;
writeFileSync(bpath, JSON.stringify(backup, null, 2));
console.log(`\nbackup written: ${bpath}`);

if (!APPLY) { await c.end(); console.log("\nDRY-RUN — no writes. Re-run with --apply to commit."); process.exit(0); }

let n = 0;
for (const w of wrong) {
  // optimistic guard: only update if the stored value is still the wrong one we read
  const res = await c.query(
    `update tb_forwarder set fcosttotalprice=$1, fprofittotal=0 where id=$2 and fcosttotalprice=$3`,
    [w.newCost, w.id, w.fcosttotalprice],
  );
  if (res.rowCount === 1) { n++; console.log(`  ✓ fid ${w.id} → ฿${w.newCost.toFixed(2)}`); }
  else console.log(`  ⚠ fid ${w.id} skipped (value changed since read — re-run dry-run)`);
}
await c.end();
console.log(`\nAPPLIED ${n}/${wrong.length} corrections.`);
