import pg from "pg";
const c=new pg.Client({connectionString:`postgresql://postgres.yzljakczhwrpbxflnmco:${encodeURIComponent(process.env.SUPABASE_DB_PASSWORD)}@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres`,ssl:{rejectUnauthorized:false},connectionTimeoutMillis:15000});
await c.connect();
const s=await c.query(`select column_name,data_type from information_schema.columns where table_name='momo_box_detail' order by ordinal_position`);
console.log("momo_box_detail cols:", s.rows.map(r=>r.column_name).join(", "));
const tcol = s.rows.find(r=>/track/i.test(r.column_name))?.column_name;
console.log("tracking col =", tcol, "\n");
for (const t of ["KY4001041630124","908006917359"]) {
  const q=await c.query(`select * from momo_box_detail where ${JSON.stringify(tcol).replace(/"/g,'"')} like $1 limit 8`,[t+"%"]);
  console.log(`=== box_detail ${t}: ${q.rows.length} แถว ===`);
  for(const r of q.rows) console.log("  ", JSON.stringify(r));
}
await c.end();
