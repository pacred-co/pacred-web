"use server";

/**
 * Admin > "เพิ่มรายการให้ลูกค้า" — server actions for /admin/forwarders/new.
 *
 * Wave 12-C v2 REWRITE (2026-05-23) — match legacy `pcs-admin/forwarder.php`
 * create modal EXACTLY (per docs/learnings/pacred-design-philosophy.md +
 * AGENTS.md §0a). The v1 form invented 14 fields (warehouseChina · tracking
 * thai · weight · volume · address typing · crate · admin note) that DON'T
 * exist in the legacy modal — ภูม rejected it on review.
 *
 * Legacy modal (forwarder.php L754-852) has exactly 9 fields:
 *   1. coID                 (tb_co dropdown — member tier)
 *   2. userID               (tb_users WHERE coid=<picked> — cascading)
 *   3. fTrackingCHN         (text · max 50 · required)
 *   4. fDetail              (textarea · max 500 · required)
 *   5. fAmount              (number · 1-10000 · default 1)
 *   6. fCover               (file · optional · max 9MB)
 *   7. fShipBy              (shipping company dropdown — required)
 *   8. addressID            (tb_address lookup — only when fShipBy != 'PCS')
 *   9. fTransportType       (1=รถ · 2=เรือ — only these two in legacy modal)
 *
 * Address handling — KEY INSIGHT FROM LEGACY:
 *   - When fShipBy='PCS' → use hardcoded "รับที่โกดัง PCS กทม" address
 *     (12 ซอย เพชรเกษม 77 แยก 3-6 · หนองค้างพลู · หนองแขม · กทม · 10160 · 02-444-7046)
 *   - Otherwise → look up tb_address WHERE addressID=<picked> (the user's
 *     saved address) and unpack into the 11 fAddress* columns.
 *   - The admin DOES NOT type the address — they pick from the customer's
 *     saved addresses (or get "PCS pickup" if shipBy='PCS').
 *
 * Cascading data — provided by these helper actions:
 *   - fetchUsersByCoid(coid)           → user picker repopulates
 *   - fetchAddressesByUserid(userid)   → address picker populates (with main flag)
 *
 * Source-badge convention (Wave 11):
 *   adminidcreator=<non-empty> → badge "ฝากนำเข้า · admin" in /admin/forwarders
 *   list. The legacy field is varchar(10) — clip the resolved id to fit.
 *
 * Schema reference: supabase/migrations/0081_pcs_legacy_schema.sql L1598
 * (tb_forwarder · ~50 NOT-NULL columns — the rest get zero-filled here,
 * matching legacy PHP behaviour).
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";
import { uploadToBucket } from "@/lib/storage/upload";

// ────────────────────────────────────────────────────────────
// resolveLegacyAdminId — clip to 10 chars (tb_forwarder.adminid* is varchar(10)).
// Same pattern as wallet-hs.ts; extracting to common.ts is a separate refactor.
// ────────────────────────────────────────────────────────────
async function resolveLegacyAdminId(): Promise<string> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const email = user?.email ?? null;
  if (!email) return "system";

  const admin = createAdminClient();
  const { data } = await admin
    .from("tb_admin")
    .select("adminid")
    .eq("adminemail", email)
    .maybeSingle<{ adminid: string | null }>();
  if (data?.adminid) return data.adminid;
  return email.slice(0, 30);
}

// ────────────────────────────────────────────────────────────
// fetchUsersByCoid — used by client form when coID changes.
// Returns up to 500 users for the picked tier (more than enough for any
// realistic coid — the largest tier in prod is ~2,000 but the picker has
// type-ahead filtering for narrowing).
// ────────────────────────────────────────────────────────────

export type CustomerOption = {
  userid:       string;
  username:     string | null;
  userlastname: string | null;
  usertel:      string | null;
};

export async function fetchUsersByCoid(
  coid: string,
): Promise<AdminActionResult<{ users: CustomerOption[] }>> {
  return withAdmin<{ users: CustomerOption[] }>(
    ["ops", "accounting", "super"],
    async () => {
      const admin = createAdminClient();
      const safeCoid = coid.trim().toUpperCase().slice(0, 10);
      if (!safeCoid) {
        return { ok: false, error: "coid empty" };
      }

      const { data, error } = await admin
        .from("tb_users")
        .select("userid, username, userlastname, usertel")
        .eq("coid", safeCoid)
        .eq("userstatus", "1")
        .order("userid", { ascending: true })
        .limit(2000);

      if (error) return { ok: false, error: error.message };

      return { ok: true, data: { users: (data ?? []) as CustomerOption[] } };
    },
  );
}

// ────────────────────────────────────────────────────────────
// fetchAddressesByUserid — used by client form after a user is picked.
// Returns the customer's tb_address rows + a flag marking which one is
// the "main" address (joined via tb_address_main).
// ────────────────────────────────────────────────────────────

export type AddressOption = {
  addressid:           number;
  addressname:         string;
  addresslastname:     string;
  addressno:           string;
  addresssubdistrict:  string;
  addressdistrict:     string;
  addressprovince:     string;
  addresszipcode:      string;
  addresstel:          string;
  addresstel2:         string | null;
  addressnote:         string;
  isMain:              boolean;
};

export async function fetchAddressesByUserid(
  userid: string,
): Promise<AdminActionResult<{ addresses: AddressOption[] }>> {
  return withAdmin<{ addresses: AddressOption[] }>(
    ["ops", "accounting", "super"],
    async () => {
      const admin = createAdminClient();
      const safe = userid.trim().toUpperCase();
      if (!safe) return { ok: false, error: "userid empty" };

      const [{ data: rows, error: rowsErr }, { data: mainRow }] = await Promise.all([
        admin
          .from("tb_address")
          .select(
            "addressid, addressname, addresslastname, addressno, addresssubdistrict, addressdistrict, addressprovince, addresszipcode, addresstel, addresstel2, addressnote",
          )
          .eq("userid", safe)
          .eq("addressstatus", "1")
          .order("addressid", { ascending: true })
          .limit(50),
        admin
          .from("tb_address_main")
          .select("addressid")
          .eq("userid", safe)
          .maybeSingle<{ addressid: number }>(),
      ]);

      if (rowsErr) return { ok: false, error: rowsErr.message };
      const mainId = mainRow?.addressid ?? null;
      const addresses = (rows ?? []).map((r) => ({
        ...(r as Omit<AddressOption, "isMain">),
        isMain: mainId !== null && r.addressid === mainId,
      })) as AddressOption[];

      // Sort: main first, then by id asc (legacy behaviour).
      addresses.sort((a, b) => {
        if (a.isMain && !b.isMain) return -1;
        if (!a.isMain && b.isMain) return 1;
        return a.addressid - b.addressid;
      });

      return { ok: true, data: { addresses } };
    },
  );
}

// ────────────────────────────────────────────────────────────
// PCS pickup address — exactly the legacy hardcoded values
// (forwarder.php L77-87). Used when fShipBy='PCS' (รับเองโกดัง PCS กทม).
// ────────────────────────────────────────────────────────────
const PCS_PICKUP_ADDRESS = {
  addressname:        "รับที่โกดัง PCS กทม",
  addresslastname:    "",
  addresstel:         "02-444-7046",
  addresstel2:        "",
  addressno:          "12 ซอย เพชรเกษม 77 แยก 3-6",
  addresssubdistrict: "หนองค้างพลู",
  addressdistrict:    "หนองแขม",
  addressprovince:    "กรุงเทพมหานคร",
  addresszipcode:     "10160",
  addressnote:        "",
} as const;

// ────────────────────────────────────────────────────────────
// adminCreateForwarder — INSERT tb_forwarder matching legacy SQL exactly.
//
// Legacy SQL (forwarder.php L115-120):
//   INSERT INTO tb_forwarder (
//     fTrackingCHN, fDetail, fAmount, fDate, userID, fShipBy, fTransportType,
//     adminIDCreator, fAddressName, fAddressLastname, fAddressNo,
//     fAddressSubDistrict, fAddressDistrict, fAddressProvince, fAddressZIPCode,
//     fAddressNote, fAddressTel, fAddressTel2, fShippingService
//   ) VALUES (...19 cols...)
//
// Other tb_forwarder NOT NULL columns get zero/blank defaults (matching
// legacy PHP behaviour — fields like fweight/fvolume/ftotalprice are filled
// in by later admin actions). The cover image is uploaded AFTER the INSERT
// (legacy resizes to 450px first; we just upload as-is to the bucket).
// ────────────────────────────────────────────────────────────

const TRANSPORT_TYPES = ["1", "2"] as const;  // legacy modal: only รถ + เรือ (no AIR)

const createForwarderSchema = z.object({
  coid:            z.string().trim().min(1, "เลือกประเภทสมาชิก").max(10),
  customerUserid:  z.string().trim().regex(/^PR\d+$/i, "userid ต้องเป็น PR####").max(20),
  trackingChn:     z.string().trim().min(1, "กรอกเลข Tracking").max(50),
  detail:          z.string().trim().min(1, "กรอกรายละเอียด").max(500),
  amount:          z.number().int().min(1).max(10000).default(1),
  shipBy:          z.string().trim().min(1, "เลือกบริษัทขนส่ง").max(10),
  addressId:       z.number().int().positive().nullable().optional(),
  transportType:   z.enum(TRANSPORT_TYPES),
});
export type AdminCreateForwarderInput = z.infer<typeof createForwarderSchema>;

export async function adminCreateForwarder(
  rawInput: AdminCreateForwarderInput,
  coverFile?: File,
): Promise<AdminActionResult<{ id: number }>> {
  const parsed = createForwarderSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  return withAdmin<{ id: number }>(
    ["ops", "accounting", "super"],
    async ({ adminId }) => {
      const admin            = createAdminClient();
      const legacyAdminIdRaw = await resolveLegacyAdminId();
      const legacyAdminId    = legacyAdminIdRaw.slice(0, 10);  // varchar(10) cap

      // Verify the target customer exists.
      const customerCode = d.customerUserid.toUpperCase();
      const { data: customer } = await admin
        .from("tb_users")
        .select("userid, coid")
        .eq("userid", customerCode)
        .maybeSingle<{ userid: string; coid: string | null }>();
      if (!customer) {
        return { ok: false, error: "ไม่พบสมาชิก (userid ไม่ตรงกับ tb_users)" };
      }

      // Resolve the delivery address.
      // - fShipBy='PCS'  → hardcoded PCS pickup address (no addressID needed)
      // - otherwise      → look up tb_address by addressID
      let addr: {
        addressname:        string;
        addresslastname:    string;
        addressno:          string;
        addresssubdistrict: string;
        addressdistrict:    string;
        addressprovince:    string;
        addresszipcode:     string;
        addressnote:        string;
        addresstel:         string;
        addresstel2:        string;
      };

      if (d.shipBy === "PCS") {
        addr = { ...PCS_PICKUP_ADDRESS };
      } else {
        if (!d.addressId) {
          return { ok: false, error: "เลือกที่อยู่จัดส่ง" };
        }
        const { data: addrRow, error: addrErr } = await admin
          .from("tb_address")
          .select(
            "addressname, addresslastname, addressno, addresssubdistrict, addressdistrict, addressprovince, addresszipcode, addressnote, addresstel, addresstel2",
          )
          .eq("addressid", d.addressId)
          .eq("userid", customer.userid)
          .eq("addressstatus", "1")
          .maybeSingle<{
            addressname:        string;
            addresslastname:    string;
            addressno:          string;
            addresssubdistrict: string;
            addressdistrict:    string;
            addressprovince:    string;
            addresszipcode:     string;
            addressnote:        string;
            addresstel:         string;
            addresstel2:        string | null;
          }>();
        if (addrErr || !addrRow) {
          return { ok: false, error: "ไม่พบที่อยู่ของสมาชิก (addressID ไม่ถูกต้อง)" };
        }
        addr = {
          addressname:        addrRow.addressname,
          addresslastname:    addrRow.addresslastname,
          addressno:          addrRow.addressno,
          addresssubdistrict: addrRow.addresssubdistrict,
          addressdistrict:    addrRow.addressdistrict,
          addressprovince:    addrRow.addressprovince,
          addresszipcode:     addrRow.addresszipcode,
          addressnote:        addrRow.addressnote ?? "",
          addresstel:         addrRow.addresstel,
          addresstel2:        addrRow.addresstel2 ?? "",
        };
      }

      // fShippingService — legacy sets to 0 always at create-time (lines 111-114).
      const fShippingService = 0;

      const nowIso = new Date().toISOString();

      // INSERT — supplies the 19 legacy columns plus blank/zero defaults for
      // every other NOT NULL column. Fields like fweight / fvolume /
      // ftotalprice are filled in by later admin status flips + combine-bill.
      const { data: row, error: insErr } = await admin
        .from("tb_forwarder")
        .insert({
          // ─── 19 legacy INSERT columns ───
          ftrackingchn:          d.trackingChn,
          fdetail:               d.detail,
          famount:               d.amount,
          fdate:                 nowIso,
          userid:                customer.userid,
          fshipby:               d.shipBy,
          ftransporttype:        d.transportType,
          adminidcreator:        legacyAdminId,
          faddressname:          addr.addressname,
          faddresslastname:      addr.addresslastname,
          faddressno:            addr.addressno,
          faddresssubdistrict:   addr.addresssubdistrict,
          faddressdistrict:      addr.addressdistrict,
          faddressprovince:      addr.addressprovince,
          faddresszipcode:       addr.addresszipcode,
          faddressnote:          addr.addressnote,
          faddresstel:           addr.addresstel,
          faddresstel2:          addr.addresstel2,
          fshippingservice:      String(fShippingService),

          // ─── safe defaults for the rest of the NOT NULL columns ───
          fstatus:               "1",      // รอเข้าโกดังจีน — initial state
          paydeposit:            "0",
          fwarehousechina:       "1",      // กวางโจว default (admin can edit)
          fwarehousename:        "1",
          fcabinetnumber:        "",
          ftrackingth:           "-",
          ffreeshipping:         "0",
          fnote:                 null,
          fnoteuser:             "0",
          fnoteuserread:         "0",
          fcover:                "",       // set AFTER insert if image uploaded
          fphotoend:             "",
          fproductstype:         "1",
          fweight:               0,
          fwidth:                0,
          flength:               0,
          fheight:               0,
          fvolume:               0,
          customratekg:          0,
          customratecbm:         0,
          customrate:            "0",
          frefprice:             "0",
          frefrate:              0,
          fcostrefrate:          0,
          ftransportprice:       0,
          fpriceupdate:          0,
          fdiscount:             0,
          ftotalprice:           0,
          fcosttotalprice:       0,
          fcosttotalpricesheet:  0,
          fprofittransportchn:   0,
          fprofitpriceupdate:    0,
          fprofittotal:          0,
          faddresslatitude:      0,
          faddresslongitude:     0,
          adminid:               legacyAdminId,
          adminidkey:            "",
          adminidupdate:         legacyAdminId,
          session:               "admin-manual",
          reforder:              "",
          fcredit:               "0",
          fusercompany:          "0",
          fsendsms1day:          "0",
          fsendsms3day:          "0",
          fsendsms3eday:         "0",
          paymethod:             "1",
          crate:                 "2",      // default = ไม่ตี (admin edit later)
          pricecrate:            0,
          fqc:                   "0",
          fqcprice:              0,
          ftransportpricechnthb: 0,
          pricemore:             "0",
          priceother:            0,
          linkapiorder:          "0",
          subuserid:             "",
          fstatuscaron:          "0",
          fstatuscaradminon:     "",
          fstatuscaroff:         "0",
          fstatuscaradminoff:    "",
          printstatus1:          "0",
          printstatus2:          "0",
          printstatus3:          "0",
          printstatus4:          "0",
        })
        .select("id")
        .single<{ id: number }>();

      if (insErr || !row) {
        return { ok: false, error: insErr?.message ?? "insert failed" };
      }

      // Optional cover upload — legacy flow: INSERT first, then UPDATE
      // fCover='<filename>' WHERE id=...
      let coverFilename = "";
      if (coverFile && coverFile instanceof File && coverFile.size > 0) {
        // Bucket `forwarder-covers` lives on prod. Path scoped to admin-create
        // so it doesn't collide with customer-side uploads. Filename pattern
        // mirrors legacy: <userid>_<unix-ms>.<ext>.
        const upload = await uploadToBucket(
          coverFile,
          "forwarder-covers",
          `admin/${customer.userid}`,
        );
        if (!upload.ok) {
          // Don't roll back the INSERT — legacy doesn't either; the row is
          // created and the cover is "missing" rather than the create failing.
          // Surface the warning so the operator knows.
          await logAdminAction(
            adminId,
            "forwarder.admin_create.cover_failed",
            "tb_forwarder",
            String(row.id),
            { reason: upload.error },
          );
        } else {
          coverFilename = upload.filename;
          const { error: updErr } = await admin
            .from("tb_forwarder")
            .update({ fcover: coverFilename })
            .eq("id", row.id);
          if (updErr) {
            await logAdminAction(
              adminId,
              "forwarder.admin_create.cover_link_failed",
              "tb_forwarder",
              String(row.id),
              { reason: updErr.message, filename: coverFilename },
            );
          }
        }
      }

      await logAdminAction(
        adminId,
        "forwarder.admin_create",
        "tb_forwarder",
        String(row.id),
        {
          userid:           customer.userid,
          coid:             d.coid,
          tracking_chn:     d.trackingChn,
          ship_by:          d.shipBy,
          transport_type:   d.transportType,
          amount:           d.amount,
          address_source:   d.shipBy === "PCS" ? "pcs_pickup" : `addressid:${d.addressId}`,
          cover_uploaded:   coverFilename ? true : false,
        },
      );

      revalidatePath("/admin/forwarders");
      revalidatePath(`/admin/forwarders/${row.id}`);
      revalidatePath("/admin");
      return { ok: true, data: { id: row.id } };
    },
  );
}
