/**
 * Import ฝากจ่ายหยวน (yuan-transfer) HISTORICAL records — June 2569 (06-69) only.
 * Source: owner Google Sheet `ลงข้อมูลฝากจ่าย_ต้นทุนกำไร` (off-system work · PCS+Pacred+freight).
 *
 * Owner 2026-06-29/30 rules (STRICT):
 *   - ยึด PR ใน tb_users เป็นหลัก (ห้ามแก้) · the sheet's PR is UNRELIABLE (PR เพี้ยน).
 *   - Resolve the customer by NAME → our real PR. Import ONLY when the name matches
 *     a SINGLE high-confidence Pacred PR. Ambiguous / not-found → SKIP + ask later.
 *   - June only · Pacred PR only.
 * Money-safe: INSERT tb_payment only (paystatus='2' = โอนแล้ว). NO wallet debit (the
 * wallet moved off-system · debiting now would double-count). Idempotent via the
 * session marker + (userid,payyuan,paydate) skip-check. Backup written before apply.
 *
 *   DRY-RUN:  SUPABASE_DB_PASSWORD=<pw> node scripts/import-yuan-fakjai-0669-2026-06-30.mjs
 *   APPLY:    SUPABASE_DB_PASSWORD=<pw> node scripts/import-yuan-fakjai-0669-2026-06-30.mjs --apply
 */
import pg from "pg";
import fs from "fs";
const { Client } = pg;
const APPLY = process.argv.includes("--apply");
const P = process.env.SUPABASE_DB_PASSWORD, REF = "yzljakczhwrpbxflnmco";
const MARKER = "import-fj-0669";
const SCRATCH = "/private/tmp/claude-501/-Users-dev-pacred-web--claude-worktrees-gifted-snyder-0a9cca/5af1ab1d-4a08-4ef2-a641-b90fc347ad66/scratchpad";
if (!P) { console.error("FATAL: SUPABASE_DB_PASSWORD required"); process.exit(1); }

const rows = JSON.parse(fs.readFileSync(`${SCRATCH}/yuan-rows.json`, "utf8")).filter((r) => r.sheet.includes("06"));

let client;
for (const h of ["aws-1-ap-southeast-1.pooler.supabase.com", "aws-0-ap-southeast-1.pooler.supabase.com"]) {
  try { client = new Client({ connectionString: `postgresql://postgres.${REF}:${encodeURIComponent(P)}@${h}:5432/postgres`, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10000 }); await client.connect(); break; } catch { client = null; }
}
if (!client) { console.error("no DB conn"); process.exit(1); }

const norm = (s) => (s || "").replace(/บริษัท|จำกัด|\(.*?\)|มหาชน|นาย|นางสาว|นาง|คุณ|\s|\.|,/g, "").toLowerCase();
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// Resolve a sheet row → our real PR by NAME (high-confidence single match only).
async function resolvePR(sheetPR, sheetName) {
  const pr = sheetPR.trim().toUpperCase().replace(/\s+/g, "");
  const sn = norm(sheetName);
  if (!sn || sn.length < 2) return { pr: null, why: "ชื่อว่าง/สั้นเกิน" };
  if (/เทสระบบ|^test/i.test(sheetName)) return { pr: null, why: "test row" };
  // (a) does the sheet's PR exist + its name match the sheet name? → trust it.
  const u = await client.query(`select "userID","userName","userLastName" from tb_users where "userID"=$1`, [pr]);
  if (u.rows[0]) {
    const tbn = norm(`${u.rows[0].userName || ""}${u.rows[0].userLastName || ""}`);
    if (tbn && (tbn.includes(sn) || sn.includes(tbn) || tbn.slice(0, 5) === sn.slice(0, 5))) {
      return { pr, why: "sheet PR ตรงชื่อ", name: `${u.rows[0].userName} ${u.rows[0].userLastName}` };
    }
  }
  // (b) name-search tb_users + tb_corporate for a SINGLE strong match.
  const cand = new Map();
  const us = await client.query(`select "userID","userName","userLastName" from tb_users where "userStatus"<>'0'`, []);
  for (const r of us.rows) { const n = norm(`${r.userName || ""}${r.userLastName || ""}`); if (n.length >= 3 && (n === sn || (sn.length >= 4 && n.includes(sn)) || (n.length >= 4 && sn.includes(n)))) cand.set(r.userID, `${r.userName} ${r.userLastName}`); }
  const cs = await client.query(`select userid, corporatename from tb_corporate`, []);
  for (const r of cs.rows) { const n = norm(r.corporatename); if (n.length >= 3 && (n === sn || (sn.length >= 4 && n.includes(sn)) || (n.length >= 4 && sn.includes(n)))) cand.set(r.userid, r.corporatename); }
  const ids = [...cand.keys()];
  if (ids.length === 1) return { pr: ids[0], why: "name→PR (เดี่ยว)", name: cand.get(ids[0]) };
  if (ids.length === 0) return { pr: null, why: "ไม่เจอชื่อใน DB → ถามทีหลัง" };
  return { pr: null, why: `กำกวม ${ids.length} ราย (${ids.join("/")}) → ถามทีหลัง` };
}

const toImport = [], skip = [];
for (const r of rows) {
  if (!r.sell_thb && !r.cost_thb) { skip.push({ ...r, why: "ไม่มียอด" }); continue; }
  const res = await resolvePR(r.pr, r.name);
  if (!res.pr) { skip.push({ ...r, why: res.why }); continue; }
  const paythb = round2(r.sell_thb || r.cost_thb);
  const paythbcost = round2(r.cost_thb);
  const payyuan = round2(r.yuan);
  toImport.push({
    importPR: res.pr, resolvedName: res.name, sheetPR: r.pr, sheetName: r.name, why: res.why,
    paydate: r.date || "2026-06-01", payyuan,
    payrate: payyuan > 0 ? round2(paythb / payyuan) : (round2(r.rate_cost) || null),     // effective SELL rate
    payratecost: payyuan > 0 ? round2(paythbcost / payyuan) : (round2(r.rate_cost) || null), // effective COST rate
    paythb, paythbcost, payprofitthb: round2(paythb - paythbcost),
  });
}

console.log(`\n=== ฝากจ่ายหยวน 06-69 import (${APPLY ? "APPLY" : "DRY-RUN"}) ===`);
console.log(`source rows: ${rows.length} · IMPORTABLE: ${toImport.length} · SKIP: ${skip.length}\n`);
console.log("IMPORTABLE (→ our PR by name):");
for (const t of toImport) console.log(`  ${t.sheetPR.padEnd(8)}"${t.sheetName.slice(0,18)}" → ${t.importPR.padEnd(8)}(${(t.resolvedName||"").slice(0,16)}) | ขาย฿${t.paythb} ต้นทุน฿${t.paythbcost} | ${t.why}`);
console.log(`\n  Σ ขาย ฿${round2(toImport.reduce((s,t)=>s+t.paythb,0)).toLocaleString()} · Σ ต้นทุน ฿${round2(toImport.reduce((s,t)=>s+t.paythbcost,0)).toLocaleString()} · Σ กำไร ฿${round2(toImport.reduce((s,t)=>s+t.payprofitthb,0)).toLocaleString()}`);
console.log("\nSKIP (→ ถามทีหลัง):");
for (const s of skip) console.log(`  ${String(s.pr).padEnd(8)}"${String(s.name).slice(0,20)}" — ${s.why}`);

fs.writeFileSync(`${SCRATCH}/yuan-import-plan.json`, JSON.stringify({ toImport, skip }, null, 2));

if (!APPLY) { console.log(`\n(DRY-RUN · re-run with --apply to write · plan saved)`); await client.end(); process.exit(0); }

// APPLY — INSERT tb_payment, idempotent, no wallet.
let ins = 0, skipDup = 0;
for (const t of toImport) {
  const dup = await client.query(`select id from tb_payment where userid=$1 and session=$2 and round(payyuan::numeric,2)=$3 and paydate::date=$4::date limit 1`, [t.importPR, MARKER, t.payyuan, t.paydate]);
  if (dup.rows[0]) { skipDup++; continue; }
  await client.query(
    `insert into tb_payment (paydate,paydeposit,paystatus,paytype,paydetail,payyuan,payrate,payratecost,paythb,paythbcost,payprofitthb,paydateadmin,userid,session,imagesslip,certifiedtruecopy,imagesslipadmin,adminid,adminidupdate,payadminidcreator)
     values ($1,'0','2','1',$2,$3,$4,$10,$5,$6,$7,$1,$8,$9,'','','','','','')`,
    [t.paydate, `ฝากจ่ายหยวน (import ประวัติ มิ.ย. · ${t.sheetName})`, t.payyuan, t.payrate, t.paythb, t.paythbcost, t.payprofitthb, t.importPR, MARKER, t.payratecost]
  );
  ins++;
}
console.log(`\nAPPLIED: inserted ${ins} · skipped-dup ${skipDup}`);
await client.end();
