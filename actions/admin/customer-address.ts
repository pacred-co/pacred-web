"use server";

/**
 * adminAddCustomerAddress — add a delivery address ON BEHALF OF a customer, from
 * any admin surface that has a <CustomerAddressPicker> (forwarder detail + the
 * billing-run document). Save-or-reuse into tb_address (the customer's own address
 * book) so the new row is reusable everywhere the customer's addresses are read.
 *
 * Mirrors the customer own-add INSERT shape (app/[locale]/(protected)/addresses/
 * add-address-action.ts): the required-field guard + the `adminid`/`addressstatus`
 * NOT-NULL defaults. The difference: `adminid` = the acting staff's legacy adminID
 * (this WAS admin-entered), and `addressstatus:"1"` is written explicitly.
 *
 * Ownership: scoped to the passed `userid` (must exist in tb_users). The picker
 * on each surface only ever passes THIS surface's customer's userid.
 *
 * NO money / status / tb_forwarder / tb_forwarder_invoice write — pure address-book
 * save-or-reuse. Returns the addressID so the picker can auto-select it.
 */

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { customerAddressSchema, saveCustomerAddress } from "@/lib/admin/customer-address-book";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";

const schema = customerAddressSchema.extend({
  userid:             z.string().trim().min(1).max(10).transform((value) => value.toUpperCase()),
  /** Forwarder correction can explicitly make the saved row the next-use default. */
  makeDefault:        z.boolean().optional().default(false),
  /** which surface to revalidate after the insert (optional). */
  revalidate:         z.string().trim().optional(),
});
export type AdminAddCustomerAddressInput = z.input<typeof schema>;

// Same local pattern as forwarders-field-edits.resolveLegacyAdminId.
async function resolveLegacyAdminId(): Promise<string> {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) console.error(`[customer-address.resolveLegacyAdminId] failed`, { code: error.code, message: error.message });
  const email = user?.email ?? null;
  if (!email) return "system";
  const admin = createAdminClient();
  const { data, error: aErr } = await admin
    .from("tb_admin").select("adminID").eq("adminEmail", email)
    .maybeSingle<{ adminID: string | null }>();
  if (aErr) console.error(`[customer-address tb_admin lookup] failed`, { code: aErr.code, message: aErr.message });
  return data?.adminID ?? email.slice(0, 10);
}

export async function adminAddCustomerAddress(
  rawInput: AdminAddCustomerAddressInput,
): Promise<AdminActionResult<{ addressId: number; created: boolean; isDefault: boolean }>> {
  const parsed = schema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const d = parsed.data;

  return withAdmin<{ addressId: number; created: boolean; isDefault: boolean }>(["ops", "accounting", "super", "warehouse"], async ({ adminId }) => {
    const admin = createAdminClient();

    // Ownership guard — the customer must exist (mirror adminPickForwarderAddress's
    // implicit userid scoping; the picker only passes the surface's own customer).
    const { data: cust, error: custErr } = await admin
      .from("tb_users").select("userID").eq("userID", d.userid)
      .maybeSingle<{ userID: string }>();
    if (custErr) {
      console.error(`[adminAddCustomerAddress tb_users] failed`, { code: custErr.code, message: custErr.message, userid: d.userid });
      return { ok: false, error: `อ่านข้อมูลลูกค้าไม่สำเร็จ: ${custErr.message}` };
    }
    if (!cust) return { ok: false, error: "ไม่พบลูกค้ารายนี้" };

    const legacyAdminId = (await resolveLegacyAdminId()).slice(0, 30);

    const saved = await saveCustomerAddress(admin, {
      userid: d.userid,
      address: d,
      adminid: legacyAdminId,
      forceDefault: d.makeDefault,
    });
    if (saved.error || !saved.data) {
      console.error(`[adminAddCustomerAddress save] failed`, { message: saved.error, userid: d.userid });
      return { ok: false, error: saved.error ?? "บันทึกที่อยู่ไม่สำเร็จ" };
    }

    await logAdminAction(adminId, "tb_address.admin_save", "tb_address", String(saved.data.addressId), {
      userid:   d.userid,
      province: d.addressprovince,
      created: saved.data.created,
      isDefault: saved.data.isDefault,
    });

    if (d.revalidate) revalidatePath(d.revalidate);
    return { ok: true, data: saved.data };
  });
}
