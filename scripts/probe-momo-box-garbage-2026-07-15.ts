/**
 * READ-ONLY validation probe (2026-07-15) — run the REAL deriveMomoBoxConsistency
 * against every multi-box base on prod, so the ตรวจตู้ 🚩 flag is proven to separate
 * genuine "MOMO มั่ว" (dims can't reconcile → ต้องแต้ม) from folded-discovery rows
 * the human split button fixes. No writes.
 * RUN: SUPABASE_DB_PASSWORD=<prod> pnpm tsx scripts/probe-momo-box-garbage-2026-07-15.ts
 */
import pg from "pg";
import { deriveMomoBoxConsistency, type BoxConsistencyInput } from "../lib/admin/momo-box-consistency";

const PW = process.env.SUPABASE_DB_PASSWORD;
if (!PW) { console.error("SUPABASE_DB_PASSWORD required"); process.exit(1); }
const base = (t: string) => (t ?? "").trim().replace(/-\d+(\/\d+)?$/, "");

const REF = process.env.SUPABASE_DB_REF || "yzljakczhwrpbxflnmco";
const c = new pg.Client({
  connectionString: `postgresql://postgres:${encodeURIComponent(PW)}@db.${REF}.supabase.co:5432/postgres`,
  ssl: { rejectUnauthorized: false },
});
async function main() {
  console.log(`(probing ${REF})`);
await c.connect();
try {
  // multi-box bases → their box_detail rows
  const bd = await c.query<{ base_tracking: string; box_tracking: string; weight_kg: string; cbm: string; width: string; length: string; height: string; quantity: string }>(
    `select base_tracking, box_tracking, weight_kg, cbm, width, length, height, quantity
     from momo_box_detail
     where base_tracking in (select base_tracking from momo_box_detail group by base_tracking having count(*) > 1)`);
  const boxesByBase = new Map<string, BoxConsistencyInput[]>();
  for (const r of bd.rows) {
    const arr = boxesByBase.get(r.base_tracking) ?? [];
    arr.push({
      boxTracking: r.box_tracking, weightKgPerPiece: Number(r.weight_kg) || 0, cbmPerPiece: Number(r.cbm) || 0,
      width: Number(r.width) || 0, length: Number(r.length) || 0, height: Number(r.height) || 0, quantity: Number(r.quantity) || 0,
    });
    boxesByBase.set(r.base_tracking, arr);
  }
  // aggregate rows (bare base) + sibling detection (base-% → already split).
  const bases = [...boxesByBase.keys()];
  const fwd = await c.query<{ id: number; ftrackingchn: string; fstatus: string; fcabinetnumber: string; userid: string; fweight: string; fvolume: string }>(
    `select id, ftrackingchn, fstatus, fcabinetnumber, userid, fweight::numeric as fweight, fvolume::numeric as fvolume
     from tb_forwarder where ftrackingchn = any($1)`, [bases]);
  const aggByBase = new Map(fwd.rows.map((r) => [base(r.ftrackingchn), r]));
  // count ALL tb_forwarder rows per base (bare + "-N" siblings) → >1 means already split.
  const cnt = await c.query<{ b: string; n: string }>(
    `select replace_suffix as b, count(*) as n from (
       select regexp_replace(ftrackingchn, '-[0-9]+(/[0-9]+)?$', '') as replace_suffix from tb_forwarder
       where ftrackingchn = any($1) or ftrackingchn like any($2)
     ) t group by replace_suffix`,
    [bases, bases.map((x) => x + "-%")]);
  const rowCountByBase = new Map(cnt.rows.map((r) => [r.b, Number(r.n)]));

  const garbage: string[] = [], dimsFix: string[] = [], consistent: string[] = [], noAgg: string[] = [], alreadySplit: string[] = [];
  for (const [b, boxes] of boxesByBase) {
    const agg = aggByBase.get(b);
    if (!agg) { noAgg.push(b); continue; }
    if ((rowCountByBase.get(b) ?? 1) > 1) { alreadySplit.push(`#${agg.id} ${agg.ftrackingchn} PR=${agg.userid} cab=${agg.fcabinetnumber || "—"}`); continue; }
    const v = deriveMomoBoxConsistency({ fweight: Number(agg.fweight) || 0, fvolume: Number(agg.fvolume) || 0 }, boxes);
    const line = `#${agg.id} ${agg.ftrackingchn} PR=${agg.userid} cab=${agg.fcabinetnumber || "—"} fstatus=${agg.fstatus} boxes=${v.boxCount} · aggW=${v.aggWeight} boxΣW=${v.boxWeightSum.toFixed(0)} aggCbm=${v.aggCbm} boxΣCbm=${v.boxCbmSum.toFixed(3)}${v.garbage ? ` · 🚩 ${v.reason}` : v.dimsReconcilable ? " · dims-fix" : ""}`;
    if (v.garbage) garbage.push(line);
    else if (v.dimsReconcilable) dimsFix.push(line);
    else consistent.push(line);
  }
  console.log(`\n════ 🚩 GARBAGE (dims can't reconcile → ต้องแต้ม) — ${garbage.length} ════`);
  garbage.forEach((l) => console.log("  " + l));
  console.log(`\n════ dims-fix (stored เพี้ยน แต่ dims ซ่อมได้ · ไม่ flag) — ${dimsFix.length} ════`);
  dimsFix.slice(0, 15).forEach((l) => console.log("  " + l));
  if (dimsFix.length > 15) console.log(`  … +${dimsFix.length - 15}`);
  console.log(`\n════ consistent (stored ตรง · ไม่ flag) — ${consistent.length} ════`);
  console.log(`\n════ already-split (มี sibling rows · resolved · ไม่ flag) — ${alreadySplit.length} ════`);
  alreadySplit.slice(0, 20).forEach((l) => console.log("  " + l));
  console.log(`\nsummary: 🚩garbage=${garbage.length} dims-fix=${dimsFix.length} consistent=${consistent.length} already-split=${alreadySplit.length} no-bare-agg=${noAgg.length} total-multibox=${boxesByBase.size}`);
  // spot-check the 3 documented cases
  for (const t of ["1782555393", "1782453952", "760234506976"]) {
    const boxes = boxesByBase.get(t); const agg = aggByBase.get(t);
    if (!boxes || !agg) { console.log(`\nspot ${t}: missing`); continue; }
    const v = deriveMomoBoxConsistency({ fweight: Number(agg.fweight) || 0, fvolume: Number(agg.fvolume) || 0 }, boxes);
    console.log(`\nspot ${t} (#${agg.id}): garbage=${v.garbage} reason=${v.reason} dimsFix=${v.dimsReconcilable} · boxΣW=${v.boxWeightSum.toFixed(1)} aggW=${v.aggWeight}`);
  }
} finally {
  await c.end();
}
}
main();
