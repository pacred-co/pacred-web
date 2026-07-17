/**
 * ════════════════════════════════════════════════════════════════════════
 * คิวตรวจสอบ (tb_check_forwarder) — นับ/ล้างแถวค้าง · งานข้อ 4 (owner 2026-07-17)
 *
 * owner (verbatim): "บางสถานะมัน ส่งแล้ว หรือ รอส่ง มันจะยังไม่ส่งแจ้งชำระใน
 * รอตรวจสอบอีกได้ไงหละครับ มันควรจะเข้าไปแค่ รายการที่จะให้ลูกค้าชำระเงิน"
 *
 * ── ทำไมแถวพวกนี้ค้าง ──────────────────────────────────────────────────
 * คิวนี้มีงานเดียว: `adminCallPriceUser` (actions/admin/forwarder-check.ts)
 * แจ้งชำระเงิน 4→5. มันอ่าน `.eq("fstatus","4")` เท่านั้น →
 *   • แถว fstatus≠4 = แจ้งชำระไม่ได้ตลอดกาล (action มองไม่เห็น ไม่นับทั้ง
 *     สำเร็จ/ผิดพลาด) และไม่เคยถูกลบออกจากคิว (ลบเฉพาะ successfulFids)
 *     → **ค้างถาวร** = อาการที่ owner เห็น
 *   • ต้นตอ = `evaluateReportCntAddCheckStatus` มีแค่ขอบล่าง ('4') ไม่มีขอบบน
 *     → แถว 5/6/7 (เก็บเงินแล้ว) ผ่าน gate เข้าคิวได้
 * โค้ดแก้ที่ต้นตอแล้ว (lib/admin/report-cnt-add-check-gate.ts = ต้องเป็น '4'
 * เป๊ะ) — script นี้ล้าง "หนี้เก่า" ที่เข้าคิวไปก่อนหน้านั้น
 *
 * ── MONEY-SAFETY ───────────────────────────────────────────────────────
 * ลบเฉพาะแถวใน **tb_check_forwarder** (ตารางคิว) เท่านั้น — ไม่แตะ
 * tb_forwarder · ไม่แตะสถานะ · ไม่แตะเงิน. เหมือน `adminRemoveFromCheckQueue`
 * (การยกเลิกคิวปกติของแอดมิน) ทุกประการ.
 *
 * แถวที่ลบ = แถวที่ **แจ้งชำระไม่ได้อยู่แล้ว**:
 *   • fstatus 5/6/7 = แจ้งชำระ/เก็บเงินไปแล้ว → เก็บซ้ำไม่ได้ (ไม่มีเงินหาย)
 *   • fstatus 1/2/3 = ยังไม่ถึงไทย → ยังแจ้งชำระไม่ได้ (เข้าคิวใหม่ได้เมื่อถึง '4')
 *   • orphan       = ไม่มีแถว tb_forwarder แล้ว (ชี้ไปที่ว่าง)
 * แถว fstatus='4' (= รายการที่ *จะ* ให้ลูกค้าชำระเงิน) **ไม่ถูกแตะเลย**
 * → ไม่มีทางทำให้แถวที่ควรเก็บเงินหลุดหาย
 *
 * ── การใช้งาน ──────────────────────────────────────────────────────────
 *   node scripts/forwarder-check-queue-backfill-2026-07-17.mjs            # dry-run (default)
 *   node scripts/forwarder-check-queue-backfill-2026-07-17.mjs --apply    # ลบจริง (owner เคาะก่อน)
 * --apply จะเขียน backup JSON ก่อนเสมอ + ทำใน transaction
 * ════════════════════════════════════════════════════════════════════════
 */
import pg from "pg";
import fs from "node:fs";

const APPLY = process.argv.includes("--apply");

// สถานะเดียวที่คิวนี้ทำงานด้วยได้ — ตรงกับ adminCallPriceUser `.eq("fstatus","4")`
// และ REPORT_CNT_ADD_CHECK_MIN/MAX_FSTATUS ใน lib/admin/report-cnt-add-check-gate.ts
const BILLABLE_FSTATUS = "4";

const FSTATUS_LABEL = {
  "1": "รอเข้าโกดังจีน",
  "2": "ถึงโกดังจีนแล้ว",
  "3": "กำลังส่งมาไทย",
  "4": "ถึงไทยแล้ว",
  "5": "รอชำระเงิน",
  "6": "เตรียมส่ง",
  "7": "ส่งแล้ว",
};

const c = new pg.Client({
  host: "aws-1-ap-southeast-1.pooler.supabase.com",
  port: 5432,
  user: "postgres.yzljakczhwrpbxflnmco",
  password: process.env.SUPABASE_DB_PASSWORD,
  database: "postgres",
  ssl: { rejectUnauthorized: false },
});

if (!process.env.SUPABASE_DB_PASSWORD) {
  console.error("✗ ต้องตั้ง SUPABASE_DB_PASSWORD ก่อน (⚠️ .env.local STALE — ห้ามใช้)");
  process.exit(1);
}

await c.connect();

const { rows } = await c.query(`
  SELECT cf."fID"           AS qfid,
         cf."date"          AS queued_at,
         cf."adminID"       AS queued_by,
         f.id               AS fid,
         f.fstatus,
         f.fidorco,
         f.userid,
         f.ftrackingchn,
         f.fcabinetnumber,
         f.ftotalprice,
         f.ftransportprice
    FROM tb_check_forwarder cf
    LEFT JOIN tb_forwarder f ON f.id = cf."fID"
   ORDER BY f.fstatus NULLS FIRST, cf."date" DESC NULLS LAST`);

// ── จัดกลุ่ม ────────────────────────────────────────────────────────────
const keep = [];        // fstatus='4' → แจ้งชำระได้ = ห้ามแตะ
const stuckByStatus = new Map(); // fstatus → rows (แจ้งชำระไม่ได้ → ค้างถาวร)
const orphans = [];     // ไม่มีแถว tb_forwarder

for (const r of rows) {
  if (r.fid === null) { orphans.push(r); continue; }
  const s = String(r.fstatus ?? "").trim();
  if (s === BILLABLE_FSTATUS) { keep.push(r); continue; }
  const key = s === "" ? "(ว่าง)" : s;
  const bucket = stuckByStatus.get(key);
  if (bucket) bucket.push(r);
  else stuckByStatus.set(key, [r]);
}

const stuckRows = [];
for (const arr of stuckByStatus.values()) stuckRows.push(...arr);

// ── รายงาน ──────────────────────────────────────────────────────────────
const money = (n) => Number(n ?? 0).toLocaleString("th-TH", { minimumFractionDigits: 2 });

console.log(`\n════════ คิวตรวจสอบ tb_check_forwarder — prod ${new Date().toISOString().slice(0, 10)} ════════`);
console.log(`โหมด: ${APPLY ? "🔴 APPLY (ลบจริง)" : "🔍 DRY-RUN (อ่านอย่างเดียว)"}`);
console.log(`\nคิวทั้งหมด: ${rows.length} แถว`);

console.log(`\n── ✅ เก็บไว้ (fstatus='${BILLABLE_FSTATUS}' ${FSTATUS_LABEL[BILLABLE_FSTATUS]} = แจ้งชำระได้ · ห้ามแตะ) : ${keep.length} ──`);
for (const r of keep) {
  console.log(`  #${r.fid} · ${r.userid} · ตู้ ${r.fcabinetnumber ?? "-"} · ${r.ftrackingchn ?? "-"} · ค่านำเข้า ฿${money(r.ftotalprice)} · ค่าส่งไทย ฿${money(r.ftransportprice)}`);
}

console.log(`\n── 🧹 ค้าง = แจ้งชำระไม่ได้ (ต้องล้างออกจากคิว) : ${stuckRows.length} ──`);
const sortedKeys = [...stuckByStatus.keys()].sort();
for (const k of sortedKeys) {
  const arr = stuckByStatus.get(k);
  const label = FSTATUS_LABEL[k] ?? "ไม่รู้จัก";
  const why =
    k === "(ว่าง)"      ? "ไม่มีสถานะ"
    : Number(k) > 4     ? "แจ้งชำระ/เก็บเงินไปแล้ว → เก็บซ้ำไม่ได้"
    :                     "ยังไม่ถึงไทย → ยังแจ้งชำระไม่ได้ (เข้าคิวใหม่ได้เมื่อถึง '4')";
  console.log(`\n  ▸ fstatus='${k}' (${label}) : ${arr.length} แถว — ${why}`);
  for (const r of arr) {
    console.log(`      #${r.fid} · ${r.userid} · ตู้ ${r.fcabinetnumber ?? "-"} · ${r.ftrackingchn ?? "-"} · เข้าคิวเมื่อ ${String(r.queued_at ?? "-").slice(0, 10)} โดย ${r.queued_by ?? "-"}`);
  }
}

if (orphans.length > 0) {
  console.log(`\n  ▸ orphan (ไม่มีแถว tb_forwarder) : ${orphans.length} แถว — ชี้ไปที่ว่าง`);
  for (const r of orphans) console.log(`      fID=${r.qfid} · เข้าคิวเมื่อ ${String(r.queued_at ?? "-").slice(0, 10)} โดย ${r.queued_by ?? "-"}`);
}

const toDelete = [...stuckRows.map((r) => r.qfid), ...orphans.map((r) => r.qfid)];

console.log(`\n════════ สรุป ════════`);
console.log(`  คิวทั้งหมด          : ${rows.length}`);
console.log(`  ✅ เก็บไว้ (fstatus=4) : ${keep.length}   ← แจ้งชำระได้ · ไม่แตะ`);
console.log(`  🧹 ค้าง (fstatus≠4)   : ${stuckRows.length}`);
console.log(`  🧹 orphan            : ${orphans.length}`);
console.log(`  ─────────────────────`);
console.log(`  รวมที่จะลบออกจากคิว   : ${toDelete.length}`);
console.log(`  หลังล้าง คิวจะเหลือ    : ${keep.length} แถว`);

if (!APPLY) {
  console.log(`\n🔍 DRY-RUN — ไม่มีการเขียน DB. ให้ owner เคาะก่อน แล้วรันซ้ำด้วย --apply`);
  await c.end();
  process.exit(0);
}

// ── APPLY (owner เคาะแล้วเท่านั้น) ──────────────────────────────────────
if (toDelete.length === 0) {
  console.log(`\n✓ ไม่มีอะไรต้องลบ`);
  await c.end();
  process.exit(0);
}

const backupPath = `./backup-forwarder-check-queue-${new Date().toISOString().slice(0, 10)}.json`;
fs.writeFileSync(backupPath, JSON.stringify({ deleted_at: new Date().toISOString(), rows: [...stuckRows, ...orphans] }, null, 2), "utf8");
console.log(`\n💾 backup → ${backupPath}`);

try {
  await c.query("BEGIN");
  const res = await c.query(`DELETE FROM tb_check_forwarder WHERE "fID" = ANY($1::bigint[])`, [toDelete]);
  // INVARIANT: ลบได้ต้องเท่ากับที่วางแผน · และแถว fstatus=4 ต้องอยู่ครบ
  const { rows: after } = await c.query(`
    SELECT COUNT(*)::int AS n FROM tb_check_forwarder cf
      JOIN tb_forwarder f ON f.id = cf."fID" WHERE f.fstatus = $1`, [BILLABLE_FSTATUS]);
  if (after[0].n !== keep.length) {
    throw new Error(`INVARIANT FAIL — แถว fstatus=4 เหลือ ${after[0].n} ควรเป็น ${keep.length} → ROLLBACK`);
  }
  await c.query("COMMIT");
  console.log(`\n✅ ลบแล้ว ${res.rowCount} แถว · คิวเหลือ ${after[0].n} แถว (fstatus=4 ครบ ✓)`);
} catch (e) {
  await c.query("ROLLBACK");
  console.error(`\n✗ ROLLBACK — ${e.message}`);
  process.exitCode = 1;
}

await c.end();
