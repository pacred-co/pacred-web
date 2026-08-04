import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * ผังองค์กร Pacred — loader (owner 2026-08-03 · แทนผังเก่า org_* mig 0017).
 *
 * ต้นไม้ชั้นเดียวใน `hr_org_units`: company → position(CEO) → position(หัว) →
 * department → position. อ่านทั้งตาราง (46 แถว · เล็ก) แล้วประกอบเป็นทรีในหน่วยความจำ
 * — โครงเล็กพอที่ไม่ต้อง recursive CTE.
 *
 * `have_*` = คนจริงตอนนี้ (seed จากผังที่ owner วาด · เฟส 2 จะสลับไปนับสดจาก row
 * พนักงานที่ย้ายเข้าตำแหน่ง). READ-ONLY.
 */

export type OrgKind = "company" | "department" | "position";

export type OrgUnit = {
  id: string;
  code: string;
  parentId: string | null;
  kind: OrgKind;
  nameTh: string;
  nameEn: string | null;
  band: number | null;
  isHead: boolean;
  sortOrder: number;
  quotaEmployee: number;
  quotaInternship: number;
  quotaPartner: number;
  haveEmployee: number;
  haveInternship: number;
  havePartner: number;
  roleKey: string | null;
  note: string | null;
  active: boolean;
  children: OrgUnit[];
};

type Row = {
  id: string; code: string; parent_id: string | null; kind: OrgKind;
  name_th: string; name_en: string | null; band: number | null; is_head: boolean;
  sort_order: number; quota_employee: number; quota_internship: number; quota_partner: number;
  have_employee: number; have_internship: number; have_partner: number;
  role_key: string | null; note: string | null; active: boolean;
};

function toUnit(r: Row): OrgUnit {
  return {
    id: r.id, code: r.code, parentId: r.parent_id, kind: r.kind,
    nameTh: r.name_th, nameEn: r.name_en, band: r.band, isHead: r.is_head,
    sortOrder: r.sort_order,
    quotaEmployee: r.quota_employee, quotaInternship: r.quota_internship, quotaPartner: r.quota_partner,
    haveEmployee: r.have_employee, haveInternship: r.have_internship, havePartner: r.have_partner,
    roleKey: r.role_key, note: r.note, active: r.active, children: [],
  };
}

/** โหลดทั้งผัง (active) แล้วประกอบเป็นทรี — คืน root (company) ตัวแรก. */
export async function loadOrgTree(): Promise<{ root: OrgUnit | null; all: OrgUnit[]; error: string | null }> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("hr_org_units")
    .select("id,code,parent_id,kind,name_th,name_en,band,is_head,sort_order,quota_employee,quota_internship,quota_partner,have_employee,have_internship,have_partner,role_key,note,active")
    .eq("active", true)
    .order("sort_order", { ascending: true });
  if (error) {
    console.error("[hr-org] load failed", { code: error.code, message: error.message });
    return { root: null, all: [], error: `db_error:${error.code ?? "unknown"}` };
  }
  const units = ((data ?? []) as Row[]).map(toUnit);
  const byId = new Map(units.map((u) => [u.id, u]));
  let root: OrgUnit | null = null;
  for (const u of units) {
    if (u.parentId && byId.has(u.parentId)) byId.get(u.parentId)!.children.push(u);
    else if (u.kind === "company") root = u;
  }
  const sortRec = (u: OrgUnit) => { u.children.sort((a, b) => a.sortOrder - b.sortOrder); u.children.forEach(sortRec); };
  if (root) sortRec(root);
  return { root, all: units, error: null };
}

/** ผลรวมของแผนก (Σ ตำแหน่งลูก) — ใช้โชว์บนกล่องแผนกดำ. */
export function deptTotals(dept: OrgUnit) {
  const t = { qE: 0, qI: 0, qP: 0, hE: 0, hI: 0, hP: 0 };
  for (const p of dept.children) {
    t.qE += p.quotaEmployee; t.qI += p.quotaInternship; t.qP += p.quotaPartner;
    t.hE += p.haveEmployee;  t.hI += p.haveInternship;  t.hP += p.havePartner;
  }
  return t;
}

/** สถานะสีของตำแหน่ง (นิยาม owner) — คำนวณจาก have vs quota. */
export type OrgState = "waiting" | "vacant" | "over" | "filled" | "short";
export function positionState(p: OrgUnit): OrgState {
  if (p.isHead && p.haveEmployee === 0) return "waiting"; // หัวหน้ายังไม่มีคน = รอเลื่อน
  const have = p.haveEmployee, quota = p.quotaEmployee;
  if (have === 0 && quota > 0) return "vacant";
  if (have > quota) return "over";
  if (have === quota) return "filled";
  return "short";
}
