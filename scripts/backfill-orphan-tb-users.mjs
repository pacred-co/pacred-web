import pg from "pg";
const { Client } = pg;
const PASS = process.env.PG_PASSWORD;
const DRY = process.env.APPLY !== "true";
const c = new Client({ connectionString:`postgresql://postgres:${encodeURIComponent(PASS)}@db.yzljakczhwrpbxflnmco.supabase.co:5432/postgres`, ssl:{rejectUnauthorized:false}});
await c.connect();

function e164ToLegacy(s){ s=(s||"").trim(); if(!s) return ""; if(s.startsWith("+66")) return "0"+s.slice(3); return s.slice(0,13); }

const orphans = await c.query(`
  select p.member_code, p.account_type, p.phone, p.email, p.first_name, p.last_name, p.created_at
  from profiles p
  where not exists (select 1 from tb_users u where u."userID"=p.member_code)
  order by p.created_at asc
`);
console.log(`Found ${orphans.rows.length} orphan profiles.\n`);

await c.query("BEGIN");
let ok=0, phoneClash=[], fail=[];
for (const p of orphans.rows) {
  const code = p.member_code;
  if (!code || code.length > 10) { fail.push(`${code} (bad len)`); continue; }
  const legacyTel = e164ToLegacy(p.phone);
  const isJur = p.account_type === "juristic";
  // phone-collision pre-check (the bridge's missing guard)
  const clash = await c.query(`select "userID" from tb_users where "userTel"=$1 limit 1`,[legacyTel]);
  if (clash.rowCount) { phoneClash.push(`${code} → phone ${legacyTel} already on ${clash.rows[0].userID}`); continue; }
  await c.query("SAVEPOINT sp");
  try {
    await c.query(`
      INSERT INTO tb_users ("userID","userTel","userStatus","userActive","userPass","userName","userLastName","userEmail","userRegistered","userPicture","coID","userLineNotify","userCompany","userComparison","userComparisonValue","userCredit","userCreditValue","userCreditDate","shopUser","channel","userRecom","userAddressID","userTransportType","userShipBy","userPayMethod","userNote","userLineIDOA","companyCustomer")
      VALUES ($1,$2,'1','0','',$3,$4,$5,$6,'user.jpg','PR','',$7,'0','0',0,0,0,'1','','','','','','','','','0')
      ON CONFLICT ("userID") DO NOTHING
    `,[code, legacyTel, p.first_name??"", p.last_name??"", p.email??null, (p.created_at instanceof Date? p.created_at.toISOString(): p.created_at), isJur?"1":"0"]);
    ok++;
  } catch(e){ await c.query("ROLLBACK TO sp"); fail.push(`${code}: ${e.code} ${e.message}`); }
}
console.log(`✅ inserted: ${ok}`);
console.log(`⚠️  phone-collision (skipped — already in tb_users via another code): ${phoneClash.length}`);
phoneClash.forEach(x=>console.log(`     ${x}`));
console.log(`❌ failed: ${fail.length}`);
fail.forEach(x=>console.log(`     ${x}`));

if (DRY) { await c.query("ROLLBACK"); console.log("\n🔸 DRY RUN — rolled back. Re-run with APPLY=true."); }
else {
  await c.query("COMMIT");
  const v = await c.query(`select count(*)::int n from tb_users where "coID"='PR' and "userActive"='0'`);
  console.log(`\n✅ COMMITTED. tb_users bridge rows (coID=PR, pending): ${v.rows[0].n}`);
}
await c.end();
