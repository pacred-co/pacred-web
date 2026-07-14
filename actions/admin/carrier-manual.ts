"use server";

/**
 * Admin > carrier manual entry — server actions for the 4 `/admin/api-sheets-<carrier>`
 * pages (CTT / Sang / MK / MX). Wave 17 P1-3..6.
 *
 * The legacy `api-sheets-<carrier>.php` files (1265-1352 LOC each) are 95%
 * shared code — same INSERT into `tb_forwarder`, same cascading user picker,
 * same PCSE pricing rule. The only diff is the hardcoded `fWarehouseName`
 * (1=Sang, 2=CTT, 3=MK, 4=MX). Per design philosophy (AGENTS.md §0a) the
 * port is ONE shared form + ONE shared action parameterised by carrier key.
 *
 * Legacy INSERT shape (api-sheets-ctt.php L191-204):
 *   - 19 user-supplied/derived columns (tracking, detail, amount, ship-by,
 *     transport-type, address, weight/volume, plus pricing fields)
 *   - The rest of the ~70 NOT-NULL columns get zero/blank defaults — same
 *     pattern as `actions/admin/forwarders-new.ts` (Wave 12-C v2).
 *
 * Address: pulled from `tb_address_main` for the user (legacy L116-141);
 * if `fShipBy='PCS'` use the hardcoded PCS pickup (legacy L104-114). The
 * admin does NOT type the address — they pick the carrier-tracking and
 * the system resolves the destination from the customer's saved address.
 *
 * Notification side-effects (LINE notify, line-userid push) are deferred
 * — the existing `actions/admin/forwarders-new.ts` doesn't fire them
 * either, and ก๊อต's LINE infra rework is still pending (DV-2).
 *
 * Cost calc + profit accounting are also deferred — the legacy
 * `calPriceForwarder` + `calPriceForwarderCost` helpers are not yet ported;
 * the row is inserted with zeroed pricing fields (`ftotalprice` = 0 etc.)
 * and gets filled in later when an admin edits via `/admin/forwarders/[fNo]/edit`.
 * This matches the Wave 12-C v2 behaviour and is intentional — the
 * customer is NOT shown a price until the admin confirms it.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  CARRIER_REGISTRY,
  computeTransportPrice,
  isCarrierKey,
} from "@/lib/carrier/registry";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";
import { ADDRESSES } from "@/components/seo/site";
import { checkCarrierForProvince } from "@/lib/forwarder/carrier-coverage-guard";

// ────────────────────────────────────────────────────────────
// resolveLegacyAdminId — clip to 10 chars (`tb_forwarder.adminid*` = varchar(10)).
// Same pattern as `actions/admin/forwarders-new.ts`.
// ────────────────────────────────────────────────────────────
async function resolveLegacyAdminId(): Promise<string> {
  const supabase = await createClient();
  const { data: { user }, error: dataErr } = await supabase.auth.getUser();
  if (dataErr) {
    console.error(`[supabase list] failed`, { code: dataErr.code, message: dataErr.message });
  }
  const email = user?.email ?? null;
  if (!email) return "system";

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("tb_admin")
    .select("adminID")
    .eq("adminEmail", email)
    .maybeSingle<{ adminID: string | null }>();
  if (error) {
    console.error(`[tb_admin list] failed`, { code: error.code, message: error.message });
  }
  if (data?.adminID) return data.adminID;
  return (email.split("@")[0] || "system").slice(0, 20); // 2026-06-05 varchar(20)
}

// ────────────────────────────────────────────────────────────
// Self-pickup address — Pacred's TH receiving warehouse (สมุทรสาคร,
// ADDRESSES.warehouseTh — same depot the shop path + forwarders-new.ts use).
// Used when fShipBy='PCS' (รับเองที่โกดัง). Legacy api-sheets-ctt.php L104-114
// hard-coded the old Bangkok PCS depot. This `addresstel` flows into
// tb_forwarder.faddresstel (varchar(10)) below → digits-only "0224213325"
// (Pacred company line "02-421-3325" minus dashes = 10 chars).
// ────────────────────────────────────────────────────────────
const PCS_PICKUP_ADDRESS = {
  addressname:        "รับที่โกดัง Pacred",
  addresslastname:    "",
  addresstel:         "0224213325",
  addresstel2:        "",
  addressno:           ADDRESSES.warehouseTh.line,
  addresssubdistrict:  ADDRESSES.warehouseTh.subDistrict,
  addressdistrict:     ADDRESSES.warehouseTh.district,
  addressprovince:     ADDRESSES.warehouseTh.province,
  addresszipcode:      ADDRESSES.warehouseTh.postcode,
  addressnote:         "",
} as const;

// ────────────────────────────────────────────────────────────
// Zod schema.
// All free-form text → `z.string()` (never type-literal — the previous
// stash-dropped attempt baked PR2583's address as a literal type and
// produced 10 TS errors).
// ────────────────────────────────────────────────────────────

const TRANSPORT_TYPES = ["1", "2"] as const; // 1=รถ · 2=เรือ (legacy modal omits AIR at create)

const carrierManualSchema = z.object({
  carrier:         z.enum(["ctt", "sang", "mk", "mx"] as const),
  coid:            z.string().trim().min(1, "เลือกประเภทสมาชิก").max(10),
  customerUserid:  z.string().trim().regex(/^PR\d+$/i, "userid ต้องเป็น PR####").max(20),
  trackingChn:     z.string().trim().min(1, "กรอกเลข Tracking").max(50),
  trackingChn2:    z.string().trim().max(50).nullable().optional(),
  detail:          z.string().trim().min(1, "กรอกรายละเอียด").max(500),
  amount:          z.number().int().min(1).max(10000).default(1),
  shipBy:          z.string().trim().min(1, "เลือกบริษัทขนส่ง").max(10),
  addressId:       z.number().int().positive().nullable().optional(),
  transportType:   z.enum(TRANSPORT_TYPES),
  weightKg:        z.number().min(0).max(10000).default(0),
  volumeCbm:       z.number().min(0).max(1000).default(0),
  warehouseChina:  z.string().trim().max(10).default("1"),       // 1=กวางโจว · 2=อี้อู (legacy values)
  productsType:    z.string().trim().max(10).default("1"),       // tb_products_type · admin tweak in edit
  cabinetNumber:   z.string().trim().max(50).default(""),        // optional — empty = ยังไม่ปิดตู้
  idOrCo:          z.string().trim().max(50).default(""),        // legacy `fIDorCO` (Container ref)
  amountCount:     z.number().int().min(1).max(10000).default(1),
});
export type CarrierManualInput = z.infer<typeof carrierManualSchema>;

/**
 * Insert a forwarder row scoped to the given carrier.
 *
 * Returns `{ ok: true, data: { fid } }` on success — caller redirects to
 * `/admin/forwarders/<fid>` to see the row + continue editing dimensions.
 */
export async function adminCarrierManualInsert(
  rawInput: CarrierManualInput,
): Promise<AdminActionResult<{ fid: number }>> {
  const parsed = carrierManualSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  if (!isCarrierKey(d.carrier)) {
    return { ok: false, error: "unknown_carrier" };
  }
  const carrier = CARRIER_REGISTRY[d.carrier];

  return withAdmin<{ fid: number }>(
    // Wave 26 G5 (2026-05-28 ดึก) — audited against the legacy owner matrix.
    // Carrier-manual INSERTs at fstatus=2 (api-sheets workflow assumes the
    // row arrived in China). INSERT not transition → not gated by
    // canFlipFstatus. Matrix: warehouse / ITDT (= ops) own this surface;
    // the role union already matches (super override · ops = ITDT ·
    // warehouse).
    ["ops", "warehouse", "super"],
    async ({ adminId }) => {
      const admin            = createAdminClient();
      const legacyAdminIdRaw = await resolveLegacyAdminId();
      const legacyAdminId    = legacyAdminIdRaw.slice(0, 10);

      // ─── Verify customer ───────────────────────────────────────────
      const customerCode = d.customerUserid.toUpperCase();
      const { data: customer, error: customerErr } = await admin
        .from("tb_users")
        .select("userID, coID, userCompany")
        .eq("userID", customerCode)
        .maybeSingle<{ userID: string; coID: string | null; userCompany: string | null }>();
      if (customerErr) {
        console.error(`[tb_users mutation lookup] failed`, { code: customerErr.code, message: customerErr.message });
        return { ok: false, error: `db_error:${customerErr.code ?? "unknown"}` };
      }
      if (!customer) {
        return { ok: false, error: "ไม่พบสมาชิก (userid ไม่ตรงกับ tb_users)" };
      }
      const userCompany = customer.userCompany === "1" ? "1" : "0";

      // ─── Resolve address ───────────────────────────────────────────
      // Note: explicit `string`-typed shape — NOT `typeof PCS_PICKUP_ADDRESS`.
      // The pickup constant uses `as const` so its fields are string-literal
      // types; using that as the slot type would reject free-form
      // `tb_address` rows (the trap that bit a previous stash-dropped attempt
      // with 10 TS2322 errors). Free-form input fields → `string`.
      type ResolvedAddress = {
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

      let addr: ResolvedAddress;
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
          .eq("userid", customer.userID)
          .eq("addressstatus", "1")
          .maybeSingle<{
            addressname:        string;
            addresslastname:    string | null;
            addressno:          string;
            addresssubdistrict: string;
            addressdistrict:    string;
            addressprovince:    string;
            addresszipcode:     string;
            addressnote:        string | null;
            addresstel:         string;
            addresstel2:        string | null;
          }>();
        if (addrErr || !addrRow) {
          return { ok: false, error: "ไม่พบที่อยู่ของสมาชิก (addressID ไม่ถูกต้อง)" };
        }
        addr = {
          addressname:         addrRow.addressname,
          addresslastname:     addrRow.addresslastname ?? "",
          addressno:           addrRow.addressno,
          addresssubdistrict:  addrRow.addresssubdistrict,
          addressdistrict:     addrRow.addressdistrict,
          addressprovince:     addrRow.addressprovince,
          addresszipcode:      addrRow.addresszipcode,
          addressnote:         addrRow.addressnote ?? "",
          addresstel:          addrRow.addresstel,
          addresstel2:         addrRow.addresstel2 ?? "",
        };
      }

      // 🔴 CLOSED LIST (owner 2026-07-14) — the ขนส่งเอกชน must be in the owner's workbook
      // AND run in the resolved delivery province. Own-fleet (PCS/PCSF/PCSE) exempt.
      {
        const coverage = checkCarrierForProvince(d.shipBy, addr.addressprovince);
        if (!coverage.ok) return { ok: false, error: coverage.error };
      }

      // ─── Pricing — shared rule (legacy L78-86) ────────────────────
      const fTransportPrice = computeTransportPrice(d.shipBy, d.volumeCbm);

      // Initial status — legacy default for these carrier pages:
      //   "2" = ถึงโกดังจีนแล้ว (the api-sheets workflow assumes the row
      //         arrived in China and the warehouse is just recording it).
      // Compare to `actions/admin/forwarders-new.ts` which uses "1" because
      // that flow is the central admin's "lookup → create on customer's
      // behalf" use case where the box hasn't shipped yet.
      const fStatus = "2";

      const nowIso = new Date().toISOString();

      // ─── INSERT ────────────────────────────────────────────────────
      const { data: row, error: insErr } = await admin
        .from("tb_forwarder")
        .insert({
          // legacy 19-column shape (api-sheets-ctt.php L191-204)
          ftrackingchn:          d.trackingChn,
          ftrackingchn2:         d.trackingChn2 ?? null,
          fdetail:               d.detail,
          famount:               d.amount,
          fdate:                 nowIso,
          userid:                customer.userID,
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
          fshippingservice:      "0",

          // carrier-scoped warehouse + dimensions (legacy: $fWarehouseName)
          fwarehousename:        carrier.warehouseCode,
          fwarehousechina:       d.warehouseChina,
          fproductstype:         d.productsType,
          fcabinetnumber:        d.cabinetNumber,
          fweight:               d.weightKg,
          fvolume:               d.volumeCbm,
          ftransportprice:       fTransportPrice,
          fstatus:               fStatus,
          fusercompany:          userCompany,
          fidorco:               d.idOrCo,

          // pricing / cost / profit — zeroed at create-time (matches Wave
          // 12-C v2; admin fills in later via edit form)
          frefprice:             "0",
          frefrate:              0,
          fcostrefrate:          0,
          fpriceupdate:          0,
          fdiscount:             0,
          ftotalprice:           0,
          fcosttotalprice:       0,
          fcosttotalpricesheet:  0,
          fprofittransportchn:   0,
          fprofitpriceupdate:    0,
          fprofittotal:          0,
          customratekg:          0,
          customratecbm:         0,
          customrate:            "0",

          // operational defaults (matches Wave 12-C v2)
          fwidth:                0,
          flength:               0,
          fheight:               0,
          faddresslatitude:      0,
          faddresslongitude:     0,
          paydeposit:            "0",
          ftrackingth:           "-",
          ffreeshipping:         "0",
          fnote:                 null,
          fnoteuser:             "0",
          fnoteuserread:         "0",
          fcover:                "",
          fphotoend:             "",
          adminid:               legacyAdminId,
          adminidkey:            "",
          adminidupdate:         legacyAdminId,
          session:               "admin-api-sheets-" + carrier.key,
          reforder:              "",
          fcredit:               "0",
          fsendsms1day:          "0",
          fsendsms3day:          "0",
          fsendsms3eday:         "0",
          paymethod:             "1",
          crate:                 "2",      // default = ไม่ตีลังไม้ (header convention · function.php L1691 · admin edits later)
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
          famountcount:          d.amountCount,
        })
        .select("id")
        .single<{ id: number }>();

      if (insErr || !row) {
        return { ok: false, error: insErr?.message ?? "insert failed" };
      }

      await logAdminAction(
        adminId,
        "forwarder.admin_carrier_manual",
        "tb_forwarder",
        String(row.id),
        {
          carrier:         carrier.key,
          warehouse_code:  carrier.warehouseCode,
          userid:          customer.userID,
          coid:            d.coid,
          tracking_chn:    d.trackingChn,
          ship_by:         d.shipBy,
          transport_type:  d.transportType,
          amount:          d.amount,
          weight_kg:       d.weightKg,
          volume_cbm:      d.volumeCbm,
          transport_price: fTransportPrice,
          address_source:  d.shipBy === "PCS" ? "pcs_pickup" : `addressid:${d.addressId}`,
        },
      );

      revalidatePath(`/admin/api-sheets-${carrier.key}`);
      revalidatePath("/admin/forwarders");
      revalidatePath(`/admin/forwarders/${row.id}`);
      return { ok: true, data: { fid: row.id } };
    },
  );
}
