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
import { splitAggregatedMomoBoxRows } from "@/lib/integrations/momo-web/split-box-rows";
import { baseOf as baseOfTracking } from "@/lib/integrations/momo-web/split-box-rows-plan";
import { getShipByOptionsForAddress } from "@/lib/cart/ship-by-eligibility";
import { isFreeShippingZip } from "@/lib/bkk-zip";
import { derivePayMethodForDelivery, enforceCodDomesticZero } from "@/lib/forwarder/pay-method";
import { autoFillThShippingForForwarder } from "@/lib/admin/auto-fill-th-shipping";
import { propagateShipmentEdit } from "@/lib/admin/forwarder-siblings";
import { assertNotRefunded } from "@/lib/admin/refund-rebill-guard";
import { checkCarrierForProvince, isOwnFleetCarrier } from "@/lib/forwarder/carrier-coverage-guard";
import { isMaoCarrier } from "@/lib/forwarder/mao-fee";
import { canonicalProvince } from "@/lib/forwarder/carrier-province-coverage";
import { cabinetWriteGuard } from "@/lib/forwarder/cabinet-class";
import { isGodRole } from "@/lib/admin/god-role";
import { customerAddressSchema, parseCustomerAddressRow, saveCustomerAddress } from "@/lib/admin/customer-address-book";

/** Pacred's own delivery family (รับเองโกดัง / เหมาๆ / ด่วน) — works any province.
 *
 *  ⚠️ MUST list BOTH the legacy codes and the D1 rebrand (PCSF→PRF เหมาๆ ·
 *  PCSE→PRE ด่วน · 2026-06-20 L-MIG-04 "a rebrand must sweep every hardcoded list").
 *  A missing PRF made suggestCarrierForAddress fall through to a PRIVATE courier on
 *  every address edit of a เหมาๆ order → the ฿100 เหมาๆ anchor could no longer be
 *  elected (mao-anchor-plan electMaoCarrier finds no PRF row) and COD dropped the
 *  domestic leg = money lost. Keep in sync with OWN_FLEET_SHIPBY
 *  (lib/forwarder/carrier-coverage-guard.ts) + MAO_CARRIER_CODE (lib/forwarder/mao-fee.ts). */
const PCS_FAMILY = new Set(["PCS", "PCSF", "PCSE", "PRF", "PRE"]);

/**
 * Auto-suggest the carrier for a delivery address (owner/ภูม 2026-07-03 · "จับจากเลขไปรษณีย์
 * ว่าจังหวัดไหน แล้วเลือกบริษัทขนส่งในจังหวัดนั้นให้เลย · แต่ยังแก้ได้"). Rules:
 *   - Keep a PCS-family carrier if already set (Pacred's own delivery is valid anywhere).
 *   - BKK-metro / ปริมณฑล (เหมาๆ zone · isFreeShippingZip) → PCSF (เหมาๆ ฿100 · ต้นทาง). NOTE:
 *     getShipByOptionsForAddress returns Flash-ONLY for this zone — that's a legacy dropdown-
 *     HIDING quirk (the maomao branch hides the picker), NOT "Flash is the carrier". The real
 *     zone carrier is เหมาๆ. (This is why order #52142 นนทบุรี wrongly auto-picked "2"=Flash.)
 *   - Upcountry → the first province-eligible courier (COD collected at delivery).
 *   - Else "" → leave the carrier alone (staff picks).
 * The result is ALWAYS staff-editable afterward via <EditShipByField>.
 *
 * 2026-07-14 (owner · CLOSED LIST): `getShipByOptionsForAddress` now returns ONLY the
 * couriers in the owner's workbook for that province → the suggestion can no longer land
 * on a retired/off-workbook courier. It returns "" (→ caller does NOT write fshipby)
 * rather than falling back to the current value, so an existing free-text carrier
 * ("สมใจสาย4", "เรียกรถขนส่ง" — ~35 such rows on prod) is never re-written into a row whose
 * province cannot back it. The caller still runs `checkCarrierForProvince` before writing.
 */
function suggestCarrierForAddress(
  current: string,
  ctx: { zip: string; province: string; amphoe: string | null; userID: string },
): string {
  const c = (current ?? "").trim();
  if (PCS_FAMILY.has(c)) return c; // keep Pacred's own delivery (เหมาๆ/ด่วน/รับเอง)
  if (isFreeShippingZip(ctx.zip)) return "PCSF"; // เหมาๆ zone → เหมาๆ, not the Flash-only quirk
  const eligible = getShipByOptionsForAddress(ctx);
  if (c && eligible.some((o) => o.id === c)) return c;
  return eligible[0]?.id ?? "";
}

/** Re-price ftransportprice by carrier (mirrors adminUpdateForwarderShipBy · legacy L1595):
 *  PCSF→0 · PCSE→max(คิว×120,50) · PCS→0 · external courier → unchanged (return null). */
function repriceTransportForCarrier(carrier: string, fVolume: number): number | null {
  if (carrier === "PCSF" || carrier === "PCS") return 0;
  if (carrier === "PCSE") return Math.max(fVolume * 120, 50);
  return null; // external courier — leave ftransportprice as-is
}

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

    // 1. Read the forwarder — fshipby (current carrier) + userid (ownership) + fstatus/fvolume (re-price).
    const { data: fwd, error: fwdErr } = await admin
      .from("tb_forwarder")
      .select("id, userid, fshipby, fstatus, fvolume, ftrackingchn")
      .eq("id", d.fId)
      .maybeSingle<{ id: number; userid: string; fshipby: string | null; fstatus: string | null; fvolume: number | string | null; ftrackingchn: string | null }>();
    if (fwdErr) {
      console.error(`[adminPickForwarderAddress tb_forwarder] failed`, { code: fwdErr.code, message: fwdErr.message, fId: d.fId });
      return { ok: false, error: `อ่านรายการไม่สำเร็จ: ${fwdErr.message}` };
    }
    if (!fwd) return { ok: false, error: "ไม่พบรายการฝากนำเข้า" };
    // NOTE: a PCS (รับเองที่โกดัง) row CAN be re-pointed to a delivery address now — picking a
    // real address flips it OFF self-pickup (owner/ภูม 2026-07-03). The auto-carrier below sets a
    // province carrier, so we no longer hard-block a PCS row here.

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
    const usable = parseCustomerAddressRow(addr);
    if (!usable.data) return { ok: false, error: `ที่อยู่ของลูกค้าไม่ครบถ้วน: ${usable.error}` };
    const address = usable.data;

    // 2b. Auto-resolve the carrier by the NEW address province (owner/ภูม 2026-07-03) + re-price
    //     the domestic leg per that carrier. Both stay staff-editable (<EditShipByField>).
    const carrier = suggestCarrierForAddress((fwd.fshipby ?? "").trim(), {
      zip:      address.addresszipcode,
      province: address.addressprovince,
      amphoe:   address.addressdistrict || null,
      userID:   fwd.userid,
    });
    // CLOSED-LIST backstop (owner 2026-07-14): never write a carrier the new province
    // cannot back. Blank → leave fshipby untouched; staff picks from <EditShipByField>.
    const carrierWritable =
      carrier !== "" && checkCarrierForProvince(carrier, address.addressprovince).ok;
    const fStatusInt = parseInt(fwd.fstatus ?? "0", 10);
    const reprice =
      carrierWritable && fStatusInt <= 5
        ? repriceTransportForCarrier(carrier, Number(fwd.fvolume ?? 0))
        : null;

    // 3. Copy the SNAPSHOT into tb_forwarder.fAddress* (legacy L1737-1739) + carrier + payMethod.
    const { error: updErr } = await admin
      .from("tb_forwarder")
      .update({
        faddressname:        address.addressname,
        faddresslastname:    address.addresslastname,
        faddressno:          address.addressno,
        faddresssubdistrict: address.addresssubdistrict,
        faddressdistrict:    address.addressdistrict,
        faddressprovince:    address.addressprovince,
        faddresszipcode:     address.addresszipcode,
        faddressnote:        address.addressnote,
        faddresstel:         address.addresstel,
        faddresstel2:        address.addresstel2,
        ...(carrierWritable ? { fshipby: carrier, paymethod: derivePayMethodForDelivery(carrier, { addressID: null, zip: address.addresszipcode }) } : {}),
        // 🔒 COD LOCK (owner 2026-07-21) — ปลายทาง = ลูกค้าจ่ายขนส่งที่ปลายทาง → เราไม่เก็บ
        // ค่าส่งไทย. ต้องชนะ reprice เพื่อไม่ให้เรทที่เพิ่งคิดได้ทับกติกานี้.
        ...(carrierWritable && derivePayMethodForDelivery(carrier, { addressID: null, zip: address.addresszipcode }) === "2"
          ? { ftransportprice: 0 }
          : reprice != null
            ? { ftransportprice: reprice }
            : {}),
        adminidupdate:       legacyAdminId,
      })
      .eq("id", d.fId);
    if (updErr) {
      console.error(`[adminPickForwarderAddress update] failed`, { code: updErr.code, message: updErr.message, fId: d.fId });
      return { ok: false, error: `บันทึกที่อยู่ไม่สำเร็จ: ${updErr.message}` };
    }

    // ── propagate to the shipment's box-split siblings (owner/ภูม 2026-07-21) —
    // one shipment = one address (ALL boxes) + one carrier/paymethod (unbilled boxes).
    await propagateShipmentEdit(
      admin,
      { id: d.fId, ftrackingchn: fwd.ftrackingchn, userid: fwd.userid },
      {
        address: {
          faddressname: address.addressname, faddresslastname: address.addresslastname,
          faddressno: address.addressno, faddresssubdistrict: address.addresssubdistrict,
          faddressdistrict: address.addressdistrict, faddressprovince: address.addressprovince,
          faddresszipcode: address.addresszipcode, faddressnote: address.addressnote,
          faddresstel: address.addresstel, faddresstel2: address.addresstel2,
        },
        money: {
          ...(carrierWritable ? { fshipby: carrier, paymethod: derivePayMethodForDelivery(carrier, { addressID: null, zip: address.addresszipcode }) } : {}),
          // ONLY flat own-fleet (เหมาๆ/รับเอง = ฿0 · fee is the once-per-shipment mao anchor)
          // gets its per-box price zeroed on siblings; PCSE/private prices stay per-box.
          // ค่าส่งไทยของกล่องพี่น้อง = ฿0 เมื่อ (ก) เหมาๆ/รับเอง (ค่าเดียว ฿100 อยู่ที่ anchor)
          // หรือ (ข) ขนส่งเอกชน = ปลายทาง (owner 2026-07-21). PCSE/PRE ด่วน = ของ Pacred
          // เก็บต้นทาง → ราคาต่อกล่องคงไว้.
          ...(carrierWritable && (isMaoCarrier(carrier) || carrier === "PCS" || !isOwnFleetCarrier(carrier))
            ? { ftransportprice: 0 }
            : {}),
        },
      },
      legacyAdminId,
    );

    await logAdminAction(adminId, "tb_forwarder.update_address", "tb_forwarder", String(d.fId), {
      addressId: d.addressId,
      userid:    fwd.userid,
      to:        `${address.addressname} ${address.addresslastname} · ${address.addressprovince}`,
      carrier, reprice,
    });

    revalidatePath(`/admin/forwarders/${d.fId}`);
    revalidatePath("/admin/forwarders");
    return { ok: true };
  });
}

// ── adminUpdateForwarderAddressDetails — inline free-text edit of the delivery address ──
// owner/ภูม 2026-07-03: staff must be able to EDIT the address text in-place (ที่อยู่เป็นก้อน
// เดียวกัน แก้ไม่ได้). The corrected address is saved/reused in the customer's address book,
// made the next-use default, then copied into tb_forwarder.fAddress*. This closes the old split
// where staff repaired today's snapshot but the next MOMO/import job still had no usable address.
const addressDetailsSchema = z.object({
  fId:          z.number().int().positive(),
  name:         z.string().trim().max(120).default(""),
  lastname:     z.string().trim().max(120).default(""),
  addressno:    z.string().trim().max(255).default(""),
  subdistrict:  z.string().trim().max(120).default(""),
  district:     z.string().trim().max(120).default(""),
  province:     z.string().trim().max(120).default(""),
  zipcode:      z.string().trim().max(10).default(""),
  tel:          z.string().trim().max(10).default(""),
  tel2:         z.string().trim().max(20).default(""),
  note:         z.string().trim().max(500).default(""),
});
export type AdminUpdateForwarderAddressDetailsInput = z.input<typeof addressDetailsSchema>;

export async function adminUpdateForwarderAddressDetails(
  rawInput: AdminUpdateForwarderAddressDetailsInput,
): Promise<AdminActionResult> {
  const parsed = addressDetailsSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const raw = parsed.data;
  const normalized = customerAddressSchema.safeParse({
    addressname: raw.name,
    addresslastname: raw.lastname,
    addresstel: raw.tel,
    addresstel2: raw.tel2,
    addressno: raw.addressno,
    addresssubdistrict: raw.subdistrict,
    addressdistrict: raw.district,
    addressprovince: raw.province,
    addresszipcode: raw.zipcode,
    addressnote: raw.note,
  });
  if (!normalized.success) {
    return { ok: false, error: normalized.error.issues[0]?.message ?? "ที่อยู่ไม่ถูกต้อง" };
  }
  const address = normalized.data;
  const d = {
    ...raw,
    name: address.addressname,
    lastname: address.addresslastname,
    tel: address.addresstel,
    tel2: address.addresstel2,
    addressno: address.addressno,
    subdistrict: address.addresssubdistrict,
    district: address.addressdistrict,
    province: address.addressprovince,
    zipcode: address.addresszipcode,
    note: address.addressnote,
  };

  return withAdmin(["ops", "accounting", "super", "warehouse"], async ({ adminId }) => {
    const admin = createAdminClient();
    const legacyAdminId = (await resolveLegacyAdminId()).slice(0, 10);

    const { data: fwd, error: fwdErr } = await admin
      .from("tb_forwarder")
      .select("id, userid, fshipby, fstatus, fvolume, ftrackingchn")
      .eq("id", d.fId)
      .maybeSingle<{ id: number; userid: string; fshipby: string | null; fstatus: string | null; fvolume: number | string | null; ftrackingchn: string | null }>();
    if (fwdErr) {
      console.error(`[adminUpdateForwarderAddressDetails read] failed`, { code: fwdErr.code, message: fwdErr.message, fId: d.fId });
      return { ok: false, error: `อ่านรายการไม่สำเร็จ: ${fwdErr.message}` };
    }
    if (!fwd) return { ok: false, error: "ไม่พบรายการฝากนำเข้า" };

    // Persist FIRST. If this fails, do not create another one-off forwarder
    // snapshot that downstream/next-order flows cannot recover or reuse.
    const saved = await saveCustomerAddress(admin, {
      userid: fwd.userid,
      address,
      adminid: legacyAdminId,
      forceDefault: true,
    });
    if (saved.error || !saved.data) {
      console.error(`[adminUpdateForwarderAddressDetails address-book] failed`, {
        fId: d.fId, userid: fwd.userid, message: saved.error,
      });
      return { ok: false, error: saved.error ?? "บันทึกสมุดที่อยู่ไม่สำเร็จ" };
    }

    // Re-resolve the carrier by the (edited) province + re-price the domestic leg (editable).
    const carrier = suggestCarrierForAddress((fwd.fshipby ?? "").trim(), {
      zip: d.zipcode, province: d.province, amphoe: d.district || null, userID: fwd.userid,
    });
    // CLOSED-LIST backstop (owner 2026-07-14) — see adminPickForwarderAddress.
    const carrierWritable =
      carrier !== "" && checkCarrierForProvince(carrier, d.province).ok;
    const fStatusInt = parseInt(fwd.fstatus ?? "0", 10);
    const reprice =
      carrierWritable && fStatusInt <= 5
        ? repriceTransportForCarrier(carrier, Number(fwd.fvolume ?? 0))
        : null;

    const { error: updErr } = await admin
      .from("tb_forwarder")
      .update({
        faddressname:        d.name,
        faddresslastname:    d.lastname,
        faddressno:          d.addressno,
        faddresssubdistrict: d.subdistrict,
        faddressdistrict:    d.district,
        faddressprovince:    d.province,
        faddresszipcode:     d.zipcode,
        faddresstel:         d.tel,
        faddresstel2:        d.tel2,
        faddressnote:        d.note,
        ...(carrierWritable ? { fshipby: carrier, paymethod: derivePayMethodForDelivery(carrier, { addressID: null, zip: d.zipcode }) } : {}),
        // 🔒 COD LOCK (owner 2026-07-21) — ปลายทาง = ลูกค้าจ่ายขนส่งที่ปลายทาง → เราไม่เก็บ
        // ค่าส่งไทย. ต้องชนะ reprice เพื่อไม่ให้เรทที่เพิ่งคิดได้ทับกติกานี้.
        ...(carrierWritable && derivePayMethodForDelivery(carrier, { addressID: null, zip: d.zipcode }) === "2"
          ? { ftransportprice: 0 }
          : reprice != null
            ? { ftransportprice: reprice }
            : {}),
        adminidupdate:       legacyAdminId,
      })
      .eq("id", d.fId);
    if (updErr) {
      console.error(`[adminUpdateForwarderAddressDetails update] failed`, { code: updErr.code, message: updErr.message, fId: d.fId });
      return { ok: false, error: `บันทึกที่อยู่ไม่สำเร็จ: ${updErr.message}` };
    }

    // ── propagate to box-split siblings (owner/ภูม 2026-07-21) — one shipment,
    // one address (ALL boxes) + one carrier/paymethod (unbilled boxes only).
    await propagateShipmentEdit(
      admin,
      { id: d.fId, ftrackingchn: fwd.ftrackingchn, userid: fwd.userid },
      {
        address: {
          faddressname: d.name, faddresslastname: d.lastname, faddressno: d.addressno,
          faddresssubdistrict: d.subdistrict, faddressdistrict: d.district, faddressprovince: d.province,
          faddresszipcode: d.zipcode, faddresstel: d.tel, faddresstel2: d.tel2, faddressnote: d.note,
        },
        money: {
          ...(carrierWritable ? { fshipby: carrier, paymethod: derivePayMethodForDelivery(carrier, { addressID: null, zip: d.zipcode }) } : {}),
          // ค่าส่งไทยของกล่องพี่น้อง = ฿0 เมื่อ (ก) เหมาๆ/รับเอง (ค่าเดียว ฿100 อยู่ที่ anchor)
          // หรือ (ข) ขนส่งเอกชน = ปลายทาง (owner 2026-07-21). PCSE/PRE ด่วน = ของ Pacred
          // เก็บต้นทาง → ราคาต่อกล่องคงไว้.
          ...(carrierWritable && (isMaoCarrier(carrier) || carrier === "PCS" || !isOwnFleetCarrier(carrier))
            ? { ftransportprice: 0 }
            : {}),
        },
      },
      legacyAdminId,
    );

    await logAdminAction(adminId, "tb_forwarder.update_address_details", "tb_forwarder", String(d.fId), {
      userid: fwd.userid,
      addressId: saved.data.addressId,
      addressCreated: saved.data.created,
      rememberedAsDefault: saved.data.isDefault,
      province: d.province,
      carrier,
      reprice,
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

// ── MULTI-image gallery (Pacred-added · migration 0176) ──────────────────────
// 2026-06-11 (ปอน · owner "มันไม่ใช่ 'เปลี่ยนรูปสินค้า' แต่เป็น 'เพิ่มรูปภาพ' · มันจะมี
// หลายๆรูปภาพ"). Legacy `tb_forwarder.fcover` is a single cover; these two actions
// drive a per-order gallery stored as a JSON array of bucket keys in the new
// `tb_forwarder.fimages` column (migration 0176). fcover is kept as the primary
// (the customer page + receipts read it) and is auto-set from the first upload when
// it was empty. Storage bucket = `forwarder-covers` (same as the cover) · prefix
// `admin/<userid>/<fid>`. We store the KEY only — the actual file isn't deleted on
// remove (a storage GC cron can sweep orphans later) to avoid accidental loss.
const FORWARDER_GALLERY_CAP = 12;

/** Parse the fimages JSON column → string[] (tolerant of empty / legacy junk). */
function parseForwarderImages(raw: string | null | undefined): string[] {
  if (!raw || raw.trim() === "") return [];
  try {
    const p = JSON.parse(raw);
    return Array.isArray(p) ? p.filter((x): x is string => typeof x === "string" && x.trim() !== "") : [];
  } catch {
    return [];
  }
}

// The fimages column may not exist yet on a given environment (migration 0176 not
// applied). Both actions detect that (PG 42703 / "column ... does not exist") and
// return a clean Thai message instead of a 500 — so the UI degrades gracefully.
function isMissingFimagesColumn(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  return err.code === "42703" || /fimages/i.test(err.message ?? "");
}
const FIMAGES_NOT_READY =
  "แกลเลอรีรูปยังไม่พร้อมใช้งาน — ต้องรัน migration 0176 (เพิ่มคอลัมน์ fimages) บน prod ก่อน · แจ้งทีม backend";

// adminAddForwarderImage — upload one image + append its key to fimages (FormData:
// `fId` + `file`). The first image on a coverless order also becomes the fcover.
export async function adminAddForwarderImage(
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

    const { data: fwd, error: fwdErr } = await admin
      .from("tb_forwarder")
      .select("id, userid, fcover, fimages")
      .eq("id", fId)
      .maybeSingle<{ id: number; userid: string; fcover: string | null; fimages: string | null }>();
    if (fwdErr) {
      if (isMissingFimagesColumn(fwdErr)) return { ok: false, error: FIMAGES_NOT_READY };
      console.error(`[adminAddForwarderImage read] failed`, { code: fwdErr.code, message: fwdErr.message, fId });
      return { ok: false, error: `อ่านรายการไม่สำเร็จ: ${fwdErr.message}` };
    }
    if (!fwd) return { ok: false, error: "ไม่พบรายการฝากนำเข้า" };

    const current = parseForwarderImages(fwd.fimages);
    if (current.length >= FORWARDER_GALLERY_CAP) {
      return { ok: false, error: `เพิ่มรูปได้สูงสุด ${FORWARDER_GALLERY_CAP} รูป/ออเดอร์ — ลบบางรูปก่อน` };
    }

    const upload = await uploadToBucket(file, "forwarder-covers", `admin/${fwd.userid}/${fId}`);
    if (!upload.ok) return { ok: false, error: upload.error ?? "อัปโหลดรูปไม่สำเร็จ" };

    const next = [...current, upload.filename];
    const update: Record<string, string> = { fimages: JSON.stringify(next), adminidupdate: legacyAdminId };
    // First image on a coverless order → also becomes the primary cover.
    if (!(fwd.fcover && fwd.fcover.trim() !== "")) update.fcover = upload.filename;

    const { error: updErr } = await admin.from("tb_forwarder").update(update).eq("id", fId);
    if (updErr) {
      if (isMissingFimagesColumn(updErr)) return { ok: false, error: FIMAGES_NOT_READY };
      console.error(`[adminAddForwarderImage update] failed`, { code: updErr.code, message: updErr.message, fId });
      return { ok: false, error: `บันทึกรูปไม่สำเร็จ: ${updErr.message}` };
    }

    await logAdminAction(adminId, "tb_forwarder.add_image", "tb_forwarder", String(fId), {
      filename: upload.filename, count: next.length,
    });

    revalidatePath(`/admin/forwarders/${fId}`);
    revalidatePath("/admin/forwarders");
    return { ok: true };
  });
}

// adminRemoveForwarderImage — drop one image KEY from the fimages gallery. If the
// removed key was also the fcover, re-derive the cover from the remaining gallery.
const removeImageSchema = z.object({
  fId:      z.number().int().positive(),
  imageKey: z.string().trim().min(1).max(500),
});
export type AdminRemoveForwarderImageInput = z.infer<typeof removeImageSchema>;

export async function adminRemoveForwarderImage(
  rawInput: AdminRemoveForwarderImageInput,
): Promise<AdminActionResult> {
  const parsed = removeImageSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const d = parsed.data;

  return withAdmin(["ops", "accounting", "super", "warehouse"], async ({ adminId }) => {
    const admin = createAdminClient();
    const legacyAdminId = (await resolveLegacyAdminId()).slice(0, 10);

    const { data: fwd, error: fwdErr } = await admin
      .from("tb_forwarder")
      .select("id, fcover, fimages")
      .eq("id", d.fId)
      .maybeSingle<{ id: number; fcover: string | null; fimages: string | null }>();
    if (fwdErr) {
      if (isMissingFimagesColumn(fwdErr)) return { ok: false, error: FIMAGES_NOT_READY };
      console.error(`[adminRemoveForwarderImage read] failed`, { code: fwdErr.code, message: fwdErr.message, fId: d.fId });
      return { ok: false, error: `อ่านรายการไม่สำเร็จ: ${fwdErr.message}` };
    }
    if (!fwd) return { ok: false, error: "ไม่พบรายการฝากนำเข้า" };

    const current = parseForwarderImages(fwd.fimages);
    const next = current.filter((k) => k !== d.imageKey);
    if (next.length === current.length) return { ok: false, error: "ไม่พบรูปที่จะลบในแกลเลอรี" };

    const update: Record<string, string> = { fimages: JSON.stringify(next), adminidupdate: legacyAdminId };
    // If we removed the image that was also the cover, re-derive (next gallery item, else clear).
    if ((fwd.fcover ?? "") === d.imageKey) update.fcover = next[0] ?? "";

    const { error: updErr } = await admin.from("tb_forwarder").update(update).eq("id", d.fId);
    if (updErr) {
      if (isMissingFimagesColumn(updErr)) return { ok: false, error: FIMAGES_NOT_READY };
      console.error(`[adminRemoveForwarderImage update] failed`, { code: updErr.code, message: updErr.message, fId: d.fId });
      return { ok: false, error: `ลบรูปไม่สำเร็จ: ${updErr.message}` };
    }

    await logAdminAction(adminId, "tb_forwarder.remove_image", "tb_forwarder", String(d.fId), {
      imageKey: d.imageKey, count: next.length,
    });

    revalidatePath(`/admin/forwarders/${d.fId}`);
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
  // Optional — the delivery จังหวัดปลายทาง the staff picked in <EditShipByField>. When a
  // PRIVATE courier is chosen for a row whose faddressprovince was empty (address-less /
  // juristic), this is the province the coverage guard checks against + is persisted so
  // it's remembered (own-fleet PCS/PCSF/PCSE ignore it). Canonicalised server-side.
  province: z.string().trim().max(60).optional(),
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

    // 1. Read fStatus + fVolume (legacy L1586-1592 reads these to decide re-price)
    //    + faddressprovince (the CLOSED-LIST province gate, owner 2026-07-14).
    const { data: fwd, error: fwdErr } = await admin
      .from("tb_forwarder")
      .select("id, fstatus, fvolume, fshipby, faddressprovince, userid, ftrackingchn, ftransportprice")
      .eq("id", d.fId)
      .maybeSingle<{ id: number; fstatus: string | null; fvolume: number | string | null; fshipby: string | null; faddressprovince: string | null; userid: string | null; ftrackingchn: string | null; ftransportprice: number | string | null }>();
    if (fwdErr) {
      console.error(`[adminUpdateForwarderShipBy read] failed`, { code: fwdErr.code, message: fwdErr.message, fId: d.fId });
      return { ok: false, error: `อ่านรายการไม่สำเร็จ: ${fwdErr.message}` };
    }
    if (!fwd) return { ok: false, error: "ไม่พบรายการฝากนำเข้า" };
    if ((fwd.fshipby ?? "").trim() === fShipBy) {
      return { ok: false, error: "ไม่มีการเปลี่ยนแปลง (ผู้ขนส่งเดิม)" };
    }

    // 🔴 CLOSED LIST (owner 2026-07-14/15) — a private courier must exist in the owner's
    // workbook AND actually run in the delivery province. Own-fleet (PCS/PCSF/PCSE) is exempt.
    // Enforce against the province the staff PICKED in <EditShipByField> (the picker filters by
    // it); fall back to the stored faddressprovince when the client sent none. This is the REAL
    // gate — the picker filter alone cannot stop a raw action post.
    const pickedProvince = canonicalProvince(d.province ?? "");
    const storedProvince = (fwd.faddressprovince ?? "").trim();
    const guardProvince = pickedProvince || storedProvince;
    const coverage = checkCarrierForProvince(fShipBy, guardProvince, {
      previous: fwd.fshipby,
    });
    if (!coverage.ok) return { ok: false, error: coverage.error };

    // 2. Build the UPDATE. fShipBy + adminIDUpdate always; conditionally
    //    fTransportPrice + the PCS depot address (legacy L1595-1627).
    const fStatusInt = parseInt(fwd.fstatus ?? "0", 10);
    const fVolume = Number(fwd.fvolume ?? 0);
    const update: Record<string, string | number> = {
      fshipby: fShipBy,
      adminidupdate: legacyAdminId,
    };

    // Legacy L1595: only re-price while still pre-payment (fStatus<=5).
    // ⚠️ Match the D1 rebrand too (PCSF→PRF เหมาๆ · PCSE→PRE ด่วน · L-MIG-04) — the
    // legacy-only literals meant picking "PRF" (what the cart writes today) left a
    // stale private-courier quote on a เหมาๆ row: billed that quote instead of the
    // ฿100 flat (เดฟ 2026-07-21 integration review · same class as PCS_FAMILY above).
    const isExpressShipBy = fShipBy === "PCSE" || fShipBy === "PRE";
    if (fStatusInt <= 5) {
      if (isMaoCarrier(fShipBy)) {
        update.ftransportprice = 0; // เหมาๆ — the ฿100 is the once-per-shipment mao fee
      } else if (isExpressShipBy) {
        update.ftransportprice = Math.max(fVolume * 120, 50); // ส่งด่วน · floor 50
      } else if (fShipBy === "PCS") {
        update.ftransportprice = 0; // รับเองที่โกดัง
      }
    }

    // Legacy L1612-1626: 'PCS' rewrites the snapshot address to the depot.
    if (fShipBy === "PCS") Object.assign(update, FPCS_DEPOT_ADDRESS);

    // Owner 2026-07-15 — persist the chosen delivery province for a PRIVATE courier when it
    // differs from what's stored (own-fleet PCS/PCSF/PCSE need none; 'PCS' already rewrote the
    // depot province above). This "remembers" the province so the บิล/เอกสาร province is right +
    // next time the picker/guard work straight off faddressprovince. Already coverage-verified.
    const isOwnFleetShipBy = isOwnFleetCarrier(fShipBy); // SOT — incl. the PRF/PRE rebrand
    const persistedProvince =
      !isOwnFleetShipBy && pickedProvince && pickedProvince !== storedProvince
        ? pickedProvince
        : null;
    if (persistedProvince) update.faddressprovince = persistedProvince;

    // 🔴 owner 2026-07-18 — stamp payMethod from the CHOSEN carrier on the ADMIN path
    // too (own-fleet → ต้นทาง '1' · ขนส่งเอกชน → ปลายทาง '2' COD). The customer/CS path
    // (updateLegacyForwarderShipBy) already does; this admin path used to leave it stale.
    // Not on billed rows (>5) — the row's collection state is settled there.
    if (fStatusInt <= 5) {
      // 🔒 COD LOCK (owner 2026-07-21) — เอกชน = ปลายทางเสมอ · ปลายทาง = ค่าส่งไทย 0.
      // enforceCodDomesticZero ตัดสินคู่นี้ที่เดียว แล้วผลลัพธ์ทับค่าที่คิดไว้ข้างบน
      // (สูตร express/เหมาๆ ยังใช้ได้เมื่อเป็นต้นทาง).
      const locked = enforceCodDomesticZero({
        fShipBy,
        payMethod: derivePayMethodForDelivery(fShipBy, { addressID: null, zip: null }),
        transportPrice: update.ftransportprice ?? fwd.ftransportprice ?? 0,
      });
      update.paymethod = locked.payMethod;
      if (locked.payMethod === "2") update.ftransportprice = 0;
    }

    const { error: updErr } = await admin
      .from("tb_forwarder")
      .update(update)
      .eq("id", d.fId);
    if (updErr) {
      console.error(`[adminUpdateForwarderShipBy update] failed`, { code: updErr.code, message: updErr.message, fId: d.fId });
      return { ok: false, error: `บันทึกผู้ขนส่งไม่สำเร็จ: ${updErr.message}` };
    }

    // ── propagate carrier to box-split siblings (owner/ภูม 2026-07-21) — one shipment,
    // one carrier (no more "หลายขนส่ง"). fshipby + paymethod → unbilled siblings; the PCS-depot
    // address (if PCS) + province → all siblings; ftransportprice zeroed on siblings ONLY for
    // flat own-fleet (เหมาๆ/รับเอง · fee is the once-per-shipment anchor) — PCSE/private stay per-box.
    {
      const isFlatOwnFleet = isMaoCarrier(fShipBy) || fShipBy === "PCS"; // flat ฿0 legs (เหมาๆ/รับเอง) · express keeps its per-box price
      const addressProp: Record<string, string | number> = {};
      const moneyProp: Record<string, string | number> = {};
      for (const [k, v] of Object.entries(update)) {
        if (k === "adminidupdate") continue;
        if (k.startsWith("faddress")) addressProp[k] = v;
        else if (k === "ftransportprice") { if (isFlatOwnFleet) moneyProp.ftransportprice = 0; }
        else moneyProp[k] = v; // fshipby, paymethod
      }
      await propagateShipmentEdit(
        admin,
        { id: d.fId, ftrackingchn: fwd.ftrackingchn, userid: fwd.userid },
        { address: addressProp, money: moneyProp },
        legacyAdminId,
      );
    }

    // owner 2026-07-18 "เรทค่าขนส่งไม่ยอมขึ้น auto · Flash/J&T เก็บตามจริง ไม่ใช่ 50" —
    // right after the carrier lands, quote the REAL courier rate (Flash table · measured
    // girth+kg) into ftransportprice when it's still ฿0. costOnly: never rewrites the
    // carrier/paymethod just chosen · fill-when-empty · best-effort (null = no change).
    if (fStatusInt <= 5 && !["PCS", "PCSF", "PCSE", "PRF", "PRE"].includes(fShipBy)) {
      await autoFillThShippingForForwarder(admin, d.fId, { costOnly: true });
    }

    await logAdminAction(adminId, "tb_forwarder.update_ship_by", "tb_forwarder", String(d.fId), {
      before: fwd.fshipby, after: fShipBy,
      reprice: fStatusInt <= 5 && ["PCS", "PCSF", "PCSE"].includes(fShipBy)
        ? update.ftransportprice : "unchanged",
      pcsDepotAddr: fShipBy === "PCS",
      provinceSet: persistedProvince ?? "unchanged",
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
  // จำนวนกล่อง/ชิ้น (famount). Optional — when supplied, staff are correcting the count
  // to match MOMO (owner/ภูม 2026-07-08: "แก้จำนวนกล่องก็ไม่ได้"). famount is DISPLAY-ONLY
  // (verified: it is in NO bill/outstanding/debit formula — the folded famountcount='1'
  // marker is what tells the bill NOT to multiply by it), so editing it moves ZERO money.
  famount:     z.coerce.number().int().min(1).max(9999).optional(),
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
      .select("id, famountcount, famount")
      .eq("id", d.fId)
      .maybeSingle<{ id: number; famountcount: string | null; famount: number | null }>();
    if (fwdErr) {
      console.error(`[adminUpdateForwarderAmountCount read] failed`, { code: fwdErr.code, message: fwdErr.message, fId: d.fId });
      return { ok: false, error: `อ่านรายการไม่สำเร็จ: ${fwdErr.message}` };
    }
    if (!fwd) return { ok: false, error: "ไม่พบรายการฝากนำเข้า" };

    const countChanged = (fwd.famountcount ?? "").trim() !== d.famountcount;
    const amountChanged = d.famount != null && Math.round(Number(fwd.famount ?? 0)) !== d.famount;
    if (!countChanged && !amountChanged) {
      return { ok: false, error: "ไม่มีการเปลี่ยนแปลง" };
    }

    // Build the update — famountcount always (basis toggle) + famount ONLY when the staff
    // typed a new count (display-only · money-safe). adminidupdate stamps the editor.
    const update: Record<string, unknown> = { famountcount: d.famountcount, adminidupdate: legacyAdminId };
    if (amountChanged) update.famount = d.famount;

    const { error: updErr } = await admin
      .from("tb_forwarder")
      .update(update)
      .eq("id", d.fId);
    if (updErr) {
      console.error(`[adminUpdateForwarderAmountCount update] failed`, { code: updErr.code, message: updErr.message, fId: d.fId });
      return { ok: false, error: `บันทึกไม่สำเร็จ: ${updErr.message}` };
    }

    await logAdminAction(adminId, "tb_forwarder.update_amount_count", "tb_forwarder", String(d.fId), {
      before: { famountcount: fwd.famountcount, famount: fwd.famount },
      after: { famountcount: d.famountcount, famount: amountChanged ? d.famount : fwd.famount },
    });

    revalidatePath(`/admin/forwarders/${d.fId}`);
    revalidatePath("/admin/forwarders");
    return { ok: true };
  });
}

// ── doc-tier discount confirm (ภูม 2026-06-18 · C · mig 0188) ────────────────
// Per-order admin ติ๊กยืนยัน = the C1 (ฝากโอน) signal for the owner-locked cargo
// doc-tier discount (lib/forwarder/doc-tier-discount.ts). Writes ONLY
// tb_forwarder.doc_tier_confirmed — ISOLATED from the money path (§0e): it does
// NOT recompute the price here. The discount is DOUBLE dormant-safe (the column
// defaults false AND the discount is gated by business_config
// cargo.doc_tier_discount.enabled=false); when the owner enables it, the flag
// feeds the next dimension re-save's resolveLiveForwarderRate. Gated to the
// money-doc authority roles (super/accounting/pricing — same as the cost editor),
// NOT the warehouse/ops set, because granting a ฿800/CBM discount is a pricing call.
const docTierConfirmSchema = z.object({
  fId:       z.number().int().positive(),
  confirmed: z.boolean(),
});
export type AdminSetForwarderDocTierConfirmedInput = z.infer<typeof docTierConfirmSchema>;

export async function adminSetForwarderDocTierConfirmed(
  rawInput: AdminSetForwarderDocTierConfirmedInput,
): Promise<AdminActionResult> {
  const parsed = docTierConfirmSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const d = parsed.data;

  return withAdmin(["super", "accounting", "pricing"], async ({ adminId }) => {
    const admin = createAdminClient();
    const legacyAdminId = (await resolveLegacyAdminId()).slice(0, 10);

    const { data: fwd, error: fwdErr } = await admin
      .from("tb_forwarder")
      .select("id, doc_tier_confirmed")
      .eq("id", d.fId)
      .maybeSingle<{ id: number; doc_tier_confirmed: boolean | null }>();
    if (fwdErr) {
      console.error(`[adminSetForwarderDocTierConfirmed read] failed`, { code: fwdErr.code, message: fwdErr.message, fId: d.fId });
      return { ok: false, error: `อ่านรายการไม่สำเร็จ: ${fwdErr.message}` };
    }
    if (!fwd) return { ok: false, error: "ไม่พบรายการฝากนำเข้า" };

    const before = fwd.doc_tier_confirmed === true;
    if (before === d.confirmed) return { ok: true }; // idempotent — already in the requested state

    const { error: updErr } = await admin
      .from("tb_forwarder")
      .update({ doc_tier_confirmed: d.confirmed, adminidupdate: legacyAdminId })
      .eq("id", d.fId);
    if (updErr) {
      console.error(`[adminSetForwarderDocTierConfirmed update] failed`, { code: updErr.code, message: updErr.message, fId: d.fId });
      return { ok: false, error: `บันทึกการยืนยันไม่สำเร็จ: ${updErr.message}` };
    }

    await logAdminAction(adminId, "tb_forwarder.set_doc_tier_confirmed", "tb_forwarder", String(d.fId), {
      before, after: d.confirmed,
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

// ── update_priceCrate — ค่าตีลังไม้ (บาท) header-level money edit ──────────────
// Owner 2026-06-29 ("เพิ่มแก้ราคาได้เข้ามาเลย"): the detail-page crate row only
// let admins flip the FLAG ('1' ตี · '2' ไม่ตี); the actual baht was read-only
// (re-derived from the per-item crateFee at dimension re-pricing). This action
// makes the crate PRICE directly editable on the forwarder header — faithful to
// the legacy update.php `priceCrate` baht input (include/pages/forwarder/update.php
// L1231-1235 · `<input name="priceCrate">`), which legacy writes via the
// update_data path (forwarder.php L1762 `$priceCrate=$_POST['priceCrate']` →
// L2065 `priceCrate='$priceCrate'`).
//
// MONEY model — collection_model = in_bill_total (legacy-verified · NOT "เก็บนอก").
// Legacy folds priceCrate into the CUSTOMER-PAYABLE total in every composite:
//   • calPriceForwarderMain (function.php L1868 — the detail/list ยอด)
//   • the credit-grant $pricePay (forwarder.php L1425)
//   • create-f-receipt.php $totalPrice + the priceOtherBillAll "ค่าใช้จ่ายอื่นๆ"
//     bucket (L329/335/665/671)
//   • shown as its own labelled line "ค่าตีลังไม้" on calPrice.php L259.
// Pacred's calcForwarderOutstanding / calcForwarderGross (lib/forwarder/
// outstanding.ts L77) ALREADY sums pricecrate → the existing grand-total is a
// faithful port. Editing pricecrate here therefore moves the customer's payable
// total — same as legacy. Column-only write (+crate flag + adminIDUpdate + audit);
// editable in ALL statuses (legacy never gated the update.php money inputs).
const cratePriceSchema = z.object({
  fId:        z.number().int().positive(),
  crate:      z.enum(["1", "2"] as const),       // '1' ตีลังไม้ · '2' ไม่ตีลังไม้
  pricecrate: z.number().finite().min(0).max(99_999_999),
});
export type AdminUpdateForwarderCratePriceInput = z.infer<typeof cratePriceSchema>;

export async function adminUpdateForwarderCratePrice(
  rawInput: AdminUpdateForwarderCratePriceInput,
): Promise<AdminActionResult> {
  const parsed = cratePriceSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const d = parsed.data;

  return withAdmin(["ops", "accounting", "super", "warehouse"], async ({ adminId }) => {
    const admin = createAdminClient();
    const legacyAdminId = (await resolveLegacyAdminId()).slice(0, 10);

    const { data: fwd, error: fwdErr } = await admin
      .from("tb_forwarder")
      .select("id, crate, pricecrate")
      .eq("id", d.fId)
      .maybeSingle<{ id: number; crate: string | null; pricecrate: number | string | null }>();
    if (fwdErr) {
      console.error(`[adminUpdateForwarderCratePrice read] failed`, { code: fwdErr.code, message: fwdErr.message, fId: d.fId });
      return { ok: false, error: `อ่านรายการไม่สำเร็จ: ${fwdErr.message}` };
    }
    if (!fwd) return { ok: false, error: "ไม่พบรายการฝากนำเข้า" };

    const beforeCrate = (fwd.crate ?? "").trim();
    const beforePrice = Number(fwd.pricecrate ?? 0);
    if (beforeCrate === d.crate && beforePrice === d.pricecrate) {
      return { ok: false, error: "ไม่มีการเปลี่ยนแปลง (ค่าตีลังเดิม)" };
    }

    const { error: updErr } = await admin
      .from("tb_forwarder")
      .update({ crate: d.crate, pricecrate: d.pricecrate, adminidupdate: legacyAdminId })
      .eq("id", d.fId);
    if (updErr) {
      console.error(`[adminUpdateForwarderCratePrice update] failed`, { code: updErr.code, message: updErr.message, fId: d.fId });
      return { ok: false, error: `บันทึกค่าตีลังไม่สำเร็จ: ${updErr.message}` };
    }

    await logAdminAction(adminId, "tb_forwarder.update_crate_price", "tb_forwarder", String(d.fId), {
      before: { crate: beforeCrate, pricecrate: beforePrice },
      after:  { crate: d.crate, pricecrate: d.pricecrate },
    });

    revalidatePath(`/admin/forwarders/${d.fId}`);
    revalidatePath("/admin/forwarders");
    return { ok: true };
  });
}

// ── update_th_shipping — ค่าขนส่งไทย (ftransportprice) manual edit ────────────
// Owner 2026-07-19: the [fNo] left panel had NO editable ค่าขนส่งไทย. When Flash's
// auto-quote no-ops (parcel not yet measured → dims/kg incomplete) the cost sits at
// ฿0 with nowhere to fix it here ("Flash เลือกแล้วค่าส่งไม่ขึ้น / save ไม่ติด").
// This lets staff SEE + set it. Single money field — part of the bill
// (pricePay += ftransportprice) · gated · logged. On a COD row (paymethod='2') the
// value is stored but the COD gate still leaves the domestic leg off the Pacred
// bill downstream (courier collects at destination · unchanged behaviour).
const thShippingSchema = z.object({
  fId:             z.number().int().positive(),
  ftransportprice: z.number().min(0).max(1_000_000),
});
export type AdminUpdateForwarderThShippingInput = z.infer<typeof thShippingSchema>;

export async function adminUpdateForwarderThShipping(
  rawInput: AdminUpdateForwarderThShippingInput,
): Promise<AdminActionResult> {
  const parsed = thShippingSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const d = parsed.data;

  return withAdmin(["ops", "accounting", "super", "warehouse"], async ({ adminId }) => {
    const admin = createAdminClient();
    const legacyAdminId = (await resolveLegacyAdminId()).slice(0, 10);

    const { data: fwd, error: fwdErr } = await admin
      .from("tb_forwarder")
      .select("id, ftransportprice, fshipby, paymethod")
      .eq("id", d.fId)
      .maybeSingle<{ id: number; ftransportprice: number | string | null; fshipby: string | null; paymethod: string | null }>();
    if (fwdErr) {
      console.error(`[adminUpdateForwarderThShipping read] failed`, { code: fwdErr.code, message: fwdErr.message, fId: d.fId });
      return { ok: false, error: `อ่านรายการไม่สำเร็จ: ${fwdErr.message}` };
    }
    if (!fwd) return { ok: false, error: "ไม่พบรายการฝากนำเข้า" };

    // 🔒 COD LOCK (owner 2026-07-21) — งานที่เก็บปลายทาง ห้ามมีค่าส่งไทยในระบบ
    // (ลูกค้าจ่ายขนส่งเองที่ปลายทาง). บอกเหตุผลตรงๆ แทนที่จะรับตัวเลขแล้วเงียบ.
    const codLock = enforceCodDomesticZero({
      fShipBy: fwd.fshipby,
      payMethod: fwd.paymethod,
      transportPrice: d.ftransportprice,
    });
    if (codLock.payMethod === "2" && d.ftransportprice > 0) {
      return {
        ok: false,
        error: "งานนี้เก็บเงินปลายทาง (COD) — ค่าขนส่งไทยต้องเป็น ฿0 (ขนส่งเก็บกับลูกค้าที่ปลายทาง). ถ้าจะเก็บค่าส่งเอง ให้เปลี่ยนเป็นขนส่งของ Pacred + วิธีเก็บเงินต้นทางก่อน",
      };
    }

    const before = Number(fwd.ftransportprice ?? 0);
    if (before === d.ftransportprice) {
      return { ok: false, error: "ไม่มีการเปลี่ยนแปลง (ค่าขนส่งไทยเดิม)" };
    }

    const { error: updErr } = await admin
      .from("tb_forwarder")
      .update({ ftransportprice: d.ftransportprice, adminidupdate: legacyAdminId })
      .eq("id", d.fId);
    if (updErr) {
      console.error(`[adminUpdateForwarderThShipping update] failed`, { code: updErr.code, message: updErr.message, fId: d.fId });
      return { ok: false, error: `บันทึกค่าขนส่งไทยไม่สำเร็จ: ${updErr.message}` };
    }

    await logAdminAction(adminId, "tb_forwarder.update_th_shipping", "tb_forwarder", String(d.fId), {
      before, after: d.ftransportprice,
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
      .select("id, paymethod, userid, ftrackingchn, fshipby, ftransportprice")
      .eq("id", d.fId)
      .maybeSingle<{ id: number; paymethod: string | null; userid: string | null; ftrackingchn: string | null; fshipby: string | null; ftransportprice: number | string | null }>();
    if (fwdErr) {
      console.error(`[adminUpdateForwarderPayMethod read] failed`, { code: fwdErr.code, message: fwdErr.message, fId: d.fId });
      return { ok: false, error: `อ่านรายการไม่สำเร็จ: ${fwdErr.message}` };
    }
    if (!fwd) return { ok: false, error: "ไม่พบรายการฝากนำเข้า" };

    // 🔒 COD LOCK (owner 2026-07-21) — ขนส่งเอกชน = ปลายทางเสมอ · ปลายทาง = ค่าส่งไทย 0.
    // REFUSE loudly instead of silently correcting: the admin picked ต้นทาง on purpose,
    // so tell them why it can't be (the ตัวเลือก in the UI is disabled for the same reason).
    const locked = enforceCodDomesticZero({
      fShipBy: fwd.fshipby,
      payMethod: d.paymethod,
      transportPrice: fwd.ftransportprice,
    });
    if (locked.payMethod !== d.paymethod) {
      return {
        ok: false,
        error: "ขนส่งเอกชนต้องเก็บเงินปลายทาง (COD) เท่านั้น — ถ้าจะเก็บต้นทาง ให้เปลี่ยนเป็นขนส่งของ Pacred (รับเองโกดัง / เหมาๆ / ด่วน) ก่อน",
      };
    }
    if ((fwd.paymethod ?? "").trim() === d.paymethod && Number(fwd.ftransportprice ?? 0) === locked.transportPrice) {
      return { ok: false, error: "ไม่มีการเปลี่ยนแปลง (วิธีเก็บเงินเดิม)" };
    }

    const { error: updErr } = await admin
      .from("tb_forwarder")
      .update({
        paymethod: locked.payMethod,
        // ปลายทาง = ลูกค้าจ่ายขนส่งที่ปลายทาง → เราไม่เก็บค่าส่งไทยในบิล (owner 2026-07-21)
        ftransportprice: locked.transportPrice,
        adminidupdate: legacyAdminId,
      })
      .eq("id", d.fId);
    if (updErr) {
      console.error(`[adminUpdateForwarderPayMethod update] failed`, { code: updErr.code, message: updErr.message, fId: d.fId });
      return { ok: false, error: `บันทึกวิธีเก็บเงินไม่สำเร็จ: ${updErr.message}` };
    }

    // propagate วิธีเก็บเงิน to unbilled box-split siblings (owner/ภูม 2026-07-21 · one shipment).
    await propagateShipmentEdit(
      admin,
      { id: d.fId, ftrackingchn: fwd.ftrackingchn, userid: fwd.userid },
      { money: { paymethod: locked.payMethod, ftransportprice: locked.transportPrice } },
      legacyAdminId,
    );

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
      .select("id, userid, fstatus, fcredit, ftotalprice, ftransportprice, paymethod, fpriceupdate, fshippingservice, pricecrate, ftransportpricechnthb, priceother, fdiscount")
      .eq("id", d.fId)
      .maybeSingle<{
        id: number; userid: string; fstatus: string | null; fcredit: string | null;
        ftotalprice: number | string | null; ftransportprice: number | string | null;
        paymethod: string | null;
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

    // MONEY — refuse granting credit (flip to fstatus '6'/fcredit='1') on a row
    // that already has a payment (legacy forwarder.php:1290 "ePayRe" · the guard
    // fires for fStatus 5 AND 'c'/credit). Prevents re-billing an already-paid
    // import onto the customer's credit line. Fail-CLOSED.
    const noRebill = await assertNotRefunded(admin, d.fId);
    if (!noRebill.ok) return { ok: false, error: noRebill.error };

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
    // COD (paymethod='2') — the courier collects the Thai domestic leg at the door,
    // so it is NOT part of the credit AR. This MIRRORS forwarderPriceFull (the settle
    // side): without it the grant adds the leg to tb_credit but markBillingRunPaid
    // settles calcForwarderOutstanding (COD-excluded) → the credit line under-frees
    // by the leg on a COD credit order. (grant == settle for COD · #6 2026-07-19)
    const domesticLeg = Number(fwd.paymethod) === 2 ? 0 : numCol(fwd.ftransportprice);
    let pricePay =
      numCol(fwd.ftotalprice) + domesticLeg + numCol(fwd.fpriceupdate) +
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
    // 💰 Atomic guard (2026-06-14 forwarder-fidelity audit): the L904/L906
    // prior-SELECT is read-at-load, so two concurrent credit-marks (or a
    // double-click / stale resubmit) both pass it, both flip, and both add the
    // order's pricePay to tb_credit → the SAME order double-credited + the AR
    // mis-stated. Fold the creditable-status guard into the UPDATE WHERE: the
    // flip moves fstatus 1..5 → "6" atomically with fcredit → "1", so a 0-row
    // result means another op already credited / advanced this order. Abort
    // BEFORE the tb_credit debt write. (fstatus is null-safe text "1".."6";
    // fcredit itself is too messy — ""/"0"/null/"1" — to fold on directly.)
    const { data: flipped, error: updErr } = await admin
      .from("tb_forwarder")
      .update({
        paydeposit: "2", fcredit: "1", fcreditdate: d.creditDueDate, fstatus: "6",
        fdateadminstatus: nowIso, fdatestatus5: nowIso, adminid: legacyAdminId, adminidupdate: legacyAdminId,
      })
      .eq("id", d.fId)
      .in("fstatus", ["1", "2", "3", "4", "5"])
      .select("id")
      .maybeSingle<{ id: number }>();
    if (updErr) {
      console.error(`[adminMarkForwarderCredit forwarder flip] failed`, { code: updErr.code, message: updErr.message, fId: d.fId });
      return { ok: false, error: `บันทึกเครดิตไม่สำเร็จ: ${updErr.message}` };
    }
    if (!flipped) {
      return { ok: false, error: "รายการนี้ถูกให้เครดิตหรือเปลี่ยนสถานะไปแล้ว (มีผู้ทำรายการพร้อมกันหรือกดซ้ำ) — โปรดรีเฟรชหน้าแล้วลองใหม่" };
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

// ── เลขตู้ (fcabinetnumber) inline edit — owner 2026-06-11 "เพิ่มปุ่มแก้ไข · แก้เลขตู้ตรงนั้นได้เลย".
//    Edits ONLY fcabinetnumber (NO status side-effect — unlike the status form's เลขตู้ field
//    which auto-advances to "กำลังส่งมาไทย" when a cabinet is first set). For fixing typos /
//    re-keying the container number from the read-detail info grid. Empty = clear. ──
const cabinetSchema = z.object({
  fId:     z.number().int().positive(),
  cabinet: z.string().trim().max(300),
});
export type AdminUpdateForwarderCabinetInput = z.infer<typeof cabinetSchema>;

export async function adminUpdateForwarderCabinet(
  rawInput: AdminUpdateForwarderCabinetInput,
): Promise<AdminActionResult> {
  const parsed = cabinetSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const d = parsed.data;

  return withAdmin(["ops", "accounting", "super", "warehouse"], async ({ adminId, roles }) => {
    const admin = createAdminClient();
    const legacyAdminId = (await resolveLegacyAdminId()).slice(0, 10);

    const { data: fwd, error: fwdErr } = await admin
      .from("tb_forwarder")
      .select("id, fcabinetnumber, fcabinet_locked")
      .eq("id", d.fId)
      .maybeSingle<{ id: number; fcabinetnumber: string | null; fcabinet_locked: boolean | null }>();
    if (fwdErr) {
      console.error(`[adminUpdateForwarderCabinet read] failed`, { code: fwdErr.code, message: fwdErr.message, fId: d.fId });
      return { ok: false, error: `อ่านรายการไม่สำเร็จ: ${fwdErr.message}` };
    }
    if (!fwd) return { ok: false, error: "ไม่พบรายการฝากนำเข้า" };
    if ((fwd.fcabinetnumber ?? "").trim() === d.cabinet) {
      return { ok: false, error: "ไม่มีการเปลี่ยนแปลง (เลขตู้เดิม)" };
    }

    // 🔒 cabinet tier guard (owner 2026-07-20) — refuse sack (CBX…)/MOMO-placeholder
    // ids for everyone; the mig-0150 lock is overridable by god roles only.
    // (TTW ids like "SEA0625-8211YW" = เลขตู้จริง per owner — the guard allows them.)
    const guard = cabinetWriteGuard({
      next: d.cabinet,
      current: fwd.fcabinetnumber,
      locked: fwd.fcabinet_locked,
      isGod: isGodRole(roles),
    });
    if (!guard.ok) return { ok: false, error: guard.reason };

    const { error: updErr } = await admin
      .from("tb_forwarder")
      .update({ fcabinetnumber: d.cabinet, adminidupdate: legacyAdminId })
      .eq("id", d.fId);
    if (updErr) {
      console.error(`[adminUpdateForwarderCabinet update] failed`, { code: updErr.code, message: updErr.message, fId: d.fId });
      return { ok: false, error: `บันทึกเลขตู้ไม่สำเร็จ: ${updErr.message}` };
    }

    await logAdminAction(adminId, "tb_forwarder.update_cabinet", "tb_forwarder", String(d.fId), {
      before: fwd.fcabinetnumber, after: d.cabinet,
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

// ── adminSplitForwarderBoxes — แตกกล่อง MOMO เป็นแถวแยก (money-neutral) ───────────
//
// owner/ภูม 2026-07-03: a MOMO cargo tracking split into N boxes of different sizes is
// currently ONE aggregate tb_forwarder row (famount=N · per-box dims in momo_box_detail).
// The customer can SEE the total is right but staff CAN'T edit a single box (e.g. when
// MOMO sent a wrong dimension). This action turns the aggregate into N SIBLING rows — one
// editable row per box — reusing the money-neutral splitAggregatedMomoBoxRows with
// allowPriced:true (the total SELL bill is PRESERVED to the satang · the split is only
// the human-triggered button/backfill, never the automatic cron). Hard guards still hold:
// a BILLED (fstatus 5/6/7) or ฝากสั่งซื้อ-linked row is refused.
const splitBoxesSchema = z.object({ fId: z.number().int().positive() });
export type AdminSplitForwarderBoxesInput = z.infer<typeof splitBoxesSchema>;

/** Human-readable reason for a refused split (maps SplitSkipReason → Thai). */
const SPLIT_SKIP_MSG: Record<string, string> = {
  already_billed: "รายการนี้อยู่ในขั้นตอนชำระเงิน/จัดส่งแล้ว — แตกกล่องไม่ได้ (กันบิลเพี้ยน)",
  has_reforder: "รายการนี้เชื่อมกับฝากสั่งซื้อ — แตกกล่องไม่ได้",
  already_priced: "รายการนี้คิดราคาแล้ว (ต้องกดยืนยันแตกกล่องผ่านปุ่มนี้เท่านั้น)",
  not_multi_box: "รายการนี้มีกล่องเดียว (ไม่มีอะไรให้แตก) — MOMO ยังไม่ส่งข้อมูลกล่องแยกมา",
  qty_mismatch: "จำนวนชิ้นรวมของกล่องแยกไม่ตรงกับรายการรวม — แตกไม่ได้ (กันข้อมูลเพี้ยน)",
  weight_mismatch: "น้ำหนักรวมของกล่องแยกไม่ตรงกับรายการรวม — แตกไม่ได้",
  cbm_mismatch: "คิวรวมของกล่องแยกไม่ตรงกับรายการรวม — แตกไม่ได้",
  not_bare_base: "รายการนี้ถูกแตกเป็นกล่องแยกไปแล้ว",
  already_split: "รายการนี้ถูกแตกเป็นกล่องแยกไปแล้ว",
  no_aggregate_row: "ไม่พบรายการรวมของแทรคนี้",
};

export async function adminSplitForwarderBoxes(
  rawInput: AdminSplitForwarderBoxesInput,
): Promise<AdminActionResult<{ siblingsCreated: number }>> {
  const parsed = splitBoxesSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const d = parsed.data;

  return withAdmin<{ siblingsCreated: number }>(["ops", "accounting", "super", "warehouse"], async ({ adminId }) => {
    const admin = createAdminClient();

    // Resolve the base tracking for this row (the writer keys off the base + re-verifies).
    const { data: fwd, error: fwdErr } = await admin
      .from("tb_forwarder")
      .select("id, ftrackingchn")
      .eq("id", d.fId)
      .maybeSingle<{ id: number; ftrackingchn: string | null }>();
    if (fwdErr) {
      console.error(`[adminSplitForwarderBoxes read] failed`, { code: fwdErr.code, message: fwdErr.message, fId: d.fId });
      return { ok: false, error: `อ่านรายการไม่สำเร็จ: ${fwdErr.message}` };
    }
    if (!fwd) return { ok: false, error: "ไม่พบรายการฝากนำเข้า" };
    const base = baseOfTracking((fwd.ftrackingchn ?? "").trim());
    if (!base) return { ok: false, error: "รายการนี้ไม่มีเลขแทรคกิ้ง" };

    // money-neutral split · allowPriced:true (this is the human-triggered path).
    const result = await splitAggregatedMomoBoxRows(admin, [base], undefined, { allowPriced: true });

    if (result.split >= 1) {
      await logAdminAction(adminId, "tb_forwarder.split_boxes", "tb_forwarder", String(d.fId), {
        base, siblingsCreated: result.siblingsCreated,
      });
      revalidatePath(`/admin/forwarders/${d.fId}`);
      revalidatePath("/admin/forwarders");
      return { ok: true, data: { siblingsCreated: result.siblingsCreated } };
    }

    // No split → surface the most relevant skip reason (or a generic error).
    const skipReason = (Object.entries(result.skipped).find(([, n]) => n > 0)?.[0]) ?? null;
    if (skipReason) return { ok: false, error: SPLIT_SKIP_MSG[skipReason] ?? `แตกกล่องไม่สำเร็จ (${skipReason})` };
    if (result.errors.length > 0) {
      console.error(`[adminSplitForwarderBoxes] writer errors`, result.errors);
      return { ok: false, error: `แตกกล่องไม่สำเร็จ: ${result.errors[0]?.message ?? "unknown"}` };
    }
    return { ok: false, error: "ไม่พบข้อมูลกล่องแยกสำหรับแทรคนี้ (MOMO ยังไม่ส่งข้อมูลกล่องมา)" };
  });
}
