// ════════════════════════════════════════════════════════════════════
// hr-lock-and-assign-2026-08-03 — owner 2026-08-03 (HR เฟส 2 · จอ prod)
// ════════════════════════════════════════════════════════════════════
// 1) พนักงานที่ออกจากบริษัท → offline + LOCK login "ไม่ว่ากรณีใดๆ" (ย้อนได้)
//    ล็อก 4 ชั้น: ban auth.users + admins.is_active=false + profiles.is_active=false
//    + tb_admin.adminStatusA='0' (ออกจากทะเบียน/ผัง + legacy gate)
// 2) จัดคนเข้าตำแหน่ง: admin_pop + admin_nat → CEO · admin_ben → Driver ·
//    admin_keetar → Warehouse
//
//   node --env-file=.env.local scripts/hr-lock-and-assign-2026-08-03.mjs           # dry-run
//   node --env-file=.env.local scripts/hr-lock-and-assign-2026-08-03.mjs --apply
//
// backup ก่อนเขียนทุกครั้ง (สถานะเดิม → ย้อนได้). ⚠️ ban auth = ปฏิเสธ login
// ทุกกรณี · ปลดล็อก = un-ban + set is_active กลับ (owner กดเปิดทีหลัง).
// ════════════════════════════════════════════════════════════════════
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";

const APPLY = process.argv.includes("--apply");
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const RESIGNED = ["admin_admin_man","admin_admin_put","admin_alongkor","admin_beer","admin_jane",
  "admin_pod","admin_pupu","admin_saiu_4","admin_tam","admin_toey","admin_vam","admin_wave"];
// จัดตำแหน่ง: adminID → code ตำแหน่งในผัง (hr_org_units.code)
const ASSIGN = { admin_pop: "ceo", admin_nat: "ceo", admin_ben: "log-drv", admin_keetar: "log-wh" };

async function main() {
  // ── ตำแหน่ง code → id ──
  const codes = [...new Set(Object.values(ASSIGN))];
  const { data: units } = await db.from("hr_org_units").select("id,code,name_th").in("code", codes);
  const unitByCode = new Map((units ?? []).map((u) => [u.code, u]));
  for (const c of codes) if (!unitByCode.has(c)) throw new Error(`ไม่พบตำแหน่ง code=${c}`);

  // ── โหลด tb_admin + profiles ของทุกคนที่เกี่ยว ──
  const allIds = [...RESIGNED, ...Object.keys(ASSIGN)];
  const { data: admins } = await db.from("tb_admin").select("adminID,adminName,adminLastName,adminStatusA,org_unit_id").in("adminID", allIds);
  const admById = new Map((admins ?? []).map((a) => [a.adminID, a]));
  const { data: profs } = await db.from("profiles").select("id,admin_login_id,is_active").in("admin_login_id", allIds);
  const profByLogin = new Map((profs ?? []).map((p) => [p.admin_login_id, p]));

  // ── PLAN: lock ──
  console.log("=== 1) LOCK (ออกจากบริษัท · ปิด 4 ชั้น) ===");
  const lockPlan = [];
  for (const id of RESIGNED) {
    const a = admById.get(id), p = profByLogin.get(id);
    if (!a) { console.log(`  ⚠ ${id}: ไม่พบใน tb_admin — ข้าม`); continue; }
    lockPlan.push({ id, profileId: p?.id ?? null, curStatusA: a.adminStatusA, curProfActive: p?.is_active });
    console.log(`  🔒 ${id} (${a.adminName||""} ${a.adminLastName||""}) · tb_admin statusA ${a.adminStatusA}→0 · profile is_active ${p?.is_active}→false · admins→inactive · ban auth${p?.id?" "+p.id.slice(0,8):" (ไม่มี profile)"}`);
  }

  // ── PLAN: assign ──
  console.log("\n=== 2) จัดคนเข้าตำแหน่ง ===");
  const assignPlan = [];
  for (const [id, code] of Object.entries(ASSIGN)) {
    const a = admById.get(id), u = unitByCode.get(code);
    if (!a) { console.log(`  ⚠ ${id}: ไม่พบใน tb_admin — ข้าม`); continue; }
    assignPlan.push({ id, unitId: u.id, curUnit: a.org_unit_id });
    console.log(`  ➕ ${id} (${a.adminName||""}) → ${u.name_th} [${code}]`);
  }
  console.log("\n⚠ admin_pop + admin_nat → CEO (โควตา 1 · จะขึ้น 2/1 = ฟ้า 'มีคนเกิน' · owner บอกทั้งคู่เป็น CEO)");

  if (!APPLY) { console.log("\nDRY-RUN — รันซ้ำด้วย --apply"); return; }

  // ── backup ──
  const backup = { lockPlan, assignPlan, ts: "2026-08-03" };
  const bfile = `/tmp/hr-lock-assign-backup-${Date.now()}.json`;
  fs.writeFileSync(bfile, JSON.stringify(backup, null, 2));
  console.log("\nbackup:", bfile);

  // ── APPLY lock ──
  for (const L of lockPlan) {
    await db.from("tb_admin").update({ adminStatusA: "0" }).eq("adminID", L.id);
    if (L.profileId) {
      await db.from("profiles").update({ is_active: false }).eq("id", L.profileId);
      await db.from("admins").update({ is_active: false }).eq("profile_id", L.profileId);
      const { error: banErr } = await db.auth.admin.updateUserById(L.profileId, { ban_duration: "876000h" });
      if (banErr) console.error(`  ✗ ban ${L.id}: ${banErr.message}`);
    }
  }
  console.log(`LOCKED: ${lockPlan.length} คน`);

  // ── APPLY assign ──
  for (const A of assignPlan) {
    const { error } = await db.from("tb_admin").update({ org_unit_id: A.unitId }).eq("adminID", A.id).eq("adminStatusA", "1");
    if (error) console.error(`  ✗ assign ${A.id}: ${error.message}`);
  }
  console.log(`ASSIGNED: ${assignPlan.length} คน`);

  // ── CEO 2 คน (owner) → โควตา 2 → ขึ้นเขียว 2/2 ──
  await db.from("hr_org_units").update({ quota_employee: 2 }).eq("code", "ceo");
  console.log("CEO quota → 2 (admin_pop + admin_nat)");
}
main().catch((e) => { console.error(e); process.exit(1); });
