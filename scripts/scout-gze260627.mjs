import pg from "pg";
const c=new pg.Client({connectionString:`postgresql://postgres.yzljakczhwrpbxflnmco:${encodeURIComponent(process.env.SUPABASE_DB_PASSWORD)}@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres`,ssl:{rejectUnauthorized:false},connectionTimeoutMillis:15000});
await c.connect();
const q=await c.query(`select id,ftrackingchn,userid,fweight,fvolume,famount,famountcount,fcosttotalprice,ftotalprice,fstatus,frefrate,customrate
  from tb_forwarder where fcabinetnumber='GZE260627-1' order by fweight desc nulls last`);
console.log(`ตู้ GZE260627-1 — ${q.rows.length} แถว`);
const W=q.rows.reduce((a,r)=>a+Number(r.fweight||0),0), V=q.rows.reduce((a,r)=>a+Number(r.fvolume||0),0);
console.log(`Σ น้ำหนัก=${W.toFixed(2)}kg · Σ คิว=${V.toFixed(4)} · ความหนาแน่นรวม=${(W/(V||1)).toFixed(0)} kg/คิว  (ปกติ ≤ ~1,000; น้ำ=1,000)`);
console.log(`ต้นทุนที่ตั้งไว้ Σ=${q.rows.reduce((a,r)=>a+Number(r.fcosttotalprice||0),0).toFixed(2)} · ขาย Σ=${q.rows.reduce((a,r)=>a+Number(r.ftotalprice||0),0).toFixed(2)}`);
console.log(`\nแถวที่น้ำหนักเป็นไปไม่ได้ทางฟิสิกส์ (>1,000 kg/คิว):`);
console.log("fid    tracking              ผู้ใช้   kg        คิว       kg/คิว     กล่อง cnt ต้นทุน    ขาย       st");
let bad=0;
for(const r of q.rows){
  const w=Number(r.fweight||0), v=Number(r.fvolume||0), d=v>0?w/v:0;
  if(d>1000||v===0&&w>0){ bad++;
    console.log(`${String(r.id).padEnd(6)} ${String(r.ftrackingchn).padEnd(21)} ${String(r.userid).padEnd(7)} ${w.toFixed(2).padStart(9)} ${v.toFixed(4).padStart(9)} ${d.toFixed(0).padStart(9)} ${String(r.famount).padEnd(5)} ${String(r.famountcount).padEnd(3)} ${String(r.fcosttotalprice).padStart(8)} ${String(r.ftotalprice).padStart(9)} ${r.fstatus}`);
  }
}
console.log(`→ ${bad}/${q.rows.length} แถว น้ำหนักมั่ว`);
// momo_box_detail = ความจริง
const trks=q.rows.map(r=>r.ftrackingchn);
const b=await c.query(`select tracking_no, count(*)::int boxes, sum(weight_kg)::numeric total_kg, sum(cbm)::numeric total_cbm
  from momo_box_detail where split_part(tracking_no,'-',1) = any($1::text[]) or tracking_no = any($1::text[]) group by 1 order by 1`,
  [trks.map(t=>String(t).split("-")[0])]);
console.log(`\nmomo_box_detail (ความจริงจาก MOMO) — ${b.rows.length} tracking:`);
for(const r of b.rows.slice(0,12)) console.log(`  ${String(r.tracking_no).padEnd(24)} กล่อง=${String(r.boxes).padEnd(3)} kg=${Number(r.total_kg).toFixed(2).padStart(9)} คิว=${Number(r.total_cbm).toFixed(4)}`);
if(b.rows.length) { const bw=b.rows.reduce((a,r)=>a+Number(r.total_kg||0),0), bv=b.rows.reduce((a,r)=>a+Number(r.total_cbm||0),0);
  console.log(`  Σ box_detail: ${bw.toFixed(2)}kg · ${bv.toFixed(4)}คิว · ความหนาแน่น=${(bw/(bv||1)).toFixed(0)} kg/คิว`); }
else console.log("  🔴 ไม่มีข้อมูลใน momo_box_detail เลย → ซ่อมจากที่นี่ไม่ได้ ต้องหาแหล่งอื่น (packing list)");
await c.end();
