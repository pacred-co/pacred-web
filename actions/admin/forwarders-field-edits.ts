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
 *   - update_fUserID        (forwarder.php L1469-1478) — reassign the forwarder
 *     to a different customer (raw data-fix · column-only). We add a guard the
 *     new userid EXISTS in tb_users (legacy didn't validate) + a strong confirm.
 *   - update_fCover         (forwarder.php L1480-1528) — replace the cover image.
 *     Legacy resizes to 450px then writes the filename; we reuse uploadToBucket
 *     (bucket `forwarder-covers`, same as forwarders-new.ts) and store the key.
 *
 * NOTE — fCredit credit-out (forwarder.php L1407-1435) is deliberately NOT
 * ported here: it's a MONEY/debt flow (writes tb_credit.creditvalue) on the
 * broader credit subsystem the 2026-05-31 re-sweep (M2) found broken, AND only
 * 76 / 8,898 customers have a tb_credit row — so the legacy
 * `UPDATE tb_credit WHERE userID` silently drops the debt for ~98% of customers.
 * Porting it needs a credit-subsystem decision (grant-to-76-only vs create-row;
 * customer-side reads rebuilt v_customer_credit_outstanding). Flagged for owner.
 *
 * Casing: tb_forwarder + tb_address are lowercase-columns (faddressname,
 * addressid, userid, fshipby, ftransporttype). tb_users + tb_admin are
 * camelCase (userID, adminID).
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";
import { uploadToBucket } from "@/lib/storage/upload";

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

// ── update_fUserID — reassign forwarder to a different customer ──────────────
// Legacy L1469: UPDATE tb_forwarder SET userID=?, adminIDUpdate=?. Raw data-fix
// (e.g. row created under the wrong account). Legacy did NOT validate the new
// userid; we ADD an existence check (tb_users.userID) so a typo can't orphan
// the row. The address snapshot (fAddress*) is left as-is — legacy doesn't
// re-copy it; the operator should re-pick the address after reassigning.
const reassignSchema = z.object({
  fId:       z.number().int().positive(),
  newUserId: z.string().trim().min(1).max(10).regex(/^[A-Za-z0-9]+$/, "รหัสลูกค้าไม่ถูกต้อง"),
});
export type AdminReassignForwarderOwnerInput = z.infer<typeof reassignSchema>;

export async function adminReassignForwarderOwner(
  rawInput: AdminReassignForwarderOwnerInput,
): Promise<AdminActionResult> {
  const parsed = reassignSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const d = parsed.data;
  const newUserId = d.newUserId.toUpperCase();

  return withAdmin(["ops", "accounting", "super"], async ({ adminId }) => {
    const admin = createAdminClient();
    const legacyAdminId = (await resolveLegacyAdminId()).slice(0, 10);

    // Confirm the forwarder exists + capture the old owner for the audit.
    const { data: fwd, error: fwdErr } = await admin
      .from("tb_forwarder")
      .select("id, userid")
      .eq("id", d.fId)
      .maybeSingle<{ id: number; userid: string }>();
    if (fwdErr) {
      console.error(`[adminReassignForwarderOwner read] failed`, { code: fwdErr.code, message: fwdErr.message, fId: d.fId });
      return { ok: false, error: `อ่านรายการไม่สำเร็จ: ${fwdErr.message}` };
    }
    if (!fwd) return { ok: false, error: "ไม่พบรายการฝากนำเข้า" };
    if (fwd.userid === newUserId) return { ok: false, error: "เป็นเจ้าของเดิมอยู่แล้ว — ไม่มีการเปลี่ยนแปลง" };

    // GUARD (Pacred-added): the new owner MUST exist (tb_users.userID camelCase).
    const { data: newUser, error: userErr } = await admin
      .from("tb_users")
      .select("userID")
      .eq("userID", newUserId)
      .maybeSingle<{ userID: string }>();
    if (userErr) {
      console.error(`[adminReassignForwarderOwner tb_users check] failed`, { code: userErr.code, message: userErr.message, newUserId });
      return { ok: false, error: `ตรวจสอบลูกค้าปลายทางไม่สำเร็จ: ${userErr.message}` };
    }
    if (!newUser) return { ok: false, error: `ไม่พบลูกค้ารหัส ${newUserId} — ตรวจสอบรหัสอีกครั้ง` };

    const { error: updErr } = await admin
      .from("tb_forwarder")
      .update({ userid: newUserId, adminidupdate: legacyAdminId })
      .eq("id", d.fId);
    if (updErr) {
      console.error(`[adminReassignForwarderOwner update] failed`, { code: updErr.code, message: updErr.message, fId: d.fId });
      return { ok: false, error: `ย้ายเจ้าของไม่สำเร็จ: ${updErr.message}` };
    }

    await logAdminAction(adminId, "tb_forwarder.reassign_owner", "tb_forwarder", String(d.fId), {
      from: fwd.userid, to: newUserId,
    });

    revalidatePath(`/admin/forwarders/${d.fId}`);
    revalidatePath("/admin/forwarders");
    return { ok: true };
  });
}

// ── update_fCover — replace the cover image (forwarder.php L1480-1528) ───────
// Legacy resizes to 450px then writes the filename to tb_forwarder.fCover. We
// reuse uploadToBucket (bucket `forwarder-covers`, same as forwarders-new.ts)
// and store the returned key. Input is FormData (a server action can receive a
// File only via FormData): fields `fId` (string) + `file` (the image).
export async function adminUpdateForwarderCover(
  formData: FormData,
): Promise<AdminActionResult> {
  const fIdRaw = formData.get("fId");
  const file = formData.get("file");
  const fId = Number(fIdRaw);
  if (!Number.isInteger(fId) || fId <= 0) return { ok: false, error: "fId ไม่ถูกต้อง" };
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "กรุณาเลือกไฟล์รูป" };

  return withAdmin(["ops", "accounting", "super"], async ({ adminId }) => {
    const admin = createAdminClient();
    const legacyAdminId = (await resolveLegacyAdminId()).slice(0, 10);

    // Need the owner for the storage prefix (same scoping as forwarders-new.ts).
    const { data: fwd, error: fwdErr } = await admin
      .from("tb_forwarder")
      .select("id, userid")
      .eq("id", fId)
      .maybeSingle<{ id: number; userid: string }>();
    if (fwdErr) {
      console.error(`[adminUpdateForwarderCover read] failed`, { code: fwdErr.code, message: fwdErr.message, fId });
      return { ok: false, error: `อ่านรายการไม่สำเร็จ: ${fwdErr.message}` };
    }
    if (!fwd) return { ok: false, error: "ไม่พบรายการฝากนำเข้า" };

    const upload = await uploadToBucket(file, "forwarder-covers", `admin/${fwd.userid}`);
    if (!upload.ok) return { ok: false, error: upload.error ?? "อัปโหลดรูปไม่สำเร็จ" };

    const { error: updErr } = await admin
      .from("tb_forwarder")
      .update({ fcover: upload.filename, adminidupdate: legacyAdminId })
      .eq("id", fId);
    if (updErr) {
      console.error(`[adminUpdateForwarderCover update] failed`, { code: updErr.code, message: updErr.message, fId });
      return { ok: false, error: `บันทึกรูปไม่สำเร็จ: ${updErr.message}` };
    }

    await logAdminAction(adminId, "tb_forwarder.update_cover", "tb_forwarder", String(fId), {
      filename: upload.filename,
    });

    revalidatePath(`/admin/forwarders/${fId}`);
    revalidatePath("/admin/forwarders");
    return { ok: true };
  });
}
