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

const assignSchema = z.object({
  adminId: z.string().trim().min(1).max(60), // = profiles.admin_login_id
  orgUnitId: z.string().uuid().nullable(),   // null = ปลดออกจากตำแหน่ง
});

export type AssignStaffInput = z.infer<typeof assignSchema>;

/**
 * จัดพนักงานเข้าตำแหน่ง — เขียน `profiles.org_unit_id` (SPINE · unify 2026-08-03).
 * profiles คือรายชื่อพนักงานที่ครบ (login+role) → เขียนที่นี่ที่เดียว.
 * tb_admin.org_unit_id (0288) เลิกใช้ (คงคอลัมน์ไว้กัน rollback).
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

    const { data: updated, error } = await admin
      .from("profiles")
      .update({ org_unit_id: orgUnitId })
      .eq("admin_login_id", adminId)
      .eq("is_active", true)
      .select("id");
    if (error) return { ok: false, error: `db_error:${error.code ?? "unknown"}` };
    if (!updated || updated.length === 0) return { ok: false, error: "staff_not_found_or_inactive" };

    await logAdminAction(actor, "hr.assign_position", "profiles", adminId, { orgUnitId });
    revalidatePath("/admin/hr/staff");
    revalidatePath("/admin/hr/org-chart");
    revalidatePath("/admin/hr/org-table");
    return { ok: true };
  });
}

// ════════════════════════════════════════════════════════════════════
// แก้ข้อมูลพนักงาน — SINGLE-SOURCE (owner 2026-08-03 · เซล/CS ชื่อ/เบอร์/รูป
// ต้องตรงกันทุก surface: เว็บ · portal ลูกค้า · หลังบ้าน · แอดมิน)
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
 * บันทึกข้อมูลพนักงาน — เขียน **profiles (แกน) + tb_admin (HR + ที่ลูกค้าเห็น)
 * พร้อมกัน** ด้วยค่าเดียวกัน. ชื่อ/เบอร์/รูป = single-source ทุก surface.
 * ถ้ายังไม่มี tb_admin (moo/sunta) → สร้างให้ (ensureLegacyAdminRow).
 */
export async function saveEmployee(input: SaveEmployeeInput): Promise<AdminActionResult> {
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const d = parsed.data;

  return withAdmin([...HR_ROLES], async ({ adminId: actor }) => {
    const admin = createAdminClient();

    // พนักงานต้องมีจริง (active)
    const { data: prof, error: pErr } = await admin
      .from("profiles").select("id").eq("admin_login_id", d.adminId).eq("is_active", true).maybeSingle();
    if (pErr) return { ok: false, error: `db_error:${pErr.code ?? "unknown"}` };
    if (!prof) return { ok: false, error: "staff_not_found_or_inactive" };

    // มี tb_admin ไหม — ไม่มีก็สร้าง (moo/sunta) แล้วค่อยเขียน HR ทับ
    const ens = await ensureLegacyAdminRow(admin, {
      adminID: d.adminId, adminName: d.firstName || d.adminId, adminLastName: d.lastName,
      adminNickname: d.nickname, isSales: d.isSale, createdBy: actor,
    });
    if (!ens.ok) return { ok: false, error: `hr_record:${ens.error ?? "unknown"}` };

    // ── profiles (แกน · identity ที่ HR + ลูกค้าใช้ร่วม) ──
    const { error: upP } = await admin.from("profiles").update({
      first_name: d.firstName, last_name: d.lastName,
      phone: d.phone, avatar_url: d.photoUrl || null,
      sex: d.sex || null, birthday: d.birthday || null,
    }).eq("id", prof.id);
    if (upP) return { ok: false, error: `profiles:${upP.code ?? "unknown"}` };

    // ── tb_admin (HR detail + ที่ลูกค้าเห็นผ่าน adminIDSale) — ค่าเดียวกับ profiles ──
    const salaryNum = d.salary.trim() === "" ? 0 : Number(d.salary);
    const { error: upT } = await admin.from("tb_admin").update({
      adminName: d.firstName, adminLastName: d.lastName, adminNickname: d.nickname,
      adminTel: d.phone,                       // ← เบอร์ที่ลูกค้าเห็น (sales-rep-contact)
      adminPicture: d.photoUrl,                // ← รูปที่ลูกค้าเห็น
      adminSex: d.sex || null, adminBirthday: d.birthday || null,
      adminType: d.type, salaryType: d.salaryType,
      salary: Number.isFinite(salaryNum) ? salaryNum : 0,
      nationalIDCard: d.nationalId, adminStatusSale: d.isSale ? "1" : "0",
    }).eq("adminID", d.adminId);
    if (upT) {
      // เบอร์ชนกัน (UNIQUE adminTel) = เคสที่เจอบ่อย → บอกภาษาคน
      if (upT.code === "23505") return { ok: false, error: "เบอร์โทรนี้มีพนักงานคนอื่นใช้แล้ว" };
      return { ok: false, error: `tb_admin:${upT.code ?? "unknown"}` };
    }

    await logAdminAction(actor, "hr.save_employee", "profiles+tb_admin", d.adminId, {
      firstName: d.firstName, phone: d.phone, isSale: d.isSale, createdHr: ens.created,
    });
    revalidatePath("/admin/hr/staff");
    revalidatePath("/admin/hr/org-chart");
    revalidatePath(`/admin/hr/staff/${d.adminId}/edit`);
    return { ok: true };
  });
}
