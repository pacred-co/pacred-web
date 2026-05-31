"use server";

/**
 * Admin > forwarder detail "แก้ไขที่อยู่ / การขนส่ง" — faithful port of the
 * small per-field update handlers in legacy `pcs-admin/forwarder.php`
 * (the detail-page editor) onto the legacy `tb_forwarder` table.
 *
 * Theme A cont · 2026-05-31 (เดฟ · ภูม offline · forwarder lane).
 * These close the "[fNo] detail editor dead on real rows" gap (re-sweep A2 #3)
 * for the two highest-value, lowest-risk sub-fields. Dimensions+re-pricing
 * already live in forwarders-edit.ts; status/cabinet/tracking/note in
 * forwarders.ts (adminBulkUpdateForwarderTbStatus); payment in pay-user.ts.
 *
 * Per AGENTS.md §0a: legacy = the column/flow source; UI is our own design.
 *
 * Handlers ported (legacy line refs):
 *   - update_fAddress       (forwarder.php L1713-1752) — re-pick the delivery
 *     address from the customer's saved tb_address book. Guard fShipBy!='PCS'
 *     (PCS = รับเอง, no shipping address). Copies a SNAPSHOT of the chosen
 *     address into tb_forwarder.fAddress* (legacy stores the snapshot, not a FK).
 *   - update_fTransportType (forwarder.php L1458-1467) — swap รถ/เรือ/อากาศ.
 *     Legacy updates ONLY the column (does NOT re-price); we match that + the
 *     UI warns the admin to re-save dimensions to recompute the rate.
 *
 * Casing: tb_forwarder + tb_address are lowercase-columns (faddressname,
 * addressid, userid, fshipby, ftransporttype). tb_admin is camelCase (adminID).
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";

// Local resolveLegacyAdminId (same pattern as forwarders-edit.ts / pay-user.ts
// — known consolidation TODO; kept local to avoid premature extraction).
async function resolveLegacyAdminId(): Promise<string> {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) console.error(`[forwarders-field-edits.resolveLegacyAdminId] failed`, { code: error.code, message: error.message });
  const email = user?.email ?? null;
  if (!email) return "system";
  const admin = createAdminClient();
  const { data, error: aErr } = await admin
    .from("tb_admin").select("adminID").eq("adminEmail", email)
    .maybeSingle<{ adminID: string | null }>();
  if (aErr) console.error(`[forwarders-field-edits tb_admin lookup] failed`, { code: aErr.code, message: aErr.message });
  return data?.adminID ?? email.slice(0, 10);
}

// ── update_fAddress — re-pick from the customer's tb_address book ────────────
const pickAddressSchema = z.object({
  fId:       z.number().int().positive(),
  addressId: z.number().int().positive(),
});
export type AdminPickForwarderAddressInput = z.infer<typeof pickAddressSchema>;

export async function adminPickForwarderAddress(
  rawInput: AdminPickForwarderAddressInput,
): Promise<AdminActionResult> {
  const parsed = pickAddressSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const d = parsed.data;

  return withAdmin(["ops", "accounting", "super"], async ({ adminId }) => {
    const admin = createAdminClient();
    const legacyAdminId = (await resolveLegacyAdminId()).slice(0, 10);

    // 1. Read the forwarder — need fshipby (guard) + userid (ownership of the address).
    const { data: fwd, error: fwdErr } = await admin
      .from("tb_forwarder")
      .select("id, userid, fshipby")
      .eq("id", d.fId)
      .maybeSingle<{ id: number; userid: string; fshipby: string | null }>();
    if (fwdErr) {
      console.error(`[adminPickForwarderAddress tb_forwarder] failed`, { code: fwdErr.code, message: fwdErr.message, fId: d.fId });
      return { ok: false, error: `อ่านรายการไม่สำเร็จ: ${fwdErr.message}` };
    }
    if (!fwd) return { ok: false, error: "ไม่พบรายการฝากนำเข้า" };

    // Legacy guard (L1721): PCS = รับเองที่โกดัง → ไม่มีที่อยู่จัดส่ง.
    if ((fwd.fshipby ?? "").trim() === "PCS") {
      return { ok: false, error: "รายการนี้เป็นแบบรับเองที่โกดัง (PCS) — เปลี่ยนที่อยู่จัดส่งไม่ได้" };
    }

    // 2. Read the chosen address — MUST belong to the same customer + be active
    //    (ownership guard: addressid AND userid AND addressstatus='1').
    const { data: addr, error: addrErr } = await admin
      .from("tb_address")
      .select("addressname, addresslastname, addresstel, addresstel2, addressno, addresssubdistrict, addressdistrict, addressprovince, addresszipcode, addressnote")
      .eq("addressid", d.addressId)
      .eq("userid", fwd.userid)
      .eq("addressstatus", "1")
      .maybeSingle<{
        addressname: string | null; addresslastname: string | null;
        addresstel: string | null; addresstel2: string | null; addressno: string | null;
        addresssubdistrict: string | null; addressdistrict: string | null;
        addressprovince: string | null; addresszipcode: string | null; addressnote: string | null;
      }>();
    if (addrErr) {
      console.error(`[adminPickForwarderAddress tb_address] failed`, { code: addrErr.code, message: addrErr.message, addressId: d.addressId });
      return { ok: false, error: `อ่านที่อยู่ไม่สำเร็จ: ${addrErr.message}` };
    }
    if (!addr) return { ok: false, error: "ไม่พบที่อยู่ของลูกค้ารายนี้ (หรือถูกลบไปแล้ว)" };

    // 3. Copy the SNAPSHOT into tb_forwarder.fAddress* (legacy L1737-1739).
    const { error: updErr } = await admin
      .from("tb_forwarder")
      .update({
        faddressname:        addr.addressname ?? "",
        faddresslastname:    addr.addresslastname ?? "",
        faddressno:          addr.addressno ?? "",
        faddresssubdistrict: addr.addresssubdistrict ?? "",
        faddressdistrict:    addr.addressdistrict ?? "",
        faddressprovince:    addr.addressprovince ?? "",
        faddresszipcode:     addr.addresszipcode ?? "",
        faddressnote:        addr.addressnote ?? "",
        faddresstel:         addr.addresstel ?? "",
        faddresstel2:        addr.addresstel2 ?? "",
        adminidupdate:       legacyAdminId,
      })
      .eq("id", d.fId);
    if (updErr) {
      console.error(`[adminPickForwarderAddress update] failed`, { code: updErr.code, message: updErr.message, fId: d.fId });
      return { ok: false, error: `บันทึกที่อยู่ไม่สำเร็จ: ${updErr.message}` };
    }

    await logAdminAction(adminId, "tb_forwarder.update_address", "tb_forwarder", String(d.fId), {
      addressId: d.addressId,
      userid:    fwd.userid,
      to:        `${addr.addressname ?? ""} ${addr.addresslastname ?? ""} · ${addr.addressprovince ?? ""}`,
    });

    revalidatePath(`/admin/forwarders/${d.fId}`);
    revalidatePath("/admin/forwarders");
    return { ok: true };
  });
}

// ── update_fTransportType — swap รถ/เรือ/อากาศ (column only · legacy L1458) ──
const transportSchema = z.object({
  fId:           z.number().int().positive(),
  transportType: z.enum(["1", "2", "3"] as const), // 1 รถ · 2 เรือ · 3 อากาศ
});
export type AdminUpdateForwarderTransportInput = z.infer<typeof transportSchema>;

export async function adminUpdateForwarderTransportType(
  rawInput: AdminUpdateForwarderTransportInput,
): Promise<AdminActionResult> {
  const parsed = transportSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const d = parsed.data;

  return withAdmin(["ops", "accounting", "super"], async ({ adminId }) => {
    const admin = createAdminClient();
    const legacyAdminId = (await resolveLegacyAdminId()).slice(0, 10);

    // Read current for the audit before/after (and to confirm the row exists).
    const { data: fwd, error: fwdErr } = await admin
      .from("tb_forwarder")
      .select("id, ftransporttype")
      .eq("id", d.fId)
      .maybeSingle<{ id: number; ftransporttype: string | null }>();
    if (fwdErr) {
      console.error(`[adminUpdateForwarderTransportType read] failed`, { code: fwdErr.code, message: fwdErr.message, fId: d.fId });
      return { ok: false, error: `อ่านรายการไม่สำเร็จ: ${fwdErr.message}` };
    }
    if (!fwd) return { ok: false, error: "ไม่พบรายการฝากนำเข้า" };
    if ((fwd.ftransporttype ?? "").trim() === d.transportType) {
      return { ok: false, error: "ไม่มีการเปลี่ยนแปลง (ประเภทขนส่งเดิม)" };
    }

    // Legacy L1461: updates ONLY the column (does NOT re-price). We match it;
    // the UI tells the admin to re-save dimensions if the rate must recompute.
    const { error: updErr } = await admin
      .from("tb_forwarder")
      .update({ ftransporttype: d.transportType, adminidupdate: legacyAdminId })
      .eq("id", d.fId);
    if (updErr) {
      console.error(`[adminUpdateForwarderTransportType update] failed`, { code: updErr.code, message: updErr.message, fId: d.fId });
      return { ok: false, error: `บันทึกไม่สำเร็จ: ${updErr.message}` };
    }

    await logAdminAction(adminId, "tb_forwarder.update_transport_type", "tb_forwarder", String(d.fId), {
      before: fwd.ftransporttype, after: d.transportType,
    });

    revalidatePath(`/admin/forwarders/${d.fId}`);
    revalidatePath("/admin/forwarders");
    return { ok: true };
  });
}
