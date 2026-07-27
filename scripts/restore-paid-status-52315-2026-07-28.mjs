/**
 * restore-paid-status-52315-2026-07-28.mjs — คืนสถานะ "จ่ายแล้ว" ให้ 52315 (PR189)
 *
 * ทำไม: ลูกค้าโอนสลิปใบเดียว ฿3,493.50 (ธ.กรุงเทพ 13/07 16:05) = 52309 + 52315.
 * ระบบบันทึกส่วนของ **52315 ฿1,734.43 ไปแล้ว** (tb_wallet_hs 106474/106475 · status=2
 * อนุมัติ 27/07 22:07 · ไม่เคยถูกย้อน) แต่คืนนั้นพนักงาน void เอกสาร "ออกผิด" แล้ว
 * ดันสถานะกลับ → แจ้งชำระใหม่ → 52315 ไปนั่งที่ "รอชำระเงิน" ทั้งที่เงินเข้าแล้ว
 * ⇒ เสี่ยงเก็บซ้ำ + ทำให้พนักงานกดชำระสลิปใบนี้ไม่ได้ทั้งชุด.
 *
 * สคริปต์นี้ **ไม่แตะเงินเลย** — เขียนอย่างเดียวคือ fstatus '5' → '6' ให้ตรงกับผลของ
 * การอนุมัติสลิปที่เกิดขึ้นจริงแล้ว (cascade ตอน approve เคลียร์ paydeposit +
 * stamp fdatestatus6 ไว้ให้แล้วตั้งแต่ 22:07 · ขาดแค่ fstatus ที่ถูกดันกลับทีหลัง).
 *
 * ⚠️ เอกสารของออเดอร์นี้ถูก void ไปแล้ว (FRI2607-00049 · FRG2607-00085) → หลังรันต้อง
 * ออกเอกสารชุดใหม่ให้ลูกค้า (เป็นเหตุผลที่พนักงาน void ตั้งแต่แรก).
 *
 * dry-run ก่อนเสมอ · --apply เขียนจริง (backup ก่อน) · re-run = 0.
 * RUN: node --env-file=.env.local scripts/restore-paid-status-52315-2026-07-28.mjs [--apply]
 */
import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";

const APPLY = process.argv.includes("--apply");
const FID = 52315;

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

async function main() {
  const { data: f, error } = await admin
    .from("tb_forwarder")
    .select("id, userid, fstatus, paydeposit, ftotalprice, ftransportprice, fdatestatus6, ftrackingchn")
    .eq("id", FID)
    .maybeSingle();
  if (error) throw error;
  if (!f) { console.log("ไม่พบออเดอร์"); return; }

  // พิสูจน์ว่ามีการชำระที่ settled จริง ก่อนคืนสถานะ (ห้ามคืนสถานะให้งานที่ยังไม่จ่าย)
  const { data: pays } = await admin
    .from("tb_wallet_hs")
    .select("id, amount, status, typenew, reforder2")
    .eq("reforder", String(FID))
    .in("typenew", ["5", "6"])
    .eq("status", "2");
  const settled = (pays ?? []).reduce((s, r) => s + Number(r.amount ?? 0), 0);

  console.log(`ออเดอร์ #${FID} (${f.userid}) · ${f.ftrackingchn}`);
  console.log(`  สถานะปัจจุบัน = ${f.fstatus} (5 = รอชำระเงิน · 6 = จ่ายแล้ว/เตรียมส่ง)`);
  console.log(`  paydeposit = ${JSON.stringify(f.paydeposit)} · fdatestatus6 = ${f.fdatestatus6 ?? "—"}`);
  console.log(`  การชำระที่ตัดจ่ายแล้ว: ${(pays ?? []).map((p) => `#${p.id} ฿${p.amount}`).join(", ") || "ไม่มี"} → รวม ฿${settled.toFixed(2)}`);

  if (settled <= 0) {
    console.log("\n🛑 ไม่มีการชำระที่ตัดจ่ายแล้ว — ห้ามคืนสถานะ (ออเดอร์นี้ยังไม่จ่ายจริง)");
    return;
  }
  if (String(f.fstatus) !== "5") {
    console.log(`\n✅ สถานะไม่ใช่ 5 อยู่แล้ว (${f.fstatus}) — ไม่ต้องทำอะไร`);
    return;
  }

  console.log(`\nแผน: fstatus '5' → '6' (สถานะอย่างเดียว · ไม่แตะเงิน/ราคา/เอกสาร)`);
  if (!APPLY) { console.log("\n(dry-run — ใส่ --apply เพื่อเขียนจริง)"); return; }

  writeFileSync(`/tmp/backup-restore-52315-2026-07-28.json`, JSON.stringify({ forwarder: f, pays }, null, 2));
  console.log("📦 backup → /tmp/backup-restore-52315-2026-07-28.json");

  const { data: upd, error: uErr } = await admin
    .from("tb_forwarder")
    .update({ fstatus: "6", adminidupdate: "sys-fix" })
    .eq("id", FID)
    .eq("fstatus", "5")               // TOCTOU: เขียนเฉพาะเมื่อยังเป็น 5 ตามที่เห็นตอน scan
    .select("id, fstatus");
  if (uErr) throw uErr;
  console.log(`✅ อัปเดต ${upd?.length ?? 0} แถว → fstatus = ${upd?.[0]?.fstatus}`);
  console.log("รันซ้ำเพื่อยืนยันว่าไม่มีอะไรให้ทำแล้ว");
}
main().catch((e) => { console.error(e); process.exit(1); });
