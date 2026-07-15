// 🔴 DATA-FIX (owner 2026-07-15) — เซล ลูกนัท (admin_looknut) + แบม (admin_bam) ถูกสร้างผ่าน
// /admin/admins แบบ role=normies → ensureLegacyAdminRow mirror ล้มเหลว/ข้าม → ไม่มี tb_admin row →
// sales-roster (SOT: tb_admin adminStatusA='1' AND adminStatusSale='1') มองไม่เห็น → เลือกเป็นเซล
// ไม่ได้ทุกที่ (customer picker · carousel · round-robin · sales-team page).
//
// FIX (mirror ensureLegacyAdminRow + the bridge it omits):
//   1) INSERT tb_admin row keyed by login id (clone a template active row for the ~30 NOT-NULL
//      cols) · adminStatusA='1' · adminStatusSale='1' (เป็นเซล) · clear secrets/photo.
//   2) SET admin_contact_extras.legacy_admin_id = login id → the sales-team bridge
//      (tb_admin.adminID → extras.legacy_admin_id → profiles) shows their REAL identity + the
//      customer transfer-rep flow can reach them.
// Idempotent (skips if the tb_admin row already exists · only asserts flags). Money-neutral
// (identity/roster only · no wallet/order/price touched).
//
//   dry:   node scripts/fix-sales-reps-looknut-bam-2026-07-15.mjs
//   apply: node scripts/fix-sales-reps-looknut-bam-2026-07-15.mjs --apply
import pg from "pg";
import { writeFileSync } from "node:fs";
const APPLY = process.argv.includes("--apply");
const c = new pg.Client({ host: "aws-1-ap-southeast-1.pooler.supabase.com", port: 5432, user: "postgres.yzljakczhwrpbxflnmco", password: "DqOzfEZVXfMHIryz", database: "postgres", ssl: { rejectUnauthorized: false } });
await c.connect();

const REPS = ["admin_looknut", "admin_bam"];
const profs = (await c.query(
  `SELECT id, admin_login_id, first_name, last_name FROM profiles WHERE admin_login_id = ANY($1)`, [REPS])).rows;

// template active tb_admin row (full NOT-NULL column shape) + next ID
const tmpl = (await c.query(`SELECT * FROM tb_admin WHERE "adminStatusA"='1' LIMIT 1`)).rows[0];
const maxId = Number((await c.query(`SELECT "ID" FROM tb_admin ORDER BY "ID" DESC LIMIT 1`)).rows[0]?.ID || 0);

console.log(`\n════ sales-rep fix · ลูกนัท + แบม → tb_admin (เซล) · ${APPLY ? "🔴 APPLY" : "🟡 DRY-RUN"} ════`);
const plan = [];
let nextId = maxId;
for (const login of REPS) {
  const p = profs.find((x) => x.admin_login_id === login);
  if (!p) { console.log(`  ⏭ ${login} — ไม่พบ profile`); continue; }
  const nick = (await c.query(`SELECT nickname, legacy_admin_id FROM admin_contact_extras WHERE profile_id=$1`, [p.id])).rows[0];
  const exists = (await c.query(`SELECT "adminID","adminStatusSale" FROM tb_admin WHERE "adminID"=$1`, [login])).rows[0];
  nextId += 1;
  plan.push({ login, name: `${p.first_name} ${p.last_name}`, nick: nick?.nickname || "", profileId: p.id,
    legacyLinked: (nick?.legacy_admin_id ?? "") === login, exists: !!exists,
    action: exists ? "assert A=1,Sale=1 + link" : `INSERT tb_admin (ID=${nextId}) + link` });
  console.log(`  ${login} "${p.first_name} ${p.last_name}" (${nick?.nickname || "—"}) · tb_admin ${exists ? "มี → ยืนยัน flags" : "ไม่มี → สร้าง"} · bridge ${(nick?.legacy_admin_id ?? "")===login ? "ผูกแล้ว" : "→ ผูก legacy_admin_id"}`);
}

if (!APPLY) { console.log(`\n🟡 DRY-RUN — ไม่เขียน. --apply เพื่อแก้จริง\n`); await c.end(); process.exit(0); }
if (!tmpl) { console.error("❌ ไม่มี template tb_admin row"); await c.end(); process.exit(1); }

writeFileSync("scripts/fix-sales-reps-backup-2026-07-15.json", JSON.stringify({ plan, at: "2026-07-15" }, null, 2));
await c.query("begin");
try {
  let id = maxId;
  for (const login of REPS) {
    const p = profs.find((x) => x.admin_login_id === login);
    if (!p) continue;
    const nick = (await c.query(`SELECT nickname FROM admin_contact_extras WHERE profile_id=$1`, [p.id])).rows[0];
    const exists = (await c.query(`SELECT "adminID" FROM tb_admin WHERE "adminID"=$1`, [login])).rows[0];
    if (exists) {
      await c.query(`UPDATE tb_admin SET "adminStatusA"='1', "adminStatusSale"='1' WHERE "adminID"=$1`, [login]);
    } else {
      id += 1;
      // UNIQUE adminTel — '' if free else placeholder
      const telFree = !(await c.query(`SELECT 1 FROM tb_admin WHERE "adminTel"='' LIMIT 1`)).rows[0];
      const row = { ...tmpl, ID: id, adminID: login, adminName: p.first_name || login, adminLastName: p.last_name || "",
        adminEmail: `${login}@pacred.co.th`, adminNickname: nick?.nickname || "", adminTel: telFree ? "" : `na-${id}`,
        adminStatusA: "1", adminStatusSale: "1", adminStatusCS: "0", adminDel: "0", adminIDCreate: "admin_web",
        adminPicture: "", adminPass: "", bearer_token: "", adminLineTokenNotify: "", adminEmailOrg: 0, adminTelOrg: 0,
        salary: 0, nationalIDCard: "", nationalIDCardFile: "", copyHouseRegistrationFile: "", resumeFile: "" };
      const keys = Object.keys(row);
      await c.query(`INSERT INTO tb_admin (${keys.map(k=>`"${k}"`).join(",")}) VALUES (${keys.map((_,i)=>`$${i+1}`).join(",")})`, keys.map(k=>row[k]));
    }
    // bridge: extras.legacy_admin_id = login id (so sales-team shows real identity + transfer-rep reaches them)
    await c.query(`UPDATE admin_contact_extras SET legacy_admin_id=$2 WHERE profile_id=$1 AND coalesce(legacy_admin_id,'')=''`, [p.id, login]);
  }
  await c.query("commit");
  const roster = (await c.query(`SELECT "adminID","adminNickname" FROM tb_admin WHERE "adminStatusA"='1' AND "adminStatusSale"='1' ORDER BY "adminID"`)).rows;
  console.log(`\n✅ APPLIED · เซลที่เลือกได้ตอนนี้ (${roster.length}): ${roster.map(r=>`${r.adminID}(${r.adminNickname||'—'})`).join(" · ")}`);
} catch (e) { await c.query("rollback"); console.error("❌ ROLLED BACK:", e.message); }
await c.end();
