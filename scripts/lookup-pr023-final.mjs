/**
 * 2026-06-04 (ภูม fix) — หา Pacred user ที่ตรงกับ legacy PCS ID=23 (PCS1395)
 * + ID=99 (PCS89) เพื่อ MOMO commit.
 *
 * MOMO ใช้ `user_code` = legacy `tb_users.ID` (integer PK) ไม่ใช่ userID.
 * MOMO ส่ง "023" → ลูกค้านี้คือคนที่ใน PCS เคยมี ID=23 (= PCS1395)
 * MOMO ส่ง "99"  → ลูกค้านี้คือคนที่ใน PCS เคยมี ID=99 (= PCS89)
 *
 * พอ Pacred migrate มา code ก็ rename เป็น PR ใหม่ — เราเทียบจากเบอร์โทร
 * ที่ PCS เก็บไว้ (0831915627 + 0843369559) เพื่อหา Pacred userID ปัจจุบัน.
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const admin = createClient(url, key, { auth: { persistSession: false } });

const lookups = [
  { momoCode: "023", legacyId: 23, legacyUserId: "PCS1395", phone: "0831915627" },
  { momoCode: "99",  legacyId: 99, legacyUserId: "PCS89",   phone: "0843369559" },
];

for (const L of lookups) {
  console.log(`\n─── MOMO user_code="${L.momoCode}" → legacy ID=${L.legacyId} (${L.legacyUserId}) · เบอร์ ${L.phone} ───\n`);

  // 1. หาด้วยเบอร์ตรงๆ
  const { data: byPhone, error: phErr } = await admin
    .from("tb_users")
    .select("userID, userName, userLastName, userTel, userEmail, userCompany, userActive, channel, adminIDSale")
    .eq("userTel", L.phone)
    .limit(5);
  if (phErr) console.error("[phone exact]", phErr.message);
  if (byPhone?.length) {
    console.log(`  ✅ Pacred match by phone (${byPhone.length} hit):`);
    for (const u of byPhone) {
      console.log(
        `     userID=${u.userID}  ${u.userName ?? ""} ${u.userLastName ?? ""}` +
        `  เบอร์ ${u.userTel ?? "—"}  active=${u.userActive ?? "—"}  channel=${u.channel ?? "—"}` +
        (u.userCompany ? `  company="${u.userCompany}"` : ""),
      );
    }
  } else {
    console.log("  ⚠️  ไม่เจอเบอร์ตรงๆ");
  }

  // 2. หา legacy code เป็น userID ตรงๆ (เผื่อ Pacred เก็บไว้แบบ raw)
  const { data: byLegacy, error: lErr } = await admin
    .from("tb_users")
    .select("userID, userName, userLastName, userTel, userActive")
    .eq("userID", L.legacyUserId)
    .maybeSingle();
  if (lErr) console.error("[legacy code]", lErr.message);
  if (byLegacy) {
    console.log(
      `  🔍 Pacred ยังเก็บ userID=${L.legacyUserId} ตรงๆด้วย:` +
      ` ${byLegacy.userName ?? ""} · เบอร์ ${byLegacy.userTel ?? "—"}`,
    );
  }

  // 3. หา fuzzy partial (last 9 digits) เผื่อ format เบอร์ต่าง
  const last9 = L.phone.replace(/^0/, "");
  const { data: byPartial } = await admin
    .from("tb_users")
    .select("userID, userName, userLastName, userTel")
    .ilike("userTel", `%${last9}`)
    .limit(5);
  if (byPartial?.length) {
    const exact = new Set((byPhone ?? []).map((u) => u.userID));
    const extras = byPartial.filter((u) => !exact.has(u.userID));
    if (extras.length > 0) {
      console.log(`  🔎 partial match (last 9 digits):`);
      for (const u of extras) {
        console.log(`     userID=${u.userID}  ${u.userName ?? ""}  เบอร์ ${u.userTel ?? "—"}`);
      }
    }
  }
}

console.log("\n✓ done.  Next step: ภูม decide rename (legacy_code → matched Pacred userID)");
console.log("   หรือ create-new ถ้า Pacred ยังไม่มี.");
