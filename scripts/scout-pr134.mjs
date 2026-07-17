import pg from "pg";
const c=new pg.Client({connectionString:`postgresql://postgres.yzljakczhwrpbxflnmco:${encodeURIComponent(process.env.SUPABASE_DB_PASSWORD)}@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres`,ssl:{rejectUnauthorized:false},connectionTimeoutMillis:20000});
await c.connect();
const q=await c.query(`select * from tb_forwarder where id in (52154, 52675, 52196)`);
for(const r of q.rows){
  console.log(`\n=== fid ${r.id} · ${r.ftrackingchn} · ${r.userid} · ตู้ ${r.fcabinetnumber} · fstatus=${r.fstatus} ===`);
  for(const k of ["fweight","fvolume","famount","famountcount","frefrate","frefprice","ftotalprice","fcosttotalprice","fsang","customrate","custom_comparison","custom_comparison_value","ftransportprice","fproductstype"])
    if(k in r) console.log(`   ${k.padEnd(24)} = ${r[k]}`);
  const b=await c.query(`select box_tracking,weight_kg,cbm,quantity,width,length,height from momo_box_detail where box_tracking=$1`,[r.ftrackingchn]);
  for(const x of b.rows) console.log(`   MOMO box_detail: weight_kg=${x.weight_kg} cbm=${x.cbm} qty=${x.quantity} dims=${x.width}x${x.length}x${x.height}`);
}
await c.end();
