"use server";

/**
 * Admin > forwarder detail "แก้ไขที่อยู่ / การขนส่ง" — faithful port of the
 * small per-field update handlers in legacy `pcs-admin/forwarder.php`
 *
 * RBAC NOTE (2026-06-08 · ภูม warehouse-handoff round 3 · audit B5):
 *   All 13 inline-edit actions in this file gate to ["ops", "accounting",
 *   "super", "warehouse"]. "warehouse" added round 3 because round 1+2
 *   opened the /admin/forwarders/[fNo] + /edit pages to warehouse role
 *   but the per-field SAVE buttons (address re-pick · transport type ·
 *   ship-by · cover image · userid reassign · amount-count · cost-adjust)
 *   would have silently returned `{ok:false, error:"unauthorized"}` —
 *   green toast → no DB write → "เซฟไม่ได้พี่!". Today all 17 admins on
 *   prod are role='super' so this is defense-in-depth; the moment ภูม
 *   provisions an admins row with role='warehouse', it becomes the actual
 *   save path. Legacy `forwarder.php` was implicitly any-staff-with-cookie
 *   so this matches faithful intent.
 *
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
 *   - update_fShipBy        (forwarder.php L1579-1631) — change the courier /
 *     ship-by carrier. When fStatus<=5, legacy re-prices fTransportPrice by the
 *     PCS-family carrier (PCSF→0, PCSE→max(fVolume*120, 50), PCS→0); then writes
 *     fShipBy; and if fShipBy='PCS' it ALSO copies the fixed PCS-warehouse pickup
 *     address into fAddress* (verbatim depot strings from L1612-1626). We match
 *     all three behaviours + a re-price-staleness hint in the UI.
 *   - update_fAmountCount   (forwarder.php L2450-2459) — toggle the pricing basis
 *     ('1' = ราคาต่อกล่อง per-box · other = รวม total). Column-only write +
 *     re-price hint (affects cbmProduct in the next dimension re-save).
 *
 * Pacred-ADDED (no standalone legacy handler):
 *   - adminUpdateForwarderCostAdjust — edit the 3 manual money columns
 *     (fPriceUpdate / priceOther / fDiscount). Legacy edits these only via the
 *     update_data re-pricing path / pay flow (no dedicated POST handler); the
 *     owner blessed a standalone manual-adjust surface 2026-05-31. Column-only
 *     write + adminIDUpdate; the detail page already renders the full breakdown.
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
import { ADDRESSES } from "@/components/seo/site";
import { TAX_DOC_MODES, prefFromMode, type TaxDocMode } from "@/lib/tax/tax-doc-mode";

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

  return withAdmin(["ops", "accounting", "super", "warehouse"], async ({ adminId }) => {
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

  return withAdmin(["ops", "accounting", "super", "warehouse"], async ({ adminId }) => {
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

  return withAdmin(["ops", "accounting", "super", "warehouse"], async ({ adminId }) => {
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

  return withAdmin(["ops", "accounting", "super", "warehouse"], async ({ adminId }) => {
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

// ── update_fShipBy — change the courier / ship-by carrier (forwarder.php L1579) ─
// fShipBy is a free string (external carrier name or a PCS-family code). When the
// row is still pre-payment (fStatus<=5), legacy re-prices fTransportPrice by the
// three PCS-family carriers; then writes fShipBy; and for 'PCS' (รับเองที่โกดัง)
// copies the fixed self-pickup warehouse address into fAddress* (= Pacred's TH
// receiving warehouse — สมุทรสาคร, ADDRESSES.warehouseTh — the same depot the shop
// path + customer-side forwarder-legacy.ts updateLegacyForwarderShipBy use).
// Legacy PHP (forwarder.php L1612-1626) hard-coded the old Bangkok PCS depot.
// faddresstel is varchar(10) → digits-only Pacred line "0224213325".
const FPCS_DEPOT_ADDRESS = {
  faddressname:        "รับที่โกดัง Pacred",
  faddresslastname:    "",
  faddressno:          ADDRESSES.warehouseTh.line,
  faddresssubdistrict: ADDRESSES.warehouseTh.subDistrict,
  faddressdistrict:    ADDRESSES.warehouseTh.district,
  faddressprovince:    ADDRESSES.warehouseTh.province,
  faddresszipcode:     ADDRESSES.warehouseTh.postcode,
  faddressnote:        "",
  faddresstel:         "0224213325",
  faddresstel2:        "",
} as const;

const shipBySchema = z.object({
  fId:     z.number().int().positive(),
  fShipBy: z.string().trim().min(1).max(50),
});
export type AdminUpdateForwarderShipByInput = z.infer<typeof shipBySchema>;

export async function adminUpdateForwarderShipBy(
  rawInput: AdminUpdateForwarderShipByInput,
): Promise<AdminActionResult> {
  const parsed = shipBySchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const d = parsed.data;
  const fShipBy = d.fShipBy.trim();

  // forwarder.php updateLegacyForwarderShipBy guard: 'F' = free-shipping promo
  // sentinel, never a real carrier the admin should set.
  if (fShipBy === "F") return { ok: false, error: "รหัสผู้ขนส่งไม่ถูกต้อง (F สงวนไว้)" };

  return withAdmin(["ops", "accounting", "super", "warehouse"], async ({ adminId }) => {
    const admin = createAdminClient();
    const legacyAdminId = (await resolveLegacyAdminId()).slice(0, 10);

    // 1. Read fStatus + fVolume (legacy L1586-1592 reads these to decide re-price).
    const { data: fwd, error: fwdErr } = await admin
      .from("tb_forwarder")
      .select("id, fstatus, fvolume, fshipby")
      .eq("id", d.fId)
      .maybeSingle<{ id: number; fstatus: string | null; fvolume: number | string | null; fshipby: string | null }>();
    if (fwdErr) {
      console.error(`[adminUpdateForwarderShipBy read] failed`, { code: fwdErr.code, message: fwdErr.message, fId: d.fId });
      return { ok: false, error: `อ่านรายการไม่สำเร็จ: ${fwdErr.message}` };
    }
    if (!fwd) return { ok: false, error: "ไม่พบรายการฝากนำเข้า" };
    if ((fwd.fshipby ?? "").trim() === fShipBy) {
      return { ok: false, error: "ไม่มีการเปลี่ยนแปลง (ผู้ขนส่งเดิม)" };
    }

    // 2. Build the UPDATE. fShipBy + adminIDUpdate always; conditionally
    //    fTransportPrice + the PCS depot address (legacy L1595-1627).
    const fStatusInt = parseInt(fwd.fstatus ?? "0", 10);
    const fVolume = Number(fwd.fvolume ?? 0);
    const update: Record<string, string | number> = {
      fshipby: fShipBy,
      adminidupdate: legacyAdminId,
    };

    // Legacy L1595: only re-price while still pre-payment (fStatus<=5).
    if (fStatusInt <= 5) {
      if (fShipBy === "PCSF") {
        update.ftransportprice = 0; // ส่งฟรี
      } else if (fShipBy === "PCSE") {
        update.ftransportprice = Math.max(fVolume * 120, 50); // ส่งด่วน · floor 50
      } else if (fShipBy === "PCS") {
        update.ftransportprice = 0; // รับเองที่โกดัง
      }
    }

    // Legacy L1612-1626: 'PCS' rewrites the snapshot address to the depot.
    if (fShipBy === "PCS") Object.assign(update, FPCS_DEPOT_ADDRESS);

    const { error: updErr } = await admin
      .from("tb_forwarder")
      .update(update)
      .eq("id", d.fId);
    if (updErr) {
      console.error(`[adminUpdateForwarderShipBy update] failed`, { code: updErr.code, message: updErr.message, fId: d.fId });
      return { ok: false, error: `บันทึกผู้ขนส่งไม่สำเร็จ: ${updErr.message}` };
    }

    await logAdminAction(adminId, "tb_forwarder.update_ship_by", "tb_forwarder", String(d.fId), {
      before: fwd.fshipby, after: fShipBy,
      reprice: fStatusInt <= 5 && ["PCS", "PCSF", "PCSE"].includes(fShipBy)
        ? update.ftransportprice : "unchanged",
      pcsDepotAddr: fShipBy === "PCS",
    });

    revalidatePath(`/admin/forwarders/${d.fId}`);
    revalidatePath("/admin/forwarders");
    return { ok: true };
  });
}

// ── adminUpdateForwarderCostAdjust — Pacred-added manual money-adjust ──────────
// Edits the 3 manual money columns on tb_forwarder: fPriceUpdate (ค่าสินค้า/ปรับ),
// priceOther (ค่าอื่นๆ), fDiscount (ส่วนลด). There is NO dedicated legacy POST
// handler for these as a standalone trio — legacy mutates them via the update_data
// re-pricing path / pay flow. Owner blessed a standalone manual-adjust surface
// 2026-05-31. We DO NOT recompute/persist ftotalprice (that = the transport leg,
// owned by the dimension re-pricing path); the detail-page DISPLAYED grand total is
//   ftotalprice + fpriceupdate + fshippingservice + ftransportpricechnthb
//   + pricecrate + priceother + ftransportprice − fdiscount
// (formula mirrored from forwarders-edit.ts L452-461). Column-only write + audit.
const costAdjustSchema = z.object({
  fId:          z.number().int().positive(),
  fpriceupdate: z.number().finite().min(0).max(99_999_999),
  priceother:   z.number().finite().min(0).max(99_999_999),
  fdiscount:    z.number().finite().min(0).max(99_999_999),
});
export type AdminUpdateForwarderCostAdjustInput = z.infer<typeof costAdjustSchema>;

export async function adminUpdateForwarderCostAdjust(
  rawInput: AdminUpdateForwarderCostAdjustInput,
): Promise<AdminActionResult> {
  const parsed = costAdjustSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const d = parsed.data;

  return withAdmin(["ops", "accounting", "super", "warehouse"], async ({ adminId }) => {
    const admin = createAdminClient();
    const legacyAdminId = (await resolveLegacyAdminId()).slice(0, 10);

    // Capture before-values for the audit (+ confirm the row exists).
    const { data: fwd, error: fwdErr } = await admin
      .from("tb_forwarder")
      .select("id, fpriceupdate, priceother, fdiscount")
      .eq("id", d.fId)
      .maybeSingle<{ id: number; fpriceupdate: number | string | null; priceother: number | string | null; fdiscount: number | string | null }>();
    if (fwdErr) {
      console.error(`[adminUpdateForwarderCostAdjust read] failed`, { code: fwdErr.code, message: fwdErr.message, fId: d.fId });
      return { ok: false, error: `อ่านรายการไม่สำเร็จ: ${fwdErr.message}` };
    }
    if (!fwd) return { ok: false, error: "ไม่พบรายการฝากนำเข้า" };

    const { error: updErr } = await admin
      .from("tb_forwarder")
      .update({
        fpriceupdate:  d.fpriceupdate,
        priceother:    d.priceother,
        fdiscount:     d.fdiscount,
        adminidupdate: legacyAdminId,
      })
      .eq("id", d.fId);
    if (updErr) {
      console.error(`[adminUpdateForwarderCostAdjust update] failed`, { code: updErr.code, message: updErr.message, fId: d.fId });
      return { ok: false, error: `บันทึกค่าใช้จ่ายไม่สำเร็จ: ${updErr.message}` };
    }

    await logAdminAction(adminId, "tb_forwarder.update_cost_adjust", "tb_forwarder", String(d.fId), {
      before: { fpriceupdate: Number(fwd.fpriceupdate ?? 0), priceother: Number(fwd.priceother ?? 0), fdiscount: Number(fwd.fdiscount ?? 0) },
      after:  { fpriceupdate: d.fpriceupdate, priceother: d.priceother, fdiscount: d.fdiscount },
    });

    revalidatePath(`/admin/forwarders/${d.fId}`);
    revalidatePath("/admin/forwarders");
    return { ok: true };
  });
}

// ── update_fAmountCount — pricing basis toggle (forwarder.php L2450-2459) ──────
// '1' = ราคาต่อกล่อง (per-box) · other = รวม (total). Legacy writes ONLY the
// column (+ adminIDUpdate). Affects the pricing basis (cbmProduct) the NEXT time
// dimensions are re-priced — so we add a re-price-staleness hint in the UI.
const amountCountSchema = z.object({
  fId:         z.number().int().positive(),
  famountcount: z.enum(["1", "2"] as const), // '1' per-box · '2' total
});
export type AdminUpdateForwarderAmountCountInput = z.infer<typeof amountCountSchema>;

export async function adminUpdateForwarderAmountCount(
  rawInput: AdminUpdateForwarderAmountCountInput,
): Promise<AdminActionResult> {
  const parsed = amountCountSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const d = parsed.data;

  return withAdmin(["ops", "accounting", "super", "warehouse"], async ({ adminId }) => {
    const admin = createAdminClient();
    const legacyAdminId = (await resolveLegacyAdminId()).slice(0, 10);

    const { data: fwd, error: fwdErr } = await admin
      .from("tb_forwarder")
      .select("id, famountcount")
      .eq("id", d.fId)
      .maybeSingle<{ id: number; famountcount: string | null }>();
    if (fwdErr) {
      console.error(`[adminUpdateForwarderAmountCount read] failed`, { code: fwdErr.code, message: fwdErr.message, fId: d.fId });
      return { ok: false, error: `อ่านรายการไม่สำเร็จ: ${fwdErr.message}` };
    }
    if (!fwd) return { ok: false, error: "ไม่พบรายการฝากนำเข้า" };
    if ((fwd.famountcount ?? "").trim() === d.famountcount) {
      return { ok: false, error: "ไม่มีการเปลี่ยนแปลง (ฐานราคาเดิม)" };
    }

    const { error: updErr } = await admin
      .from("tb_forwarder")
      .update({ famountcount: d.famountcount, adminidupdate: legacyAdminId })
      .eq("id", d.fId);
    if (updErr) {
      console.error(`[adminUpdateForwarderAmountCount update] failed`, { code: updErr.code, message: updErr.message, fId: d.fId });
      return { ok: false, error: `บันทึกฐานราคาไม่สำเร็จ: ${updErr.message}` };
    }

    await logAdminAction(adminId, "tb_forwarder.update_amount_count", "tb_forwarder", String(d.fId), {
      before: fwd.famountcount, after: d.famountcount,
    });

    revalidatePath(`/admin/forwarders/${d.fId}`);
    revalidatePath("/admin/forwarders");
    return { ok: true };
  });
}

// ── update_crate — toggle ตีลังไม้ on the forwarder header ────────────────────
// Header-level flag mirroring per-item chinawoodencratefeetype (see
// forwarders-edit.ts §"Mirror crate flag onto tb_forwarder"). This per-field
// edit is the QUICK-flip the inline-edit button on the detail page calls;
// the heavier-handed re-price is the dimensions form. Column-only write —
// the actual pricecrate cost recomputes when dimensions are re-saved.
// Values: '1' = ตีลังไม้ · '2' = ไม่ตีลังไม้ (matches legacy + tb_edit-panel UI).
const crateSchema = z.object({
  fId:   z.number().int().positive(),
  crate: z.enum(["1", "2"] as const),
});
export type AdminUpdateForwarderCrateInput = z.infer<typeof crateSchema>;

export async function adminUpdateForwarderCrate(
  rawInput: AdminUpdateForwarderCrateInput,
): Promise<AdminActionResult> {
  const parsed = crateSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const d = parsed.data;

  return withAdmin(["ops", "accounting", "super", "warehouse"], async ({ adminId }) => {
    const admin = createAdminClient();
    const legacyAdminId = (await resolveLegacyAdminId()).slice(0, 10);

    const { data: fwd, error: fwdErr } = await admin
      .from("tb_forwarder")
      .select("id, crate")
      .eq("id", d.fId)
      .maybeSingle<{ id: number; crate: string | null }>();
    if (fwdErr) {
      console.error(`[adminUpdateForwarderCrate read] failed`, { code: fwdErr.code, message: fwdErr.message, fId: d.fId });
      return { ok: false, error: `อ่านรายการไม่สำเร็จ: ${fwdErr.message}` };
    }
    if (!fwd) return { ok: false, error: "ไม่พบรายการฝากนำเข้า" };
    if ((fwd.crate ?? "").trim() === d.crate) {
      return { ok: false, error: "ไม่มีการเปลี่ยนแปลง (ค่าตีลังเดิม)" };
    }

    const { error: updErr } = await admin
      .from("tb_forwarder")
      .update({ crate: d.crate, adminidupdate: legacyAdminId })
      .eq("id", d.fId);
    if (updErr) {
      console.error(`[adminUpdateForwarderCrate update] failed`, { code: updErr.code, message: updErr.message, fId: d.fId });
      return { ok: false, error: `บันทึกค่าตีลังไม่สำเร็จ: ${updErr.message}` };
    }

    await logAdminAction(adminId, "tb_forwarder.update_crate", "tb_forwarder", String(d.fId), {
      before: fwd.crate, after: d.crate,
    });

    revalidatePath(`/admin/forwarders/${d.fId}`);
    revalidatePath("/admin/forwarders");
    return { ok: true };
  });
}

// ── update_paymethod — เก็บเงินค่าขนส่งในไทย (ต้นทาง/ปลายทาง) ────────────────
// Faithful counterpart to adminUpdateOrderPayMethod (service-orders-header-edits.ts)
// — the ฝากสั่งซื้อ side already had this; ฝากนำเข้า was missing the per-field
// quick-edit. Pure flag flip ('1'=ต้นทาง · '2'=ปลายทาง). Affects downstream
// COD handling at delivery; no re-price needed.
const payMethodSchema = z.object({
  fId:       z.number().int().positive(),
  paymethod: z.enum(["1", "2"] as const),
});
export type AdminUpdateForwarderPayMethodInput = z.infer<typeof payMethodSchema>;

export async function adminUpdateForwarderPayMethod(
  rawInput: AdminUpdateForwarderPayMethodInput,
): Promise<AdminActionResult> {
  const parsed = payMethodSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const d = parsed.data;

  return withAdmin(["ops", "accounting", "super", "warehouse"], async ({ adminId }) => {
    const admin = createAdminClient();
    const legacyAdminId = (await resolveLegacyAdminId()).slice(0, 10);

    const { data: fwd, error: fwdErr } = await admin
      .from("tb_forwarder")
      .select("id, paymethod")
      .eq("id", d.fId)
      .maybeSingle<{ id: number; paymethod: string | null }>();
    if (fwdErr) {
      console.error(`[adminUpdateForwarderPayMethod read] failed`, { code: fwdErr.code, message: fwdErr.message, fId: d.fId });
      return { ok: false, error: `อ่านรายการไม่สำเร็จ: ${fwdErr.message}` };
    }
    if (!fwd) return { ok: false, error: "ไม่พบรายการฝากนำเข้า" };
    if ((fwd.paymethod ?? "").trim() === d.paymethod) {
      return { ok: false, error: "ไม่มีการเปลี่ยนแปลง (วิธีเก็บเงินเดิม)" };
    }

    const { error: updErr } = await admin
      .from("tb_forwarder")
      .update({ paymethod: d.paymethod, adminidupdate: legacyAdminId })
      .eq("id", d.fId);
    if (updErr) {
      console.error(`[adminUpdateForwarderPayMethod update] failed`, { code: updErr.code, message: updErr.message, fId: d.fId });
      return { ok: false, error: `บันทึกวิธีเก็บเงินไม่สำเร็จ: ${updErr.message}` };
    }

    await logAdminAction(adminId, "tb_forwarder.update_paymethod", "tb_forwarder", String(d.fId), {
      before: fwd.paymethod, after: d.paymethod,
    });

    revalidatePath(`/admin/forwarders/${d.fId}`);
    revalidatePath("/admin/forwarders");
    return { ok: true };
  });
}

// ── fCredit credit-out — grant credit instead of payment (forwarder.php L1395-1435)
// ─────────────────────────────────────────────────────────────────────────────
// MONEY/DEBT flow (owner-authorized 2026-05-31). Legacy "เครดิต" branch: instead
// of debiting the wallet, mark the forwarder paid-on-credit + add the amount to
// the customer's outstanding `tb_credit.creditvalue`, gated by their credit LIMIT
// (`tb_users.userCreditValue`).
//
// Faithful flow (L1399-1431):
//   pricePay = (ftotalprice + ftransportprice + fpriceupdate + fshippingservice
//               + pricecrate + ftransportpricechnthb + priceother) − fdiscount
//   if userCompany=='1': pricePay −= pricePay*0.01   (corporate 1% allowance)
//   headroom = userCreditValue − creditValue(outstanding)
//   GATE: headroom >= pricePay  (else วงเงินไม่พอ)
//   UPDATE tb_forwarder: paydeposit='2', fcredit='1', fcreditdate=<due>,
//                        fstatus='6', fdateadminstatus, fdatestatus5, adminid, adminidupdate
//   creditValue += pricePay → UPSERT tb_credit (legacy UPDATE silently dropped the
//   debt when no row existed — only 76/8,898 have one — so we INSERT if missing).
//
// Casing: tb_forwarder + tb_credit lowercase; tb_users camelCase (userCreditValue,
// userCompany). tb_credit cols: userid, creditvalue.
const creditOutSchema = z.object({
  fId:         z.number().int().positive(),
  creditDueDate: z.string().trim().min(1).max(40), // admin-entered due date (legacy $_POST['userCreditDate'])
});
export type AdminMarkForwarderCreditInput = z.infer<typeof creditOutSchema>;

function numCol(v: number | string | null | undefined): number {
  if (v === null || v === undefined) return 0;
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

export async function adminMarkForwarderCredit(
  rawInput: AdminMarkForwarderCreditInput,
): Promise<AdminActionResult<{ priceCredited: number; outstanding: number }>> {
  const parsed = creditOutSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const d = parsed.data;

  return withAdmin<{ priceCredited: number; outstanding: number }>(["accounting", "super"], async ({ adminId }) => {
    const admin = createAdminClient();
    const legacyAdminId = (await resolveLegacyAdminId()).slice(0, 10);
    const nowIso = new Date().toISOString();

    // 1. Read the forwarder price components + state (legacy L1402-1404).
    const { data: fwd, error: fwdErr } = await admin
      .from("tb_forwarder")
      .select("id, userid, fstatus, fcredit, ftotalprice, ftransportprice, fpriceupdate, fshippingservice, pricecrate, ftransportpricechnthb, priceother, fdiscount")
      .eq("id", d.fId)
      .maybeSingle<{
        id: number; userid: string; fstatus: string | null; fcredit: string | null;
        ftotalprice: number | string | null; ftransportprice: number | string | null;
        fpriceupdate: number | string | null; fshippingservice: number | string | null;
        pricecrate: number | string | null; ftransportpricechnthb: number | string | null;
        priceother: number | string | null; fdiscount: number | string | null;
      }>();
    if (fwdErr) {
      console.error(`[adminMarkForwarderCredit tb_forwarder] failed`, { code: fwdErr.code, message: fwdErr.message, fId: d.fId });
      return { ok: false, error: `อ่านรายการไม่สำเร็จ: ${fwdErr.message}` };
    }
    if (!fwd) return { ok: false, error: "ไม่พบรายการฝากนำเข้า" };
    if ((fwd.fcredit ?? "").trim() === "1") return { ok: false, error: "รายการนี้เป็นเครดิตอยู่แล้ว" };
    // Legacy grants credit on the unpaid (รอชำระเงิน) state; guard fstatus<=5.
    if (!["1", "2", "3", "4", "5"].includes((fwd.fstatus ?? "").trim())) {
      return { ok: false, error: `สถานะปัจจุบัน (${fwd.fstatus}) ให้เครดิตไม่ได้ — ต้องเป็นรายการที่ยังไม่ส่ง` };
    }

    // 2. Read the customer's credit LIMIT + corporate flag (tb_users · camelCase).
    const { data: u, error: uErr } = await admin
      .from("tb_users")
      .select("userID, userCreditValue, userCompany")
      .eq("userID", fwd.userid)
      .maybeSingle<{ userID: string; userCreditValue: number | string | null; userCompany: string | null }>();
    if (uErr) {
      console.error(`[adminMarkForwarderCredit tb_users] failed`, { code: uErr.code, message: uErr.message, userid: fwd.userid });
      return { ok: false, error: `อ่านข้อมูลลูกค้าไม่สำเร็จ: ${uErr.message}` };
    }
    const creditLimit = numCol(u?.userCreditValue);
    if (!(creditLimit > 0)) {
      return { ok: false, error: "ลูกค้ารายนี้ไม่มีวงเงินเครดิต (userCreditValue = 0) — เปิดวงเงินก่อน" };
    }

    // 3. Read current outstanding (tb_credit · may be missing → treat as 0).
    const { data: creditRow, error: creditErr } = await admin
      .from("tb_credit")
      .select("creditvalue")
      .eq("userid", fwd.userid)
      .maybeSingle<{ creditvalue: number | string | null }>();
    if (creditErr) {
      console.error(`[adminMarkForwarderCredit tb_credit] failed`, { code: creditErr.code, message: creditErr.message, userid: fwd.userid });
      return { ok: false, error: `อ่านยอดเครดิตไม่สำเร็จ: ${creditErr.message}` };
    }
    const outstanding = numCol(creditRow?.creditvalue);

    // 4. Compute pricePay (legacy L1424) + corporate 1% allowance.
    let pricePay =
      numCol(fwd.ftotalprice) + numCol(fwd.ftransportprice) + numCol(fwd.fpriceupdate) +
      numCol(fwd.fshippingservice) + numCol(fwd.pricecrate) + numCol(fwd.ftransportpricechnthb) +
      numCol(fwd.priceother) - numCol(fwd.fdiscount);
    if ((u?.userCompany ?? "").trim() === "1") pricePay = pricePay - pricePay * 0.01;
    pricePay = Math.round(pricePay * 100) / 100;
    if (!(pricePay > 0)) return { ok: false, error: "ยอดรายการไม่ถูกต้อง" };

    // 5. GATE — remaining headroom must cover this order (legacy L1429).
    const headroom = creditLimit - outstanding;
    if (headroom < pricePay) {
      return {
        ok: false,
        error: `วงเงินเครดิตไม่พอ — เหลือ ฿${headroom.toLocaleString()} (วงเงิน ฿${creditLimit.toLocaleString()} − ค้าง ฿${outstanding.toLocaleString()}) ต้อง ฿${pricePay.toLocaleString()}`,
      };
    }

    // 6. Flip tb_forwarder to credit (legacy L1431).
    const { error: updErr } = await admin
      .from("tb_forwarder")
      .update({
        paydeposit: "2", fcredit: "1", fcreditdate: d.creditDueDate, fstatus: "6",
        fdateadminstatus: nowIso, fdatestatus5: nowIso, adminid: legacyAdminId, adminidupdate: legacyAdminId,
      })
      .eq("id", d.fId);
    if (updErr) {
      console.error(`[adminMarkForwarderCredit forwarder flip] failed`, { code: updErr.code, message: updErr.message, fId: d.fId });
      return { ok: false, error: `บันทึกเครดิตไม่สำเร็จ: ${updErr.message}` };
    }

    // 7. UPSERT tb_credit (legacy UPDATE-only silently dropped the debt for the
    //    ~98% of customers with no row — we INSERT if missing). Rollback the
    //    forwarder flip if the debt write fails (keep books consistent).
    const newOutstanding = Math.round((outstanding + pricePay) * 100) / 100;
    const { error: creditUpErr } = creditRow
      ? await admin.from("tb_credit").update({ creditvalue: newOutstanding }).eq("userid", fwd.userid)
      : await admin.from("tb_credit").insert({ userid: fwd.userid, creditvalue: newOutstanding });
    if (creditUpErr) {
      // rollback the forwarder flip
      await admin.from("tb_forwarder").update({
        paydeposit: "", fcredit: "", fcreditdate: null, fstatus: fwd.fstatus,
      }).eq("id", d.fId);
      console.error(`[adminMarkForwarderCredit tb_credit upsert] failed — rolled back flip`, { code: creditUpErr.code, message: creditUpErr.message, userid: fwd.userid });
      return { ok: false, error: `บันทึกยอดเครดิตไม่สำเร็จ (ยกเลิกรายการแล้ว): ${creditUpErr.message}` };
    }

    await logAdminAction(adminId, "tb_forwarder.mark_credit", "tb_forwarder", String(d.fId), {
      userid: fwd.userid, priceCredited: pricePay, outstanding_before: outstanding, outstanding_after: newOutstanding,
      credit_limit: creditLimit, due_date: d.creditDueDate,
    });

    revalidatePath(`/admin/forwarders/${d.fId}`);
    revalidatePath("/admin/forwarders");
    return { ok: true, data: { priceCredited: pricePay, outstanding: newOutstanding } };
  });
}

// ── tax-document mode (Lane B · 2026-06-04) ─────────────────────────────────
// Set/change the order's tax-document mode (ใบกำกับ / ใบขน / ไม่รับเอกสาร) on a
// tb_forwarder row. This is the ADMIN counterpart to the customer's /cart
// selector — staff can correct/assign the mode for forwarder orders (which are
// created via warehouse/MOMO intake, not a customer cart, so they have no mode
// until set here). The mode drives the VAT-7% base + which RD document is
// issued at payment-land (lib/admin/auto-issue-receipt.ts → issueForwarderTax-
// Invoice). Column-only write to tb_forwarder.tax_doc_pref (migration 0127).
//
// NOTE — this sets the PREFERENCE only. It does NOT re-issue an already-issued
// tax document (those are idempotent on fid). Setting the mode BEFORE payment-
// land is what routes the auto-issue. After issuance, accounting must cancel +
// re-issue via the etax surface to change a document's mode.
const taxDocModeSchema = z.object({
  fId:  z.number().int().positive(),
  mode: z.enum(TAX_DOC_MODES as unknown as [TaxDocMode, ...TaxDocMode[]]),
});
export type AdminUpdateForwarderTaxDocModeInput = z.infer<typeof taxDocModeSchema>;

export async function adminUpdateForwarderTaxDocMode(
  rawInput: AdminUpdateForwarderTaxDocModeInput,
): Promise<AdminActionResult> {
  const parsed = taxDocModeSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const d = parsed.data;
  const newPref = prefFromMode(d.mode); // 'tax_invoice' | 'customs' | 'receipt'

  return withAdmin(["ops", "accounting", "super", "warehouse"], async ({ adminId }) => {
    const admin = createAdminClient();
    const legacyAdminId = (await resolveLegacyAdminId()).slice(0, 10);

    const { data: fwd, error: fwdErr } = await admin
      .from("tb_forwarder")
      .select("id, tax_doc_pref")
      .eq("id", d.fId)
      .maybeSingle<{ id: number; tax_doc_pref: string | null }>();
    if (fwdErr) {
      console.error(`[adminUpdateForwarderTaxDocMode read] failed`, { code: fwdErr.code, message: fwdErr.message, fId: d.fId });
      return { ok: false, error: `อ่านรายการไม่สำเร็จ: ${fwdErr.message}` };
    }
    if (!fwd) return { ok: false, error: "ไม่พบรายการฝากนำเข้า" };
    // Normalise the stored value the same way the engine does ('' / NULL = receipt).
    const beforePref = (fwd.tax_doc_pref ?? "").trim() || "receipt";
    if (beforePref === newPref) {
      return { ok: false, error: "ไม่มีการเปลี่ยนแปลง (โหมดเอกสารเดิม)" };
    }

    const { error: updErr } = await admin
      .from("tb_forwarder")
      .update({ tax_doc_pref: newPref, adminidupdate: legacyAdminId })
      .eq("id", d.fId);
    if (updErr) {
      console.error(`[adminUpdateForwarderTaxDocMode update] failed`, { code: updErr.code, message: updErr.message, fId: d.fId });
      return { ok: false, error: `บันทึกโหมดเอกสารไม่สำเร็จ: ${updErr.message}` };
    }

    await logAdminAction(adminId, "tb_forwarder.update_tax_doc_mode", "tb_forwarder", String(d.fId), {
      before: beforePref, after: newPref, mode: d.mode,
    });

    revalidatePath(`/admin/forwarders/${d.fId}`);
    revalidatePath("/admin/forwarders");
    return { ok: true };
  });
}

// ── update_fPallet — location/pallet number (forwarder.php L2417-2427) ────────
// Legacy writes the raw text to tb_forwarder.fpallet (+ adminIDUpdate). fpallet
// is INTEGER in the DB (the legacy "warehouse pallet number", e.g. 12) — Pacred
// also accepts 0 / NULL to clear. UI on the inline editor renders a number input.
const palletSchema = z.object({
  fId:     z.number().int().positive(),
  fpallet: z.number().int().min(0).max(99_999),
});
export type AdminUpdateForwarderPalletInput = z.infer<typeof palletSchema>;

export async function adminUpdateForwarderPallet(
  rawInput: AdminUpdateForwarderPalletInput,
): Promise<AdminActionResult> {
  const parsed = palletSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const d = parsed.data;

  return withAdmin(["ops", "accounting", "super", "warehouse"], async ({ adminId }) => {
    const admin = createAdminClient();
    const legacyAdminId = (await resolveLegacyAdminId()).slice(0, 10);

    const { data: fwd, error: fwdErr } = await admin
      .from("tb_forwarder")
      .select("id, fpallet")
      .eq("id", d.fId)
      .maybeSingle<{ id: number; fpallet: number | null }>();
    if (fwdErr) {
      console.error(`[adminUpdateForwarderPallet read] failed`, { code: fwdErr.code, message: fwdErr.message, fId: d.fId });
      return { ok: false, error: `อ่านรายการไม่สำเร็จ: ${fwdErr.message}` };
    }
    if (!fwd) return { ok: false, error: "ไม่พบรายการฝากนำเข้า" };
    if (Number(fwd.fpallet ?? 0) === d.fpallet) {
      return { ok: false, error: "ไม่มีการเปลี่ยนแปลง (พาเลทเดิม)" };
    }

    const { error: updErr } = await admin
      .from("tb_forwarder")
      .update({ fpallet: d.fpallet, adminidupdate: legacyAdminId })
      .eq("id", d.fId);
    if (updErr) {
      console.error(`[adminUpdateForwarderPallet update] failed`, { code: updErr.code, message: updErr.message, fId: d.fId });
      return { ok: false, error: `บันทึกพาเลทไม่สำเร็จ: ${updErr.message}` };
    }

    await logAdminAction(adminId, "tb_forwarder.update_pallet", "tb_forwarder", String(d.fId), {
      before: fwd.fpallet, after: d.fpallet,
    });

    revalidatePath(`/admin/forwarders/${d.fId}`);
    revalidatePath("/admin/forwarders");
    return { ok: true };
  });
}

// ── update_fTrackingCHN — China tracking number (forwarder.php L1562-1577) ────
// Legacy column-only UPDATE tb_forwarder.fTrackingCHN. Legacy gate (L730 in the
// form view): only editable while fStatus<7 — once the package is delivered
// the tracking number is locked. We mirror that gate (return error if fstatus=7).
const trackingChnSchema = z.object({
  fId:          z.number().int().positive(),
  ftrackingchn: z.string().trim().min(1).max(60),
});
export type AdminUpdateForwarderTrackingChnInput = z.infer<typeof trackingChnSchema>;

export async function adminUpdateForwarderTrackingChn(
  rawInput: AdminUpdateForwarderTrackingChnInput,
): Promise<AdminActionResult> {
  const parsed = trackingChnSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const d = parsed.data;

  return withAdmin(["ops", "accounting", "super", "warehouse"], async ({ adminId }) => {
    const admin = createAdminClient();
    const legacyAdminId = (await resolveLegacyAdminId()).slice(0, 10);

    const { data: fwd, error: fwdErr } = await admin
      .from("tb_forwarder")
      .select("id, fstatus, ftrackingchn")
      .eq("id", d.fId)
      .maybeSingle<{ id: number; fstatus: string | null; ftrackingchn: string | null }>();
    if (fwdErr) {
      console.error(`[adminUpdateForwarderTrackingChn read] failed`, { code: fwdErr.code, message: fwdErr.message, fId: d.fId });
      return { ok: false, error: `อ่านรายการไม่สำเร็จ: ${fwdErr.message}` };
    }
    if (!fwd) return { ok: false, error: "ไม่พบรายการฝากนำเข้า" };
    // Legacy gate (update.php L730) — only editable while fstatus<7.
    const fStatusInt = parseInt(fwd.fstatus ?? "0", 10);
    if (fStatusInt >= 7) {
      return { ok: false, error: "รายการนี้ถูกส่งแล้ว — แก้ไขเลขแทรคกิ้งจีนไม่ได้" };
    }
    if ((fwd.ftrackingchn ?? "").trim() === d.ftrackingchn) {
      return { ok: false, error: "ไม่มีการเปลี่ยนแปลง (เลขแทรคกิ้งเดิม)" };
    }

    const { error: updErr } = await admin
      .from("tb_forwarder")
      .update({ ftrackingchn: d.ftrackingchn, adminidupdate: legacyAdminId })
      .eq("id", d.fId);
    if (updErr) {
      console.error(`[adminUpdateForwarderTrackingChn update] failed`, { code: updErr.code, message: updErr.message, fId: d.fId });
      return { ok: false, error: `บันทึกเลขแทรคกิ้งไม่สำเร็จ: ${updErr.message}` };
    }

    await logAdminAction(adminId, "tb_forwarder.update_tracking_chn", "tb_forwarder", String(d.fId), {
      before: fwd.ftrackingchn, after: d.ftrackingchn,
    });

    revalidatePath(`/admin/forwarders/${d.fId}`);
    revalidatePath("/admin/forwarders");
    return { ok: true };
  });
}

// ── update_fDateToThai — container-close + ETA-to-Thailand (forwarder.php L1541-1560)
// Legacy: takes ONE input (the container-close date in dd/mm/yyyy), then writes
// BOTH columns:
//   - fdatecontainerclose = the close date (as-entered)
//   - fdatetothai          = close date + 5 days (truck) or +12 days (sea)
// Legacy did the math on the PHP side; we mirror it in the action. Input here =
// the close date as an ISO 'YYYY-MM-DD' string (HTML <input type="date"> emits
// this). We read the current ftransporttype to pick the offset.
const dateToThaiSchema = z.object({
  fId:                 z.number().int().positive(),
  fdatecontainerclose: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "วันที่ปิดตู้ต้องอยู่ในรูป YYYY-MM-DD"),
});
export type AdminUpdateForwarderDateToThaiInput = z.infer<typeof dateToThaiSchema>;

export async function adminUpdateForwarderDateToThai(
  rawInput: AdminUpdateForwarderDateToThaiInput,
): Promise<AdminActionResult> {
  const parsed = dateToThaiSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const d = parsed.data;

  return withAdmin(["ops", "accounting", "super", "warehouse"], async ({ adminId }) => {
    const admin = createAdminClient();
    const legacyAdminId = (await resolveLegacyAdminId()).slice(0, 10);

    const { data: fwd, error: fwdErr } = await admin
      .from("tb_forwarder")
      .select("id, ftransporttype, fdatecontainerclose, fdatetothai")
      .eq("id", d.fId)
      .maybeSingle<{ id: number; ftransporttype: string | null; fdatecontainerclose: string | null; fdatetothai: string | null }>();
    if (fwdErr) {
      console.error(`[adminUpdateForwarderDateToThai read] failed`, { code: fwdErr.code, message: fwdErr.message, fId: d.fId });
      return { ok: false, error: `อ่านรายการไม่สำเร็จ: ${fwdErr.message}` };
    }
    if (!fwd) return { ok: false, error: "ไม่พบรายการฝากนำเข้า" };

    // Legacy L1547-1553 — derive fdatetothai from close + transport-type offset.
    // truck (1) = +5 days; sea (2) and air (3) = +12 days (legacy treated non-1 as sea).
    const closeDate = new Date(d.fdatecontainerclose + "T00:00:00Z");
    if (Number.isNaN(closeDate.getTime())) return { ok: false, error: "วันที่ปิดตู้ไม่ถูกต้อง" };
    const offsetDays = (fwd.ftransporttype ?? "1") === "1" ? 5 : 12;
    const toThaiDate = new Date(closeDate.getTime() + offsetDays * 24 * 60 * 60 * 1000);
    const fdatetothai = toThaiDate.toISOString().slice(0, 10); // YYYY-MM-DD

    const { error: updErr } = await admin
      .from("tb_forwarder")
      .update({
        fdatecontainerclose: d.fdatecontainerclose,
        fdatetothai,
        adminidupdate: legacyAdminId,
      })
      .eq("id", d.fId);
    if (updErr) {
      console.error(`[adminUpdateForwarderDateToThai update] failed`, { code: updErr.code, message: updErr.message, fId: d.fId });
      return { ok: false, error: `บันทึกวันที่ปิดตู้ไม่สำเร็จ: ${updErr.message}` };
    }

    await logAdminAction(adminId, "tb_forwarder.update_date_to_thai", "tb_forwarder", String(d.fId), {
      before: { fdatecontainerclose: fwd.fdatecontainerclose, fdatetothai: fwd.fdatetothai },
      after:  { fdatecontainerclose: d.fdatecontainerclose, fdatetothai },
      offsetDays,
    });

    revalidatePath(`/admin/forwarders/${d.fId}`);
    revalidatePath("/admin/forwarders");
    return { ok: true };
  });
}
