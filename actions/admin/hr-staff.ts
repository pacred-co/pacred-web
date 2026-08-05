"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureLegacyAdminRow } from "@/lib/admin/ensure-legacy-admin";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";

/**
 * เฟส 2 (owner 2026-08-03) — จัดพนักงานเข้าตำแหน่งในผัง.
 * เขียน tb_admin.org_unit_id เท่านั้น (ไม่แตะ field อื่น ไม่แตะเงิน · reference).
 * RBAC: HR = super | accounting (เหมือนหน้าผัง).
 */

const HR_ROLES = ["super", "accounting"] as const;
const EMPLOYMENT_ROLES = ["super"] as const; // ล็อก/ปลดล็อกพนักงาน = super เท่านั้น

const assignSchema = z.object({
  adminId: z.string().trim().min(1).max(60), // = profiles.admin_login_id
  orgUnitId: z.string().uuid().nullable(),   // null = ปลดออกจากตำแหน่ง
});

export type AssignStaffInput = z.infer<typeof assignSchema>;

/**
 * จัดพนักงานเข้าตำแหน่ง — เขียน `tb_admin.org_unit_id` (แกนเดียว · owner 2026-08-05).
 * tb_admin = แหล่งเดียวข้อมูลพนักงาน → DB trigger (mig 0292) มิเรอร์ org_unit_id
 * ไป profiles ให้เอง. เขียนที่เดียว = ไม่มี drift.
 * ต้องมี profiles active (loginable) จึงจัดได้ (กัน center/คนออก).
 */
export async function assignStaffToPosition(input: AssignStaffInput): Promise<AdminActionResult> {
  const parsed = assignSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const { adminId, orgUnitId } = parsed.data;

  return withAdmin([...HR_ROLES], async ({ adminId: actor }) => {
    const admin = createAdminClient();

    // ถ้าผูกตำแหน่ง — ตำแหน่งต้องมีจริง + เป็น kind=position
    if (orgUnitId) {
      const { data: unit, error: uErr } = await admin
        .from("hr_org_units")
        .select("id,kind")
        .eq("id", orgUnitId)
        .maybeSingle();
      if (uErr) return { ok: false, error: `db_error:${uErr.code ?? "unknown"}` };
      if (!unit) return { ok: false, error: "position_not_found" };
      if ((unit as { kind: string }).kind !== "position") return { ok: false, error: "not_a_position" };
    }

    // ต้องเป็นพนักงานที่ login ได้ (มี profiles active) — กัน center/คนออก
    const { data: prof, error: pErr } = await admin
      .from("profiles").select("id").eq("admin_login_id", adminId).eq("is_active", true).maybeSingle();
    if (pErr) return { ok: false, error: `db_error:${pErr.code ?? "unknown"}` };
    if (!prof) return { ok: false, error: "staff_not_found_or_inactive" };

    // เขียน tb_admin (แกน) → trigger มิเรอร์ profiles.org_unit_id เอง
    const { data: updated, error } = await admin
      .from("tb_admin")
      .update({ org_unit_id: orgUnitId })
      .eq("adminID", adminId)
      .select("adminID");
    if (error) return { ok: false, error: `db_error:${error.code ?? "unknown"}` };
    if (!updated || updated.length === 0) return { ok: false, error: "hr_record_missing" };

    await logAdminAction(actor, "hr.assign_position", "tb_admin", adminId, { orgUnitId });
    revalidatePath("/admin/hr/staff");
    revalidatePath("/admin/hr/org-chart");
    revalidatePath("/admin/hr/org-table");
    return { ok: true };
  });
}

// ════════════════════════════════════════════════════════════════════
// ล็อก/ปลดล็อกพนักงาน (ทำงาน ↔ ลาออก) — 4 ชั้น ย้อนได้ (owner 2026-08-05 ·
// ยุบ /admin/admins มารวมหน้า HR staff → ต้องปลดล็อกคนออกได้จากหน้านี้)
// ════════════════════════════════════════════════════════════════════
const employmentSchema = z.object({
  adminId: z.string().trim().min(1).max(60),
  active: z.boolean(), // true = เปิดกลับ (ทำงาน) · false = ล็อก (ลาออก)
});
export type SetEmploymentInput = z.infer<typeof employmentSchema>;

/**
 * ตั้งสถานะการจ้าง 4 ชั้น (mirror scripts/hr-lock 2026-08-03):
 * auth (ban/unban) + admins.is_active + profiles.is_active + tb_admin.adminStatusA.
 * ปลดล็อก = เปิดทุกชั้นกลับ · ล็อก = ปิดทุกชั้น. RBAC: super เท่านั้น.
 */
export async function setStaffEmployment(input: SetEmploymentInput): Promise<AdminActionResult> {
  const parsed = employmentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const { adminId, active } = parsed.data;

  return withAdmin([...EMPLOYMENT_ROLES], async ({ adminId: actor }) => {
    const admin = createAdminClient();

    const { data: prof, error: pErr } = await admin
      .from("profiles").select("id").eq("admin_login_id", adminId).maybeSingle();
    if (pErr) return { ok: false, error: `db_error:${pErr.code ?? "unknown"}` };
    if (!prof) return { ok: false, error: "staff_not_found" };
    const profileId = (prof as { id: string }).id;

    // ชั้น 1 — auth ban/unban (876000h ≈ 100 ปี = ล็อกถาวรจนกว่าปลด)
    const { error: authErr } = await admin.auth.admin.updateUserById(profileId, {
      ban_duration: active ? "none" : "876000h",
    });
    if (authErr) return { ok: false, error: `auth:${authErr.message}` };

    // ชั้น 2-4 — admins / profiles / tb_admin (best-effort · log ถ้าพลาด)
    const { error: aErr } = await admin.from("admins").update({ is_active: active }).eq("profile_id", profileId);
    if (aErr) console.error("[hr] admins toggle failed", { adminId, code: aErr.code });
    const { error: puErr } = await admin.from("profiles").update({ is_active: active }).eq("id", profileId);
    if (puErr) return { ok: false, error: `profiles:${puErr.code ?? "unknown"}` };
    const { error: tErr } = await admin.from("tb_admin").update({ adminStatusA: active ? "1" : "0" }).eq("adminID", adminId);
    if (tErr) console.error("[hr] tb_admin toggle failed", { adminId, code: tErr.code });

    await logAdminAction(actor, active ? "hr.staff_unlock" : "hr.staff_lock", "profiles", adminId, { active });
    revalidatePath("/admin/hr/staff");
    revalidatePath("/admin/hr/org-chart");
    return { ok: true };
  });
}

// ════════════════════════════════════════════════════════════════════
// แก้ข้อมูลพนักงาน — แหล่งเดียว tb_admin (owner 2026-08-05 · "ใช้ที่เดียวจบๆ")
// เขียน tb_admin ที่เดียว → DB trigger (mig 0292) มิเรอร์ ชื่อ/เบอร์/รูป/เพศ/
// วันเกิด/ตำแหน่ง ไป profiles ให้เอง → ตรงกันทุก surface (เว็บ · portal ลูกค้า ·
// หลังบ้าน · แอดมิน) โดยไม่มี dual-write ที่ drift ได้.
// ════════════════════════════════════════════════════════════════════
const saveSchema = z.object({
  adminId: z.string().trim().min(1).max(60),
  firstName: z.string().trim().max(255),
  lastName: z.string().trim().max(255),
  nickname: z.string().trim().max(60),
  phone: z.string().trim().max(30),
  photoUrl: z.string().trim().max(500),
  sex: z.enum(["", "1", "2", "3"]),
  birthday: z.string().trim().max(10), // yyyy-mm-dd (หรือ "")
  type: z.enum(["1", "2", "3", "4", "5", "6", "7"]),
  salaryType: z.enum(["1", "2", "3"]),
  salary: z.string().trim().max(15),
  nationalId: z.string().trim().max(25),
  isSale: z.boolean(),
});
export type SaveEmployeeInput = z.infer<typeof saveSchema>;

/**
 * บันทึกข้อมูลพนักงาน — เขียน **tb_admin ที่เดียว** (owner 2026-08-05 · "ใช้ที่
 * เดียวจบๆ"). DB trigger (mig 0292) มิเรอร์ ชื่อ/นามสกุล/เบอร์/รูป/เพศ/วันเกิด
 * ไป profiles ให้เอง → ชื่อ/เบอร์/รูป ที่ลูกค้าเห็น = ที่ HR = ที่ login ตรงกัน
 * ทุก surface โดยไม่มี dual-write. ถ้ายังไม่มี tb_admin → สร้างให้ (ensureLegacyAdminRow).
 */
export async function saveEmployee(input: SaveEmployeeInput): Promise<AdminActionResult> {
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const d = parsed.data;

  return withAdmin([...HR_ROLES], async ({ adminId: actor }) => {
    const admin = createAdminClient();

    // พนักงานต้องมีจริง (มี profiles active = login ได้) — กัน center/คนออก
    const { data: prof, error: pErr } = await admin
      .from("profiles").select("id").eq("admin_login_id", d.adminId).eq("is_active", true).maybeSingle();
    if (pErr) return { ok: false, error: `db_error:${pErr.code ?? "unknown"}` };
    if (!prof) return { ok: false, error: "staff_not_found_or_inactive" };

    // มี tb_admin ไหม — ไม่มีก็สร้าง (พนักงานใหม่ที่ยังไม่มี legacy row)
    const ens = await ensureLegacyAdminRow(admin, {
      adminID: d.adminId, adminName: d.firstName || d.adminId, adminLastName: d.lastName,
      adminNickname: d.nickname, isSales: d.isSale, createdBy: actor,
    });
    if (!ens.ok) return { ok: false, error: `hr_record:${ens.error ?? "unknown"}` };

    // เขียน tb_admin (แหล่งเดียว) → trigger มิเรอร์ identity ไป profiles ให้เอง.
    // ⚠️ tb_admin.adminTel = UNIQUE → เบอร์ว่าง "" ชนกันได้แถวเดียว → placeholder
    // ต่อคน `na-<adminID>` (trigger แปลง na-* กลับเป็นว่างใน profiles).
    const salaryNum = d.salary.trim() === "" ? 0 : Number(d.salary);
    const telValue = d.phone.trim() !== "" ? d.phone.trim() : `na-${d.adminId}`;
    const { error: upT } = await admin.from("tb_admin").update({
      adminName: d.firstName, adminLastName: d.lastName, adminNickname: d.nickname,
      adminTel: telValue,                      // ← เบอร์ที่ลูกค้าเห็น (sales-rep-contact)
      adminPicture: d.photoUrl,                // ← รูปที่ลูกค้าเห็น
      adminSex: d.sex || null, adminBirthday: d.birthday || null,
      adminType: d.type, salaryType: d.salaryType,
      salary: Number.isFinite(salaryNum) ? salaryNum : 0,
      nationalIDCard: d.nationalId, adminStatusSale: d.isSale ? "1" : "0",
    }).eq("adminID", d.adminId);
    if (upT) {
      if (upT.code === "23505") return { ok: false, error: "เบอร์โทรนี้มีพนักงานคนอื่นใช้แล้ว" };
      return { ok: false, error: `tb_admin:${upT.code ?? "unknown"}` };
    }

    await logAdminAction(actor, "hr.save_employee", "tb_admin", d.adminId, {
      firstName: d.firstName, phone: d.phone, isSale: d.isSale, createdHr: ens.created,
    });
    revalidatePath("/admin/hr/staff");
    revalidatePath("/admin/hr/org-chart");
    revalidatePath(`/admin/hr/staff/${d.adminId}/edit`);
    return { ok: true };
  });
}
