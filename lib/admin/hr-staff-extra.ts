import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * HR พนักงาน — ที่อยู่ + การศึกษา (owner 4a · faithful PCS HR · mig 0293).
 * child records หลาย row ต่อคน · keyed `admin_login_id`
 * (= tb_admin.adminID = profiles.admin_login_id · แกนเดียวกับ mig 0292).
 *
 * fail-soft: ตาราง 0293 อาจยังไม่ถูก apply บน dev DB → อ่านไม่ได้ก็ log แล้ว
 * คืน [] (หน้าแก้พนักงานต้องไม่ 500 · §0c). แยกไฟล์ให้ไม่ชนกับ hr-staff.ts.
 */

export type StaffAddressRow = {
  id: string;
  label: string;
  address: string;
  subdistrict: string;
  district: string;
  province: string;
  zipcode: string;
};

export type StaffEducationRow = {
  id: string;
  level: string;
  institution: string;
  major: string;
  graduationYear: string;
};

type AddrRaw = {
  id: string; label: string | null; address: string | null;
  subdistrict: string | null; district: string | null;
  province: string | null; zipcode: string | null;
};
type EduRaw = {
  id: string; level: string | null; institution: string | null;
  major: string | null; graduation_year: string | null;
};

const s = (v: string | null | undefined) => (v ?? "").trim();

/** โหลดที่อยู่ทั้งหมดของพนักงานคนหนึ่ง (fail-soft → []) */
export async function loadStaffAddresses(adminLoginId: string): Promise<StaffAddressRow[]> {
  const admin = createAdminClient();
  try {
    const { data, error } = await admin
      .from("hr_staff_address")
      .select("id,label,address,subdistrict,district,province,zipcode")
      .eq("admin_login_id", adminLoginId)
      .order("created_at", { ascending: true });
    if (error) {
      // ตาราง 0293 อาจยังไม่ apply → ปล่อยว่าง ดีกว่าทั้งหน้าล้ม
      console.error("[hr-staff-extra] อ่านที่อยู่พนักงานไม่ได้", { code: error.code, message: error.message });
      return [];
    }
    return ((data ?? []) as AddrRaw[]).map((r) => ({
      id: r.id,
      label: s(r.label),
      address: s(r.address),
      subdistrict: s(r.subdistrict),
      district: s(r.district),
      province: s(r.province),
      zipcode: s(r.zipcode),
    }));
  } catch (e) {
    console.error("[hr-staff-extra] loadStaffAddresses threw", e);
    return [];
  }
}

/** โหลดประวัติการศึกษาทั้งหมดของพนักงานคนหนึ่ง (fail-soft → []) */
export async function loadStaffEducation(adminLoginId: string): Promise<StaffEducationRow[]> {
  const admin = createAdminClient();
  try {
    const { data, error } = await admin
      .from("hr_staff_education")
      .select("id,level,institution,major,graduation_year")
      .eq("admin_login_id", adminLoginId)
      .order("created_at", { ascending: true });
    if (error) {
      console.error("[hr-staff-extra] อ่านการศึกษาพนักงานไม่ได้", { code: error.code, message: error.message });
      return [];
    }
    return ((data ?? []) as EduRaw[]).map((r) => ({
      id: r.id,
      level: s(r.level),
      institution: s(r.institution),
      major: s(r.major),
      graduationYear: s(r.graduation_year),
    }));
  } catch (e) {
    console.error("[hr-staff-extra] loadStaffEducation threw", e);
    return [];
  }
}
