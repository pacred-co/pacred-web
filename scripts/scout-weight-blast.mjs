import pg from "pg";
const c=new pg.Client({connectionString:`postgresql://postgres.yzljakczhwrpbxflnmco:${encodeURIComponent(process.env.SUPABASE_DB_PASSWORD)}@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres`,ssl:{rejectUnauthorized:false},connectionTimeoutMillis:20000});
await c.connect();
// join tb_forwarder ↔ momo_box_detail on the EXACT box tracking; flag fweight == weight_kg * quantity (qty>1)
const q=await c.query(`
  select f.id, f.ftrackingchn, f.fcabinetnumber, f.userid, f.fstatus,
         f.fweight::numeric fw, f.fvolume::numeric fv, f.famount, f.ftotalprice::numeric sell, f.fcosttotalprice::numeric cost,
         b.weight_kg::numeric bw, b.cbm::numeric bv, b.quantity q
  from tb_forwarder f
  join momo_box_detail b on b.box_tracking = f.ftrackingchn
  where b.quantity > 1
    and f.fweight is not null and b.weight_kg is not null
    and abs(f.fweight::numeric - (b.weight_kg::numeric * b.quantity)) < 0.01
    and abs(f.fweight::numeric - b.weight_kg::numeric) > 0.01
  order by (f.fweight::numeric - b.weight_kg::numeric) desc`);
console.log(`🔴 แถวที่ fweight = weight_kg × quantity (คูณเกิน) : ${q.rows.length} แถว`);
const inflated = q.rows.reduce((a,r)=>a+(Number(r.fw)-Number(r.bw)),0);
console.log(`   น้ำหนักที่เกินมารวม = ${inflated.toFixed(2)} kg\n`);
console.log("fid    tracking              ตู้             ผู้ใช้   fweight     ที่ถูก    qty  ขาย        ขาย/คิว   ฐานที่ใช้ขาย  st");
for(const r of q.rows.slice(0,20)){
  const perCbm = Number(r.fv)>0 ? Number(r.sell)/Number(r.fv) : 0;
  const perKgBad = Number(r.fw)>0 ? Number(r.sell)/Number(r.fw) : 0;
  const basis = (perCbm>1500&&perCbm<8000) ? "คิว ✓ปลอดภัย" : (perKgBad>5&&perKgBad<60) ? "🔴 น้ำหนัก(เพี้ยน)" : "?";
  console.log(`${String(r.id).padEnd(6)} ${String(r.ftrackingchn).padEnd(21)} ${String(r.fcabinetnumber||"-").padEnd(15)} ${String(r.userid).padEnd(7)} ${Number(r.fw).toFixed(2).padStart(10)} ${Number(r.bw).toFixed(2).padStart(8)} ${String(r.q).padEnd(4)} ${Number(r.sell).toFixed(2).padStart(9)} ${perCbm.toFixed(0).padStart(8)}  ${basis.padEnd(16)} ${r.fstatus}`);
}
const byCab={}; for(const r of q.rows){ const k=r.fcabinetnumber||"(ว่าง)"; byCab[k]=(byCab[k]??0)+1; }
console.log("\nกระจายตามตู้:", JSON.stringify(byCab));
const byStatus={}; for(const r of q.rows){ const k=String(r.fstatus); byStatus[k]=(byStatus[k]??0)+1; }
console.log("กระจายตามสถานะ:", JSON.stringify(byStatus), " (6/7 = เก็บเงินไปแล้ว)");
await c.end();
