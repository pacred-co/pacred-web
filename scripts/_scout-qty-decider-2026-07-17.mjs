// READ-ONLY scout — verify the "dims decider" ground truth against prod.
// Throwaway probe (underscore-prefixed). node scripts/_scout-qty-decider-2026-07-17.mjs
import pg from "pg";

const PASSWORD = process.env.SUPABASE_DB_PASSWORD;
if (!PASSWORD) { console.error("FATAL: SUPABASE_DB_PASSWORD not set"); process.exit(1); }

const c = new pg.Client({
  host: "aws-1-ap-southeast-1.pooler.supabase.com", port: 5432,
  user: "postgres.yzljakczhwrpbxflnmco", password: PASSWORD,
  database: "postgres", ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000,
});
const n = (v) => Number(v ?? 0) || 0;
const r6 = (x) => Number(x.toFixed(6));

await c.connect();
console.log("connected\n");

// every momo_box_detail row + the tb_forwarder row with the SAME tracking
const { rows } = await c.query(`
  SELECT b.base_tracking, b.box_tracking, b.weight_kg, b.cbm, b.quantity,
         b.width, b.length, b.height,
         f.id AS fid, f.ftrackingchn, f.fweight, f.fvolume, f.famount, f.famountcount,
         f.fstatus, f.fcabinetnumber, f.userid, f.ftotalprice, f.frefprice, f.frefrate
    FROM momo_box_detail b
    LEFT JOIN tb_forwarder f ON f.ftrackingchn = b.box_tracking
   ORDER BY b.base_tracking, b.box_tracking`);

console.log(`momo_box_detail rows: ${rows.length}`);

let dimsUsable = 0, perBox = 0, lineTotal = 0, undecided = 0;
const suspects = [];

for (const b of rows) {
  const w = n(b.width), l = n(b.length), h = n(b.height);
  const qty = Math.max(1, Math.round(n(b.quantity)) || 1);
  const cbm = n(b.cbm);
  if (!(w > 0 && l > 0 && h > 0) || cbm <= 0) { undecided++; continue; }
  dimsUsable++;
  const dimsCbm = r6((w * l * h) / 1_000_000);
  const relPerBox = Math.abs(cbm - dimsCbm) / Math.max(cbm, dimsCbm);
  const relTotal = Math.abs(cbm - dimsCbm * qty) / Math.max(cbm, dimsCbm * qty);
  let verdict = null;
  if (relPerBox <= 0.02 && relTotal > 0.02) { verdict = "per_box"; perBox++; }
  else if (relTotal <= 0.02 && relPerBox > 0.02) { verdict = "line_total"; lineTotal++; }
  else { undecided++; continue; }  // qty=1 → both fit (ambiguous but harmless)

  if (verdict === "line_total" && qty > 1 && b.fid) {
    // our row should carry the LINE TOTAL as-is; if it carries ×qty → double-multiplied
    const trueW = Number((n(b.weight_kg)).toFixed(2));
    const trueV = cbm;
    const curW = n(b.fweight), curV = n(b.fvolume);
    const wDouble = trueW > 0 && Math.abs(curW - trueW * qty) / Math.max(curW, trueW * qty) <= 0.02;
    const vDouble = trueV > 0 && Math.abs(curV - trueV * qty) / Math.max(curV, trueV * qty) <= 0.02;
    if (wDouble || vDouble) {
      suspects.push({
        fid: b.fid, tracking: b.box_tracking, cab: b.fcabinetnumber, user: b.userid,
        qty, st: b.fstatus, price: n(b.ftotalprice), refprice: b.frefprice, refrate: n(b.frefrate),
        curW, trueW, wDouble, curV, trueV: r6(trueV), vDouble,
        dims: `${w}x${l}x${h}`, dimsCbm,
      });
    }
  }
}

console.log(`dims-usable: ${dimsUsable} · per_box: ${perBox} · line_total: ${lineTotal} · undecided/ambiguous: ${undecided}`);
console.log(`\nSUSPECT rows (line_total convention BUT our row carries ×qty): ${suspects.length}\n`);
suspects.sort((a, b) => b.curW - a.curW);
for (const s of suspects) {
  console.log(
    `fid ${s.fid} | ${s.tracking} | ${s.cab} | ${s.user} | qty ${s.qty} | st ${s.st} | ` +
    `kg ${s.curW} -> ${s.trueW} ${s.wDouble ? "DOUBLE" : "ok"} | ` +
    `cbm ${s.curV} -> ${s.trueV} ${s.vDouble ? "DOUBLE" : "ok"} | ` +
    `price ${s.price} refprice=${s.refprice} rate ${s.refrate} | dims ${s.dims} (=${s.dimsCbm})`
  );
}
const ghost = suspects.reduce((a, s) => a + (s.wDouble ? s.curW - s.trueW : 0), 0);
console.log(`\nghost weight total: ${ghost.toFixed(2)} kg`);
await c.end();
