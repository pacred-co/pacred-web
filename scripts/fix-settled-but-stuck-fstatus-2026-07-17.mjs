#!/usr/bin/env node
/**
 * เงินเข้าครบแล้ว แต่ fstatus ค้างที่ 5 (รอชำระเงิน) → ขยับเป็น 6 (เตรียมส่ง)
 * ---------------------------------------------------------------------------
 * owner 2026-07-17 (ด่วน): "ของที่เราจะทำจ่าย แต่จ่ายไม่ได้" — PR217 (52456/52473/52481)
 *
 * อาการ: จอโชว์ "รอชำระเงิน" → พนักงานกดจ่ายซ้ำ → ระบบบอก "ชำระไปแล้ว" → ตัน
 * ต้นตอ: `tb_wallet_hs` settled (status='2') แล้ว แต่ `tb_forwarder.fstatus` ไม่เคยขยับ 5→6
 *
 * 🔒 MONEY-SAFETY (อ่านก่อนแก้):
 *  - เขียน **เฉพาะ fstatus (+ stamp fdatestatus6)** — ไม่แตะเงินสักบาท
 *    ห้ามแตะ ftotalprice / fcosttotalprice / fcredit / paydeposit / wallet
 *  - GUARD: ขยับให้ก็ต่อเมื่อ **Σ เงินที่ settled ต่อ fid >= ftotalprice** (พิสูจน์ว่าเก็บครบจริง)
 *    → เก็บไม่ครบ = ไม่แตะ (ไม่ใช่หน้าที่ script นี้เดา)
 *  - GUARD: เฉพาะ fstatus = '5' เท่านั้น (fold ใน WHERE = TOCTOU-safe · idempotent)
 *  - GUARD: ต้องมีแถวเงิน typenew ∈ {5,6} status='2' (settled) ชี้มาที่ fid นี้
 *  - ไม่แตะ fcredit ที่ยังค้าง (เครดิต = คนละเส้น · ต้องเคลียร์ผ่าน flow เครดิต)
 *
 *   DRY-RUN (ค่าเริ่มต้น):  SUPABASE_DB_PASSWORD='<pw>' node scripts/fix-settled-but-stuck-fstatus-2026-07-17.mjs
 *   APPLY:                 SUPABASE_DB_PASSWORD='<pw>' node scripts/fix-settled-but-stuck-fstatus-2026-07-17.mjs --apply
 */
import fs from "node:fs";
import pg from "pg";

const APPLY = process.argv.includes("--apply");
const PASSWORD = process.env.SUPABASE_DB_PASSWORD;
if (!PASSWORD) { console.error("FATAL: ไม่ได้ตั้ง SUPABASE_DB_PASSWORD"); process.exit(1); }

const c = new pg.Client({
  connectionString: `postgresql://postgres.yzljakczhwrpbxflnmco:${encodeURIComponent(PASSWORD)}@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres`,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 20_000,
});
await c.connect();

console.log(`\n${"=".repeat(96)}\nเงิน settled แล้ว แต่ fstatus ค้าง <6 — ${APPLY ? "APPLY" : "DRY-RUN"}\n${"=".repeat(96)}\n`);

// หาแถวที่ "เก็บเงินแล้วจริง" แต่สถานะค้าง — detect เอง ไม่ hardcode fid
const { rows } = await c.query(`
  select f.id, f.userid, f.ftrackingchn, f.fcabinetnumber, f.fstatus,
         f.ftotalprice::numeric  sell,
         f.fcredit, f.paydeposit,
         coalesce(sum(h.amount::numeric), 0) settled,
         string_agg(h.id::text || '(' || h.typenew || '/฿' || h.amount::text || ')', ' · ' order by h.id) hs
  from tb_forwarder f
  join tb_wallet_hs h
    on h.reforder::text = f.id::text
   and h.status = '2'
   and h.typenew in ('5', '6')
  where f.fstatus = '5'
  group by f.id, f.userid, f.ftrackingchn, f.fcabinetnumber, f.fstatus, f.ftotalprice, f.fcredit, f.paydeposit
  order by f.id`);

if (rows.length === 0) { console.log("ไม่พบแถวที่ค้าง — ไม่มีอะไรต้องทำ ✓\n"); await c.end(); process.exit(0); }

const plan = [];
console.log("fid    ลูกค้า   แทรกกิ้ง            ตู้              ขาย        เก็บได้แล้ว  เครดิต  → ทำอะไร");
console.log("-".repeat(120));
for (const r of rows) {
  const sell = Number(r.sell || 0);
  const settled = Number(r.settled || 0);
  const creditOpen = String(r.fcredit ?? "").trim() === "1";
  // เก็บครบ = settled >= ขาย (เผื่อปัดเศษ 1 สตางค์)
  const fullyPaid = settled + 0.01 >= sell && sell > 0;
  let action;
  if (creditOpen) action = "⏸ ข้าม — เครดิตยังเปิดอยู่ (ต้องเคลียร์ผ่าน flow เครดิต)";
  else if (!fullyPaid) action = `⏸ ข้าม — เก็บยังไม่ครบ (ขาด ฿${(sell - settled).toFixed(2)})`;
  else { action = "→ ขยับ 5 → 6 (เตรียมส่ง)"; plan.push({ fid: r.id, userid: r.userid, before: "5", after: "6", sell, settled, hs: r.hs }); }
  console.log(
    `${String(r.id).padEnd(6)} ${String(r.userid).padEnd(8)} ${String(r.ftrackingchn).padEnd(19)} ${String(r.fcabinetnumber || "-").padEnd(16)} ` +
    `${sell.toFixed(2).padStart(10)} ${settled.toFixed(2).padStart(11)}  ${(creditOpen ? "เปิด" : "-").padEnd(6)} ${action}`,
  );
  console.log(`       เงินที่ settled: ${r.hs}`);
}
console.log("-".repeat(120));
console.log(`พบ ${rows.length} แถว · จะขยับ ${plan.length} แถว · ข้าม ${rows.length - plan.length}\n`);
console.log("🔒 เขียนเฉพาะ fstatus + fdatestatus6 — ไม่แตะเงินสักบาท (ftotalprice/wallet/เครดิต คงเดิมทั้งหมด)\n");

if (!plan.length) { console.log("ไม่มีแถวที่ผ่าน guard — ไม่เขียนอะไร\n"); await c.end(); process.exit(0); }

if (!APPLY) {
  console.log(`${"=".repeat(96)}\nDRY-RUN — ยังไม่ได้เขียนอะไร. ตรวจตารางข้างบนแล้วรันซ้ำด้วย --apply\n${"=".repeat(96)}\n`);
  await c.end(); process.exit(0);
}

const backup = `./backup-settled-stuck-fstatus-2026-07-17.json`;
fs.writeFileSync(backup, JSON.stringify({ applied_at: new Date().toISOString(), rows: plan }, null, 2), "utf8");
console.log(`💾 backup → ${backup}`);

let n = 0;
try {
  await c.query("BEGIN");
  for (const p of plan) {
    // fold fstatus='5' เข้า WHERE = idempotent + กัน race (ถ้ามีใครขยับไปแล้ว → 0 แถว → ข้าม)
    const res = await c.query(
      `update tb_forwarder set fstatus = '6', fdatestatus6 = coalesce(fdatestatus6, now())
       where id = $1 and fstatus = '5'
       returning id, fstatus, ftotalprice`,
      [p.fid],
    );
    if (res.rowCount === 1) n++;
    else console.log(`  ⚠️ fid ${p.fid}: ไม่ได้ขยับ (สถานะเปลี่ยนไปแล้ว?) — ข้าม`);
  }
  // invariant: เงินต้องไม่ขยับ
  const chk = await c.query(
    `select coalesce(sum(ftotalprice::numeric),0) s from tb_forwarder where id = any($1::bigint[])`,
    [plan.map((p) => p.fid)],
  );
  const expect = plan.reduce((a, p) => a + p.sell, 0);
  if (Math.abs(Number(chk.rows[0].s) - expect) > 0.01) throw new Error(`INVARIANT พัง: Σ ขาย ขยับ (${chk.rows[0].s} vs ${expect}) — ROLLBACK`);
  await c.query("COMMIT");
  console.log(`\n✅ ขยับแล้ว ${n} แถว (5 → 6) · Σ ขาย ฿${expect.toFixed(2)} ไม่ขยับ ✓\n`);
} catch (e) {
  await c.query("ROLLBACK");
  console.error("\n✗ ROLLBACK:", e.message, "\n");
  process.exitCode = 1;
}
await c.end();
