"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertNotImpersonating } from "@/lib/auth/impersonation";
import { getCurrentUserWithProfile } from "@/lib/auth/get-user";

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
  let fShipBy: string | null = d.hShipBy ?? null;
  if (d.addressID === "PCS") {
    fShipBy = "PCS";
  }
  if (d.pro === "f") {
    fShipBy = "PCSF";
  }
  // forwarder.php L49-53 — paymethod derived from fShipBy
  const inOrigin = fShipBy === "PCS" || fShipBy === "PCSF" || fShipBy === "PCSE"
    || fShipBy === "24" || fShipBy === "2";
  const paymethod = inOrigin ? "1" : "2";

  // forwarder.php L55-87 — address copy (PCS warehouse fallback ELSE tb_address lookup)
  let addressName = "", addressLastname = "", addressTel = "", addressTel2 = "";
  let addressNo = "", addressSubDistrict = "", addressDistrict = "";
  let addressProvince = "", addressZIPCode = "", addressNote = "";
  if (fShipBy === "PCS") {
    // L56-66 — รับเองหน้าโกดัง PCS กทม (HARD-CODED in legacy)
    addressName = "รับที่โกดัง PCS กทม";
    addressTel = "02-444-7046";
    addressNo = "12 ซอย เพชรเกษม 77 แยก 3-6";
    addressSubDistrict = "หนองค้างพลู";
    addressDistrict = "หนองแขม";
    addressProvince = "กรุงเทพมหานคร";
    addressZIPCode = "10160";
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
    // NOT NULL columns the legacy leaves to MySQL defaults (Postgres
    // strict mode requires explicit values — match the 0081 defaults).
    fstatuscaradminon:   "",
    fstatuscaroff:       "0",
    fstatuscaradminoff:  "",
    printstatus4:        "0",
    fwarehousechina:     "1",
    fwarehousename:      "1",
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

  // forwarder.php L1590-1592 — derive payMethod when fShipBy is in-origin.
  const inOrigin = fShipBy === "PCS" || fShipBy === "PCSF" || fShipBy === "PCSE"
    || fShipBy === "24" || fShipBy === "2";
  const paymethod = inOrigin ? "1" : undefined;

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

  // forwarder.php L1599-1614 — PCS warehouse override (in-store pickup
  // rewrites the address fields to the PCS depot address).
  if (fShipBy === "PCS") {
    const { error: addrErr } = await admin
      .from("tb_forwarder")
      .update({
        faddressname:        "รับที่โกดัง PCS กทม",
        faddresslastname:    "",
        faddressno:          "12 ซอย เพชรเกษม 77 แยก 3-6",
        faddresssubdistrict: "หนองค้างพลู",
        faddressdistrict:    "หนองแขม",
        faddressprovince:    "กรุงเทพมหานคร",
        faddresszipcode:     "10160",
        faddressnote:        "",
        faddresstel:         "02-444-7046",
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
