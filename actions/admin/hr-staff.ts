"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureLegacyAdminRow } from "@/lib/admin/ensure-legacy-admin";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";
import { adminCreateNew } from "./admins";

/**
 * เฟส 2 (owner 2026-08-03) — จัดพนักงานเข้าตำแหน่งในผัง.
 * เขียน tb_admin.org_unit_id เท่านั้น (ไม่แตะ field อื่น ไม่แตะเงิน · reference).
 * RBAC: HR = super | accounting (เหมือนหน้าผัง).
 */

const HR_ROLES = ["super", "accounting"] as const;
const EMPLOYMENT_ROLES = ["super"] as const; // ล็อก/ปลดล็อกพนักงาน = super เท่านั้น

/**
 * ตำแหน่งในผัง (code) → สิทธิ์ระบบ (role) เริ่มต้น (owner 2026-08-05 "ตำแหน่ง→สิทธิ์
 * อัตโนมัติ · Driver=admin_ben · Warehouse=admin_keetar"). จัดคนเข้าตำแหน่งเหล่านี้
 * → ได้ role ตรงเลย (เมนู/สิทธิ์ตาม role นั้น). map เฉพาะตำแหน่งที่ role ชัดเจน ·
 * ตำแหน่งอื่น (IT/HR/Freight/Customs/CEO) role กำหนดมือ (ไม่ auto). role พวกนี้
 * อยู่ใน admins_role_check ครบ.
 */
const POSITION_DEFAULT_ROLE: Record<string, string> = {
  "log-drv": "driver",      // Driver (owner: template admin_ben)
  "log-wh": "warehouse",    // Warehouse (owner: template admin_keetar)
  "log-sup": "warehouse",   // Warehouse Supervisor
  "acc-admin": "accounting",
  "acc-sup": "accounting",
  "ops-sales": "sales",
  "ops-price": "pricing",
  "ops-cs": "ops",
};
// role ที่ห้าม auto-เขียนทับ/แตะ (god/manager tier — เปลี่ยนเองมือเท่านั้น)
const PROTECTED_ROLES = new Set(["super", "ultra", "accounting"]);

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

  return withAdmin([...HR_ROLES], async ({ adminId: actor, roles: actorRoles }) => {
    const admin = createAdminClient();

    // ถ้าผูกตำแหน่ง — ตำแหน่งต้องมีจริง + เป็น kind=position · เก็บ code ไว้ map สิทธิ์
    let unitCode: string | null = null;
    if (orgUnitId) {
      const { data: unit, error: uErr } = await admin
        .from("hr_org_units")
        .select("id,kind,code")
        .eq("id", orgUnitId)
        .maybeSingle();
      if (uErr) return { ok: false, error: `db_error:${uErr.code ?? "unknown"}` };
      if (!unit) return { ok: false, error: "position_not_found" };
      if ((unit as { kind: string }).kind !== "position") return { ok: false, error: "not_a_position" };
      unitCode = (unit as { code: string | null }).code ?? null;
    }

    // ต้องเป็นพนักงานที่ login ได้ (มี profiles active) — กัน center/คนออก
    const { data: prof, error: pErr } = await admin
      .from("profiles").select("id").eq("admin_login_id", adminId).eq("is_active", true).maybeSingle();
    if (pErr) return { ok: false, error: `db_error:${pErr.code ?? "unknown"}` };
    if (!prof) return { ok: false, error: "staff_not_found_or_inactive" };
    const profileId = (prof as { id: string }).id;

    // เขียน tb_admin (แกน) → trigger มิเรอร์ profiles.org_unit_id เอง
    const { data: updated, error } = await admin
      .from("tb_admin")
      .update({ org_unit_id: orgUnitId })
      .eq("adminID", adminId)
      .select("adminID");
    if (error) return { ok: false, error: `db_error:${error.code ?? "unknown"}` };
    if (!updated || updated.length === 0) return { ok: false, error: "hr_record_missing" };

    // ── ตำแหน่ง → สิทธิ์อัตโนมัติ (owner 2026-08-05) ──
    // เพิ่ม role ตามตำแหน่ง (additive · ไม่ลบ/ไม่ downgrade role เดิม = ปลอดภัย) ·
    // เฉพาะ actor ที่คุมสิทธิ์ได้ (super/ultra) · best-effort (พลาดไม่ล้มการจัดตำแหน่ง).
    let grantedRole: string | null = null;
    const mappedRole = unitCode ? POSITION_DEFAULT_ROLE[unitCode] : undefined;
    const actorCanGrant = actorRoles.some((r) => r === "super" || r === "ultra");
    if (mappedRole && actorCanGrant) {
      // มี active grant ของ role นี้อยู่แล้วไหม · หรือมี role ที่สูงกว่า (protected) อยู่
      const { data: grants } = await admin
        .from("admins").select("role,is_active").eq("profile_id", profileId).eq("is_active", true);
      const activeRoles = new Set(((grants ?? []) as { role: string }[]).map((g) => g.role));
      const hasProtected = [...activeRoles].some((r) => PROTECTED_ROLES.has(r));
      if (!activeRoles.has(mappedRole) && !hasProtected) {
        const { error: gErr } = await admin.from("admins").upsert(
          { profile_id: profileId, role: mappedRole, is_active: true, granted_by: actor, granted_at: new Date().toISOString() },
          { onConflict: "profile_id,role" },
        );
        if (gErr) console.error("[hr] auto-grant role failed", { adminId, mappedRole, code: gErr.code });
        else grantedRole = mappedRole;
      }
    }

    await logAdminAction(actor, "hr.assign_position", "tb_admin", adminId, { orgUnitId, grantedRole });
    revalidatePath("/admin/hr/staff");
    revalidatePath("/admin/hr/org-chart");
    revalidatePath("/admin/hr/org-table");
    return { ok: true };
  });
}

// ════════════════════════════════════════════════════════════════════
// เพิ่มพนักงานใหม่ — สร้าง + เติม tb_admin + จัดตำแหน่ง ในไหลเดียว (owner 2026-08-05
// "ฟอร์มเพิ่มพนักงานตรงแกนเดียว · กัน account กลวง"). ต่อยอด adminCreateNew (สร้าง
// auth+profiles+admins+extras+tb_admin ครบ) → saveEmployee เติม tb_admin ให้ตรง
// (adminCreateNew ตั้งเบอร์เป็น placeholder) → assignStaffToPosition (org+สิทธิ์อัตโนมัติ).
// ════════════════════════════════════════════════════════════════════
const createStaffSchema = z.object({
  loginId: z.string().trim().min(1).max(60),
  password: z.string().min(6, "รหัสผ่านอย่างน้อย 6 ตัว").max(200),
  firstName: z.string().trim().min(1, "กรอกชื่อ").max(200),
  lastName: z.string().trim().max(200),
  nickname: z.string().trim().max(60),
  phone: z.string().trim().max(30),
  email: z.string().trim().max(200),
  type: z.enum(["1", "2", "3", "4", "5", "6", "7"]),
  isSale: z.boolean(),
  allowExistingPhone: z.boolean().optional(),
  orgUnitId: z.string().uuid().nullable(),
});
export type CreateStaffInput = z.infer<typeof createStaffSchema>;

export async function createStaffComplete(input: CreateStaffInput): Promise<AdminActionResult<{ adminId: string }>> {
  const parsed = createStaffSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const d = parsed.data;
  const loginId = d.loginId.toLowerCase().startsWith("admin_") ? d.loginId.toLowerCase() : `admin_${d.loginId.toLowerCase()}`;

  return withAdmin<{ adminId: string }>([...EMPLOYMENT_ROLES], async ({ adminId: actor }) => {
    // 1) สร้างพนักงานครบชุด (auth+profiles+admins+extras+tb_admin · ensureLegacyAdminRow)
    const created = await adminCreateNew({
      login_id: d.loginId, password: d.password,
      first_name: d.firstName, last_name: d.lastName || undefined,
      phone: d.phone || undefined, email: d.email || undefined,
      role: d.isSale ? "sales" : "ops",
      allow_existing_phone: d.allowExistingPhone,
    } as Parameters<typeof adminCreateNew>[0]);
    if (!created.ok) return { ok: false, error: created.error };

    // 2) เติม tb_admin ให้ตรงแกนเดียว (ชื่อ/เบอร์จริง/ชื่อเล่น/ประเภท/เซล) → trigger มิเรอร์ profiles
    const saved = await saveEmployee({
      adminId: loginId, firstName: d.firstName, lastName: d.lastName, nickname: d.nickname,
      phone: d.phone, photoUrl: "", sex: "", birthday: "",
      type: d.type, salaryType: "2", salary: "", nationalId: "", isSale: d.isSale,
    });
    if (!saved.ok) return { ok: false, error: `สร้างแล้วแต่เติมข้อมูลไม่ครบ: ${saved.error}` };

    // 3) จัดเข้าตำแหน่ง (ถ้าเลือก) → org_unit_id + สิทธิ์อัตโนมัติ
    if (d.orgUnitId) {
      const assigned = await assignStaffToPosition({ adminId: loginId, orgUnitId: d.orgUnitId });
      if (!assigned.ok) return { ok: false, error: `สร้างแล้วแต่จัดตำแหน่งไม่สำเร็จ: ${assigned.error}` };
    }

    await logAdminAction(actor, "hr.create_staff", "profiles+tb_admin", loginId, { isSale: d.isSale, orgUnitId: d.orgUnitId });
    revalidatePath("/admin/hr/staff");
    revalidatePath("/admin/hr/org-chart");
    return { ok: true, data: { adminId: loginId } };
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
