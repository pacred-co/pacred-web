import "server-only";

/**
 * Wave 30.5 — MOMO commit core (auth-agnostic).
 *
 * WHY THIS FILE EXISTS
 * ────────────────────
 * `commitMomoRowToForwarder` (actions/admin/momo-commit.ts) is wrapped with
 * `withAdmin(["super","ops","warehouse"])`, which calls `requireAdmin()` →
 * reads the session cookie. That's correct for the interactive /review grid
 * (an admin clicks "สร้างใหม่"), but it THROWS in cron context (no session) —
 * which is exactly why Wave 30 #2's auto-commit failed 7/7 (see the KNOWN
 * LIMITATION comment that used to live in lib/admin/auto-commit-momo.ts).
 *
 * The fix (per that comment's "Fix path (Wave 30.5)"): extract the entire
 * commit body into THIS module as `commitMomoRowCore(ctx, input)` — pure
 * `(context, input) → DB writes`, no session reads. Then:
 *
 *   - `commitMomoRowToForwarder` (admin-gated)  → resolves ctx from the
 *      session inside withAdmin, then calls the core.
 *   - `commitMomoRowSystem` (cron/service-role) → builds a system ctx
 *      (adminId=null · legacyAdminId="momo-cron" · committedBy=null) and
 *      calls the core directly. NEVER exposed as a "use server" action
 *      (that would be an unauthenticated tb_forwarder INSERT endpoint).
 *
 * This module is a plain server module (NOT "use server") + `server-only`,
 * so `commitMomoRowSystem` can only ever run server-side and is never turned
 * into a callable RPC endpoint. The schema + pure helpers also live here so
 * both callers share one source of truth.
 *
 * @see actions/admin/momo-commit.ts          — the admin-gated wrapper
 * @see lib/admin/auto-commit-momo.ts          — the cron caller
 * @see app/api/cron/momo-sync/route.ts        — gated by MOMO_CRON_AUTOCOMMIT
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAdminAction, type AdminActionResult } from "@/actions/admin/common";
// Pure raw→field derivations live in a non-`server-only` module so they're
// unit-testable under tsx (this module's `server-only` import throws there).
import {
  deriveTransportTypeFromMomoRaw,
  deriveTransportTypeFromCabinet,
  extractMetricsFromMomoRaw,
  extractWarehouseDatesFromMomoRaw,
} from "@/lib/admin/momo-raw-helpers";
import { ADDRESSES } from "@/components/seo/site";

// ────────────────────────────────────────────────────────────
// Self-pickup address — Pacred's TH receiving warehouse (สมุทรสาคร,
// ADDRESSES.warehouseTh — same depot the shop path + api-forwarder-manual.ts
// use). Legacy hard-coded the old Bangkok PCS depot. `addresstel` digits-only
// (tb_forwarder.faddresstel is varchar(10)) per Wave 23 bug-fix.
// ────────────────────────────────────────────────────────────
export type ResolvedAddress = {
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

export const PCS_PICKUP_ADDRESS: ResolvedAddress = {
  addressname:        "รับที่โกดัง Pacred",
  addresslastname:    "",
  addresstel:         "0224213325",
  addresstel2:        "",
  addressno:          ADDRESSES.warehouseTh.line,
  addresssubdistrict: ADDRESSES.warehouseTh.subDistrict,
  addressdistrict:    ADDRESSES.warehouseTh.district,
  addressprovince:    ADDRESSES.warehouseTh.province,
  addresszipcode:     ADDRESSES.warehouseTh.postcode,
  addressnote:        "",
};

// ────────────────────────────────────────────────────────────
// Zod schema — admin-supplied overrides for a single MOMO commit.
// The base row data (tracking · cabinet · dates) comes from
// momo_import_tracks; the caller only supplies userID + shipBy +
// productsType (+ optional address). The atomic INSERT merges both.
// ────────────────────────────────────────────────────────────
const PRODUCT_TYPE_OPTIONS = ["1", "2", "3", "4"] as const;
const TRANSPORT_OPTIONS    = ["1", "2"] as const; // 1=EK truck, 2=SEA — legacy code values

export const commitMomoRowSchema = z.object({
  rowId:        z.string().uuid("rowId ต้องเป็น uuid"),
  userID:       z.string().trim().regex(/^PR\d+$/i, "userID ต้องเป็น PR####").max(20),
  subUserID:    z.string().trim().max(20).optional().default(""),
  fShipBy:      z.string().trim().min(1, "เลือกบริษัทขนส่ง").max(10),
  fProductsType: z.enum(PRODUCT_TYPE_OPTIONS),
  fTransportType: z.enum(TRANSPORT_OPTIONS).optional(),
  fAmount:      z.number().int().min(1).max(10000).optional().default(1),
  addressID:    z.number().int().positive().nullable().optional(),
});

/**
 * Input type — uses `z.input` (NOT `z.infer`) so callers can omit fields
 * that have `.default()` clauses (subUserID, fAmount). The parser fills
 * the defaults before the core body sees them.
 */
export type CommitMomoRowInput = z.input<typeof commitMomoRowSchema>;

/**
 * Who is committing — resolved by the caller (admin session OR cron system),
 * so the core never reads a session itself.
 *
 * @property adminId       profiles.id uuid for the admin path (writes
 *                         admin_audit_log, which has a NOT NULL FK to
 *                         profiles). `null` for the cron/system path → the
 *                         admin_audit_log write is SKIPPED (the
 *                         momo_import_tracks stamp + momo_sync_logs "commit"
 *                         row are the system path's audit trail).
 * @property legacyAdminId tb_forwarder.adminid* value, varchar(10). The admin
 *                         path passes the resolved legacy admin id; the cron
 *                         path passes "momo-cron" so cron-created rows are
 *                         identifiable in tb_forwarder.
 * @property committedBy   momo_import_tracks.committed_by (auth uuid). `null`
 *                         for cron = "system committed this".
 * @property revalidate    revalidate the /admin/* paths after the INSERT.
 *                         true for the interactive admin path; false for the
 *                         cron loop (it commits many rows; the next admin page
 *                         load is force-dynamic and reads fresh anyway).
 */
export type CommitMomoRowContext = {
  adminId:       string | null;
  legacyAdminId: string;
  committedBy:   string | null;
  revalidate:    boolean;
};

// Pure raw→field helpers (deriveTransportTypeFromMomoRaw,
// extractMetricsFromMomoRaw) moved to @/lib/admin/momo-raw-helpers — imported
// at the top of this file. They're unit-tested in momo-raw-helpers.test.ts.

/**
 * ภูม flag 2026-05-30 (bug 2b): bulk commit threw
 *   `date/time field value out of range: "0000-00-00"`
 * because legacy MySQL sentinel "0000-00-00" (and empty string) flowed
 * from MOMO raw into a Postgres date column write. Postgres rejects both.
 *
 * Pipe EVERY date column write through this helper to coerce the legacy
 * sentinels → null. Accepts ISO "YYYY-MM-DD", returns it untouched only
 * when it parses as a valid date.
 */
function cleanDate(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  if (!trimmed) return null;
  // Legacy MySQL sentinels.
  if (trimmed === "0000-00-00" || trimmed === "0000-00-00 00:00:00") return null;
  // Accept "YYYY-MM-DD" or "YYYY-MM-DDTHH:MM:SS...".
  const datePart = trimmed.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return null;
  // Validate it's a real date (rejects 2026-02-30, etc.).
  const probe = new Date(`${datePart}T00:00:00Z`);
  if (Number.isNaN(probe.getTime())) return null;
  // Round-trip to confirm it didn't normalise (e.g. 2026-02-30 → 2026-03-02).
  if (probe.toISOString().slice(0, 10) !== datePart) return null;
  return datePart;
}

// ════════════════════════════════════════════════════════════
// commitMomoRowCore — the auth-agnostic commit body.
//
// Verbatim port of the original withAdmin body from momo-commit.ts, with
// the THREE session-derived values lifted into `ctx`:
//   - resolveLegacyAdminId()  → ctx.legacyAdminId
//   - getCurrentUser()?.id    → ctx.committedBy
//   - withAdmin adminId       → ctx.adminId (audit only; skipped when null)
// Everything else (loads · validation · the 51-column atomic INSERT · the
// committed_at stamp · the sync log) is unchanged.
// ════════════════════════════════════════════════════════════
export async function commitMomoRowCore(
  ctx: CommitMomoRowContext,
  rawInput: CommitMomoRowInput,
): Promise<AdminActionResult<{ forwarderId: number; fIDorCO: string }>> {
  const parsed = commitMomoRowSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  const admin         = createAdminClient();
  const legacyAdminId = ctx.legacyAdminId.slice(0, 10);

  // ── 1. Load the source row from momo_import_tracks ────────
  // ภูม flag 2026-05-30 (bug 2c): also pull `container_batch_no` — the
  // REAL cabinet (e.g. "GZS260525-2") joined from container_closed.cid
  // via sync.ts step 2.5. Use that for fcabinetnumber; fall back to
  // momo_container_no (= MOMO routing batch ID) only when propagation
  // hasn't run yet for this row.
  const { data: srcRow, error: srcErr } = await admin
    .from("momo_import_tracks")
    .select(
      "id, momo_tracking_no, momo_container_no, container_batch_no, momo_sack_no, shipment_status, raw, momo_updated_at, committed_at, committed_forwarder_id",
    )
    .eq("id", d.rowId)
    .maybeSingle<{
      id:                     string;
      momo_tracking_no:       string | null;
      momo_container_no:      string | null;
      container_batch_no:     string | null;
      momo_sack_no:           string | null;
      shipment_status:        string | null;
      raw:                    unknown;
      momo_updated_at:        string | null;
      committed_at:           string | null;
      committed_forwarder_id: number | null;
    }>();
  if (srcErr) {
    console.error(`[momo_import_tracks lookup] failed`, { code: srcErr.code, message: srcErr.message });
    return { ok: false, error: `db_error:${srcErr.code ?? "unknown"}` };
  }
  if (!srcRow) {
    return { ok: false, error: "ไม่พบ momo row (rowId)" };
  }
  if (srcRow.committed_at) {
    return {
      ok: false,
      error: `row นี้ถูก commit แล้ว (tb_forwarder id=${srcRow.committed_forwarder_id ?? "?"})`,
    };
  }
  if (!srcRow.momo_tracking_no) {
    return { ok: false, error: "row นี้ไม่มี momo_tracking_no" };
  }

  // ── 2. Verify customer (tb_users) ─────────────────────────
  const userID = d.userID.toUpperCase();
  const { data: customer, error: customerErr } = await admin
    .from("tb_users")
    .select("userID, coID, userCompany")
    .eq("userID", userID)
    .maybeSingle<{ userID: string; coID: string | null; userCompany: string | null }>();
  if (customerErr) {
    console.error(`[tb_users lookup] failed`, { code: customerErr.code, message: customerErr.message });
    return { ok: false, error: `db_error:${customerErr.code ?? "unknown"}` };
  }
  if (!customer) {
    return { ok: false, error: "ไม่พบสมาชิก (userID ไม่ตรงกับ tb_users)" };
  }

  // ── 3. Resolve address ────────────────────────────────────
  let addr: ResolvedAddress;
  if (d.fShipBy === "PCS") {
    addr = { ...PCS_PICKUP_ADDRESS };
  } else if (d.addressID) {
    const { data: addrRow, error: addrErr } = await admin
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
    if (addrErr) {
      console.error(`[tb_address lookup] failed`, { code: addrErr.code, message: addrErr.message });
      return { ok: false, error: `db_error:${addrErr.code ?? "unknown"}` };
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
    // Fallback: tb_address_main → tb_address.
    const { data: main, error: mainErr } = await admin
      .from("tb_address_main")
      .select("addressid")
      .eq("userid", customer.userID)
      .maybeSingle<{ addressid: number }>();
    if (mainErr) {
      console.error(`[tb_address_main lookup] failed`, { code: mainErr.code, message: mainErr.message });
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
        console.error(`[tb_address main fallback lookup] failed`, { code: addrRowErr.code, message: addrRowErr.message });
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
      addr = { ...PCS_PICKUP_ADDRESS };
    }
  }

  // ── 4. Derive cargo fields from MOMO source row ────────────
  const trackingNo  = srcRow.momo_tracking_no;
  // ภูม flag 2026-05-30 (bug 2c): prefer the joined cabinet (cid from
  // container_closed) over momo_container_no (MOMO routing batch ID).
  // The legacy PHP writes the cabinet PCS staff/customers actually see
  // (e.g. "GZS260525-2") — that's what `container_batch_no` holds.
  // Falls back to momo_container_no ONLY when the propagation hasn't
  // populated this row yet (sync.ts step 2.5 fires on container_closed
  // and may lag one cycle behind import_track upsert).
  const cabinetForDisplay = srcRow.container_batch_no ?? srcRow.momo_container_no ?? "";
  const containerNo = srcRow.momo_container_no ?? "";
  const metrics     = extractMetricsFromMomoRaw(srcRow.raw);
  // ── Transport type (รถ EK "1" / เรือ SEA "2") — พี่ป๊อป flag 2026-06-11 ──
  // Priority:
  //   1. d.fTransportType        — explicit admin override (review form) wins.
  //   2. the REAL cabinet GZS/GZE — the PHYSICAL truth. We PROVED per-parcel
  //      ship_by lies: parcel 0004065 was tagged ship_by=รถ but physically
  //      shipped in the SEA cabinet GZS260528-1. container_batch_no (= the
  //      container_closed cid, GZS…/GZE…) is the cabinet the goods actually
  //      rode, so derive the mode from it.
  //   3. deriveTransportTypeFromMomoRaw(raw) = ship_by — last-resort fallback
  //      ONLY when the parcel isn't in a closed container yet (no cabinet).
  // This also corrects the fdatetothai ETA below (sea +14 vs truck +7).
  const fTransportType =
    d.fTransportType
    ?? deriveTransportTypeFromCabinet(srcRow.container_batch_no)
    ?? deriveTransportTypeFromMomoRaw(srcRow.raw);

  // Legacy "feel automatic" atomicity:
  //   - fstatus: 2 if no manifest/container yet · 3 if container assigned
  //   - fcabinetnumber: cabinetForDisplay (or '')
  //   - fdatetothai: today + 7 (EK) / +14 (SEA) when status=3
  //   - fdatecontainerclose: today (the MOMO confirmation point)
  //
  // Mirrors legacy api-forwarder-momo.php:151-170 logic. We collapse
  // into THE ONE atomic INSERT below.
  // hasContainer = "do we have ANY cabinet/routing identifier" — we use
  // either propagated cid OR the routing batch number as a signal that
  // this tracking has been allocated, so status flips to 3.
  const hasContainer = !!cabinetForDisplay;
  const fStatusNew = hasContainer ? "3" : "2";

  // Date fields. Legacy uses `manifest_date` from the SM payload —
  // MOMO Status Sync stores `momo_updated_at` (the latest status_date
  // timestamp from the raw). Use that as the manifest reference; if
  // missing, fall back to today.
  // ภูม flag 2026-05-30 (bug 2b): coerce legacy sentinels through
  // cleanDate so empty / "0000-00-00" / invalid dates can't reach the
  // INSERT (Postgres rejects "0000-00-00").
  const todayIso = new Date().toISOString().slice(0, 10);
  const manifestDate = cleanDate(srcRow.momo_updated_at) ?? todayIso;

  let fDateToThai: string | null = null;
  let fDateContainerClose: string | null = null;
  let fCabinetNumber = "";
  if (hasContainer) {
    const daysAhead = fTransportType === "1" ? 7 : 14;
    const eta = new Date(`${manifestDate}T00:00:00Z`);
    eta.setUTCDate(eta.getUTCDate() + daysAhead);
    fDateToThai = cleanDate(eta.toISOString().slice(0, 10));
    fDateContainerClose = manifestDate;
    fCabinetNumber = cabinetForDisplay;
  }

  // ── Warehouse-IN / warehouse-OUT dates (ภูม flag 2026-06-10) ──
  // The list shows two distinct columns — เข้าโกดัง (fdatestatus2) and
  // ออกโกดัง (fdatestatus3). The old code wrote `manifestDate` into BOTH,
  // so they always rendered identical (28/05 == 28/05 in ภูม's screenshot).
  // MOMO's raw carries the real per-phase timestamps under `status_date`:
  //   fdatestatus2 (เข้าโกดังจีน)   ← status_date.kodang
  //   fdatestatus3 (ออกจากโกดังจีน) ← status_date.exported || prepare_export
  // fdatestatus3 stays null while the parcel is still in the China warehouse
  // (not yet exported) — the column then correctly shows "—".
  const warehouseDates = extractWarehouseDatesFromMomoRaw(srcRow.raw);
  // เข้าโกดัง: prefer the real kodang timestamp; fall back to the manifest
  // reference only when MOMO didn't supply it (older payloads).
  const fDateStatus2 = cleanDate(warehouseDates.kodang) ?? cleanDate(manifestDate);
  // ออกโกดัง: ONLY the real exported/prepare_export timestamp — never the
  // manifest fallback (an un-exported parcel must show no out-date).
  const fDateStatus3 = cleanDate(warehouseDates.exported);

  // fIDorCO — legacy uses 'CC'+productID. For MOMO Status Sync rows,
  // productID isn't in scope; use 'MO' (MOMO marker) + tracking suffix
  // to keep it unique + traceable. Distinguishes from legacy CC# rows.
  const fIDorCO = `MO${trackingNo}`.slice(0, 30);

  const smParts = (srcRow.momo_sack_no ?? "").split("-");
  const smPCS = smParts[0] ?? "";

  // fusercompany — 2026-05-30 evening ภูม flag: NULL violates the
  // NOT NULL constraint on tb_forwarder.fusercompany. Legacy PHP
  // (api-forwarder-momo.php L241-243) DID set $fUserCompany=NULL but
  // PHP string-interpolated it back as "" in the INSERT statement
  // (`'$fUserCompany'` → `''`). Result: legacy ended up writing empty
  // string for company customers. We match that here (verified in
  // prod tb_forwarder rows for PR124 / PR2503 / AIGA — all show "").
  // Convention: "" = company customer · "0" = individual customer.
  const fUserCompany = customer.userCompany === "1" ? "" : "0";

  const nowIso = new Date().toISOString();

  // ── 5. ATOMIC INSERT into tb_forwarder ────────────────────
  // Mirrors api-forwarder-manual.ts:429 — the canonical 51-column
  // INSERT. All status + cabinet + date fields written in ONE call.
  // This is what makes the legacy "feel automatic": admin clicks one
  // button → one INSERT → fstatus + fcabinetnumber + fdatetothai +
  // fdatecontainerclose flip together.
  const { data: row, error: insErr } = await admin
    .from("tb_forwarder")
    .insert({
      // ── core identity ─────────────────────────────────
      ftrackingchn:          trackingNo,
      famount:               metrics.qty,
      fdate:                 nowIso,
      userid:                customer.userID,
      fshipby:               d.fShipBy,
      ftransporttype:        fTransportType,
      adminidcreator:        legacyAdminId,
      subuserid:             d.subUserID ?? "",
      paymethod:             "1",
      fusercompany:          fUserCompany,
      priceother:            0,
      // fwarehousename: "8" = MOMO (per WAREHOUSE_LABEL in /admin/report-cnt/
      // [fNo]/page.tsx L55 — { "7": "Cargo Center", "8": "MOMO" }).
      // 2026-05-30 evening fix: previously hardcoded "7" with a misleading
      // comment ("MOMO = Cargo Center per legacy") — that comment was wrong
      // (a copy-paste from the CargoCenter manual entry form). Result on
      // /admin/report-cnt/[cabinet]: rows committed from MOMO showed
      // "Cargo Center (กวางโจว)" instead of "MOMO". ภูม flagged 2026-05-30.
      fwarehousename:        "8",
      // Date fields run through cleanDate (bug 2b) — Postgres rejects
      // "0000-00-00" / empty / invalid; coerce to null instead.
      fdatestatus2:          fDateStatus2,
      fdatestatus3:          fDateStatus3,
      fcosttotalpricesheet:  0,
      fstatus:               fStatusNew,

      // ── address ───────────────────────────────────────
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

      // ── package metrics (from MOMO raw) ────────────────
      fdatetothai:           fDateToThai,
      fweight:               metrics.weight,
      fwidth:                metrics.width,
      flength:               metrics.length,
      fheight:               metrics.height,
      fvolume:               metrics.cbm,
      ftransportprice:       0,
      fwarehousechina:       "1",       // กวางโจว default
      fproductstype:         d.fProductsType,
      fdiscount:             0,

      // ── cabinet + cost defaults ───────────────────────
      crate:                 "2",
      pricecrate:            0,
      ftransportpricechnthb: 0,
      pricemore:             "0",
      customrate:            "0",
      frefrate:              0,
      frefprice:             "0",
      ftotalprice:           0,
      customratekg:          0,
      customratecbm:         0,
      fcabinetnumber:        fCabinetNumber,
      fdatecontainerclose:   fDateContainerClose,        // null when no cabinet (bug 2b — was "0000-00-00")
      fidorco:               fIDorCO,
      famountcount:          1,
      smpcs:                 smPCS,

      // ── safe defaults for other NOT NULL cols ─────────
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
      session:               "admin-momo-review-commit",
      reforder:              "",
      fcredit:               "0",
      fsendsms1day:          "0",
      fsendsms3day:          "0",
      fsendsms3eday:         "0",
      fqc:                   "0",
      fqcprice:              0,
      linkapiorder:          "0",
      fstatuscaron:           "0",
      fstatuscaradminon:     "",
      fstatuscaroff:          "0",
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
    console.error(`[tb_forwarder insert] failed`, { code: insErr?.code, message: insErr?.message });
    return { ok: false, error: insErr?.message ?? "insert failed" };
  }

  // ── 6. Stamp committed_at on the source row ────────────────
  const { error: stampErr } = await admin
    .from("momo_import_tracks")
    .update({
      committed_at:           nowIso,
      committed_forwarder_id: row.id,
      committed_by:           ctx.committedBy,
      commit_userid:          customer.userID,
      updated_at:             nowIso,
    })
    .eq("id", srcRow.id);
  if (stampErr) {
    // Don't roll back the tb_forwarder insert — the row is real and
    // the customer notification has fired. Log the stamp failure
    // loudly so audit can reconcile.
    console.error(
      `[momo_import_tracks stamp] failed AFTER tb_forwarder INSERT (id=${row.id})`,
      { code: stampErr.code, message: stampErr.message },
    );
  }

  // ── 7. Audit log + revalidate ──────────────────────────────
  // admin_audit_log.admin_id is `uuid NOT NULL references profiles(id)` —
  // so the cron/system path (ctx.adminId === null) CANNOT write here. For
  // that path the momo_import_tracks stamp (committed_by=null = system) +
  // the momo_sync_logs "commit" row below are the audit trail.
  if (ctx.adminId) {
    await logAdminAction(
      ctx.adminId,
      "forwarder.momo_review.commit",
      "tb_forwarder",
      String(row.id),
      {
        momo_row_id:        srcRow.id,
        momo_tracking_no:   trackingNo,
        momo_container_no:  containerNo,                // MOMO routing batch ID (bug 2c)
        container_batch_no: srcRow.container_batch_no,  // real cabinet from container_closed.cid
        momo_sack_no:       srcRow.momo_sack_no,
        userid:             customer.userID,
        ship_by:            d.fShipBy,
        fStatusNew,
        fIDorCO,
        stamp_failed:       stampErr != null,
      },
    );
  }

  // Best-effort sync log for analytics (works for BOTH paths — created_by
  // is null for the cron/system path).
  try {
    await admin.from("momo_sync_logs").insert({
      sync_type:          "commit",
      status:             "success",
      import_track_count: 1,
      upserted_count:     1,
      created_by:         ctx.committedBy,
      errors:             [],
    });
  } catch (e) {
    console.error("[momo_sync_logs commit row] best-effort insert failed", e);
  }

  if (ctx.revalidate) {
    revalidatePath(`/admin/api-forwarder-momo`);
    revalidatePath(`/admin/api-forwarder-momo/review`);
    revalidatePath(`/admin/api-forwarder-momo/sync`);
    revalidatePath(`/admin/forwarders`);
    revalidatePath(`/admin/forwarders/${row.id}`);
  }

  return { ok: true, data: { forwarderId: row.id, fIDorCO } };
}

// ════════════════════════════════════════════════════════════
// commitMomoRowSystem — the cron/service-role entry point.
//
// Builds a system context (NO session) and calls the core. NEVER export
// this from a "use server" file — it bypasses admin auth, so exposing it
// as an RPC endpoint would let anyone INSERT tb_forwarder rows. It lives
// here (server-only, non-action module) and is called only by
// lib/admin/auto-commit-momo.ts under the cron's MOMO_CRON_AUTOCOMMIT gate.
// ════════════════════════════════════════════════════════════
export async function commitMomoRowSystem(
  rawInput: CommitMomoRowInput,
): Promise<AdminActionResult<{ forwarderId: number; fIDorCO: string }>> {
  return commitMomoRowCore(
    {
      adminId:       null,          // skip admin_audit_log (FK to profiles)
      legacyAdminId: "momo-cron",   // identifies cron-created tb_forwarder rows
      committedBy:   null,          // momo_import_tracks.committed_by = null = system
      revalidate:    false,         // cron loop; admin pages are force-dynamic
    },
    rawInput,
  );
}
