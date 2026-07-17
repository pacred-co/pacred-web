// READ-ONLY — ตรวจว่าลิงก์ "→ ตัดจ่ายตู้นี้" จะพาไปแท็บที่ "เจอตู้จริง" ไหม
// (ใช้ SOT ตัวเดียวกับหน้ารายงานตู้: isContainerInBucket)
//   npx tsx scripts/probe-rollup-paypage-2026-07-17.ts
import pg from "pg";
import { isContainerInBucket } from "../lib/admin/report-cnt-bucket";

const CABS = ["GZS260620-2", "GZE260701-1"];

async function main() {
  const c = new pg.Client({
    host: "aws-1-ap-southeast-1.pooler.supabase.com", port: 5432,
    user: "postgres.yzljakczhwrpbxflnmco", password: "DqOzfEZVXfMHIryz",
    database: "postgres", ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  console.log("\n════ ตู้ของใบ INV-20260708-0002 อยู่แท็บไหน ════");
  for (const cab of CABS) {
    const { rows } = await c.query(
      `SELECT min(fstatus) minf, max(fstatus) maxf, count(*)::int n,
              max(fdatecontainerclose::date::text) closed
         FROM tb_forwarder WHERE fcabinetnumber = $1`, [cab]);
    const { minf, maxf, n, closed } = rows[0];
    const page = isContainerInBucket(minf ?? "", "succeed") ? "succeed" : "waiting";
    // ช่วงวันที่ default ของแท็บ succeed = ย้อนหลัง 90 วัน
    const days = closed ? Math.round((Date.now() - new Date(closed).getTime()) / 86400000) : null;
    console.log(
      `  ${cab.padEnd(14)} MIN(fstatus)=${minf} MAX=${maxf} (${n} แถว) · ปิดตู้ ${closed} (${days} วันก่อน)\n` +
      `     → payPage = "${page}"` +
      (page === "succeed"
        ? ` · อยู่ในช่วง 90 วัน default? ${days != null && days <= 90 ? "ใช่ ✓ เจอแน่" : "ไม่ ✗ ต้องขยายช่วงวันที่"}`
        : " · แท็บ default ของหน้า = เจอเลย ✓"),
    );
    console.log(
      `     ลิงก์เดิม (?actionPay=1 ไม่ส่ง page) → แท็บ waiting → ${page === "waiting" ? "เจอ" : "🔴 ไม่เจอตู้นี้ = ติ๊กไม่ติด"}`,
    );
  }
  await c.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
