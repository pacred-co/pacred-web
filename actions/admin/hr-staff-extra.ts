"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";
import type { StaffAddressRow, StaffEducationRow } from "@/lib/admin/hr-staff-extra";

/**
 * HR พนักงาน — CRUD ที่อยู่ + การศึกษา (owner 4a · faithful PCS HR · mig 0293).
 * child records keyed `admin_login_id`. RBAC = super | accounting (เหมือน hr-staff.ts).
 * เขียน tb ลูก 0293 ที่เดียว (isolated · ไม่แตะเงิน/ตัวตน · §0e).
 */

const HR_ROLES = ["super", "accounting"] as const;

function revalidate(adminId: string) {
  revalidatePath("/admin/hr/staff");
  revalidatePath(`/admin/hr/staff/${adminId}/edit`);
}

// ════════════════════════════════════════════════════════════════════
// ที่อยู่
// ════════════════════════════════════════════════════════════════════
const addAddressSchema = z.object({
  adminId: z.string().trim().min(1).max(60),
  label: z.string().trim().max(120),
  address: z.string().trim().min(1, "กรุณากรอกที่อยู่").max(500),
  subdistrict: z.string().trim().max(120),
  district: z.string().trim().max(120),
  province: z.string().trim().max(120),
  zipcode: z.string().trim().max(10),
});
export type AddStaffAddressInput = z.infer<typeof addAddressSchema>;

/** เพิ่มที่อยู่พนักงาน 1 รายการ → คืน row ที่สร้าง (ให้ client ต่อท้ายลิสต์ได้) */
export async function addStaffAddress(input: AddStaffAddressInput): Promise<AdminActionResult<StaffAddressRow>> {
  const parsed = addAddressSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const d = parsed.data;

  return withAdmin([...HR_ROLES], async ({ adminId: actor }) => {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("hr_staff_address")
      .insert({
        admin_login_id: d.adminId,
        label: d.label || null,
        address: d.address,
        subdistrict: d.subdistrict || null,
        district: d.district || null,
        province: d.province || null,
        zipcode: d.zipcode || null,
      })
      .select("id,label,address,subdistrict,district,province,zipcode")
      .maybeSingle();
    if (error) return { ok: false, error: `db_error:${error.code ?? "unknown"}` };
    if (!data) return { ok: false, error: "insert_no_row" };

    await logAdminAction(actor, "hr.add_staff_address", "hr_staff_address", d.adminId, { id: (data as { id: string }).id });
    revalidate(d.adminId);
    const r = data as { id: string; label: string | null; address: string | null; subdistrict: string | null; district: string | null; province: string | null; zipcode: string | null };
    return {
      ok: true,
      data: {
        id: r.id,
        label: r.label ?? "",
        address: r.address ?? "",
        subdistrict: r.subdistrict ?? "",
        district: r.district ?? "",
        province: r.province ?? "",
        zipcode: r.zipcode ?? "",
      },
    };
  });
}

const removeAddressSchema = z.object({
  adminId: z.string().trim().min(1).max(60),
  id: z.string().uuid(),
});
export type RemoveStaffAddressInput = z.infer<typeof removeAddressSchema>;

/** ลบที่อยู่พนักงาน 1 รายการ (scope ด้วย adminId กันลบข้ามคน) */
export async function removeStaffAddress(input: RemoveStaffAddressInput): Promise<AdminActionResult> {
  const parsed = removeAddressSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const d = parsed.data;

  return withAdmin([...HR_ROLES], async ({ adminId: actor }) => {
    const admin = createAdminClient();
    const { error } = await admin
      .from("hr_staff_address")
      .delete()
      .eq("id", d.id)
      .eq("admin_login_id", d.adminId);
    if (error) return { ok: false, error: `db_error:${error.code ?? "unknown"}` };

    await logAdminAction(actor, "hr.remove_staff_address", "hr_staff_address", d.adminId, { id: d.id });
    revalidate(d.adminId);
    return { ok: true };
  });
}

// ════════════════════════════════════════════════════════════════════
// การศึกษา
// ════════════════════════════════════════════════════════════════════
const EDU_LEVELS = ["ประถม", "มัธยม", "ปวช", "ปวส", "ปริญญาตรี", "ปริญญาโท", "ปริญญาเอก"] as const;

const addEducationSchema = z.object({
  adminId: z.string().trim().min(1).max(60),
  level: z.string().trim().max(60),
  institution: z.string().trim().min(1, "กรุณากรอกสถาบัน").max(255),
  major: z.string().trim().max(255),
  graduationYear: z.string().trim().max(10),
});
export type AddStaffEducationInput = z.infer<typeof addEducationSchema>;

/** เพิ่มประวัติการศึกษาพนักงาน 1 รายการ → คืน row ที่สร้าง */
export async function addStaffEducation(input: AddStaffEducationInput): Promise<AdminActionResult<StaffEducationRow>> {
  const parsed = addEducationSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const d = parsed.data;
  // ระดับต้องเป็นค่าในลิสต์ (หรือว่าง) — กันค่าแปลก
  const level = (EDU_LEVELS as readonly string[]).includes(d.level) ? d.level : "";

  return withAdmin([...HR_ROLES], async ({ adminId: actor }) => {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("hr_staff_education")
      .insert({
        admin_login_id: d.adminId,
        level: level || null,
        institution: d.institution,
        major: d.major || null,
        graduation_year: d.graduationYear || null,
      })
      .select("id,level,institution,major,graduation_year")
      .maybeSingle();
    if (error) return { ok: false, error: `db_error:${error.code ?? "unknown"}` };
    if (!data) return { ok: false, error: "insert_no_row" };

    await logAdminAction(actor, "hr.add_staff_education", "hr_staff_education", d.adminId, { id: (data as { id: string }).id });
    revalidate(d.adminId);
    const r = data as { id: string; level: string | null; institution: string | null; major: string | null; graduation_year: string | null };
    return {
      ok: true,
      data: {
        id: r.id,
        level: r.level ?? "",
        institution: r.institution ?? "",
        major: r.major ?? "",
        graduationYear: r.graduation_year ?? "",
      },
    };
  });
}

const removeEducationSchema = z.object({
  adminId: z.string().trim().min(1).max(60),
  id: z.string().uuid(),
});
export type RemoveStaffEducationInput = z.infer<typeof removeEducationSchema>;

/** ลบประวัติการศึกษาพนักงาน 1 รายการ (scope ด้วย adminId) */
export async function removeStaffEducation(input: RemoveStaffEducationInput): Promise<AdminActionResult> {
  const parsed = removeEducationSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const d = parsed.data;

  return withAdmin([...HR_ROLES], async ({ adminId: actor }) => {
    const admin = createAdminClient();
    const { error } = await admin
      .from("hr_staff_education")
      .delete()
      .eq("id", d.id)
      .eq("admin_login_id", d.adminId);
    if (error) return { ok: false, error: `db_error:${error.code ?? "unknown"}` };

    await logAdminAction(actor, "hr.remove_staff_education", "hr_staff_education", d.adminId, { id: d.id });
    revalidate(d.adminId);
    return { ok: true };
  });
}
