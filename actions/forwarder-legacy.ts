"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertNotImpersonating } from "@/lib/auth/impersonation";
import { getCurrentUserWithProfile } from "@/lib/auth/get-user";
import { isFreeShippingZip } from "@/lib/bkk-zip";
import { derivePayMethod, isPayAtOriginCarrier } from "@/lib/forwarder/pay-method";
import { ADDRESSES } from "@/components/seo/site";
import { modeFromPref, prefFromMode, modeRequiresBillingSnapshot } from "@/lib/tax/tax-doc-mode";

/**
 * Legacy `tb_forwarder` writers — D1 / ADR-0017 faithful 1:1 ports of
 * the three POST branches in `member/forwarder.php` + `forwarder-table.php`:
 *
 *   - `save`           (forwarder.php L9-160 + forwarder-table.php L37-155)
 *                      → INSERT tb_forwarder (the "create new forwarder" modal)
 *   - `update_fShipBy` (forwarder.php L1586-1619)
 *                      → UPDATE tb_forwarder SET fShipBy=…, paymethod=…
 *   - `update_fAddress`(forwarder.php L1620-1658)
 *                      → UPDATE tb_forwarder SET fAddress*=… (copied from
 *                        the selected tb_address row)
 *
 * Why a NEW file (not `actions/forwarder.ts`):
 *   `actions/forwarder.ts:createForwarder` writes to the modern Pacred
 *   `forwarders` table (rebuilt-era schema — `forwarder_items` items,
 *   computed totals via `calcPrice`, modern `profiles.id` ownership).
 *   The D1 faithful port writes to the legacy `tb_forwarder` table
 *   (the schema customers' historical data lives in) with the much
 *   smaller field set the legacy POST handler accepts. Same domain,
 *   different schema → separate action to keep each lane unambiguous.
 *
 * Wallet/cost calc are NOT computed here — the legacy `save` POST
 * inserts the row at zero price (fTotalPrice=0, fTransportPrice=0, …);
 * the admin sets prices later through the back-office. This matches
 * legacy behaviour bit-for-bit (forwarder.php L89-91: only `fAmount`,
 * `fDate`, `fShipBy`, the address copy, `payMethod`, `crate`,
 * `fShippingService` flow into the INSERT — every price field is left
 * to the schema default of 0).
 */

type ActionResult<T = void> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

// ────────────────────────────────────────────────────────────
// CREATE — `save` POST (forwarder.php L9-160 / forwarder-table.php L37-155)
// ────────────────────────────────────────────────────────────

// The legacy POST field set, faithfully.
//   - fTrackingCHN : เลข Tracking          (REQUIRED · 1..50)
//   - fDetail      : รายละเอียด           (REQUIRED · text)
//   - fAmount      : จำนวนกล่อง           (REQUIRED · int ≥ 0; "<0" rejected)
//   - addressID    : addressID OR "PCS"   (REQUIRED — drives the address copy)
//   - hTransportType: "1"=รถ EK | "2"=เรือ (REQUIRED, forwarder.php L54)
//                     NB. forwarder-table.php uses `fTransportType` instead
//                     of `hTransportType` — accepted as an alias.
//   - hShipBy      : carrier code         (optional; forced when addressID=PCS
//                                          → "PCS"; when pro='f' → "PCSF")
//   - pro          : 'f' (PCSF promo) or other (optional)
//   - crate        : "1" (ตี) | "2" (ไม่ตี)  (default "2", legacy L1699)
const createForwarderLegacySchema = z.object({
  fTrackingCHN:   z.string().trim().min(1).max(50),
  fDetail:        z.string().trim().min(1).max(500),
  fAmount:        z.coerce.number().int().min(0).max(10000),
  addressID:      z.string().trim().min(1).max(50),  // numeric ID or "PCS"
  hTransportType: z.string().trim().min(1).max(2),   // "1" | "2"
  hShipBy:        z.string().trim().max(10).optional().or(z.literal("").transform(() => undefined)),
  pro:            z.string().trim().max(10).optional().or(z.literal("").transform(() => undefined)),
  crate:          z.string().trim().max(2).optional().or(z.literal("").transform(() => undefined)),
  // P1 (tax-doc at ฝากนำเข้า order entry · 2026-06-09) — the customer's doc-mode
  // pick from <CartTaxDocPref> (same field names as the cart). Persisted to
  // tb_forwarder's 0127 tax_doc_* columns. ALL optional: the /service-import
  // list-view quick-add modal omits the picker → defaults to 'receipt'
  // (ไม่รับเอกสาร), i.e. today's unchanged behaviour. This is a SELECTION only —
  // issuance is downstream + still gated (no money move at create).
  taxDocPref:        z.string().trim().max(20).optional(),
  taxDocTaxId:       z.string().trim().max(20).optional(),
  taxDocBillingName: z.string().trim().max(300).optional(),
  taxDocAddress:     z.string().trim().max(500).optional(),
});
export type CreateForwarderLegacyInput = z.infer<typeof createForwarderLegacySchema>;

export async function createLegacyForwarder(
  raw: Record<string, FormDataEntryValue | undefined>,
): Promise<ActionResult<{ id: number }>> {
  // G-4 — impersonation is read-only; refuse customer-facing mutations.
  const impErr = await assertNotImpersonating();
  if (impErr) return impErr;

  // forwarder-table.php uses `fTransportType` while forwarder.php uses
  // `hTransportType`. Accept either to stay faithful to BOTH legacy forms.
  if (raw.fTransportType && !raw.hTransportType) {
    raw.hTransportType = raw.fTransportType;
  }

  const parsed = createForwarderLegacySchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  // P1 — tax-doc mode for THIS import order (mirror actions/cart.ts exactly).
  // Normalise pref → mode → pref; ใบกำกับ + ใบขน need the buyer snapshot,
  // ไม่รับเอกสาร needs nothing. Stored on tb_forwarder.tax_doc_* (mig 0127).
  const taxDocMode = modeFromPref(d.taxDocPref);
  const taxDocPref = prefFromMode(taxDocMode);            // 'tax_invoice' | 'customs' | 'receipt'
  const taxDocTaxId = (d.taxDocTaxId ?? "").trim();
  const taxDocBillingName = (d.taxDocBillingName ?? "").trim();
  const taxDocAddress = (d.taxDocAddress ?? "").trim();
  const needsBilling = modeRequiresBillingSnapshot(taxDocMode);
  if (needsBilling) {
    if (!/^\d{13}$/.test(taxDocTaxId)) return { ok: false, error: "tax_id_invalid — เลขผู้เสียภาษีต้องมี 13 หลัก" };
    if (taxDocBillingName === "") return { ok: false, error: "tax_billing_name_required — กรอกชื่อบริษัท/ผู้เสียภาษี" };
    if (taxDocAddress === "") return { ok: false, error: "tax_address_required — กรอกที่อยู่สำหรับออกเอกสาร" };
  }

  const session = await getCurrentUserWithProfile();
  if (!session?.profile) return { ok: false, error: "not_signed_in" };
  const userID = session.profile.member_code ?? "";
  if (!userID) return { ok: false, error: "no_member_code" };

  const admin = createAdminClient();

  // forwarder.php L18-20 — duplicate tracking guard
  // SELECT fTrackingCHN FROM tb_forwarder WHERE fTrackingCHN=… AND userID=…
  const { data: dupRows, error: dupErr } = await admin
    .from("tb_forwarder")
    .select("id")
    .eq("ftrackingchn", d.fTrackingCHN)
    .eq("userid", userID)
    .limit(1);
  if (dupErr) {
    console.error(`[forwarder-legacy createLegacyForwarder dup guard] failed`, { code: dupErr.code, message: dupErr.message });
    return { ok: false, error: dupErr.message };
  }
  if (dupRows && dupRows.length > 0) {
    // Legacy `sweetalert='eRe'` (already exists, see L157).
    return {
      ok: false,
      error: "duplicate_tracking — เลข Tracking นี้ถูกใช้ในรายการเดิมแล้ว",
    };
  }

  // forwarder.php L24-53 — fShipBy + pro + payMethod resolution
  //
  // 2026-06-09 BUG FIX (pricing-flagged): order of these 2 ifs swapped.
  // Old order set PCS then overwrote with PCSF when pro="f", so a customer
  // who picked self-pickup PCS AND toggled Flash promo would have fShipBy
  // = "PCSF" but addressID still = "PCS" → the else-branch SELECT below
  // tried `.eq("addressid", "PCS")` and DB threw
  // `invalid input syntax for type bigint: "PCS"`.
  // Self-pickup wins over Flash promo (you can't Flash-ship something the
  // customer is picking up at our warehouse) — matches actions/cart.ts
  // L332-337 belt-and-braces.
  let fShipBy: string | null = d.hShipBy ?? null;
  if (d.pro === "f") {
    fShipBy = "PCSF";
  }
  if (d.addressID === "PCS") {
    fShipBy = "PCS"; // PCS self-pickup wins over Flash promo
  }
  // forwarder.php L49-53 — paymethod derived from fShipBy (setPayMethodShip).
  // Shared with the shop-cart path via lib/forwarder/pay-method.ts.
  const paymethod = derivePayMethod(fShipBy);

  // forwarder.php L55-87 — address copy (PCS warehouse fallback ELSE tb_address lookup)
  let addressName = "", addressLastname = "", addressTel = "", addressTel2 = "";
  let addressNo = "", addressSubDistrict = "", addressDistrict = "";
  let addressProvince = "", addressZIPCode = "", addressNote = "";
  if (fShipBy === "PCS") {
    // L56-66 — รับเองที่โกดัง Pacred (Samut Sakhon). Legacy PHP hard-coded the
    // old Bangkok PCS depot; under D1 self-pickup uses Pacred's TH receiving
    // warehouse (= ADDRESSES.warehouseTh, the same depot the shop path writes
    // in actions/cart.ts). faddresstel is varchar(10) → digits-only Pacred
    // company line "02-421-3325" → "0224213325" (10 chars · no dashes).
    addressName = "รับที่โกดัง Pacred";
    addressTel = "0224213325";
    addressNo = ADDRESSES.warehouseTh.line;
    addressSubDistrict = ADDRESSES.warehouseTh.subDistrict;
    addressDistrict = ADDRESSES.warehouseTh.district;
    addressProvince = ADDRESSES.warehouseTh.province;
    addressZIPCode = ADDRESSES.warehouseTh.postcode;
  } else {
    // L69-87 — copy from tb_address (userID-scoped + addressStatus='1')
    const { data: addr, error: addrErr } = await admin
      .from("tb_address")
      .select("addressname, addresslastname, addresstel, addresstel2, addressno, addresssubdistrict, addressdistrict, addressprovince, addresszipcode, addressnote")
      .eq("addressid", d.addressID)
      .eq("addressstatus", "1")
      .eq("userid", userID)
      .maybeSingle<{
        addressname: string | null;
        addresslastname: string | null;
        addresstel: string | null;
        addresstel2: string | null;
        addressno: string | null;
        addresssubdistrict: string | null;
        addressdistrict: string | null;
        addressprovince: string | null;
        addresszipcode: string | null;
        addressnote: string | null;
      }>();
    if (addrErr) {
      console.error(`[forwarder-legacy createLegacyForwarder address lookup] failed`, { code: addrErr.code, message: addrErr.message });
      return { ok: false, error: addrErr.message };
    }
    if (!addr) {
      // Legacy `sweetalert='eSQL'` (L86) — address not found / not owned.
      return { ok: false, error: "address_not_found — ไม่พบที่อยู่ในการจัดส่ง" };
    }
    addressName        = addr.addressname        ?? "";
    addressLastname    = addr.addresslastname    ?? "";
    addressTel         = addr.addresstel         ?? "";
    addressTel2        = addr.addresstel2        ?? "";
    addressNo          = addr.addressno          ?? "";
    addressSubDistrict = addr.addresssubdistrict ?? "";
    addressDistrict    = addr.addressdistrict    ?? "";
    addressProvince    = addr.addressprovince    ?? "";
    addressZIPCode     = addr.addresszipcode     ?? "";
    addressNote        = addr.addressnote        ?? "";
  }

  // forwarder.php L89-91 — the INSERT. Every column the legacy doesn't
  // mention defaults from the schema (numbers → 0, strings → ''). The
  // 0081 migration mirrors the legacy MySQL DEFAULTs so this is safe.
  // NOT-NULL columns the schema requires but the legacy MySQL silently
  // defaults to '': we set them to '' explicitly so Postgres accepts.
  const now = new Date().toISOString();
  const insertRow = {
    fdate:               now,
    fstatus:             "1",
    ftransporttype:      d.hTransportType,
    ftrackingchn:        d.fTrackingCHN,
    fdetail:             d.fDetail,
    famount:             d.fAmount,
    userid:              userID,
    fshipby:             fShipBy ?? "",
    faddressname:        addressName,
    faddresslastname:    addressLastname,
    faddressno:          addressNo,
    faddresssubdistrict: addressSubDistrict,
    faddressdistrict:    addressDistrict,
    faddressprovince:    addressProvince,
    faddresszipcode:     addressZIPCode,
    faddressnote:        addressNote,
    faddresstel:         addressTel,
    faddresstel2:        addressTel2,
    ffreeshipping:       "1",
    paymethod,
    crate:               d.crate ?? "2",
    fshippingservice:    0,
    // P1 — tax-doc selection (mig 0127 columns · same shape as cart.ts).
    tax_doc_pref:        taxDocPref,
    tax_doc_tax_id:      needsBilling ? taxDocTaxId : null,
    tax_doc_address:     needsBilling ? `${taxDocBillingName} · ${taxDocAddress}` : null,
    // NOT NULL columns the legacy leaves to MySQL defaults (Postgres
    // strict mode requires explicit values — match the 0081 defaults).
    fstatuscaradminon:   "",
    fstatuscaroff:       "0",
    fstatuscaradminoff:  "",
    printstatus4:        "0",
    fwarehousechina:     "1",
    // 2026-06-05 (ภูม flag — "spawn ขึ้นโกดัง แสง อัตโนมัติ"): the customer
    // self-service import-create flow doesn't know which China partner
    // warehouse the goods will land at. Leave blank — admin sets it later
    // when the partner-API / manual confirmation arrives. Mirrors
    // actions/admin/forwarders-new.ts:397 + service-orders-spawn.ts:243.
    fwarehousename:      "",
    fcabinetnumber:      "",
    ftrackingth:         "-",
    fcover:              "",
    fproductstype:       "1",
    fweight:             0,
    fwidth:              0,
    flength:             0,
    fheight:             0,
    fvolume:             0,
    customratekg:        0,
    customratecbm:       0,
    frefprice:           "1",
    frefrate:            0,
    fcostrefrate:        0,
    ftransportprice:     0,
    fpriceupdate:        0,
    fdiscount:           0,
    ftotalprice:         0,
    fcosttotalprice:     0,
    fcosttotalpricesheet:0,
    fprofittransportchn: 0,
    fprofitpriceupdate:  0,
    fprofittotal:        0,
    faddresslatitude:    0,
    faddresslongitude:   0,
    adminid:             "",
    adminidcreator:      "",
    adminidkey:          "",
    adminidupdate:       "",
    session:             "",
    reforder:            "",
    fcredit:             "0",
    fusercompany:        "0",
    fsendsms1day:        "0",
    fsendsms3day:        "0",
    fsendsms3eday:       "0",
    pricecrate:          0,
    fqc:                 "0",
    fqcprice:            0,
    ftransportpricechnthb:0,
    pricemore:           "0",
    priceother:          0,
    linkapiorder:        "0",
    subuserid:           "",
    fnoteuser:           "0",
    fnoteuserread:       "0",
    fphotoend:           "",
  };

  const { data: inserted, error } = await admin
    .from("tb_forwarder")
    .insert(insertRow)
    .select("id")
    .single<{ id: number }>();

  if (error || !inserted) {
    return { ok: false, error: error?.message ?? "insert_failed" };
  }

  revalidatePath("/service-import");
  revalidatePath("/service-import/table");
  revalidatePath("/service-import/pending");

  return { ok: true, data: { id: inserted.id } };
}

// ────────────────────────────────────────────────────────────
// UPDATE fShipBy — `update_fShipBy` POST (forwarder.php L1586-1619)
// ────────────────────────────────────────────────────────────

const updateShipBySchema = z.object({
  ID:      z.coerce.number().int().positive(),
  fShipBy: z.string().trim().min(1).max(10),
});
export type UpdateForwarderShipByInput = z.infer<typeof updateShipBySchema>;

export async function updateLegacyForwarderShipBy(
  raw: Record<string, FormDataEntryValue | undefined>,
): Promise<ActionResult> {
  const impErr = await assertNotImpersonating();
  if (impErr) return impErr;

  const parsed = updateShipBySchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const { ID, fShipBy } = parsed.data;

  // forwarder.php L1589 — guard against 'F' (free-shipping promo carrier)
  if (fShipBy === "F") {
    return { ok: false, error: "ship_by_invalid" };
  }

  const session = await getCurrentUserWithProfile();
  if (!session?.profile) return { ok: false, error: "not_signed_in" };
  const userID = session.profile.member_code ?? "";
  if (!userID) return { ok: false, error: "no_member_code" };

  // forwarder.php L1590-1592 — only stamp payMethod when the carrier is
  // pay-at-origin; a destination carrier leaves the stored value alone
  // (preserve the legacy update-only-on-origin asymmetry). Origin set
  // shared with the shop-cart path via lib/forwarder/pay-method.ts.
  const paymethod = isPayAtOriginCarrier(fShipBy) ? "1" : undefined;

  const admin = createAdminClient();

  // forwarder.php L1593 — base UPDATE with ownership.
  const baseUpdate: Record<string, string> = { fshipby: fShipBy };
  if (paymethod) baseUpdate.paymethod = paymethod;

  const { error: updErr } = await admin
    .from("tb_forwarder")
    .update(baseUpdate)
    .eq("id", ID)
    .eq("userid", userID);
  if (updErr) return { ok: false, error: updErr.message };

  // forwarder.php L1599-1614 — self-pickup warehouse override (in-store pickup
  // rewrites the address fields to Pacred's TH receiving warehouse — สมุทรสาคร,
  // ADDRESSES.warehouseTh, same depot the shop path uses). Legacy wrote the old
  // Bangkok PCS depot. faddresstel varchar(10) → digits-only "0224213325".
  if (fShipBy === "PCS") {
    const { error: addrErr } = await admin
      .from("tb_forwarder")
      .update({
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
      })
      .eq("id", ID)
      .eq("userid", userID);
    if (addrErr) return { ok: false, error: addrErr.message };
  }

  revalidatePath(`/service-import/${ID}`);
  revalidatePath("/service-import");
  return { ok: true };
}

// ────────────────────────────────────────────────────────────
// UPDATE fAddress — `update_fAddress` POST (forwarder.php L1620-1658)
// ────────────────────────────────────────────────────────────

const updateAddressSchema = z.object({
  ID:        z.coerce.number().int().positive(),
  addressID: z.string().trim().min(1).max(50),
});
export type UpdateForwarderAddressInput = z.infer<typeof updateAddressSchema>;

export async function updateLegacyForwarderAddress(
  raw: Record<string, FormDataEntryValue | undefined>,
): Promise<ActionResult> {
  const impErr = await assertNotImpersonating();
  if (impErr) return impErr;

  const parsed = updateAddressSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const { ID, addressID } = parsed.data;

  const session = await getCurrentUserWithProfile();
  if (!session?.profile) return { ok: false, error: "not_signed_in" };
  const userID = session.profile.member_code ?? "";
  if (!userID) return { ok: false, error: "no_member_code" };

  const admin = createAdminClient();

  // forwarder.php L1623-1627 — read current fShipBy (PCS pickup blocks the change)
  const { data: cur, error: curErr } = await admin
    .from("tb_forwarder")
    .select("fshipby")
    .eq("id", ID)
    .eq("userid", userID)
    .maybeSingle<{ fshipby: string | null }>();
  if (curErr) {
    console.error(`[forwarder-legacy updateLegacyForwarderAddress current lookup] failed`, { code: curErr.code, message: curErr.message });
    return { ok: false, error: curErr.message };
  }
  if (!cur) return { ok: false, error: "forwarder_not_found" };

  if (cur.fshipby === "PCS") {
    // legacy `sweetalert='eAddress'` (L1654)
    return { ok: false, error: "address_locked_pcs — รับเองที่โกดัง ไม่สามารถเปลี่ยนที่อยู่ได้" };
  }

  // forwarder.php L1629-1648 — SELECT tb_address + UPDATE tb_forwarder
  // address columns from the picked address row.
  const { data: addr, error: addrErr } = await admin
    .from("tb_address")
    .select("addressname, addresslastname, addresstel, addresstel2, addressno, addresssubdistrict, addressdistrict, addressprovince, addresszipcode, addressnote")
    .eq("addressid", addressID)
    .eq("addressstatus", "1")
    .eq("userid", userID)
    .maybeSingle<{
      addressname: string | null;
      addresslastname: string | null;
      addresstel: string | null;
      addresstel2: string | null;
      addressno: string | null;
      addresssubdistrict: string | null;
      addressdistrict: string | null;
      addressprovince: string | null;
      addresszipcode: string | null;
      addressnote: string | null;
    }>();
  if (addrErr) {
    console.error(`[forwarder-legacy updateLegacyForwarderAddress address lookup] failed`, { code: addrErr.code, message: addrErr.message });
    return { ok: false, error: addrErr.message };
  }
  if (!addr) {
    // legacy `sweetalert='eSQL'` (L1650)
    return { ok: false, error: "address_not_found — ไม่พบที่อยู่ในการจัดส่ง" };
  }

  const { error: updErr } = await admin
    .from("tb_forwarder")
    .update({
      faddressname:        addr.addressname        ?? "",
      faddresslastname:    addr.addresslastname    ?? "",
      faddressno:          addr.addressno          ?? "",
      faddresssubdistrict: addr.addresssubdistrict ?? "",
      faddressdistrict:    addr.addressdistrict    ?? "",
      faddressprovince:    addr.addressprovince    ?? "",
      faddresszipcode:     addr.addresszipcode     ?? "",
      faddressnote:        addr.addressnote        ?? "",
      faddresstel:         addr.addresstel         ?? "",
      faddresstel2:        addr.addresstel2        ?? "",
    })
    .eq("id", ID)
    .eq("userid", userID);
  if (updErr) return { ok: false, error: updErr.message };

  revalidatePath(`/service-import/${ID}`);
  revalidatePath("/service-import");
  return { ok: true };
}

// ────────────────────────────────────────────────────────────
// READ ship-by options — `getShipBy.php` + `optionHShipByCart3`
//   (member/include/pages/forwarder/getShipBy.php
//    + member/include/function.php L884-930)
// ────────────────────────────────────────────────────────────
//
// The customer's carrier (#hShipBy) <select> on the "ฝากนำเข้า" add form is
// data-driven: the option list DEPENDS on whether the chosen Thai delivery
// address falls inside Pacred's free-shipping metro allowlist (BKK + 5 metro
// provinces — the same ZIP set `lib/bkk-zip.ts` ports, with the empty Pathum
// Thani array that getShipBy.php L9 uses).
//
// Legacy `optionHShipByCart3($conn, $addressID)`:
//   - SELECT addressZIPCode FROM tb_address WHERE addressID='$addressID'
//   - ZIP NOT in free-area  → the FULL out-of-area carrier list (23 couriers)
//   - ZIP IN free-area      → only 2 options: Flash (2) + J&T (24)
// Legacy `getShipBy.php` ALSO reads tb_users.{userShipBy, userPayMethod} to
// pre-select the customer's saved carrier (L25-32, L105-109). We return both
// so the UI can default-select them, exactly like the legacy inline
// `$('#hShipBy').val('<userShipBy>')`.
//
// NB on userID scoping: the legacy helper does NOT scope the tb_address read
// by userID — but getShipBy.php is invoked for the signed-in customer's own
// address picker, so we scope by userid (strictly safer; an address that
// isn't the caller's simply yields the "address not found" empty result the
// caller already handles). The PCS warehouse pickup ("PCS") has no courier
// select in the legacy UI — we return an empty list + a flag for that case.

/** A single carrier option for the #hShipBy <select>. */
export type LegacyShipByOption = { id: string; name: string };

export type GetShipByOptionsResult =
  | {
      ok: true;
      /** Carrier options for the <select> (empty when warehouse pickup). */
      options: LegacyShipByOption[];
      /** True when the destination ZIP is inside the free-shipping metro
       *  allowlist (legacy `proF != 2`) — drives the 2-option short list. */
      inFreeArea: boolean;
      /** True when addressID === "PCS" (รับเองหน้าโกดัง — no courier select). */
      warehousePickup: boolean;
      /** The customer's saved `tb_users.usershipby` (pre-select default). */
      userShipBy: string;
      /** The customer's saved `tb_users.userpaymethod`
       *  ('1'=เก็บต้นทาง '2'=เก็บปลายทาง). */
      userPayMethod: string;
    }
  | { ok: false; error: string };

// getShipBy.php L36-51 / optionHShipByCart3 L900-921 — the OUT-OF-AREA list
// (ZIP not in the free-shipping metro allowlist): the full courier roster.
// Faithful to legacy option order + value codes + Thai names.
const SHIP_BY_OUT_OF_AREA: readonly LegacyShipByOption[] = [
  { id: "2",  name: "Flash Express" },
  { id: "3",  name: "J.K. เอ็กซ์เพรส" },
  { id: "21", name: "นิ่มซี่เส็งขนส่ง 1988" },
  { id: "6",  name: "S & J ขนส่งด่วนสุพรรณบุรี" },
  { id: "7",  name: "SB สมใจขนส่ง" },
  { id: "9",  name: "เคพีเอ็น" },
  { id: "10", name: "เฟิร์ส เอ็กเพรส ขนส่ง" },
  { id: "12", name: "จันทร์สว่างขนส่ง" },
  { id: "13", name: "ธนามัย ขนส่งด่วน" },
  { id: "14", name: "บุญอนันต์ขนส่ง" },
  { id: "15", name: "พี.เจ. ด่วนอีสาน ขนส่ง" },
  { id: "16", name: "มะม่วงขนส่ง" },
  { id: "17", name: "วันชนะ แอนด์ วันณิสา ขนส่ง" },
  { id: "18", name: "สมพงษ์อุบลรัตน์ ขนส่ง" },
  { id: "19", name: "อาร์.ซี.อาร์ เพลส" },
  { id: "20", name: "ตองสอง ขนส่ง" },
  { id: "22", name: "ธนาไพศาล ขนส่ง" },
  { id: "23", name: "PL ขนส่งด่วน" },
  { id: "24", name: "J&T Express" },
  { id: "25", name: "มังกรทองขนส่ง 2019" },
  { id: "26", name: "PM ชลบุรี ขนส่งด่วน" },
];

// getShipBy.php / optionHShipByCart3 L922-926 — the IN-FREE-AREA short list:
// only Flash + J&T pick up free inside the metro allowlist.
const SHIP_BY_IN_FREE_AREA: readonly LegacyShipByOption[] = [
  { id: "2",  name: "Flash Express" },
  { id: "24", name: "J&T Express" },
];

export async function getShipByOptions(
  addressID: string,
): Promise<GetShipByOptionsResult> {
  const aid = (addressID ?? "").trim();
  if (!aid) return { ok: false, error: "missing_address_id" };

  const session = await getCurrentUserWithProfile();
  if (!session?.profile) return { ok: false, error: "not_signed_in" };
  const userID = session.profile.member_code ?? "";
  if (!userID) return { ok: false, error: "no_member_code" };

  const admin = createAdminClient();

  // getShipBy.php L23-33 — the saved carrier + pay-method to pre-select.
  // NOTE: `tb_users` was renamed to camelCase columns on prod (the 2026-05-27
  // batch-1 rename — `userID`/`userShipBy`/`userPayMethod`), UNLIKE `tb_address`
  // / `tb_forwarder` which stayed lowercase. Probed live 2026-05-31; querying
  // lowercase `usershipby` here would throw "column does not exist" at runtime.
  const { data: userRow, error: userErr } = await admin
    .from("tb_users")
    .select('"userShipBy", "userPayMethod"')
    .eq("userID", userID)
    .maybeSingle<{ userShipBy: string | null; userPayMethod: string | null }>();
  if (userErr) {
    console.error(`[forwarder-legacy getShipByOptions user lookup] failed`, {
      code: userErr.code,
      message: userErr.message,
    });
    return { ok: false, error: userErr.message };
  }
  const userShipBy = userRow?.userShipBy ?? "";
  const userPayMethod = userRow?.userPayMethod ?? "";

  // addressID === "PCS" — รับเองหน้าโกดัง (getShipBy.php L55-57): no courier
  // <select>; the form sends hShipBy="PCS". Return an empty option list.
  if (aid === "PCS") {
    return {
      ok: true,
      options: [],
      inFreeArea: false,
      warehousePickup: true,
      userShipBy,
      userPayMethod,
    };
  }

  // optionHShipByCart3 L893-899 — read the address's ZIP, decide the list.
  const { data: addr, error: addrErr } = await admin
    .from("tb_address")
    .select("addresszipcode")
    .eq("addressid", aid)
    .eq("userid", userID)
    .maybeSingle<{ addresszipcode: string | null }>();
  if (addrErr) {
    console.error(`[forwarder-legacy getShipByOptions address lookup] failed`, {
      code: addrErr.code,
      message: addrErr.message,
    });
    return { ok: false, error: addrErr.message };
  }
  if (!addr) {
    // Legacy returns NULL content (no <option>s) when the address row is
    // missing — surface an empty list so the caller shows "no carriers".
    return {
      ok: true,
      options: [],
      inFreeArea: false,
      warehousePickup: false,
      userShipBy,
      userPayMethod,
    };
  }

  const inFreeArea = isFreeShippingZip(addr.addresszipcode);
  const options = inFreeArea
    ? [...SHIP_BY_IN_FREE_AREA]
    : [...SHIP_BY_OUT_OF_AREA];

  return {
    ok: true,
    options,
    inFreeArea,
    warehousePickup: false,
    userShipBy,
    userPayMethod,
  };
}

// ────────────────────────────────────────────────────────────
// CHECK free-shipping area — `checkFreeArea.php`
//   (member/include/pages/forwarder/checkFreeArea.php L11-30)
// ────────────────────────────────────────────────────────────
//
// Legacy `checkFreeArea.php` runs when the customer ticks the "Pacred เหมา ๆ"
// free-delivery promo (fShipBy='PCSF'): it confirms the chosen address's ZIP
// is inside the metro allowlist and, if not, clears #hShipBy + Swal-errors
// "ที่อยู่ของคุณ ไม่ได้อยู่ในพื้นที่จัดส่งฟรี!!!".
//
//   SELECT addressZIPCode FROM tb_address
//    WHERE userID='$_SESSION[userID]' AND addressID='$ID'
//      AND addressZIPCode IN ('<free-list>')
//   num_rows > 0 → "ผ่าน"   else → "ไม่ผ่าน"
//
// We reproduce the SAME decision via the canonical `lib/bkk-zip.ts` allowlist
// (which IS the ported free-list) after fetching the address's ZIP under the
// caller's ownership — matching the legacy userID-scoped SELECT exactly.

export type CheckFreeAreaResult =
  | { ok: true; inFreeArea: boolean; zip: string }
  | { ok: false; error: string };

export async function checkFreeArea(
  addressID: string,
): Promise<CheckFreeAreaResult> {
  const aid = (addressID ?? "").trim();
  if (!aid) return { ok: false, error: "missing_address_id" };

  // The PCS warehouse pickup is never a "free delivery area" question.
  if (aid === "PCS") return { ok: true, inFreeArea: false, zip: "" };

  const session = await getCurrentUserWithProfile();
  if (!session?.profile) return { ok: false, error: "not_signed_in" };
  const userID = session.profile.member_code ?? "";
  if (!userID) return { ok: false, error: "no_member_code" };

  const admin = createAdminClient();

  // checkFreeArea.php L13 — userID-scoped address read.
  const { data: addr, error: addrErr } = await admin
    .from("tb_address")
    .select("addresszipcode")
    .eq("addressid", aid)
    .eq("userid", userID)
    .maybeSingle<{ addresszipcode: string | null }>();
  if (addrErr) {
    console.error(`[forwarder-legacy checkFreeArea address lookup] failed`, {
      code: addrErr.code,
      message: addrErr.message,
    });
    return { ok: false, error: addrErr.message };
  }
  if (!addr) {
    // No matching address row → legacy "ไม่ผ่าน" (num_rows == 0).
    return { ok: true, inFreeArea: false, zip: "" };
  }

  const zip = (addr.addresszipcode ?? "").trim();
  return { ok: true, inFreeArea: isFreeShippingZip(zip), zip };
}
