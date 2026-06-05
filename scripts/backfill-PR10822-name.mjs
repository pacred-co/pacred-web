/**
 * 2026-06-05 ภูม flag — sync tb_users.userName/userLastName ของ PR10822
 * ให้ตรงกับ profiles.first_name/last_name (= "Test Poom" ที่ ภูม กรอกไว้)
 *
 * Root cause: updateProfileBasic เขียน profiles อย่างเดียว · tb_users ค้าง
 * "dev dev" จากตอน register. Fix applied in commit ก่อนหน้านี้ (dual-write).
 * Script นี้ backfill row นี้ row เดียวให้ sync.
 *
 * Default = dry-run · pass --apply เพื่อ commit จริง.
 */
import { createClient } from "@supabase/supabase-js";

const APPLY = process.argv.includes("--apply");
const USER_ID = "PR10822";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("[backfill] missing env vars");
  process.exit(1);
}
const admin = createClient(url, key, { auth: { persistSession: false } });

console.log(`\n${APPLY ? "🔴 APPLY" : "🟡 DRY-RUN"} · sync ${USER_ID} name (profiles → tb_users)\n`);

// 1. Load both rows
const { data: prof, error: profErr } = await admin
  .from("profiles")
  .select("id, member_code, first_name, last_name, phone, email")
  .eq("member_code", USER_ID)
  .maybeSingle();
const { data: u, error: uErr } = await admin
  .from("tb_users")
  .select("userID, userName, userLastName, userTel, userEmail")
  .eq("userID", USER_ID)
  .maybeSingle();

if (profErr) { console.error("[profiles]", profErr.message); process.exit(1); }
if (uErr) { console.error("[tb_users]", uErr.message); process.exit(1); }
if (!prof || !u) {
  console.error(`❌ ไม่เจอ row · profiles=${!!prof} · tb_users=${!!u}`);
  process.exit(1);
}

console.log("─── profiles snapshot ───");
console.log(`  member_code=${prof.member_code}  first_name=${prof.first_name}  last_name=${prof.last_name}  phone=${prof.phone}  email=${prof.email ?? "—"}`);
console.log("\n─── tb_users snapshot (BEFORE) ───");
console.log(`  userID=${u.userID}  userName=${u.userName}  userLastName=${u.userLastName}  userTel=${u.userTel}  userEmail=${u.userEmail ?? "—"}`);

// 2. Compute diff
const newName = prof.first_name ?? "";
const newLast = prof.last_name ?? "";
const newTel  = prof.phone ?? u.userTel;
const newMail = prof.email ?? u.userEmail ?? "";

const diff = [];
if (u.userName !== newName)         diff.push(`  userName: "${u.userName}" → "${newName}"`);
if (u.userLastName !== newLast)     diff.push(`  userLastName: "${u.userLastName}" → "${newLast}"`);
if (u.userTel !== newTel)           diff.push(`  userTel: "${u.userTel}" → "${newTel}"`);
if ((u.userEmail ?? "") !== newMail) diff.push(`  userEmail: "${u.userEmail ?? ""}" → "${newMail}"`);

if (diff.length === 0) {
  console.log("\n✓ profiles ↔ tb_users ตรงกันอยู่แล้ว · ไม่ต้อง backfill");
  process.exit(0);
}

console.log("\n─── DIFF (จะเขียนทับ) ───");
diff.forEach(d => console.log(d));

if (!APPLY) {
  console.log("\n🟡 DRY-RUN — ใช้ --apply เพื่อ commit");
  process.exit(0);
}

// 3. Apply
const { error: upErr } = await admin
  .from("tb_users")
  .update({
    userName:     newName,
    userLastName: newLast,
    userTel:      newTel,
    userEmail:    newMail,
  })
  .eq("userID", USER_ID);

if (upErr) {
  console.error("\n❌ UPDATE failed:", upErr.message);
  process.exit(1);
}

console.log(`\n✅ tb_users ${USER_ID} synced · ภูม รีเฟรช /admin/customers + /profile → จะเป็น "Test Poom" แล้ว`);
