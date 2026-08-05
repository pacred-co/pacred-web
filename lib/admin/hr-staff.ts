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
type AdminRaw = { adminID: string; adminNickname: string | null; adminType: string | null; adminStatusSale: string | null };

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
    loginIds.length ? admin.from("tb_admin").select("adminID,adminNickname,adminType,adminStatusSale").in("adminID", loginIds) : Promise.resolve({ data: [] }),
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
    const { data: units } = await admin.from("hr_org_units").select("id,name_th,parent_id").in("id", unitIds);
    for (const u of (units ?? []) as { id: string; name_th: string; parent_id: string | null }[]) nameById.set(u.id, { name: u.name_th, parentId: u.parent_id });
    const parentIds = [...new Set([...nameById.values()].map((v) => v.parentId).filter(Boolean) as string[])];
    if (parentIds.length) {
      const { data: parents } = await admin.from("hr_org_units").select("id,name_th").in("id", parentIds);
      for (const p of (parents ?? []) as { id: string; name_th: string }[]) nameById.set(p.id, { name: p.name_th, parentId: null });
    }
  }

  const rows: StaffRow[] = rows0.map((p) => {
    const login = p.admin_login_id as string;
    const tba = tbaByLogin.get(login);
    const unit = p.org_unit_id ? nameById.get(p.org_unit_id) : null;
    const dept = unit?.parentId ? nameById.get(unit.parentId) : null;
    const t = (tba?.adminType ?? "").trim();
    const nameParts = [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
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
