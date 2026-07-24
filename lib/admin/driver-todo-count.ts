import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * "งานที่ต้องส่ง" ของคนขับหนึ่งคน = จำนวนรอบจัดส่งที่มอบให้เขาและยังเปิดอยู่
 * (`tb_forwarder_driver` WHERE `fdadminid` = member_code AND `fdstatus`='1'
 * = กำลังดำเนินการ). ตรงกับสิ่งที่หน้า `/admin/drivers?view=todo` แสดง (self-scoped)
 * → เลข badge บนแถบล่างมือถือกับหน้ารายการจึงตรงกันเสมอ (§0f) (ปอน 2026-07-24).
 *
 * READ-ONLY · best-effort — คืน 0 เมื่อไม่มี code / error (ไม่ throw · ห้ามทำให้
 * layout ทั้งหน้าล้มเพราะนับ badge ไม่ได้).
 */
export async function countDriverOpenBatches(driverMemberCode: string | null): Promise<number> {
  const code = (driverMemberCode ?? "").trim();
  if (!code) return 0;

  const admin = createAdminClient();
  const { count, error } = await admin
    .from("tb_forwarder_driver")
    .select("id", { count: "exact", head: true })
    .eq("fdadminid", code)
    .eq("fdstatus", "1");
  if (error) {
    console.error("[countDriverOpenBatches] failed", { code: error.code, message: error.message });
    return 0;
  }
  return count ?? 0;
}
