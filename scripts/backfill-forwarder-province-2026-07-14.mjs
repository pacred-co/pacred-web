// Backfill tb_forwarder.faddressprovince from the customer's saved address (owner 2026-07-14).
// WHY: the province-aware carrier picker (EditShipByField) shows a province's ขนส่งเอกชน only
// when faddressprovince is set. 181 billable rows have it blank; 33 have a customer address with
// a province → fill those so the picker lights up. (The rest have NO customer address → staff
// sets it manually · the picker's empty-state already guides that.)
// Uses the DEFAULT address (addressstatus='1') else the sole address; skips if ambiguous
// (multiple non-default provinces) or billed (fstatus 5/6/7 · frozen doc).
//   dry:   node scripts/backfill-forwarder-province-2026-07-14.mjs
//   apply: node scripts/backfill-forwarder-province-2026-07-14.mjs --apply
import pg from "pg";
import { writeFileSync } from "node:fs";
const APPLY = process.argv.includes("--apply");
// mirror lib/forwarder/carrier-province-coverage.ts :: canonicalProvince (prefix strip + กรุงเทพ)
// so the stored value is the clean canonical name the picker + workbook use.
const ALIAS = { "กรุงเทพ": "กรุงเทพมหานคร", "กทม": "กรุงเทพมหานคร", "อยุธยา": "พระนครศรีอยุธยา", "โคราช": "นครราชสีมา" };
function canon(raw) {
  let t = String(raw || "").trim().replace(/^จ\.\s*/, "").replace(/^จังหวัด\s*/, "").replace(/ฯ/g, "").replace(/[​\s]+$/, "").trim();
  return ALIAS[t] ?? t;
}
const c = new pg.Client({ host: "aws-1-ap-southeast-1.pooler.supabase.com", port: 5432, user: "postgres.yzljakczhwrpbxflnmco", password: "DqOzfEZVXfMHIryz", database: "postgres", ssl: { rejectUnauthorized: false } });
await c.connect();

const rows = (await c.query(`
  SELECT f.id, f.ftrackingchn, f.userid, f.fstatus
    FROM tb_forwarder f
   WHERE coalesce(f.faddressprovince,'')='' AND f.fstatus IN ('1','2','3','4')
     AND EXISTS(SELECT 1 FROM tb_address ta WHERE ta.userid=f.userid AND coalesce(ta.addressprovince,'')<>'')
   ORDER BY f.id`)).rows;

const plan = [];
for (const r of rows) {
  const addrs = (await c.query(`SELECT addressprovince, addressstatus FROM tb_address WHERE userid=$1 AND coalesce(addressprovince,'')<>''`, [r.userid])).rows;
  const provs = [...new Set(addrs.map(a => String(a.addressprovince).trim()))];
  const def = addrs.find(a => String(a.addressstatus) === "1");
  let pick = null, why = "";
  if (def && String(def.addressprovince).trim()) { pick = canon(def.addressprovince); why = "default(status=1)"; }
  else if (provs.length === 1) { pick = canon(provs[0]); why = "sole province"; }
  else { why = `ambiguous (${provs.length} provinces) → skip`; }
  plan.push({ id: r.id, tracking: r.ftrackingchn, PR: r.userid, st: r.fstatus, province: pick, why });
}
const doable = plan.filter(p => p.province);

console.log(`\n════ backfill forwarder province · ${APPLY ? "🔴 APPLY" : "🟡 DRY-RUN"} ════`);
console.log(`candidate ${rows.length} · backfill ได้ ${doable.length} · skip ${plan.length - doable.length}`);
doable.slice(0, 40).forEach(p => console.log(`  #${p.id} ${p.tracking} [${p.PR}] → จ.${p.province} (${p.why})`));
plan.filter(p => !p.province).forEach(p => console.log(`  ⏭ #${p.id} [${p.PR}] — ${p.why}`));

if (!APPLY) { console.log(`\n🟡 DRY-RUN — ไม่เขียน. --apply เพื่อแก้จริง\n`); await c.end(); process.exit(0); }

writeFileSync("scripts/backfill-forwarder-province-backup-2026-07-14.json", JSON.stringify({ before: plan }, null, 2));
let n = 0;
for (const p of doable) {
  const { rowCount } = await c.query(`UPDATE tb_forwarder SET faddressprovince=$2 WHERE id=$1 AND coalesce(faddressprovince,'')='' AND fstatus IN ('1','2','3','4')`, [p.id, p.province]);
  n += rowCount;
}
console.log(`\n✅ APPLIED · เติมจังหวัด ${n} แถว → picker ขนส่งเอกชนขึ้นให้เลือกแล้ว`);
await c.end();
