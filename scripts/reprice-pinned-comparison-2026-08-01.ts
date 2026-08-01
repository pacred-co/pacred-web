/**
 * reprice-pinned-comparison-2026-08-01.ts — เก็บซากช่องว่าง 10 ชม. ก่อน fix 1d308f55
 *
 * ราก (พิสูจน์จาก audit log · เคส PR187): ระหว่าง 21/07 (CHARGE_HIGHER_BASIS) ถึง
 * 27/07 19:13 (fix "ค่าเทียบที่พนักงานตั้งเองต้องชนะ") การเซฟหน้าวัดขนาดของงานที่
 * **ติ๊กเรทกำหนดเอง + ค่าเทียบกำหนดเอง** ถูกนโยบายเหมารวมทับ → ฐานขัดกับที่พนักงานตัดสิน.
 *
 * sweep prod 2026-08-01: ฐานขัดค่าเทียบ 29 ชิปเม้น — จ่าย/บิลแล้ว 20 (ห้ามแตะ · เงิน frozen)
 * · MOCK ปอน 5 · **เหลือจริง 4 ชิปเม้น / 15 แถว ยังไม่จ่าย** = เป้าของสคริปต์นี้.
 *
 * วิธี: เรียก `computeAndFillForwarderImportRate` (engine ตัวจริง · มี fix แล้ว ·
 * guard ครบ: basis-drift/zero-basis/ชิปเม้นเดียวกันฐานเดียว) ต่อ fid — **ไม่คิดเลขเอง**.
 * ก่อนเขียน เช็คซ้ำว่าไม่มีแถวไหนอยู่บนใบวางบิล live.
 *
 * RUN:
 *   PGPW='<pw>' NODE_PATH=/tmp/so-stub npx tsx --env-file=.env.local scripts/reprice-pinned-comparison-2026-08-01.ts
 *   PGPW='<pw>' NODE_PATH=/tmp/so-stub npx tsx --env-file=.env.local scripts/reprice-pinned-comparison-2026-08-01.ts --apply
 */
import { writeFileSync } from "node:fs";
import pg from "pg";
import { createClient } from "@supabase/supabase-js";
import { computeAndFillForwarderImportRate } from "../lib/forwarder/live-rate";

const APPLY = process.argv.includes("--apply");
if (!process.env.PGPW) { console.error("ต้องส่ง PGPW"); process.exit(1); }

// ชิปเม้นจริงจาก sweep (MOCK ปอนไม่แตะ · billed ไม่แตะ)
// ⚠️ ตัดออก 3 กลุ่ม:
//   52146 — บนใบ live FRI2607-00037 (ยอดบนใบ = สัญญา · รายงาน owner)
//   800206224068 ทั้งครอบครัว (52305+52608-52614) — เคสค้างเก่า: **จ่ายครบ ฿4,980 แล้ว
//     มีใบเสร็จ FRC2607-00024** แค่สถานะค้าง 5 (carryover รอไฟเขียว owner) → เงิน frozen ห้ามแตะ
const FIDS = [
  52720, 52719, 52721, 52722, 52718, // PR079 JYM800122194645 (density 595 → กิโล)
  52382,                             // PR083 710090955942 (253 → กิโล)
];

const pool = new pg.Pool({
  host: "aws-1-ap-southeast-1.pooler.supabase.com",
  port: 5432,
  user: "postgres.yzljakczhwrpbxflnmco",
  password: process.env.PGPW,
  database: "postgres",
  ssl: { rejectUnauthorized: false },
  max: 3,
});

async function main() {
  const { rows: before } = await pool.query(
    `SELECT id, ftrackingchn, userid, fstatus, paydeposit, frefprice, ftotalprice
     FROM tb_forwarder WHERE id = ANY($1) ORDER BY id`, [FIDS]);
  console.log("── ก่อนแก้ ──"); console.table(before);

  // guard 1: ยังไม่จ่าย/บิล
  const paid = before.filter((r) => Number(r.fstatus) >= 6 || r.paydeposit === "1");
  if (paid.length) { console.error(`🛑 มีแถวจ่าย/บิลแล้ว: ${paid.map((r) => r.id).join(",")} — เอาออกจากลิสต์ก่อน`); process.exit(2); }

  // guard 2: ไม่อยู่บนใบวางบิล live
  const { rows: onInv } = await pool.query(
    `SELECT it.forwarder_id, i.doc_no FROM tb_forwarder_invoice_item it
     JOIN tb_forwarder_invoice i ON i.id = it.invoice_id
     WHERE it.forwarder_id = ANY($1) AND COALESCE(i.status,'') <> 'cancelled'`, [FIDS]);
  if (onInv.length) { console.error(`🛑 อยู่บนใบ live:`, onInv); process.exit(2); }

  writeFileSync(`/tmp/backup-pinned-cmp-${Date.now()}.json`, JSON.stringify(before, null, 2));

  if (!APPLY) {
    console.log(`\n(dry-run — จะเรียก engine จริง re-price ${FIDS.length} แถว · guard ทั้งสองผ่านแล้ว · ใส่ --apply)`);
    return;
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
  for (const fid of FIDS) {
    const res = await computeAndFillForwarderImportRate(admin as never, fid);
    console.log(`fid ${fid}: wrote=${res.wrote} reason=${res.reason}${res.total != null ? ` total=${res.total}` : ""}`);
  }

  const { rows: after } = await pool.query(
    `SELECT id, frefprice, ftotalprice FROM tb_forwarder WHERE id = ANY($1) ORDER BY id`, [FIDS]);
  console.log("\n── หลังแก้ ──"); console.table(after);
  const flipped = after.filter((a) => {
    const b = before.find((x) => x.id === a.id)!;
    return a.frefprice !== b.frefprice || a.ftotalprice !== b.ftotalprice;
  });
  console.log(`เปลี่ยน ${flipped.length}/${FIDS.length} แถว ✅ (แถวที่ engine ปฏิเสธ = ดู reason ข้างบน)`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => pool.end());
