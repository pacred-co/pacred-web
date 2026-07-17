import pg from "pg";
const c=new pg.Client({connectionString:`postgresql://postgres.yzljakczhwrpbxflnmco:${encodeURIComponent(process.env.SUPABASE_DB_PASSWORD)}@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres`,ssl:{rejectUnauthorized:false},connectionTimeoutMillis:20000});
await c.connect();
const q=await c.query(`
  select f.id, f.ftrackingchn, f.fcabinetnumber, f.userid, f.fstatus,
         f.fweight::numeric fw, f.fvolume::numeric fv, f.famount, f.frefprice, f.frefrate::numeric rate,
         f.ftotalprice::numeric sell, f.fcosttotalprice::numeric cost,
         b.weight_kg::numeric bw, b.cbm::numeric bv, b.quantity q,
         (b.width::numeric*b.length::numeric*b.height::numeric/1000000.0) dims_cbm
  from tb_forwarder f join momo_box_detail b on b.box_tracking = f.ftrackingchn
  where b.quantity > 1 and b.width is not null and b.cbm is not null and f.fweight is not null`);
const near=(a,b,t=0.02)=>Math.abs(a-b)<=Math.max(t, Math.abs(b)*0.02);
const bugs=[];
for(const r of q.rows){
  const d=Number(r.dims_cbm), bv=Number(r.bv), qn=Number(r.q);
  const perBox = near(bv,d), isTotal = near(bv,d*qn);
  if(!isTotal||perBox) continue;              // only rows where MOMO's value is unambiguously the TOTAL
  const trueW=Number(r.bw), storedW=Number(r.fw);
  if(near(storedW,trueW)) continue;            // already correct
  if(!near(storedW,trueW*qn)) continue;        // not the ×qty signature
  const trueV=bv, storedV=Number(r.fv);
  bugs.push({...r, trueW, storedW, trueV, storedV, volAlsoBug: near(storedV, bv*qn) && !near(storedV,bv)});
}
console.log(`🔴 แถวที่ MOMO ส่ง "ยอดรวม" มาแล้ว แต่เราคูณ quantity ซ้ำ : ${bugs.length} แถว (จาก ${q.rows.length} แถวที่เทียบได้)`);
console.log(`   น้ำหนักผีรวม = ${bugs.reduce((a,b)=>a+(b.storedW-b.trueW),0).toFixed(2)} kg`);
console.log(`   แถวที่คิว ผิดด้วย = ${bugs.filter(b=>b.volAlsoBug).length}\n`);
console.log("fid    tracking              ตู้             ผู้ใช้   น้ำหนักเก็บ  ที่ถูก   qty ฐานคิดเงิน  เรท     ขาย       คิว-ผิดด้วย st");
for(const b of bugs.sort((x,y)=>(y.storedW-y.trueW)-(x.storedW-x.trueW))){
  const basis = String(b.frefprice)==="1" ? "🔴น้ำหนัก" : "คิว ✓";
  console.log(`${String(b.id).padEnd(6)} ${String(b.ftrackingchn).padEnd(21)} ${String(b.fcabinetnumber||"-").padEnd(15)} ${String(b.userid).padEnd(7)} ${b.storedW.toFixed(2).padStart(11)} ${b.trueW.toFixed(2).padStart(8)} ${String(b.q).padEnd(3)} ${basis.padEnd(11)} ${Number(b.rate).toFixed(2).padStart(7)} ${Number(b.sell).toFixed(2).padStart(9)} ${b.volAlsoBug?"🔴 ใช่":"ไม่"}      ${b.fstatus}`);
}
const weightBasis=bugs.filter(b=>String(b.frefprice)==="1");
console.log(`\n🔴 เสี่ยงเก็บเงินผิด (คิดตามน้ำหนัก + น้ำหนักผี): ${weightBasis.length} แถว`);
for(const b of weightBasis){
  const should=Number(b.rate)*b.trueW, is=Number(b.sell);
  console.log(`   fid ${b.id} ${b.userid} ตู้ ${b.fcabinetnumber} st=${b.fstatus}: เก็บ ฿${is.toFixed(2)} · ควรเป็น ฿${should.toFixed(2)} · ต่าง ฿${(is-should).toFixed(2)}`);
}
await c.end();
