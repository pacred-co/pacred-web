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
  // 2026-06-05 (ภูม flag #2) — tb_users.userSex canonical = ภาษาไทย
  // "ชาย"/"หญิง"/"" (legacy SOT · ฟอร์มลูกค้า EditProfileForm ก็ส่ง Thai).
  // Accept both English + Thai input + normalize to Thai before write — กัน
  // split-brain ระหว่างฟอร์ม admin (เคยใช้ English) กับฟอร์มลูกค้า (ใช้ Thai).
  userSex:      z.preprocess(
    (v) => {
      if (v === "male" || v === "ชาย") return "ชาย";
      if (v === "female" || v === "หญิง") return "หญิง";
      return "";
    },
    z.enum(["ชาย", "หญิง", ""]),
  ).optional().default(""),
  // Optional; "" or omitted clears the column (legacy date is nullable). A
  // present value must be ISO yyyy-mm-dd.
  userBirthday: z.union([z.literal(""), z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "วันเกิดต้องเป็น YYYY-MM-DD")]).optional().default(""),
  userLineID:   z.string().trim().max(50).optional().default(""),
  userFacebook: z.string().trim().max(255).optional().default(""),
  adminIDSale:  z.string().trim().max(20).optional(),
  coID:         z.string().trim().max(10).optional(),
});
// 2026-06-05 — use z.input (not z.infer) so preprocess input types stay broad
// (userSex accepts any string · normalize happens inside the schema).
export type UpdateUserIdentityInput = z.input<typeof updateUserIdentitySchema>;

// ───────────────────────────────────────────────────────────────────────────
// Billing / display identity resolver (2026-07-03)
//
// THE single source of truth for "which name/tax-id/address does a document or
// header show for THIS customer" — juristic (นิติบุคคล) vs person. Before this,
// every juristic-aware surface reimplemented the same 3-line inline pattern
//   isJuristic = userCompany==='1' || corp.corporatenumber
//   name       = corp.corporatename ?? `${userName} ${userLastName}`
//   taxId      = corp.corporatenumber ?? ""
//   address    = corp.corporateaddress ?? ""
// and the leaking surfaces (admin header · portal profile · ใบเสนอราคา) simply
// never ran it — they showed the person for a company. This pure function is
// the reusable home so every surface resolves identity identically.
//
// DISPLAY-ONLY: this changes the identity TEXT shown, never any amount / VAT /
// WHT / tax-doc eligibility / serial. A ใบกำกับภาษี for a juristic buyer must
// show the registered company name + 13-digit tax id + registered address —
// this returns exactly those for isJuristic.
//
// `registeredAddress` is the tb_corporate.corporateaddress (the COMPANY's
// registered address — what tax docs require). It is NOT the shipping/delivery
// address; callers that show a delivery leg keep their own address unchanged.
// ───────────────────────────────────────────────────────────────────────────

/** The tb_corporate columns the resolver needs (null when no corp row). */
export type CorporateIdentityRow = {
  corporatename: string | null;
  corporatenumber: string | null;
  corporateaddress: string | null;
};

export type BillingIdentity = {
  /** True when the customer is a company (userCompany='1' OR a corp tax-id exists). */
  isJuristic: boolean;
  /** Company name for juristic (falls back to the person name if the corp name is blank); else the person full name. */
  name: string;
  /** 13-digit corporate tax id for juristic; '' when none. */
  taxId: string;
  /** Registered company address for juristic; '' when none (caller may fall back to a delivery address). */
  registeredAddress: string;
  /** Always the contact person's full name — for a "ผู้ติดต่อ" sub-line on a juristic header. */
  personName: string;
};

/**
 * Resolve the DISPLAY/BILLING identity for a customer.
 *
 * Juristic detection is the UNION of both signals (`userCompany==='1'` OR a
 * corp row carrying a tax id) — some migrated rows lost `userCompany` but still
 * have a tb_corporate row, so keying on either matches the widest correct set
 * (this is the same union billing-run.ts already used).
 *
 * @example
 *   resolveBillingIdentity({ userCompany: "1", userName: "PEA", userLastName: "PEA",
 *     corp: { corporatename: "HOME CAMERA CO.,LTD.", corporatenumber: "0105564077716", corporateaddress: "…" } })
 *   // → { isJuristic:true, name:"HOME CAMERA CO.,LTD.", taxId:"0105564077716",
 *   //     registeredAddress:"…", personName:"PEA PEA" }
 */
export function resolveBillingIdentity(input: {
  userCompany: string | null | undefined;
  userName: string | null | undefined;
  userLastName: string | null | undefined;
  corp: CorporateIdentityRow | null | undefined;
}): BillingIdentity {
  const personName = `${input.userName ?? ""} ${input.userLastName ?? ""}`.trim();
  const corpName = (input.corp?.corporatename ?? "").trim();
  const taxId = (input.corp?.corporatenumber ?? "").trim();
  const registeredAddress = (input.corp?.corporateaddress ?? "").trim();
  const isJuristic = input.userCompany === "1" || taxId !== "";
  const name = isJuristic ? (corpName || personName) : personName;
  return { isJuristic, name, taxId, registeredAddress, personName };
}

/**
 * Batched tb_corporate → company-name lookup (2026-07-04).
 *
 * THE reusable, N+1-free way for any admin list surface to resolve juristic
 * display names: ONE `.in(userIds)` query, returns a Map<userid, corporatename>
 * (only companies that carry a non-blank name land in the map). Every list page
 * that shows a customer identity should pull this + feed resolveBillingIdentity
 * so นิติบุคคล rows show the company, not the contact person (owner directive:
 * the leak was the contact person appearing where a company name belongs).
 *
 * `admin` is the service-role client (createAdminClient()). Kept structurally
 * typed (PromiseLike so a PostgREST builder satisfies it) so this plain module
 * needn't import the Supabase client type. Soft-fails to an empty map on error —
 * a corp-lookup failure must never blank a list.
 */
export async function fetchCorporateNameMap(
  // Typed loosely as `{ from(table): any }` on purpose: passing the full Supabase
  // client here (its schema generics are enormous) into a precise structural type
  // triggers TS2589 "type instantiation excessively deep" at call sites. `from`
  // returns `any` so no deep structural comparison happens; the result shape is
  // re-asserted below. (createAdminClient() satisfies this trivially.)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: { from: (table: string) => any },
  userIds: (string | null | undefined)[],
): Promise<Map<string, string>> {
  const unique = Array.from(new Set(userIds.filter((x): x is string => !!x)));
  const map = new Map<string, string>();
  if (unique.length === 0) return map;
  const res = (await admin
    .from("tb_corporate")
    .select("userid, corporatename")
    .in("userid", unique)) as {
    data: { userid: string; corporatename: string | null }[] | null;
    error: unknown;
  };
  if (res.error) {
    console.warn("[fetchCorporateNameMap] failed (soft-fail · person name shown)", res.error);
    return map;
  }
  for (const c of res.data ?? []) {
    const nm = (c.corporatename ?? "").trim();
    if (c.userid && nm) map.set(c.userid, nm);
  }
  return map;
}

/** A tb_corporate row shape for resolveBillingIdentity, built from a name-only map. */
export function corpRowFromName(name: string | undefined): CorporateIdentityRow | null {
  return name ? { corporatename: name, corporatenumber: null, corporateaddress: null } : null;
}

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
