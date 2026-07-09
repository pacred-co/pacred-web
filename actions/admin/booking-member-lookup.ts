"use server";

/**
 * ค้นหาสมาชิกจากรหัส PR (สำหรับฟอร์มใบเสนอราคา Booking · 2026-07-09).
 * อ่าน tb_users + tb_corporate จริง → ชื่อผู้ออกบิล/เบอร์/เลขภาษี/ที่อยู่ (นิติ).
 * READ-ONLY · gated ด้วย requireAdmin. ใช้ resolveBillingIdentity เป็น SOT
 * (นิติบุคคล = โชว์ชื่อบริษัท + เลข 13 หลัก + ที่อยู่จดทะเบียน).
 */

import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveBillingIdentity } from "@/lib/admin/customer-identity";

export type MemberLookupResult = {
  found: boolean;
  code: string;
  name: string;
  phone: string;
  taxId: string;
  address: string;
  kind: "person" | "juristic";
};

export async function lookupMemberByCode(rawCode: string): Promise<MemberLookupResult> {
  await requireAdmin();
  const code = (rawCode || "").trim().toUpperCase();
  const empty: MemberLookupResult = {
    found: false, code, name: "", phone: "", taxId: "", address: "", kind: "person",
  };
  if (!/^PR\d+$/.test(code)) return empty;

  const admin = createAdminClient();
  const { data: user, error } = await admin
    .from("tb_users")
    .select("userID, userName, userLastName, userTel, userCompany")
    .eq("userID", code)
    .maybeSingle<{
      userID: string;
      userName: string | null;
      userLastName: string | null;
      userTel: string | null;
      userCompany: string | null;
    }>();
  if (error || !user) return empty;

  const { data: corp } = await admin
    .from("tb_corporate")
    .select("corporatename, corporatenumber, corporateaddress")
    .eq("userid", code)
    .maybeSingle<{
      corporatename: string | null;
      corporatenumber: string | null;
      corporateaddress: string | null;
    }>();

  const identity = resolveBillingIdentity({
    userCompany: user.userCompany,
    userName: user.userName,
    userLastName: user.userLastName,
    corp: corp ?? null,
  });

  return {
    found: true,
    code,
    name: identity.name,
    phone: (user.userTel ?? "").trim(),
    taxId: identity.taxId,
    address: identity.registeredAddress,
    kind: identity.isJuristic ? "juristic" : "person",
  };
}
