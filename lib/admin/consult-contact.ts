import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * เบอร์ "ปรึกษา" ที่คนขับกดโทรจากแถบเมนูล่างมือถือ = กีตาร์ (ผู้จัดรอบส่ง ·
 * admin_login_id `admin_keetar` · AD021). owner 2026-07-25 "อิงเบอร์ keetar
 * จากในระบบได้เลย" → ดึงสดจาก `profiles.phone` เพื่อให้ keetar แก้เบอร์ในระบบ
 * แล้วปุ่มโทรตามเอง (ไม่ต้องแก้โค้ด). best-effort → null เมื่ออ่านไม่ได้
 * (ตัวเรียกมี fallback เบอร์คงที่ของ keetar อยู่แล้ว).
 */
const CONSULT_ADMIN_LOGIN = "admin_keetar";

export async function getDriverConsultTel(): Promise<string | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .select("phone")
    .eq("admin_login_id", CONSULT_ADMIN_LOGIN)
    .maybeSingle();
  if (error) {
    console.error("getDriverConsultTel: อ่านเบอร์ keetar ไม่ได้", error);
    return null;
  }
  // เก็บเฉพาะตัวเลข + เครื่องหมาย + (เผื่อเบอร์สากล) ให้ tel: ใช้ได้สะอาด
  const tel = (data?.phone ?? "").replace(/[^\d+]/g, "").trim();
  return tel || null;
}
