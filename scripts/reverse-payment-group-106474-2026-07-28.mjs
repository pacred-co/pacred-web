/**
 * reverse-payment-group-106474-2026-07-28.mjs — ย้อน "ทั้งชุด" ของสลิปรวม (PR189)
 *
 * owner 2026-07-28: *"ถ้ากดแยกแล้วเอกสาร ทั้งใบวางบิลและใบเสร็จจะรวมกันทั้งหมดได้ไง
 * มันก็แยกกันดิ"* — ถูกต้อง. ลูกค้าโอนสลิปใบเดียว ฿3,493.50 ให้ชิปเม้นเดียว
 * (KY984284755 = 52309 + KY984284755-2/2 = 52315) ⇒ ต้องได้ **ใบวางบิล 1 ใบ +
 * ใบเสร็จ 1 ใบ ยอด ฿3,493.50** ไม่ใช่แยกคนละใบตามแทรคกิ้ง.
 *
 * ปัญหา: ระบบบันทึกไว้ครึ่งเดียว (ชุด #106474 = ฿1,734.43 เฉพาะ 52315) → ถ้าไปกด
 * จ่ายส่วนที่เหลือแยก จะได้เอกสาร 2 ใบคนละยอด = ผิดจากที่ลูกค้าโอนมา.
 *
 * สคริปต์นี้ = "ย้อนทั้งชุด" (ที่ยังไม่มีปุ่มในระบบ) เพื่อให้กดจ่ายใหม่ทั้งชิปเม้นรอบเดียว:
 *   1. หัวบิล 106474 (แถวที่ถือสลิป)      status 2 → 3
 *   2. ลูกทุกแถวใต้หัวบิล (reforder2=106474) status 2 → 3
 *   3. ลบสะพาน tb_wallet_paydeposit ของชุดนี้ (ไม่งั้นค้างเป็น "จ่ายแล้ว")
 *   4. ออเดอร์ทุกใบในชุด → fstatus '5' (รอชำระเงิน)
 *
 * 💰 ไม่มีการคืนเงินเข้ากระเป๋า — สลิปนี้โอนตรงเข้าธนาคาร (depositnamebank=KBANK-…)
 *    เงินยังอยู่ในบัญชีบริษัทเหมือนเดิม แค่ยกเลิก "การบันทึก" เพื่อบันทึกใหม่ให้ครบใบเดียว.
 * ใบเสร็จของชุดนี้ถูก void ไปแล้วตั้งแต่ 27/07 22:45 → ไม่มีอะไรต้องยกเลิกเพิ่ม.
 *
 * dry-run ก่อนเสมอ · --apply เขียนจริง (backup ก่อน) · re-run = 0.
 * RUN: node --env-file=.env.local scripts/reverse-payment-group-106474-2026-07-28.mjs [--apply]
 */
import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";

const APPLY = process.argv.includes("--apply");
const HEADER_ID = 106474;

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

async function main() {
  const { data: header, error: hErr } = await admin
    .from("tb_wallet_hs")
    .select("id, userid, type, typenew, status, amount, depositnamebank, imagesslip, dateslip")
    .eq("id", HEADER_ID)
    .maybeSingle();
  if (hErr) throw hErr;
  if (!header) { console.log("ไม่พบหัวบิล"); return; }

  const { data: children } = await admin
    .from("tb_wallet_hs")
    .select("id, status, amount, reforder")
    .eq("reforder2", String(HEADER_ID));

  const { data: links } = await admin
    .from("tb_wallet_paydeposit")
    .select("id, whid, hno")
    .eq("whid", HEADER_ID);

  const fids = [...new Set([
    ...(children ?? []).map((c) => String(c.reforder ?? "").trim()).filter(Boolean),
    ...(links ?? []).map((l) => String(l.hno ?? "").trim()).filter(Boolean),
  ])];

  const { data: fwds } = await admin
    .from("tb_forwarder")
    .select("id, fstatus, ftotalprice, ftransportprice, ftrackingchn")
    .in("id", fids.map(Number));

  console.log(`ชุดการชำระ #${HEADER_ID} (${header.userid})`);
  console.log(`  หัวบิล: ฿${header.amount} · สถานะ ${header.status} · เข้าบัญชี ${header.depositnamebank || "—"} · สลิป ${header.imagesslip ? "มี" : "ไม่มี"}`);
  console.log(`  ลูกในชุด: ${(children ?? []).map((c) => `#${c.id} ฿${c.amount} (ออเดอร์ ${c.reforder}) st${c.status}`).join(", ") || "—"}`);
  console.log(`  สะพาน paydeposit: ${(links ?? []).map((l) => `#${l.id}→ออเดอร์ ${l.hno}`).join(", ") || "—"}`);
  console.log(`  ออเดอร์ที่กระทบ:`);
  for (const f of fwds ?? []) {
    console.log(`    #${f.id} ${f.ftrackingchn} · สถานะ ${f.fstatus} → 5 · ยอด ฿${(Number(f.ftotalprice) + Number(f.ftransportprice)).toFixed(2)}`);
  }
  const isWallet = String(header.depositnamebank ?? "").trim().toUpperCase() === "WALLET";
  console.log(`  คืนเงินเข้ากระเป๋า: ${isWallet ? "🔴 ต้องคืน (ตัดจากกระเป๋า)" : "ไม่ต้อง (โอนตรงธนาคาร — เงินยังอยู่ในบัญชี)"}`);

  if (String(header.status) !== "2") {
    console.log(`\n✅ หัวบิลไม่ได้อยู่สถานะ 2 แล้ว (${header.status}) — ย้อนไปแล้ว ไม่ต้องทำอะไร`);
    return;
  }
  if (isWallet) {
    console.log("\n🛑 ชุดนี้ตัดจากกระเป๋า — สคริปต์นี้ไม่รองรับการคืนเงิน หยุดไว้ก่อน");
    return;
  }
  if (!APPLY) { console.log("\n(dry-run — ใส่ --apply เพื่อเขียนจริง)"); return; }

  writeFileSync("/tmp/backup-reverse-group-106474-2026-07-28.json",
    JSON.stringify({ header, children, links, fwds }, null, 2));
  console.log("📦 backup → /tmp/backup-reverse-group-106474-2026-07-28.json");

  // 1+2. ย้อนหัวบิล + ลูกทั้งหมด (TOCTOU: เฉพาะที่ยัง status=2)
  const note = `ย้อนทั้งชุด #${HEADER_ID} เพื่อบันทึกใหม่รวมทั้งชิปเม้น (สลิปใบเดียว ฿3,493.50)`;
  for (const id of [HEADER_ID, ...(children ?? []).map((c) => c.id)]) {
    const { data, error } = await admin
      .from("tb_wallet_hs")
      .update({ status: "3", adminidupdate: "sys-fix", note })
      .eq("id", id).eq("status", "2").select("id");
    if (error) throw error;
    console.log(`  wallet #${id} → status 3 (${data?.length ?? 0} แถว)`);
  }

  // 3. ลบสะพาน paydeposit (ไม่งั้นออเดอร์ค้างเป็น "จ่ายแล้ว" ในสายตา guard)
  for (const l of links ?? []) {
    const { error } = await admin.from("tb_wallet_paydeposit").delete().eq("id", l.id);
    if (error) throw error;
    console.log(`  ลบสะพาน paydeposit #${l.id}`);
  }

  // 4. ออเดอร์กลับไปรอชำระเงิน
  for (const f of fwds ?? []) {
    const { data, error } = await admin
      .from("tb_forwarder")
      .update({ fstatus: "5", paydeposit: "", adminidupdate: "sys-fix" })
      .eq("id", f.id).in("fstatus", ["6", "5"]).select("id, fstatus");
    if (error) throw error;
    console.log(`  ออเดอร์ #${f.id} → fstatus ${data?.[0]?.fstatus ?? "?"}`);
  }
  console.log("\n✅ ย้อนทั้งชุดแล้ว — ทั้งชิปเม้นกลับมา 'รอชำระเงิน' พร้อมบันทึกใหม่รวมใบเดียว");
}
main().catch((e) => { console.error(e); process.exit(1); });
