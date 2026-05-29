"use server";

/**
 * Admin > "อัปเดต MOMO / CargoCenter ด้วยมือ" — server actions.
 *
 * Wave 17 P1-1+2 (2026-05-23) — port legacy `pcs-admin/api-forwarder-momo.php`
 * (and the byte-identical `api-forwarder-cn.php`) sub-page `manualUpdate`.
 *
 * Both legacy pages are 99% identical · the only difference between MOMO and
 * CN in the legacy flow is the page title + URL ribbon (the SQL INSERT is
 * literally the same `CC<productID>` prefix + `fWarehouseName='7'`). The
 * upstream-token / dashboard difference is handled in OTHER sub-pages
 * (updateAPI, APICheckSM) which are P2-defer. This Wave 17 only ports the
 * manualUpdate form which is what admin actually uses daily.
 *
 * Why one action file for both: the audit said "byte-identical pages" — the
 * `carrier` discriminator only affects breadcrumb + revalidate path, NOT the
 * INSERT shape. Keeping them in one place avoids drift if legacy adds a real
 * differentiator later (we change it once).
 *
 * Legacy SQL reference: `api-forwarder-momo.php` L247-260 (INSERT) — 51
 * columns. All listed below in `adminApiForwarderManualInsert`.
 *
 * Schema reference: supabase/migrations/0081_pcs_legacy_schema.sql L1598
 * (tb_forwarder · same NOT-NULL columns as Wave 12-C uses).
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";

// ────────────────────────────────────────────────────────────
// Carrier discriminator. Both MOMO + CargoCenter use the same legacy
// constants (CC prefix + warehouse '7') — kept as a literal map so a future
// agent can split them without grepping the whole file.
// ────────────────────────────────────────────────────────────
const CARRIER_CONFIG = {
  momo: { fIDorCOPrefix: "CC", fWarehouseName: "7", label: "MOMO" },
  cn:   { fIDorCOPrefix: "CC", fWarehouseName: "7", label: "CargoCenter" },
} as const;

export type Carrier = keyof typeof CARRIER_CONFIG;

// ────────────────────────────────────────────────────────────
// resolveLegacyAdminId — clip to 10 chars (tb_forwarder.adminid* is varchar(10)).
// Same pattern as forwarders-new.ts; extracting to common.ts is a separate refactor.
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
  return email.slice(0, 30);
}

// ────────────────────────────────────────────────────────────
// fetchUsersByQuery — used by the client form's customer picker.
// Searches tb_users by userid OR (username || ' ' || userlastname) ILIKE q.
// Returns the top 30 by relevance (exact userid match first · then prefix).
// ────────────────────────────────────────────────────────────

export type ManualCustomerOption = {
  userID:       string;
  userName:     string | null;
  userLastName: string | null;
  userTel:      string | null;
  coID:         string | null;
};

export async function fetchUsersByQuery(
  q: string,
): Promise<AdminActionResult<{ users: ManualCustomerOption[] }>> {
  return withAdmin<{ users: ManualCustomerOption[] }>(
    ["super", "ops", "warehouse"],
    async () => {
      const trimmed = q.trim();
      if (trimmed.length < 2) {
        return { ok: true, data: { users: [] } };
      }
      const admin = createAdminClient();
      const upper = trimmed.toUpperCase();
      // Use OR-filter: userID ilike OR userName ilike OR userTel ilike.
      // Quote individual values to dodge PostgREST or-syntax conflicts.
      const pattern = `%${upper}%`;
      const { data, error } = await admin
        .from("tb_users")
        .select("userID, userName, userLastName, userTel, coID")
        .or(
          `userID.ilike.${pattern},userName.ilike.${pattern},userLastName.ilike.${pattern},userTel.ilike.${pattern}`,
        )
        .eq("userStatus", "1")
        .order("userID", { ascending: true })
        .limit(30);

      if (error) return { ok: false, error: error.message };

      return { ok: true, data: { users: (data ?? []) as ManualCustomerOption[] } };
    },
  );
}

// ────────────────────────────────────────────────────────────
// PCS pickup address — same as Wave 12-C v2 (legacy
// api-forwarder-momo.php L70-80 — identical to forwarder.php L77-87).
//
// NOTE: typed as plain `string` (NOT `as const`) to avoid the TS const-
// narrowing trap that bit Wave 17 v0 — if these are literal types the
// `addr = ...` reassignment in adminApiForwarderManualInsert fails with
// "Type 'string' is not assignable to type '...literal...'".
// ────────────────────────────────────────────────────────────
type ResolvedAddress = {
  addressname:        string;
  addresslastname:    string;
  addresstel:         string;
  addresstel2:        string;
  addressno:          string;
  addresssubdistrict: string;
  addressdistrict:    string;
  addressprovince:    string;
  addresszipcode:     string;
  addressnote:        string;
};

const PCS_PICKUP_ADDRESS: ResolvedAddress = {
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
};

// ────────────────────────────────────────────────────────────
// Zod schema. Mirrors the 14 form inputs from legacy pageManualUpdate.php
// (lines 366-520) + the `carrier` discriminator. All free-form strings use
// `z.string()` (NOT const-typed string literals — Wave 17 v0 ran into a TS
// const-narrowing trap because the previous attempt typed user-specific
// defaults as literal types).
// ────────────────────────────────────────────────────────────

const TRANSPORT_OPTIONS = ["EK", "SEA"] as const;
const PRODUCT_TYPE_OPTIONS = ["1", "2", "3", "4"] as const;  // ทั่วไป/มอก/อย./พิเศษ
const PRODUCT_COST_TYPE_OPTIONS = ["", "1", "2"] as const;   // ""/ตีลังไม้/ค่าขนส่งจีน

const apiForwarderManualSchema = z.object({
  // ── identity
  productID:        z.string().trim().min(1, "กรอก productID").max(50),
  sm_code:          z.string().trim().min(1, "กรอก SM Code").max(60),
  productTracking:  z.string().trim().min(1, "กรอก Tracking").max(50),

  // ── customer
  userID:           z.string().trim().regex(/^PR\d+$/i, "userID ต้องเป็น PR####").max(20),
  subUserID:        z.string().trim().max(20).optional().default(""),

  // ── package metrics
  productQTY:       z.number().int().min(1).max(10000),
  productTypeCode:  z.enum(PRODUCT_TYPE_OPTIONS),
  productWeightAll: z.number().min(0).default(0),
  productWidth:     z.number().min(0).default(0),
  productLength:    z.number().min(0).default(0),
  productHeight:    z.number().min(0).default(0),
  productCBMAll:    z.number().min(0).default(0),
  productCostCHN:   z.number().min(0).default(0),
  productCostCHNType: z.enum(PRODUCT_COST_TYPE_OPTIONS).optional().default(""),

  // ── dates (`dd/mm/yyyy` text or "" — same format the legacy form uses)
  date1:            z.string().trim().min(1, "กรอกวันที่เข้าโกดังจีน"),
  manifest_date:    z.string().trim().optional().default(""),

  // ── transport + ship-by
  transport_code:   z.enum(TRANSPORT_OPTIONS),
  container_code:   z.string().trim().max(50).optional().default(""),
  fShipBy:          z.string().trim().min(1, "เลือกบริษัทขนส่ง").max(10),
  addressID:        z.number().int().positive().nullable().optional(),
});

export type ApiForwarderManualInput = z.infer<typeof apiForwarderManualSchema>;

// ────────────────────────────────────────────────────────────
// Date parser — legacy uses `DateTime::createFromFormat('d/m/Y', ...)`.
// Returns YYYY-MM-DD on success, null on failure.
// ────────────────────────────────────────────────────────────
function parseDdMmYyyy(s: string): string | null {
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) {
    // Allow YYYY-MM-DD too (the daterangepicker emits this when locale='YYYY-MM-DD').
    const m2 = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (m2) {
      const [, y, mo, d] = m2;
      return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
    }
    return null;
  }
  const [, d, mo, y] = m;
  return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

// ────────────────────────────────────────────────────────────
// Add `n` days to a YYYY-MM-DD string. Used for the fDateToThai estimate
// (legacy: EK +7 days · SEA +14 days). Returns "" on parse failure.
// ────────────────────────────────────────────────────────────
function addDays(yyyymmdd: string, n: number): string {
  const d = new Date(`${yyyymmdd}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return "";
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// ────────────────────────────────────────────────────────────
// adminApiForwarderManualInsert — INSERT tb_forwarder · "create new" path.
//
// Maps to legacy `api-forwarder-momo.php` L18-271 — the `isset($_POST['add'])`
// branch (which is the path admin uses for fresh entries; the legacy `update`
// branch updates an existing row, deferred to Wave 17+ if needed).
// ────────────────────────────────────────────────────────────

export async function adminApiForwarderManualInsert(
  carrier: Carrier,
  rawInput: ApiForwarderManualInput,
): Promise<AdminActionResult<{ id: number; fIDorCO: string }>> {
  const parsed = apiForwarderManualSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  // Validate carrier first so an unknown carrier returns a clean error before
  // touching the DB.
  if (!CARRIER_CONFIG[carrier]) {
    return { ok: false, error: `unknown carrier: ${carrier}` };
  }
  const carrierCfg = CARRIER_CONFIG[carrier];

  return withAdmin<{ id: number; fIDorCO: string }>(
    // Wave 26 G5 (2026-05-28 ดึก) — audited against the legacy owner matrix.
    // Partner-API sync creates a NEW tb_forwarder row at fstatus=2/3 — this
    // is an INSERT, not a transition, so it doesn't go through
    // `canFlipFstatus`. Matrix maps "1→2" + "1→3" + "→2 sync" + "→3 sync"
    // to warehouse / ITDT (= ops in Pacred role-map). The role union below
    // already matches: super (override) · ops (ITDT) · warehouse.
    ["super", "ops", "warehouse"],
    async ({ adminId }) => {
      const admin            = createAdminClient();
      const legacyAdminIdRaw = await resolveLegacyAdminId();
      const legacyAdminId    = legacyAdminIdRaw.slice(0, 10);

      // ── Parse dates ──────────────────────────────────────────
      const fDateStatus2 = parseDdMmYyyy(d.date1);
      if (!fDateStatus2) {
        return { ok: false, error: `รูปแบบวันที่เข้าโกดังจีนไม่ถูกต้อง (ใช้ dd/mm/yyyy)` };
      }

      let manifestDateParsed: string | null = null;
      if (d.manifest_date && d.manifest_date.trim()) {
        manifestDateParsed = parseDdMmYyyy(d.manifest_date);
        if (!manifestDateParsed) {
          return { ok: false, error: `รูปแบบวันที่ออกโกดังจีนไม่ถูกต้อง (ใช้ dd/mm/yyyy)` };
        }
      }

      // ── Derive fStatus (legacy: 2 if no manifest_date, 3 otherwise) ──
      const fStatusNew = manifestDateParsed ? "3" : "2";

      // ── Transport type (legacy: EK→1, SEA→2) ─────────────────
      const fTransportType = d.transport_code === "EK" ? "1" : "2";

      // ── fDateToThai estimate (legacy lines 155-159: EK +7 · SEA +14) ──
      let fDateToThai = "";
      let fDateContainerClose: string = "0000-00-00";
      let fCabinetNumber = "";
      if (manifestDateParsed) {
        fDateToThai = addDays(manifestDateParsed, d.transport_code === "EK" ? 7 : 14);
        fDateContainerClose = manifestDateParsed;
        fCabinetNumber = d.container_code;
      }
      const fDateStatus3 = manifestDateParsed ?? "";

      // ── Verify customer ───────────────────────────────────────
      const userID = d.userID.toUpperCase();
      const { data: customer, error: customerErr } = await admin
        .from("tb_users")
        .select("userID, coID, userCompany")
        .eq("userID", userID)
        .maybeSingle<{ userID: string; coID: string | null; userCompany: string | null }>();
      if (customerErr) {
        console.error(`[tb_users mutation lookup] failed`, { code: customerErr.code, message: customerErr.message });
        return { ok: false, error: `db_error:${customerErr.code ?? "unknown"}` };
      }
      if (!customer) {
        return { ok: false, error: "ไม่พบสมาชิก (userID ไม่ตรงกับ tb_users)" };
      }

      // ── Resolve address ───────────────────────────────────────
      let addr: ResolvedAddress;
      if (d.fShipBy === "PCS") {
        addr = { ...PCS_PICKUP_ADDRESS };
      } else if (d.addressID) {
        const { data: addrRow, error: addrRowErr } = await admin
          .from("tb_address")
          .select(
            "addressname, addresslastname, addressno, addresssubdistrict, addressdistrict, addressprovince, addresszipcode, addressnote, addresstel, addresstel2",
          )
          .eq("addressid", d.addressID)
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
        if (addrRowErr) {
          console.error(`[tb_address mutation lookup] failed`, { code: addrRowErr.code, message: addrRowErr.message });
          return { ok: false, error: `db_error:${addrRowErr.code ?? "unknown"}` };
        }
        if (!addrRow) {
          return { ok: false, error: "ไม่พบที่อยู่ของสมาชิก (addressID ไม่ถูกต้อง)" };
        }
        addr = {
          addressname:        addrRow.addressname,
          addresslastname:    addrRow.addresslastname ?? "",
          addressno:          addrRow.addressno,
          addresssubdistrict: addrRow.addresssubdistrict,
          addressdistrict:    addrRow.addressdistrict,
          addressprovince:    addrRow.addressprovince,
          addresszipcode:     addrRow.addresszipcode,
          addressnote:        addrRow.addressnote ?? "",
          addresstel:         addrRow.addresstel,
          addresstel2:        addrRow.addresstel2 ?? "",
        };
      } else {
        // Fallback to tb_address_main if not explicitly picked.
        const { data: main, error: mainErr } = await admin
          .from("tb_address_main")
          .select("addressid")
          .eq("userid", customer.userID)
          .maybeSingle<{ addressid: number }>();
        if (mainErr) {
          console.error(`[tb_address_main list] failed`, { code: mainErr.code, message: mainErr.message });
        }
        if (main?.addressid) {
          const { data: addrRow, error: addrRowErr } = await admin
            .from("tb_address")
            .select(
              "addressname, addresslastname, addressno, addresssubdistrict, addressdistrict, addressprovince, addresszipcode, addressnote, addresstel, addresstel2",
            )
            .eq("addressid", main.addressid)
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
          if (addrRowErr) {
            console.error(`[tb_address list] failed`, { code: addrRowErr.code, message: addrRowErr.message });
          }
          addr = addrRow ? {
            addressname:        addrRow.addressname,
            addresslastname:    addrRow.addresslastname ?? "",
            addressno:          addrRow.addressno,
            addresssubdistrict: addrRow.addresssubdistrict,
            addressdistrict:    addrRow.addressdistrict,
            addressprovince:    addrRow.addressprovince,
            addresszipcode:     addrRow.addresszipcode,
            addressnote:        addrRow.addressnote ?? "",
            addresstel:         addrRow.addresstel,
            addresstel2:        addrRow.addresstel2 ?? "",
          } : { ...PCS_PICKUP_ADDRESS };
        } else {
          // No address at all — fallback to PCS pickup (legacy behaviour L117-130).
          addr = { ...PCS_PICKUP_ADDRESS };
        }
      }

      // ── Cost-CHN split (legacy lines 207-215) ────────────────
      let priceCrate = 0;
      let crate = "";  // legacy default is '' (no crate)
      let fTransportPriceCHNTHB = 0;
      if (d.productCostCHNType === "1") {
        priceCrate = d.productCostCHN;
        crate = "2";  // legacy marker for "ตีลังไม้"
      } else if (d.productCostCHNType === "2") {
        fTransportPriceCHNTHB = d.productCostCHN;
      }

      // ── Derive smPCS (legacy lines 180-194: split sm_code on `-`) ──
      const smParts = d.sm_code.split("-");
      const smPCS = smParts[0] ?? d.sm_code;

      // ── fIDorCO ──────────────────────────────────────────────
      const fIDorCO = `${carrierCfg.fIDorCOPrefix}${d.productID}`;

      // ── fUserCompany (legacy lines 242-244) ──────────────────
      // 2026-05-30 evening ภูม flag: NULL violates the NOT NULL constraint
      // on tb_forwarder.fusercompany. The original comment ("NULL not
      // allowed — use '0'") was correct in spirit but the code still
      // wrote null. Legacy PHP set $fUserCompany=NULL but then
      // string-interpolated it in the INSERT (`'$fUserCompany'` → `''`),
      // so legacy effectively wrote empty string. Match that here for
      // consistency with existing prod data (PR124/PR2503/AIGA all "").
      // Convention: "" = company customer · "0" = individual customer.
      const fUserCompany = customer.userCompany === "1" ? "" : "0";

      const nowIso = new Date().toISOString();

      // ── INSERT ────────────────────────────────────────────────
      const { data: row, error: insErr } = await admin
        .from("tb_forwarder")
        .insert({
          // ── core identity (51 legacy INSERT columns) ───────
          ftrackingchn:          d.productTracking,
          famount:               d.productQTY,
          fdate:                 nowIso,
          userid:                customer.userID,
          fshipby:               d.fShipBy,
          ftransporttype:        fTransportType,
          adminidcreator:        legacyAdminId,
          subuserid:             d.subUserID ?? "",
          paymethod:             "1",       // resolved by setPayMethodShip — '1' is the most common default
          fusercompany:          fUserCompany,
          priceother:            0,
          fwarehousename:        carrierCfg.fWarehouseName,
          fdatestatus2:          fDateStatus2,
          fdatestatus3:          fDateStatus3,
          fcosttotalpricesheet:  0,
          fstatus:               fStatusNew,

          // ── address (11 cols) ────────────────────────────
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

          // ── package metrics (admin-entered) ──────────────
          fdatetothai:           fDateToThai || null,
          fweight:               d.productWeightAll,
          fwidth:                d.productWidth,
          flength:               d.productLength,
          fheight:               d.productHeight,
          fvolume:               d.productCBMAll,
          ftransportprice:       0,
          fwarehousechina:       "1",       // กวางโจว default
          fproductstype:         d.productTypeCode,
          fdiscount:             0,

          // ── cost-CHN split + cabinet ─────────────────────
          crate:                 crate || "2",
          pricecrate:            priceCrate,
          ftransportpricechnthb: fTransportPriceCHNTHB,
          pricemore:             "0",
          customrate:            "0",
          frefrate:              0,
          frefprice:             "0",
          ftotalprice:           0,
          customratekg:          0,
          customratecbm:         0,
          fcabinetnumber:        fCabinetNumber,
          fdatecontainerclose:   fDateContainerClose,
          fidorco:               fIDorCO,
          famountcount:          1,
          smpcs:                 smPCS,

          // ── safe defaults for other NOT NULL cols (matches Wave 12-C) ──
          fdetail:               "",
          paydeposit:            "0",
          ftrackingth:           "-",
          ffreeshipping:         "0",
          fnote:                 null,
          fnoteuser:             "0",
          fnoteuserread:         "0",
          fcover:                "",
          fphotoend:             "",
          fcostrefrate:          0,
          fpriceupdate:          0,
          fcosttotalprice:       0,
          fprofittransportchn:   0,
          fprofitpriceupdate:    0,
          fprofittotal:          0,
          faddresslatitude:      0,
          faddresslongitude:     0,
          adminid:               legacyAdminId,
          adminidkey:            "",
          adminidupdate:         legacyAdminId,
          session:               "admin-api-manual",
          reforder:              "",
          fcredit:               "0",
          fsendsms1day:          "0",
          fsendsms3day:          "0",
          fsendsms3eday:         "0",
          fqc:                   "0",
          fqcprice:              0,
          linkapiorder:          "0",
          fstatuscaron:          "0",
          fstatuscaradminon:     "",
          fstatuscaroff:         "0",
          fstatuscaradminoff:    "",
          printstatus1:          "0",
          printstatus2:          "0",
          printstatus3:          "0",
          printstatus4:          "0",
          fshippingservice:      "0",
        })
        .select("id")
        .single<{ id: number }>();

      if (insErr || !row) {
        return { ok: false, error: insErr?.message ?? "insert failed" };
      }

      await logAdminAction(
        adminId,
        `forwarder.api_manual.${carrier}`,
        "tb_forwarder",
        String(row.id),
        {
          carrier,
          carrier_label:    carrierCfg.label,
          userid:           customer.userID,
          productID:        d.productID,
          sm_code:          d.sm_code,
          tracking_chn:     d.productTracking,
          ship_by:          d.fShipBy,
          transport_type:   fTransportType,
          status_new:       fStatusNew,
          fIDorCO,
          address_source:   d.fShipBy === "PCS" ? "pcs_pickup" : `addressid:${d.addressID ?? "main"}`,
        },
      );

      revalidatePath(`/admin/api-forwarder-${carrier}`);
      revalidatePath(`/admin/api-forwarder-${carrier}/manual`);
      revalidatePath(`/admin/forwarders`);
      revalidatePath(`/admin/forwarders/${row.id}`);
      revalidatePath(`/admin`);

      return { ok: true, data: { id: row.id, fIDorCO } };
    },
  );
}
