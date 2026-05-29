import pg from "pg";
const { Client } = pg;
const PASS = process.env.PG_PASSWORD;
const c = new Client({ connectionString:`postgresql://postgres:${encodeURIComponent(PASS)}@db.yzljakczhwrpbxflnmco.supabase.co:5432/postgres`, ssl:{rejectUnauthorized:false}});
await c.connect();

console.log("══ Re-test with VALID-length userID 'PRZZ99' (6 chars ≤ 10) ══");
await c.query("BEGIN");
try {
  const nowIso = new Date(2026,0,1).toISOString();
  await c.query(`
    INSERT INTO tb_users ("userID","userTel","userStatus","userActive","userPass","userName","userLastName","userEmail","userRegistered","userPicture","coID","userLineNotify","userCompany","userComparison","userComparisonValue","userCredit","userCreditValue","userCreditDate","shopUser","channel","userRecom","userAddressID","userTransportType","userShipBy","userPayMethod","userNote","userLineIDOA","companyCustomer")
    VALUES ('PRZZ99','0900000000','1','0','','Test','Probe',null,$1,'user.jpg','PR','','0','0',0,'0',0,0,'1','','','','','','','','','0')
  `,[nowIso]);
  console.log("  ✅ INSERT SUCCEEDED with valid-length userID");
  console.log("  → bridge PAYLOAD is valid. Silent failure is at RUNTIME, not SQL.");
} catch(e) {
  console.log(`  ❌ FAILED: ${e.code} ${e.message}`);
  if (e.column) console.log(`     column: ${e.column}`);
}
await c.query("ROLLBACK");

console.log("\n══ How long are the orphan member_codes? (do any exceed 10?) ══");
const lens = await c.query(`
  select length(member_code) len, count(*)::int n, min(member_code) ex
  from profiles p
  where not exists (select 1 from tb_users u where u."userID"=p.member_code)
  group by 1 order by len
`);
for (const r of lens.rows) console.log(`  len=${r.len} → ${r.n} rows (e.g. ${r.ex})`);

console.log("\n══ Does profiles.member_code match tb_users.userID exactly for OLD rows? ══");
console.log("(sanity: confirm the join key is correct — old migrated customers DO match)");
const matched = await c.query(`
  select count(*)::int n from profiles p
  where exists (select 1 from tb_users u where u."userID"=p.member_code)
`);
const total = await c.query(`select count(*)::int n from profiles`);
console.log(`  profiles WITH matching tb_users: ${matched.rows[0].n} / ${total.rows[0].n}`);

await c.end();
