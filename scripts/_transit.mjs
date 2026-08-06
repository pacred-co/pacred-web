import pg from "pg";
const c = new pg.Client({ host:"aws-1-ap-southeast-1.pooler.supabase.com", port:5432, user:"postgres.yzljakczhwrpbxflnmco", password:process.env.PGPW, database:"postgres", ssl:{rejectUnauthorized:false} });
await c.connect();
// ETD = วันในชื่อตู้ (วันปิดตู้) · ของถึงจริง = แทรคแรกที่ยิงรับ (min fdatestatus4) − 1 วัน (โกดังรอเขาลงของ)
const r = await c.query(`
  select fcabinetnumber ตู้,
         substring(fcabinetnumber from '^(?:GZ|YW)([SEA])') โหมด,
         left(fcabinetnumber,2) โกดัง,
         to_date('20'||substring(fcabinetnumber from '^(?:GZ|YW)[SEA](\\d{6})'),'YYYYMMDD') etd,
         (min(fdatestatus4)::date - 1) ถึงจริง,
         ((min(fdatestatus4)::date - 1) - to_date('20'||substring(fcabinetnumber from '^(?:GZ|YW)[SEA](\\d{6})'),'YYYYMMDD')) วัน,
         count(*)::int แถว
  from tb_forwarder
  where fcabinetnumber ~ '^(GZ|YW)[SEA][0-9]{6}-[0-9]+$' and fdatestatus4 is not null
    and fcabinetnumber not ilike '%MOCK%'
  group by 1,2,3,4 having (min(fdatestatus4)::date - 1) is not null
  order by 4 desc`);
const rows = r.rows.filter(x => x.วัน !== null && x.วัน > 0 && x.วัน < 90);
console.log(`ตู้ที่วัดได้ ${rows.length} ตู้ (ตัดค่าผิดปกติ ≤0 หรือ >90 วันออก ${r.rows.length-rows.length})`);
console.table(rows.slice(0,18));
const by = new Map();
for (const x of rows) { const k = `${x.โกดัง}${x.โหมด}`; (by.get(k) ?? by.set(k,[]).get(k)).push(Number(x.วัน)); }
console.log("\n── สรุปต่อเส้นทาง ──");
console.table([...by].map(([k,v])=>{ const s=[...v].sort((a,b)=>a-b); return { เส้นทาง:k, ตู้:v.length, ต่ำสุด:s[0], มัธยฐาน:s[Math.floor(s.length/2)], สูงสุด:s[s.length-1], เฉลี่ย:+(v.reduce((a,b)=>a+b,0)/v.length).toFixed(1) };}));
await c.end();
