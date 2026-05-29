import pg from "pg";
const { Client } = pg;
const PASS = process.env.PG_PASSWORD;
const c = new Client({ connectionString:`postgresql://postgres:${encodeURIComponent(PASS)}@db.yzljakczhwrpbxflnmco.supabase.co:5432/postgres`, ssl:{rejectUnauthorized:false}});
await c.connect();

console.log("══ tb_users NOT NULL columns WITHOUT a default (must be in payload) ══");
const notnull = await c.query(`
  select column_name, data_type, character_maximum_length
  from information_schema.columns
  where table_schema='public' and table_name='tb_users'
    and is_nullable='NO' and column_default is null
  order by ordinal_position
`);
const payloadKeys = new Set(["userID","userTel","userStatus","userActive","userPass","userName","userLastName","userEmail","userRegistered","userPicture","coID","userLineNotify","userCompany","userComparison","userComparisonValue","userCredit","userCreditValue","userCreditDate","shopUser","channel","userRecom","userAddressID","userTransportType","userShipBy","userPayMethod","userNote","userLineIDOA","companyCustomer"]);
console.log("NOT NULL + no-default columns:");
let missing = [];
for (const r of notnull.rows) {
  const inPayload = payloadKeys.has(r.column_name);
  console.log(`  ${inPayload?"✅":"❌ MISSING"}  ${r.column_name} ${r.data_type}${r.character_maximum_length?`(${r.character_maximum_length})`:""}`);
  if (!inPayload) missing.push(r.column_name);
}
console.log(`\n→ Payload is MISSING ${missing.length} required column(s): ${missing.join(", ") || "(none)"}`);

console.log("\n══ ACTUAL INSERT TEST (in transaction, ROLLBACK — no pollution) ══");
await c.query("BEGIN");
try {
  const nowIso = new Date(2026,0,1).toISOString(); // fixed date OK in script
  await c.query(`
    INSERT INTO tb_users ("userID","userTel","userStatus","userActive","userPass","userName","userLastName","userEmail","userRegistered","userPicture","coID","userLineNotify","userCompany","userComparison","userComparisonValue","userCredit","userCreditValue","userCreditDate","shopUser","channel","userRecom","userAddressID","userTransportType","userShipBy","userPayMethod","userNote","userLineIDOA","companyCustomer")
    VALUES ('PRTEST_PROBE','0900000000','1','0','','Test','Probe',null,$1,'user.jpg','PR','','0','0',0,'0',0,0,'1','','','','','','','','','0')
  `,[nowIso]);
  console.log("  ✅ INSERT SUCCEEDED (so the bridge payload is valid — failure must be elsewhere: RLS / build / runtime)");
} catch(e) {
  console.log(`  ❌ INSERT FAILED: ${e.code} ${e.message}`);
  if (e.column) console.log(`     column: ${e.column}`);
  if (e.detail) console.log(`     detail: ${e.detail}`);
}
await c.query("ROLLBACK");
console.log("  (rolled back — no test row persisted)");

await c.end();
