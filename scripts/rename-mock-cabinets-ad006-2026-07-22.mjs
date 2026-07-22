/**
 * rename-mock-cabinets-ad006-2026-07-22.mjs
 * ─────────────────────────────────────────────────────────────────────────
 * owner 2026-07-22: *"ไล่ดูงาน MOCK และตู้และพวกรายการ Test user AD006 ของปอนด์ ·
 * ไล่เปลี่ยนเลขตู้ของปอนด์ให้เป็น GZPOND006-MOCK1/2/3 · แพทเทินประมาณนี้ครับ
 * คนทำงานจริงจะได้ไม่งง"*
 *
 * ปัญหา: ตู้ทดสอบของบัญชี UI-test `AD006` (ปอน) ตั้งชื่อเป็น `GZS2607-MOCK1` /
 * `GZE2607-MOCK1` — ขึ้นต้นเหมือนตู้ MOMO จริง (GZS/GZE + เดือน) จึงไปนั่งปนกับตู้จริง
 * ในรายงานตู้/ตรวจตู้ → คนทำงานจริงเข้าใจผิดว่าเป็นงานจริง.
 *
 * เปลี่ยนเป็นแพทเทินที่อ่านแล้วรู้ทันทีว่าเป็นของทดสอบ + เป็นของใคร:
 *   GZS2607-MOCK1 (เรือ · 2 แถว) → GZPOND006-MOCK1
 *   GZE2607-MOCK1 (รถ  · 3 แถว) → GZPOND006-MOCK2
 *   (MOCK3 เว้นไว้ให้ตู้ทดสอบถัดไป — ตอนนี้มีจริงแค่ 2 ตู้)
 *
 * ทำไมโหมดขนส่งไม่เพี้ยน: `transportModeFromCabinetName` อ่าน token GZS/GZE/GZA —
 * ชื่อใหม่ไม่มี token → ระบบ fallback ไปใช้ `ftransporttype` ที่เก็บไว้ (เรือ '2' /
 * รถ '1' ซึ่งถูกอยู่แล้วทั้ง 5 แถว) → การแสดงผลเรือ/รถ คงเดิม.
 *
 * SCOPE: เฉพาะ userid='AD006' เท่านั้น · ตรวจแล้วไม่มีลูกค้าอื่นใช้ 2 ตู้นี้ (0 แถว)
 * และไม่มีข้อมูลผูกในตารางอื่น (tb_cost_container 0 · momo_import_tracks 0 ·
 * taem_container_etd_eta 0 · tb_cnt_item 0 · momo_invoice_line 0) → rename ปลอดภัย.
 * ไม่แตะเงิน/สถานะ/น้ำหนัก — เปลี่ยนแค่ชื่อตู้.
 *
 * ⚠️ `tb_forwarder.adminidupdate` = varchar(10) (legacy admin id) — แสตมป์ต้อง ≤10 ตัว
 *    ('mock-rename' 11 ตัว ทำ txn ล้มทั้งก้อนมาแล้ว · fcabinetnumber เองกว้าง 300 พอ).
 *
 * RUN: node --env-file=.env.local scripts/rename-mock-cabinets-ad006-2026-07-22.mjs [--apply]
 */
import pg from "pg";
import fs from "node:fs";

const APPLY = process.argv.includes("--apply");
const PW = process.env.SUPABASE_DB_PASSWORD || process.env.PGPW;
const TEST_USER = "AD006";
const MAP = [
  { from: "GZS2607-MOCK1", to: "GZPOND006-MOCK1" }, // เรือ
  { from: "GZE2607-MOCK1", to: "GZPOND006-MOCK2" }, // รถ
];

const c = new pg.Client({ host: "aws-1-ap-southeast-1.pooler.supabase.com", port: 5432,
  user: "postgres.yzljakczhwrpbxflnmco", password: PW, database: "postgres", ssl: { rejectUnauthorized: false } });
await c.connect();

// SAFETY: ชื่อใหม่ต้องยังไม่มีใครใช้ + ชื่อเดิมต้องไม่มีลูกค้าอื่นใช้
const news = MAP.map((m) => m.to);
const olds = MAP.map((m) => m.from);
const clash = await c.query(`select fcabinetnumber, count(*)::int n from tb_forwarder where fcabinetnumber = any($1) group by 1`, [news]);
const foreign = await c.query(`select fcabinetnumber, count(*)::int n from tb_forwarder where fcabinetnumber = any($1) and userid <> $2 group by 1`, [olds, TEST_USER]);
console.log("ชื่อใหม่ซ้ำกับของเดิม (ต้องว่าง):", JSON.stringify(clash.rows));
console.log("ลูกค้าอื่นใช้ตู้เดิม (ต้องว่าง):", JSON.stringify(foreign.rows));
if (clash.rows.length || foreign.rows.length) { console.error("ABORT — ไม่ปลอดภัย"); await c.end(); process.exit(1); }

const before = await c.query(
  `select id, ftrackingchn, fcabinetnumber, ftransporttype, fstatus from tb_forwarder
   where userid=$1 and fcabinetnumber = any($2) order by id`, [TEST_USER, olds]);
console.log(`\n${APPLY ? "APPLY" : "DRY-RUN"} — ${before.rows.length} แถวของ ${TEST_USER}`);
for (const r of before.rows) {
  const to = MAP.find((m) => m.from === r.fcabinetnumber)?.to;
  console.log(` #${r.id} ${r.ftrackingchn} · ${r.fcabinetnumber} → ${to} (${r.ftransporttype === "2" ? "เรือ" : r.ftransporttype === "3" ? "อากาศ" : "รถ"} · st${r.fstatus})`);
}
if (!APPLY) { await c.end(); process.exit(0); }

fs.writeFileSync(`scripts/_backup-mock-cabinets-${Date.now()}.json`, JSON.stringify(before.rows, null, 1), "utf8");
await c.query("begin");
try {
  let n = 0;
  for (const m of MAP) {
    const r = await c.query(
      `update tb_forwarder set fcabinetnumber=$3, adminidupdate='mock-cab'
       where userid=$1 and fcabinetnumber=$2`, [TEST_USER, m.from, m.to]);
    n += r.rowCount ?? 0;
  }
  await c.query("commit");
  console.log(`APPLIED — ${n} แถว`);
} catch (e) { await c.query("rollback"); console.error("ROLLED BACK:", e.message); process.exitCode = 1; }

const after = await c.query(`select fcabinetnumber, count(*)::int n from tb_forwarder where userid=$1 group by 1 order by 1`, [TEST_USER]);
console.log("ตู้ของ AD006 หลังแก้:", JSON.stringify(after.rows));
const leftover = await c.query(`select count(*)::int n from tb_forwarder where fcabinetnumber = any($1)`, [olds]);
console.log("ชื่อเก่าเหลือในระบบ (ควร 0):", leftover.rows[0].n);
await c.end();
