import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * ทะเบียนพนักงาน (เฟส 2 · owner 2026-08-03) — อ่านจาก tb_admin (SOT ตัวคน · โครง PCS)
 * + สถานะการผูกเข้าตำแหน่งในผัง (org_unit_id → hr_org_units).
 *
 * bucket ตาม adminType (PCS): 1,2 = พนักงาน · 3,4 = ฝึกงาน · 5 = partner ·
 * 6 ฟรีแลนซ์ / 7 คนในบ้าน = ไม่นับเข้าโควตาตำแหน่ง (แต่ยัง list/จัดได้).
 */

export const EMPLOYEE_TYPE_LABEL: Record<string, string> = {
  "1": "พนักงานประจำ", "2": "ทดลองงาน", "3": "เด็กฝึกงาน", "4": "สหกิจศึกษา",
  "5": "พาร์ทเนอร์", "6": "ฟรีแลนซ์", "7": "คนในบ้าน",
};

export type StaffRow = {
  adminId: string;
  name: string;
  nickname: string | null;
  type: string;        // adminType
  typeLabel: string;
  isSale: boolean;
  orgUnitId: string | null;
  positionName: string | null;   // ชื่อตำแหน่งที่ผูกอยู่ (จาก hr_org_units)
  departmentName: string | null; // ชื่อแผนกของตำแหน่งนั้น
};

type AdminRaw = {
  adminID: string; adminName: string | null; adminLastName: string | null;
  adminNickname: string | null; adminType: string | null; adminStatusA: string | null;
  adminStatusSale: string | null; org_unit_id: string | null;
};

/** bucket ของ adminType → ช่องบนผัง */
export function typeBucket(type: string | null): "employee" | "internship" | "partner" | null {
  if (type === "1" || type === "2") return "employee";
  if (type === "3" || type === "4") return "internship";
  if (type === "5") return "partner";
  return null; // 6,7 = ไม่นับโควตา
}

/** โหลดพนักงาน active ทั้งหมด + ชื่อตำแหน่ง/แผนกที่ผูกอยู่ */
export async function loadStaffRegister(): Promise<{ rows: StaffRow[]; error: string | null }> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("tb_admin")
    .select("adminID,adminName,adminLastName,adminNickname,adminType,adminStatusA,adminStatusSale,org_unit_id")
    .eq("adminStatusA", "1")
    .order("adminID");
  if (error) {
    console.error("[hr-staff] register load failed", { code: error.code, message: error.message });
    return { rows: [], error: `db_error:${error.code ?? "unknown"}` };
  }
  const raws = (data ?? []) as AdminRaw[];

  // ชื่อตำแหน่ง + แผนกแม่ ของ org_unit ที่มีคนผูก
  const unitIds = [...new Set(raws.map((r) => r.org_unit_id).filter(Boolean) as string[])];
  const nameById = new Map<string, { name: string; parentId: string | null }>();
  if (unitIds.length > 0) {
    const { data: units } = await admin.from("hr_org_units").select("id,name_th,parent_id").in("id", unitIds);
    for (const u of (units ?? []) as { id: string; name_th: string; parent_id: string | null }[]) {
      nameById.set(u.id, { name: u.name_th, parentId: u.parent_id });
    }
    const parentIds = [...new Set([...nameById.values()].map((v) => v.parentId).filter(Boolean) as string[])];
    if (parentIds.length > 0) {
      const { data: parents } = await admin.from("hr_org_units").select("id,name_th").in("id", parentIds);
      for (const p of (parents ?? []) as { id: string; name_th: string }[]) {
        nameById.set(p.id, { name: p.name_th, parentId: null });
      }
    }
  }

  const rows: StaffRow[] = raws.map((r) => {
    const unit = r.org_unit_id ? nameById.get(r.org_unit_id) : null;
    const dept = unit?.parentId ? nameById.get(unit.parentId) : null;
    const t = (r.adminType ?? "").trim();
    return {
      adminId: r.adminID,
      name: [r.adminName, r.adminLastName].filter(Boolean).join(" ").trim() || r.adminID,
      nickname: r.adminNickname,
      type: t,
      typeLabel: EMPLOYEE_TYPE_LABEL[t] ?? "—",
      isSale: r.adminStatusSale === "1",
      orgUnitId: r.org_unit_id,
      positionName: unit?.name ?? null,
      departmentName: dept?.name ?? null,
    };
  });
  return { rows, error: null };
}

/** นับคนสด per org_unit → { unitId: {employee,internship,partner} } (สำหรับผัง) */
export async function loadLivePositionCounts(): Promise<Map<string, { employee: number; internship: number; partner: number }>> {
  const admin = createAdminClient();
  const out = new Map<string, { employee: number; internship: number; partner: number }>();
  const { data, error } = await admin
    .from("tb_admin")
    .select("adminType,org_unit_id")
    .eq("adminStatusA", "1")
    .not("org_unit_id", "is", null);
  if (error) {
    console.error("[hr-staff] live counts failed", { code: error.code, message: error.message });
    return out;
  }
  for (const r of (data ?? []) as { adminType: string | null; org_unit_id: string }[]) {
    const b = typeBucket(r.adminType);
    if (!b) continue;
    const cur = out.get(r.org_unit_id) ?? { employee: 0, internship: 0, partner: 0 };
    cur[b] += 1;
    out.set(r.org_unit_id, cur);
  }
  return out;
}
