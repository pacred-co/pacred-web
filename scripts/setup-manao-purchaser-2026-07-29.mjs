// owner 2026-07-29: "เพิ่มมะนาวให้มอบหมายจัดซื้อได้ + ทุกช่องว่าง → มะนาว"
// มะนาว = เบญจพร รักษายศ (modern admin · profiles 54adf629-d0fb-442f-bace-657111b0ebf8 · super)
//   → ไม่มีใน tb_admin เลยไม่ขึ้น dropdown listActiveAdmins (tb_admin active).
// ทำ 2 อย่าง: (1) สร้าง tb_admin row (มะนาว · active · ไม่ใช่ sales/cs) เลียนแบบ ensureLegacyAdminRow
//            (2) backfill adminidpurchaser IN ('', <id ตัดสั้นเดิม>) → adminID ใหม่
// dry-run default · --apply เขียนจริง (backup ก่อน).
import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";

const APPLY = process.argv.includes("--apply");
const MANAO_PROFILE = "54adf629-d0fb-442f-bace-657111b0ebf8";
const OLD_TRUNC = MANAO_PROFILE.slice(0, 20); // "54adf629-d0fb-442f-b" (ออเดอร์เดิม P22374/75)
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// เบญจพร profiles → login id (ตั้ง adminID ให้สัมพันธ์ · กัน bridge สร้างซ้ำภายหลัง)
const { data: prof } = await sb
  .from("profiles")
  .select("id, first_name, last_name, admin_login_id, employee_code")
  .eq("id", MANAO_PROFILE)
  .maybeSingle();
if (!prof) {
  console.error("ไม่พบ profiles ของมะนาว");
  process.exit(1);
}
const login = (prof.admin_login_id ?? "").trim();
const ADMIN_ID = login ? (login.startsWith("admin_") ? login : `admin_${login}`) : "admin_manao";
console.log("มะนาว =", prof.first_name, prof.last_name, "· admin_login_id =", JSON.stringify(login), "→ tb_admin.adminID =", ADMIN_ID);

// มี tb_admin แล้วไหม
const { data: existing } = await sb.from("tb_admin").select("adminID, adminStatusA").eq("adminID", ADMIN_ID).maybeSingle();
console.log("tb_admin row มีอยู่แล้ว?", existing ?? "ไม่มี (จะสร้างใหม่)");

// นับ order ที่จะ backfill (ช่องว่าง + id ตัดสั้นเดิม)
async function countBy(val) {
  const { count } = await sb.from("tb_header_order").select("*", { count: "exact", head: true }).eq("adminidpurchaser", val);
  return count ?? 0;
}
const nEmpty = await countBy("");
const nOld = await countBy(OLD_TRUNC);
console.log(`\nbackfill → adminidpurchaser='${ADMIN_ID}':  ว่าง('')=${nEmpty}  +  เดิม('${OLD_TRUNC}')=${nOld}  =  ${nEmpty + nOld} ออเดอร์`);

if (!APPLY) {
  console.log("\n[DRY-RUN] ยังไม่เขียน. ใส่ --apply เพื่อสร้าง tb_admin + backfill จริง.");
  process.exit(0);
}

// ── APPLY ──
// (1) สร้าง tb_admin row (clone template active row เพื่อคลุม NOT-NULL cols) ถ้ายังไม่มี
if (!existing) {
  const { data: tmpl } = await sb.from("tb_admin").select("*").eq("adminStatusA", "1").limit(1).maybeSingle();
  if (!tmpl) { console.error("no template tb_admin row"); process.exit(1); }
  const { data: maxRow } = await sb.from("tb_admin").select("ID").order("ID", { ascending: false }).limit(1).maybeSingle();
  const nextId = (Number(maxRow?.ID) || 0) + 1;
  const { data: telFree } = await sb.from("tb_admin").select("adminID").eq("adminTel", "").limit(1).maybeSingle();
  const row = {
    ...tmpl,
    ID: nextId,
    adminID: ADMIN_ID,
    adminName: prof.first_name || "เบญจพร",
    adminLastName: prof.last_name || "รักษายศ",
    adminEmail: `${ADMIN_ID}@pacred.co.th`,
    adminNickname: "มะนาว",
    adminTel: telFree ? `na-${nextId}` : "",
    adminStatusA: "1",
    adminStatusSale: "0",
    adminStatusCS: "0",
    adminDel: "0",
    adminIDCreate: "system",
    adminPicture: "",
    adminPass: "",
    bearer_token: "",
    adminLineTokenNotify: "",
    adminEmailOrg: 0,
    adminTelOrg: 0,
    salary: 0,
    nationalIDCard: "",
    nationalIDCardFile: "",
    copyHouseRegistrationFile: "",
    resumeFile: "",
  };
  const { error: insErr } = await sb.from("tb_admin").insert(row);
  if (insErr) { console.error("insert tb_admin failed:", insErr.message); process.exit(1); }
  console.log(`✅ สร้าง tb_admin ${ADMIN_ID} (มะนาว) แล้ว`);
} else {
  await sb.from("tb_admin").update({ adminStatusA: "1" }).eq("adminID", ADMIN_ID);
  console.log(`✅ tb_admin ${ADMIN_ID} active แล้ว`);
}

// (2) backup + backfill
const changed = [];
for (const val of ["", OLD_TRUNC]) {
  let from = 0;
  for (;;) {
    const { data } = await sb.from("tb_header_order").select("id, hno, adminidpurchaser").eq("adminidpurchaser", val).range(from, from + 999);
    if (!data || !data.length) break;
    changed.push(...data);
    if (data.length < 1000) break;
    from += 1000;
  }
}
writeFileSync(`scripts/_backup-manao-purchaser-2026-07-29.json`, JSON.stringify(changed, null, 2));
console.log(`backup ${changed.length} แถว → scripts/_backup-manao-purchaser-2026-07-29.json`);

for (let i = 0; i < changed.length; i += 200) {
  const ids = changed.slice(i, i + 200).map((t) => t.id);
  const { error } = await sb.from("tb_header_order").update({ adminidpurchaser: ADMIN_ID }).in("id", ids);
  if (error) { console.error("update failed:", error.message); process.exit(1); }
}
console.log(`✅ backfill ${changed.length} ออเดอร์ → adminidpurchaser=${ADMIN_ID}`);
process.exit(0);
