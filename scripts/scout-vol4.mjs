import pg from "pg";
const c=new pg.Client({connectionString:`postgresql://postgres.yzljakczhwrpbxflnmco:${encodeURIComponent(process.env.SUPABASE_DB_PASSWORD)}@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres`,ssl:{rejectUnauthorized:false},connectionTimeoutMillis:20000});
await c.connect();
const q=await c.query(`select f.id,f.ftrackingchn,f.userid,f.fcabinetnumber,f.fstatus,f.fweight::numeric fw,f.fvolume::numeric fv,f.famount,
   f.frefrate::numeric rate,f.frefprice,f.ftotalprice::numeric sell,f.fcosttotalprice::numeric cost,
   b.weight_kg::numeric bw,b.cbm::numeric bv,b.quantity q,(b.width::numeric*b.length::numeric*b.height::numeric/1000000.0) dims
   from tb_forwarder f join momo_box_detail b on b.box_tracking=f.ftrackingchn where f.id in (52196,52194,52198,52600)`);
for(const r of q.rows){
  const dims=Number(r.dims),bv=Number(r.bv),qn=Number(r.q);
  const kind = Math.abs(bv-dims*qn)<Math.max(0.02,dims*qn*0.02) ? "TOTAL(=dims×qty)" : Math.abs(bv-dims)<Math.max(0.02,dims*0.02)?"per-box":"?";
  console.log(`\nfid ${r.id} ${r.ftrackingchn} ${r.userid} ตู้ ${r.fcabinetnumber} st=${r.fstatus}`);
  console.log(`  MOMO: weight_kg=${r.bw} cbm=${bv} qty=${qn} · dims/กล่อง=${dims.toFixed(6)} → MOMO's cbm = ${kind}`);
  console.log(`  เรา : fweight=${Number(r.fw)} (ที่ถูก ${Number(r.bw)}) · fvolume=${Number(r.fv)} (ที่ถูก ${bv}) · famount=${r.famount}`);
  const sell=Number(r.sell), rate=Number(r.rate);
  const sellOnStoredV=(rate*Number(r.fv)).toFixed(2), sellOnTrueV=(rate*bv).toFixed(2), sellOnTrueW=(rate*Number(r.bw)).toFixed(2);
  console.log(`  ขายจริง=฿${sell.toFixed(2)} · เรท=${rate} | rate×คิวที่เก็บ=฿${sellOnStoredV} · rate×คิวที่ถูก=฿${sellOnTrueV} · rate×นน.ที่ถูก=฿${sellOnTrueW}`);
  const hitStored=Math.abs(sell-Number(sellOnStoredV))<1.5, hitTrue=Math.abs(sell-Number(sellOnTrueV))<1.5, hitW=Math.abs(sell-Number(sellOnTrueW))<1.5;
  console.log(`  → ขายคิดจาก: ${hitStored?"🔴 คิวที่เพี้ยน = เก็บเกิน ฿"+(sell-Number(sellOnTrueV)).toFixed(2):hitTrue?"คิวที่ถูก ✓ ปลอดภัย":hitW?"น้ำหนักที่ถูก ✓ ปลอดภัย":"หาไม่เจอ (เรทมือ/manual?)"}`);
}
await c.end();
