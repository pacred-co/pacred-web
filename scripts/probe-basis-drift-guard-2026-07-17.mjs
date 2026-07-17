// READ-ONLY probe — เลน B: ออกแบบ guard "ฐานเพี้ยน ห้าม re-price"
// ดูโครงสร้างข้อมูลจริงก่อน แล้วค่อยเลือก threshold
//   node scripts/probe-basis-drift-guard-2026-07-17.mjs
import pg from "pg";
const c = new pg.Client({
  host: "aws-1-ap-southeast-1.pooler.supabase.com",
  port: 5432,
  user: "postgres.yzljakczhwrpbxflnmco",
  password: "DqOzfEZVXfMHIryz",
  database: "postgres",
  ssl: { rejectUnauthorized: false },
});
await c.connect();

// 1. schema ของ momo_box_detail
const { rows: cols } = await c.query(`
  SELECT column_name, data_type FROM information_schema.columns
   WHERE table_name = 'momo_box_detail' ORDER BY ordinal_position`);
console.log("\n═══ momo_box_detail columns ═══");
console.log(cols.map((r) => `${r.column_name}:${r.data_type}`).join(" · "));

const { rows: cnt } = await c.query(`SELECT count(*)::int n FROM momo_box_detail`);
console.log(`rows = ${cnt[0].n}`);

// 2. ตัวอย่าง 5 แถว
const { rows: sample } = await c.query(`SELECT * FROM momo_box_detail LIMIT 3`);
console.log("\n═══ sample ═══");
for (const r of sample) console.log(JSON.stringify(r));

// 3. tb_forwarder ทั้งหมดที่มี box_detail จับคู่ได้ (exact box_tracking)
const { rows: matched } = await c.query(`
  SELECT count(DISTINCT f.id)::int n
    FROM tb_forwarder f
    JOIN momo_box_detail d ON d.box_tracking = f.ftrackingchn`);
console.log(`\ntb_forwarder ที่ match box_tracking ตรงตัว = ${matched[0].n}`);

// 4. tb_forwarder ทั้งหมด
const { rows: tot } = await c.query(`SELECT count(*)::int n FROM tb_forwarder`);
console.log(`tb_forwarder ทั้งหมด = ${tot[0].n}`);

// 5. base_tracking match (bare base ← Σ boxes)
const { rows: baseMatch } = await c.query(`
  SELECT count(DISTINCT f.id)::int n
    FROM tb_forwarder f
    JOIN momo_box_detail d ON d.base_tracking = f.ftrackingchn`);
console.log(`tb_forwarder ที่ match base_tracking (bare) = ${baseMatch[0].n}`);

await c.end();
