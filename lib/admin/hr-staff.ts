import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * ทะเบียนพนักงาน (เฟส 2 · owner 2026-08-03 · unify 2026-08-03 ค่ำ) —
 * 🔴 SPINE = `profiles` (login+role+identity · ครบกว่า tb_admin) · join `tb_admin`
 * เอา HR detail (adminType/nickname/sale) · join `admins` เอา role. ที่เดียวจริง:
 * roster ทุกคน (รวม moo/sunta/tiger ที่ไม่มี tb_admin) มาจาก profiles.
 *
 * join key = `tb_admin.adminID == profiles.admin_login_id`.
 * bucket ตำแหน่ง (adminType · PCS): 1,2=พนักงาน · 3,4=ฝึกงาน · 5=partner ·
 * ไม่มี tb_admin/adminType (คนที่สร้างผ่าน /admin/admins) → นับเป็นพนักงาน.
 */

export const EMPLOYEE_TYPE_LABEL: Record<string, string> = {
  "1": "พนักงานประจำ", "2": "ทดลองงาน", "3": "เด็กฝึกงาน", "4": "สหกิจศึกษา",
  "5": "พาร์ทเนอร์", "6": "ฟรีแลนซ์", "7": "คนในบ้าน",
};

export type StaffRow = {
  adminId: string;               // admin_login_id (spine key)
  memberCode: string | null;     // AD###
  name: string;
  nickname: string | null;
  type: string;                  // adminType (from tb_admin · "" ถ้าไม่มี)
  typeLabel: string;
  isSale: boolean;
  roles: string[];               // จาก admins (แสดงเฉยๆ)
  hasHrRecord: boolean;          // มี tb_admin ไหม (ไม่มี = ต้องเติม HR detail)
  orgUnitId: string | null;
  positionName: string | null;
  departmentName: string | null;
};

type ProfileRaw = {
  id: string; admin_login_id: string | null; member_code: string | null;
  first_name: string | null; last_name: string | null; is_active: boolean; org_unit_id: string | null;
};
type AdminRaw = { adminID: string; adminName: string | null; adminLastName: string | null; adminNickname: string | null; adminType: string | null; adminStatusSale: string | null };

export function typeBucket(type: string | null): "employee" | "internship" | "partner" | null {
  if (type === "3" || type === "4") return "internship";
  if (type === "5") return "partner";
  if (type === "6" || type === "7") return null; // ฟรีแลนซ์/คนในบ้าน = ไม่นับโควตา
  return "employee"; // 1,2 หรือ ไม่มี adminType (สร้างผ่าน /admin/admins) = พนักงาน
}

/** โหลด profiles staff (active) → resolve tb_admin(HR) + admins(role) + ตำแหน่ง */
export async function loadStaffRegister(): Promise<{ rows: StaffRow[]; error: string | null }> {
  const admin = createAdminClient();
  const { data: profs, error } = await admin
    .from("profiles")
    .select("id,admin_login_id,member_code,first_name,last_name,is_active,org_unit_id")
    .not("admin_login_id", "is", null)
    .eq("is_active", true)
    .order("admin_login_id");
  if (error) {
    console.error("[hr-staff] register load failed", { code: error.code, message: error.message });
    return { rows: [], error: `db_error:${error.code ?? "unknown"}` };
  }
  const rows0 = (profs ?? []) as ProfileRaw[];
  const loginIds = rows0.map((p) => p.admin_login_id).filter(Boolean) as string[];
  const profileIds = rows0.map((p) => p.id);

  // tb_admin (HR detail) · admins (role) · ชื่อตำแหน่ง — batch
  const [tbaRes, admRes] = await Promise.all([
    loginIds.length ? admin.from("tb_admin").select("adminID,adminName,adminLastName,adminNickname,adminType,adminStatusSale").in("adminID", loginIds) : Promise.resolve({ data: [] }),
    profileIds.length ? admin.from("admins").select("profile_id,role").eq("is_active", true).in("profile_id", profileIds) : Promise.resolve({ data: [] }),
  ]);
  const tbaByLogin = new Map(((tbaRes.data ?? []) as AdminRaw[]).map((a) => [a.adminID, a]));
  const rolesByProfile = new Map<string, string[]>();
  for (const r of ((admRes.data ?? []) as { profile_id: string; role: string }[])) {
    (rolesByProfile.get(r.profile_id) ?? rolesByProfile.set(r.profile_id, []).get(r.profile_id)!).push(r.role);
  }

  // ชื่อตำแหน่ง + แผนกแม่
  const unitIds = [...new Set(rows0.map((r) => r.org_unit_id).filter(Boolean) as string[])];
  const nameById = new Map<string, { name: string; parentId: string | null }>();
  if (unitIds.length) {
    // §0c — ต้อง destructure `error` เสมอ · ชื่อตำแหน่งเป็นข้อมูลประกอบ (ไม่ใช่เงิน)
    // → fail-soft: อ่านไม่ได้ = log แล้วปล่อยชื่อว่าง ดีกว่าทั้งหน้าล้ม
    const { data: units, error: unitsErr } = await admin
      .from("hr_org_units").select("id,name_th,parent_id").in("id", unitIds);
    if (unitsErr) console.error("[hr-staff] อ่านชื่อตำแหน่งไม่ได้", { code: unitsErr.code, message: unitsErr.message });
    for (const u of (units ?? []) as { id: string; name_th: string; parent_id: string | null }[]) nameById.set(u.id, { name: u.name_th, parentId: u.parent_id });
    const parentIds = [...new Set([...nameById.values()].map((v) => v.parentId).filter(Boolean) as string[])];
    if (parentIds.length) {
      const { data: parents, error: parentsErr } = await admin
        .from("hr_org_units").select("id,name_th").in("id", parentIds);
      if (parentsErr) console.error("[hr-staff] อ่านชื่อแผนกแม่ไม่ได้", { code: parentsErr.code, message: parentsErr.message });
      for (const p of (parents ?? []) as { id: string; name_th: string }[]) nameById.set(p.id, { name: p.name_th, parentId: null });
    }
  }

  const rows: StaffRow[] = rows0.map((p) => {
    const login = p.admin_login_id as string;
    const tba = tbaByLogin.get(login);
    const unit = p.org_unit_id ? nameById.get(p.org_unit_id) : null;
    const dept = unit?.parentId ? nameById.get(unit.parentId) : null;
    const t = (tba?.adminType ?? "").trim();
    // แหล่งเดียว = tb_admin → ชื่อจาก tb_admin ก่อน (profiles = mirror · fallback)
    const nameParts = [tba?.adminName ?? p.first_name, tba?.adminLastName ?? p.last_name].filter(Boolean).join(" ").trim();
    return {
      adminId: login,
      memberCode: p.member_code,
      name: nameParts || login,
      nickname: tba?.adminNickname ?? null,
      type: t,
      typeLabel: t ? (EMPLOYEE_TYPE_LABEL[t] ?? "—") : "— (ยังไม่มีข้อมูล HR)",
      isSale: tba?.adminStatusSale === "1",
      roles: rolesByProfile.get(p.id) ?? [],
      hasHrRecord: !!tba,
      orgUnitId: p.org_unit_id,
      positionName: unit?.name ?? null,
      departmentName: dept?.name ?? null,
    };
  });
  return { rows, error: null };
}

export type StaffDetail = {
  adminId: string;
  memberCode: string | null;
  hasHrRecord: boolean;
  // identity (single-source · profiles + tb_admin เขียนตรงกัน)
  firstName: string; lastName: string; nickname: string;
  phone: string; photoUrl: string;
  sex: string; birthday: string; // yyyy-mm-dd
  // HR detail (tb_admin)
  type: string; salaryType: string; salary: string; nationalId: string;
  isSale: boolean;
  roles: string[];
  positionName: string | null;
};

/** โหลดข้อมูลพนักงานคนเดียว (profiles + tb_admin) สำหรับฟอร์มแก้ไข */
export async function loadStaffDetail(adminLoginId: string): Promise<StaffDetail | null> {
  const admin = createAdminClient();
  const { data: p, error } = await admin
    .from("profiles")
    .select("id,admin_login_id,member_code,first_name,last_name,phone,avatar_url,sex,birthday,org_unit_id")
    .eq("admin_login_id", adminLoginId)
    .maybeSingle();
  if (error) { console.error("[hr-staff] detail load failed", { code: error.code, message: error.message }); return null; }
  if (!p) return null;

  const [{ data: tba }, { data: adm }, unitName] = await Promise.all([
    admin.from("tb_admin").select("adminName,adminLastName,adminNickname,adminTel,adminPicture,adminSex,adminBirthday,adminType,salaryType,salary,nationalIDCard,adminStatusSale").eq("adminID", adminLoginId).maybeSingle(),
    admin.from("admins").select("role").eq("profile_id", (p as { id: string }).id).eq("is_active", true),
    p.org_unit_id
      ? admin.from("hr_org_units").select("name_th").eq("id", p.org_unit_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const t = tba as null | { adminName: string | null; adminLastName: string | null; adminNickname: string | null; adminTel: string | null; adminPicture: string | null; adminSex: string | null; adminBirthday: string | null; adminType: string | null; salaryType: string | null; salary: number | null; nationalIDCard: string | null; adminStatusSale: string | null };
  const dOnly = (v: string | null | undefined) => (v ?? "").slice(0, 10); // yyyy-mm-dd
  // เบอร์ว่าง placeholder na-* → แสดงเป็นว่าง
  const telClean = (v: string | null | undefined) => (v && !v.startsWith("na-") ? v : "");

  // แหล่งเดียว = tb_admin (owner 2026-08-05) → อ่าน identity จาก tb_admin ก่อน,
  // profiles (mirror) เป็น fallback กันกรณียังไม่มี tb_admin
  return {
    adminId: adminLoginId,
    memberCode: p.member_code,
    hasHrRecord: !!t,
    firstName: t?.adminName ?? p.first_name ?? "",
    lastName: t?.adminLastName ?? p.last_name ?? "",
    nickname: t?.adminNickname ?? "",
    phone: telClean(t?.adminTel) || p.phone || "",
    photoUrl: t?.adminPicture || p.avatar_url || "",
    sex: t?.adminSex ?? p.sex ?? "",
    birthday: dOnly(t?.adminBirthday ?? p.birthday),
    type: (t?.adminType ?? "1").trim() || "1",
    salaryType: (t?.salaryType ?? "2").trim() || "2",
    salary: t?.salary != null ? String(t.salary) : "",
    nationalId: t?.nationalIDCard ?? "",
    isSale: t?.adminStatusSale === "1",
    roles: ((adm ?? []) as { role: string }[]).map((r) => r.role),
    positionName: (unitName.data as { name_th: string } | null)?.name_th ?? null,
  };
}

/** นับคนสด per org_unit (จาก profiles spine · join tb_admin adminType เพื่อ bucket) */
export async function loadLivePositionCounts(): Promise<Map<string, { employee: number; internship: number; partner: number }>> {
  const admin = createAdminClient();
  const out = new Map<string, { employee: number; internship: number; partner: number }>();
  const { data: profs, error } = await admin
    .from("profiles")
    .select("admin_login_id,org_unit_id")
    .not("admin_login_id", "is", null)
    .eq("is_active", true)
    .not("org_unit_id", "is", null);
  if (error) {
    console.error("[hr-staff] live counts failed", { code: error.code, message: error.message });
    return out;
  }
  const rows = (profs ?? []) as { admin_login_id: string; org_unit_id: string }[];
  const loginIds = rows.map((r) => r.admin_login_id);
  const { data: tba } = loginIds.length
    ? await admin.from("tb_admin").select("adminID,adminType").in("adminID", loginIds)
    : { data: [] };
  const typeByLogin = new Map(((tba ?? []) as { adminID: string; adminType: string | null }[]).map((a) => [a.adminID, a.adminType]));

  for (const r of rows) {
    const b = typeBucket(typeByLogin.get(r.admin_login_id) ?? null); // ไม่มี HR = employee
    if (!b) continue;
    const cur = out.get(r.org_unit_id) ?? { employee: 0, internship: 0, partner: 0 };
    cur[b] += 1;
    out.set(r.org_unit_id, cur);
  }
  return out;
}
