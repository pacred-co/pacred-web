/**
 * Pure validators + legacy code maps for the admin customer-identity (P0-17)
 * + juristic (P0-18) flows. Extracted from the `"use server"` action file
 * (actions/admin/customers.ts) so the load-bearing logic — the identity
 * field-map Zod schema + the corporate-status code map — is unit-testable
 * without mocking Supabase/cookies. Mirrors lib/legacy-paystatus-map.ts.
 *
 * Sources (verified verbatim — ห้ามเดา):
 *   - identity fields:  pcs-admin/users.php `update` POST (~L30-71)
 *                       + include/pages/users/editUser.php
 *   - corporatestatus:  pcs-admin/include/function.php:530 statusComp()
 *                       + users.php:866 editCompStatus + api/otp signup INSERT
 */
import { z } from "zod";

/**
 * Legacy tb_corporate.corporatestatus codes (statusComp · function.php:530):
 *   '1' = รอตรวจสอบ (pending · the signup default + the queue filter)
 *   '2' = อนุมัติแล้ว (verified · editCompStatus writes this)
 *   '3' = ไม่ผ่าน    (rejected)
 */
export const CORP_STATUS = { PENDING: "1", VERIFIED: "2", REJECTED: "3" } as const;
export type CorpStatusCode = (typeof CORP_STATUS)[keyof typeof CORP_STATUS];

const CORP_STATUS_LABEL: Record<string, string> = {
  "1": "รอตรวจสอบ",
  "2": "อนุมัติแล้ว",
  "3": "ไม่ผ่าน",
};

/** Map a corporatestatus code → Thai label (statusComp fidelity). */
export function corporateStatusLabel(code: string | null | undefined): string {
  return CORP_STATUS_LABEL[code ?? ""] ?? "ไม่พบข้อมูล";
}

/**
 * The customer-identity editor field map (legacy editUser modal).
 *
 * ALL roles may edit: userName · userLastName · userEmail · userTel ·
 *   userSex · userBirthday · userLineID · userFacebook.
 * SENIOR roles additionally edit: adminIDSale · coID (gated in the action,
 *   not the schema — the schema accepts them, the action drops them for
 *   non-senior admins).
 *
 * Legacy guards reproduced: userName + userLastName required (non-empty);
 *   userTel 9-10 digits; email optional (column is nullable, "" clears it).
 */
export const updateUserIdentitySchema = z.object({
  userid:       z.string().trim().min(1).max(20),
  userName:     z.string().trim().min(1, "กรอกชื่อจริง").max(200),
  userLastName: z.string().trim().min(1, "กรอกนามสกุล").max(200),
  userEmail:    z.string().trim().toLowerCase().email("อีเมลไม่ถูกต้อง").max(100).or(z.literal("")),
  userTel:      z.string().trim().regex(/^\d{9,10}$/, "เบอร์โทร 9-10 หลัก (ไม่มีขีด)"),
  userSex:      z.enum(["male", "female", ""]).optional().default(""),
  // Optional; "" or omitted clears the column (legacy date is nullable). A
  // present value must be ISO yyyy-mm-dd.
  userBirthday: z.union([z.literal(""), z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "วันเกิดต้องเป็น YYYY-MM-DD")]).optional().default(""),
  userLineID:   z.string().trim().max(50).optional().default(""),
  userFacebook: z.string().trim().max(255).optional().default(""),
  adminIDSale:  z.string().trim().max(20).optional(),
  coID:         z.string().trim().max(10).optional(),
});
export type UpdateUserIdentityInput = z.infer<typeof updateUserIdentitySchema>;

/** Convert-to-juristic field map (legacy update-corporate POST). */
export const convertToJuristicSchema = z.object({
  userid:          z.string().trim().min(1).max(20),
  tax_id:          z.string().trim().regex(/^\d{13}$/, "เลขผู้เสียภาษีต้อง 13 หลัก"),
  company_name:    z.string().trim().min(1, "กรอกชื่อบริษัท").max(300),
  // Optional; a blank string normalises to undefined (the action then stores
  // "" — the legacy NOT-NULL corporateaddress column never holds Postgres NULL).
  company_address: z.string().trim().max(2000).optional().transform((v) => (v && v.length > 0 ? v : undefined)),
  mark_verified:   z.boolean().default(true),
});
export type ConvertToJuristicInput = z.infer<typeof convertToJuristicSchema>;
