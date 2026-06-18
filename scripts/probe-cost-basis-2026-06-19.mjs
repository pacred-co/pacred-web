// READ-ONLY rigorous detector — find tb_forwarder rows whose STORED cost is
// demonstrably weight-basis for a CBM carrier (MOMO + every carrier except
// Sang(1)/MX(4)). Resolves the real cost rate per row (tb_cost_container custom
// rate if present, else the tb_settings cost matrix), then flags ONLY rows where
// stored == round2(rate × weight) AND stored != round2(rate × cbm). No writes.
import pg from "pg";

const PROJECT_REF = "yzljakczhwrpbxflnmco"; // PROD
const PASSWORD = process.env.SUPABASE_DB_PASSWORD;
if (!PASSWORD) { console.error("SUPABASE_DB_PASSWORD not set"); process.exit(1); }
const HOSTS = ["aws-1-ap-southeast-1.pooler.supabase.com", "aws-0-ap-southeast-1.pooler.supabase.com"];
const USER = `postgres.${PROJECT_REF}`;

async function connect() {
  for (const h of HOSTS) {
    const conn = `postgresql://${USER}:${encodeURIComponent(PASSWORD)}@${h}:5432/postgres`;
    const cl = new pg.Client({ connectionString: conn });
    try { await cl.connect(); console.log(`connected via ${h}:5432`); return cl; }
    catch (e) { console.error(`  ${h}:5432 → ${e.code ?? e.message}`); }
  }
  throw new Error("all hosts failed");
}
const c = await connect();
const q = (sql, p) => c.query(sql, p).then((r) => r.rows);
const r2 = (n) => Math.round(n * 100) / 100;

// --- cost column resolver (faithful to resolve-cost.ts costColumn) ---
const WEIGHT_WH = new Set(["1", "4"]);                 // Sang + MX bill by weight
const CBM_WH = ["2", "3", "5", "6", "7", "8"];
function costColumn(wh, typeIdx, transport, china) {
  const prefix = transport === "1" ? "fcostcar" : "fcostship";
  const city = china === "2" ? "2" : "";
  const seg = { "1": "sang", "2": "", "3": "mkcargo", "4": "mkcargo", "5": "jmf", "6": "gogo", "7": "cargocenter", "8": "momo" }[wh];
  if (seg === undefined) return null;
  return `${prefix}${typeIdx}default${seg}${city}`;
}
const typeIdx = (t) => { const s = (t ?? "").trim(); return s === "2" ? 2 : s === "3" ? 3 : s === "4" ? 4 : 1; };

// --- load tb_settings (single global row) ---
const settings = (await q(`select * from tb_settings limit 1`))[0] ?? {};
// --- load custom per-cabinet rates (tb_cost_container) ---
let custom = new Map();
try {
  const cc = await q(`select fcabinetnumber, fproductstype1, fproductstype2, fproductstype3, fproductstype4 from tb_cost_container`);
  for (const r of cc) custom.set(r.fcabinetnumber, r);
} catch (e) { console.error("tb_cost_container read:", e.message); }
console.log(`settings cols=${Object.keys(settings).length} · custom-rate cabinets=${custom.size}`);

// --- scan all CBM-carrier rows with a stored cost ---
const rows = await q(
  `select id, ftrackingchn, userid, fcabinetnumber, fwarehousename, fwarehousechina,
          ftransporttype, fproductstype, frefprice, fweight, fvolume, fcosttotalprice, ftotalprice
     from tb_forwarder
    where fwarehousename = any($1)
      and coalesce(fcosttotalprice,0) > 0
      and coalesce(fweight,0) > 0
      and coalesce(fvolume,0) > 0`,
  [CBM_WH],
);
console.log(`scanned ${rows.length} CBM-carrier rows with cost>0\n`);

const wrong = [];
let unresolved = 0;
for (const r of rows) {
  const wh = String(r.fwarehousename);
  const transport = String(r.ftransporttype) === "1" ? "1" : "2"; // 1=รถ 2=เรือ(default)
  const idx = typeIdx(r.fproductstype);
  // rate: custom cabinet rate wins, else tb_settings matrix
  let rate = 0;
  const cr = custom.get(r.fcabinetnumber);
  if (cr) rate = Number(cr[`fproductstype${idx}`]) || 0;
  if (!rate) {
    const col = costColumn(wh, idx, transport, String(r.fwarehousechina ?? ""));
    rate = col ? Number(settings[col]) || 0 : 0;
  }
  if (!rate) { unresolved++; continue; } // no rate → can't judge → skip
  const w = Number(r.fweight), v = Number(r.fvolume), cost = Number(r.fcosttotalprice);
  const wCost = r2(rate * w), vCost = r2(rate * v);
  const isWeightBasis = Math.abs(cost - wCost) < 0.02 && Math.abs(cost - vCost) >= 0.02;
  if (isWeightBasis) wrong.push({ id: r.id, tracking: r.ftrackingchn, userid: r.userid, cab: r.fcabinetnumber, wh, rate, w, v, before: cost, after: vCost, sell: Number(r.ftotalprice) });
}

console.log(`=== ${wrong.length} rows are DEMONSTRABLY weight-basis (stored == rate×kg) ===`);
console.log(`(${unresolved} rows had no resolvable rate → skipped, not judged)\n`);
let tb = 0, ta = 0;
for (const w of wrong) {
  console.log(`fid ${w.id} | ${w.tracking} | ${w.userid} | cab=${w.cab} wh=${w.wh} rate=${w.rate}`);
  console.log(`   kg=${w.w} cbm=${w.v}  STORED ฿${w.before.toFixed(2)} → CBM ฿${w.after.toFixed(2)}  sell=฿${w.sell.toFixed(2)}`);
  tb += w.before; ta += w.after;
}
console.log(`\nTOTAL before ฿${tb.toFixed(2)} → after ฿${ta.toFixed(2)} · over-stated cost removed ฿${(tb - ta).toFixed(2)}`);
await c.end();
console.log("\ndone (read-only · no writes).");
