/**
 * sales-rep-contact — resolve the assigned sales rep contact (name + tel)
 * for a customer (tb_users.userid).
 *
 * Used by the customer-facing fallback banner on
 * `/service-import/[fNo]/invoice` when no `tb_receipt` has been issued
 * yet, so the customer knows whom to contact ("กรุณาติดต่อเซลล์ผู้ดูแล …").
 *
 * Data path:
 *   tb_users.adminidsale → tb_admin.adminID → { adminName, adminTel }
 *
 * If the user has no `adminidsale` on file (legacy walk-ins · imports
 * with NULL sales rep) the helper returns a safe Pacred-wide fallback
 * (CONTACT.phoneCs · CONTACT.phoneCsDisplay) so the customer is never
 * shown an empty contact box.
 */

import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { CONTACT } from "@/components/seo/site";

export type SalesRepContact = {
  /** Display name (admin's first+last when available · "Pacred CS" fallback). */
  name:        string;
  /** Phone — international form for `tel:` href. */
  phone:       string;
  /** Phone — display form (xx-xxx-xxxx). */
  phoneDisplay: string;
  /** Email (best-effort — may be empty). */
  email:       string;
  /** True when this is the assigned sales rep · false when fallback CS. */
  isAssigned:  boolean;
};

/**
 * Resolve the assigned sales rep for a customer's tb_users.userid.
 * Returns Pacred CS fallback when no assigned rep is on file.
 */
export async function getSalesRepContactForUserid(
  userid: string,
): Promise<SalesRepContact> {
  const fallback: SalesRepContact = {
    name:         "Pacred Customer Service",
    phone:        CONTACT.phoneCs,
    phoneDisplay: CONTACT.phoneCsDisplay,
    email:        CONTACT.emailDocs,
    isAssigned:   false,
  };
  if (!userid) return fallback;

  const admin = createAdminClient();

  // tb_users.adminIDSale — the sales-rep adminID for this customer
  // (camelCase post-migration 0113 · `pcs-admin/legacy-admins` audit).
  const { data: userRow, error: userErr } = await admin
    .from("tb_users")
    .select("adminIDSale")
    .eq("userID", userid)
    .maybeSingle<{ adminIDSale: string | null }>();
  if (userErr) {
    console.error(`[sales-rep-contact tb_users lookup] failed`, {
      code: userErr.code, message: userErr.message, userid,
    });
    return fallback;
  }
  const adminIdSale = userRow?.adminIDSale?.trim();
  if (!adminIdSale) return fallback;

  // tb_admin.adminID → name + tel + email.
  const { data: adminRow, error: adminErr } = await admin
    .from("tb_admin")
    .select("adminName, adminLastName, adminTel, adminEmail")
    .eq("adminID", adminIdSale)
    .maybeSingle<{
      adminName:     string | null;
      adminLastName: string | null;
      adminTel:      string | null;
      adminEmail:    string | null;
    }>();
  if (adminErr) {
    console.error(`[sales-rep-contact tb_admin lookup] failed`, {
      code: adminErr.code, message: adminErr.message, adminIdSale,
    });
    return fallback;
  }
  if (!adminRow) return fallback;

  const fullName =
    `${adminRow.adminName ?? ""} ${adminRow.adminLastName ?? ""}`.trim() ||
    fallback.name;
  const tel = (adminRow.adminTel ?? "").trim();
  const intl = tel ? toIntlPhone(tel) : fallback.phone;
  const disp = tel ? toDisplayPhone(tel) : fallback.phoneDisplay;

  return {
    name:         fullName,
    phone:        intl,
    phoneDisplay: disp,
    email:        adminRow.adminEmail?.trim() || fallback.email,
    isAssigned:   true,
  };
}

/** "0617799299" → "+66617799299" — best-effort, returns input unchanged
 *  if it's not a 0-leading Thai mobile/landline. */
function toIntlPhone(s: string): string {
  const digits = s.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return digits;
  if (digits.startsWith("0")) return "+66" + digits.slice(1);
  return digits;
}

/** "0617799299" → "061-779-9299" — Thai mobile-tel display format. */
function toDisplayPhone(s: string): string {
  const digits = s.replace(/\D/g, "");
  if (digits.length === 10 && digits.startsWith("0")) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 9 && digits.startsWith("0")) {
    // 02-xxx-xxxx (Bangkok landline)
    return `${digits.slice(0, 2)}-${digits.slice(2, 5)}-${digits.slice(5)}`;
  }
  return s;
}
