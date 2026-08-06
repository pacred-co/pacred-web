import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * แปลงรหัสเซล (`tb_users.adminIDSale` เช่น "admin_center") → ชื่อคน (owner 2026-08-05
 * "หน้าอื่นๆ ยังขึ้นบัคเป็นรหัส uid sales · แสดงผลหยาบจัด"). batch ทีเดียวสำหรับ
 * หน้า list — เร็วกว่า resolve ทีละ userid (sales-rep-contact.ts เหมาะ 1 คน).
 *
 * source = tb_admin (แหล่งเดียวข้อมูลพนักงาน · mig 0292) → ชื่อเล่นถ้ามี ไม่งั้น
 * ชื่อ-นามสกุล · fallback = รหัสเดิม (ไม่หายไปเฉยๆ).
 */
export async function resolveSaleRepNameMap(
  codes: (string | null | undefined)[],
): Promise<Map<string, string>> {
  const uniq = [...new Set(codes.map((c) => (c ?? "").trim()).filter(Boolean))];
  const out = new Map<string, string>();
  if (!uniq.length) return out;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("tb_admin")
    .select("adminID,adminName,adminLastName,adminNickname")
    .in("adminID", uniq);
  if (error) {
    console.error("[sale-rep-names] resolve failed", { code: error.code, message: error.message });
    return out; // fail-soft: ปล่อยให้ caller ใช้รหัสเดิม (ไม่ล้มทั้งหน้า)
  }
  for (const a of (data ?? []) as {
    adminID: string; adminName: string | null; adminLastName: string | null; adminNickname: string | null;
  }[]) {
    const nn = (a.adminNickname ?? "").trim();
    const full = [a.adminName, a.adminLastName].map((s) => (s ?? "").trim()).filter(Boolean).join(" ");
    out.set(a.adminID, nn || full || a.adminID);
  }
  return out;
}

/** ป้ายแสดงเซล: ชื่อคน (fallback รหัส) · "—" ถ้าไม่มี. ใช้กับ map ที่ resolve แล้ว */
export function saleRepLabel(code: string | null | undefined, map: Map<string, string>): string {
  const c = (code ?? "").trim();
  if (!c) return "—";
  return map.get(c) ?? c;
}
