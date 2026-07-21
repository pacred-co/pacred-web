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
  extractCrateFromMomoRaw,
  extractCoverFromMomoRaw,
  extractCgFromMomoRaw,
} from "@/lib/admin/momo-raw-helpers";
import { computeAndFillForwarderImportRate } from "@/lib/forwarder/live-rate";
import { splitAggregatedMomoBoxRows } from "@/lib/integrations/momo-web/split-box-rows";
// Base/suffix parsing for the family-aware dedup (4a½) — pure module, same parser
// the split/absorb machinery uses, so the two sides can never disagree on shape.
import {
  baseOf as momoBaseOf,
  suffixOf as momoSuffixOf,
} from "@/lib/integrations/momo-web/split-box-rows-plan";
// Disjoint-lots discriminator (bare = its OWN lot beside suffixed siblings ·
// 908007350691 = 6 กล่อง) — the SAME brain the ตรวจตู้ display uses, so the
// commit guard and the family Σ can never disagree on the shape.
import { approxEqualValue, isAdditiveLotBare } from "@/lib/admin/momo-bill-header";
import { resolveMomoBoxBasis } from "@/lib/integrations/momo-web/box-detail-basis";
import { derivePayMethodForDelivery } from "@/lib/forwarder/pay-method";
import { checkCarrierForProvince } from "@/lib/forwarder/carrier-coverage-guard";
import { isNonContainerCabinetId } from "@/lib/forwarder/cabinet-class";
import { ADDRESSES } from "@/components/seo/site";
import { parseCustomerAddressRow } from "@/lib/admin/customer-address-book";

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
const PAYMETHOD_OPTIONS    = ["1", "2"] as const; // 1=ต้นทาง (pay-at-origin) · 2=ปลายทาง (COD)

export const commitMomoRowSchema = z.object({
  rowId:        z.string().uuid("rowId ต้องเป็น uuid"),
  userID:       z.string().trim().regex(/^PR\d+$/i, "userID ต้องเป็น PR####").max(20),
  subUserID:    z.string().trim().max(20).optional().default(""),
  // ภูม 2026-06-25 ("ตัดออก") — ขนส่งเป็น optional ตอน commit MOMO. ว่าง = ยังไม่ระบุ
  // → เซล/ลูกค้ากรอกที่อยู่จัดส่ง+เลือกขนส่งเองภายหลัง (เลิก default "รับเองโกดัง").
  fShipBy:      z.string().trim().max(10),
  fProductsType: z.enum(PRODUCT_TYPE_OPTIONS),
  fTransportType: z.enum(TRANSPORT_OPTIONS).optional(),
  fAmount:      z.number().int().min(1).max(10000).optional().default(1),
  addressID:    z.number().int().positive().nullable().optional(),
  // payMethod — '1'=ต้นทาง · '2'=ปลายทาง (COD). OPTIONAL: the admin /review
  // path OMITS it → defaults to '1' (legacy behaviour, unchanged). The MOMO
  // cron path derives it from the carrier (derivePayMethod) so an upcountry
  // order gets '2' (เก็บเงินปลายทาง) per ภูม's province rule (Issue 4 v2).
  payMethod:    z.enum(PAYMETHOD_OPTIONS).optional(),
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
      // weight_kg/cbm/quantity = the container_closed AGGREGATE (Σ track_details ·
      // sync.ts aggregateTrackDetailMetrics) — ภูม 2026-07-13: value the row from THESE,
      // not the first-box `raw` (raw carried only box-1 when MOMO's feed dropped the
      // -2..-N siblings → ~5× under-bill · e.g. 800206224068 raw.kg=46.5 vs true 249).
      "id, momo_tracking_no, momo_container_no, container_batch_no, momo_sack_no, shipment_status, raw, weight_kg, cbm, quantity, momo_updated_at, committed_at, committed_forwarder_id",
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
      weight_kg:              number | string | null;
      cbm:                    number | string | null;
      quantity:               number | null;
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
    const usable = parseCustomerAddressRow(addrRow);
    if (!usable.data) return { ok: false, error: `ที่อยู่ของสมาชิกไม่ครบถ้วน: ${usable.error}` };
    addr = usable.data;
  } else {
    // Fallback: tb_address_main → tb_address.
    const { data: main, error: mainErr } = await admin
      .from("tb_address_main")
      .select("addressid")
      .eq("userid", customer.userID)
      .maybeSingle<{ addressid: number }>();
    if (mainErr) {
      console.error(`[tb_address_main lookup] failed`, { code: mainErr.code, message: mainErr.message });
      return { ok: false, error: `db_error:${mainErr.code ?? "unknown"}` };
    }
    if (!main?.addressid) {
      return { ok: false, error: "ลูกค้ายังไม่มีที่อยู่หลัก — บันทึกที่อยู่ก่อนสร้างงานนำเข้า" };
    }
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
      return { ok: false, error: `db_error:${addrRowErr.code ?? "unknown"}` };
    }
    if (!addrRow) {
      return { ok: false, error: "ที่อยู่หลักของลูกค้าไม่พร้อมใช้งาน — กรุณาเลือก/บันทึกใหม่" };
    }
    const usable = parseCustomerAddressRow(addrRow);
    if (!usable.data) return { ok: false, error: `ที่อยู่หลักของลูกค้าไม่ครบถ้วน: ${usable.error}` };
    addr = usable.data;
  }

  // 🔴 CLOSED LIST (owner 2026-07-14) — a ขนส่งเอกชน chosen at commit time must be in the
  // owner's workbook, and must run in the resolved delivery province. An empty
  // carrier is still allowed for later assignment, but a reusable address is no
  // longer optional: address-less MOMO rows fail before this coverage check.
  {
    const coverage = checkCarrierForProvince(d.fShipBy, addr.addressprovince);
    if (!coverage.ok) return { ok: false, error: coverage.error };
  }

  // ── 4. Derive cargo fields from MOMO source row ────────────
  const trackingNo  = srcRow.momo_tracking_no;
  // ภูม flag 2026-05-30 (bug 2c): use ONLY the joined REAL cabinet (cid from
  // container_closed · e.g. "GZS260525-2"), what `container_batch_no` holds.
  //
  // A1 (2026-07-13 · logic): DROP the momo_container_no fallback. momo_container_no is
  // MOMO's ROUTING BATCH ID (e.g. "PR20260712-EK01"), NOT a real PCS cabinet — propagate.ts
  // explicitly REFUSES to write it (it links to no /admin/report-cnt/[cabinet] page + traps
  // the column so the real cid can never be written later). Writing it here ALSO over-advanced
  // fstatus to '3' (hasContainer) even when MOMO's status was TRUCK_CLOSED → '2', and the
  // forward-only propagate can't demote it. With no fallback the row stays fstatus '2' with an
  // EMPTY cabinet until MOMO's real cid arrives, then propagate fills the real cabinet + advances
  // status from MOMO's real signal — no phantom cabinet, no over-advance. (containerNo below
  // still keeps momo_container_no separately for the momo_container_no column; and transport-mode
  // derivation already reads container_batch_no only, so no mode regression.)
  // Tier guard (owner 2026-07-20 · cabinet-class SOT): container_batch_no must be a
  // ตู้. If upstream ever hands a sack (CBX…)/routing-placeholder instead, keep
  // fcabinetnumber EMPTY — propagate fills the real ตู้ later. กระสอบ ≠ ตู้.
  const rawCabinetBatch = (srcRow.container_batch_no ?? "").trim();
  const cabinetForDisplay = isNonContainerCabinetId(rawCabinetBatch) ? "" : rawCabinetBatch;
  const containerNo = srcRow.momo_container_no ?? "";
  // ภูม 2026-07-13 (MONEY · ~5× under-bill fix) — value the row from the momo_import_tracks
  // AGGREGATE columns (weight_kg/cbm/quantity = Σ of all the shipment's boxes, set by the
  // container_closed propagate) and fall back to the first-box `raw` only when a column is
  // empty (pre-close single-box rows where column==raw anyway). Was: extractMetricsFromMomoRaw
  // alone → when MOMO's feed delivered only the bare base parcel (raw.kg = box 1) it billed
  // box 1's weight (46.5) instead of the whole shipment (249). Dims stay from raw (the
  // aggregate carries none; real per-box dims arrive with the box-split below).
  const rawMetrics  = extractMetricsFromMomoRaw(srcRow.raw);
  const colW = Number(srcRow.weight_kg);
  const colV = Number(srcRow.cbm);
  const colQ = Number(srcRow.quantity);
  const metrics = {
    ...rawMetrics,
    weight: colW > 0 ? colW : rawMetrics.weight,
    cbm:    colV > 0 ? colV : rawMetrics.cbm,
    qty:    colQ > 0 ? Math.round(colQ) : rawMetrics.qty,
  };
  // ── Crate (ตีลังไม้) — owner PR999: derive from MOMO real data ──────
  // MOMO sends an explicit crate signal (raw.wooden_create boolean +
  // raw.extra_cost fee); the old code IGNORED it and hardcoded "no crate".
  // extractCrateFromMomoRaw maps it to the legacy tb_forwarder.crate HEADER
  // convention ('1'=ตีลังไม้ · '2'=ไม่ตี · function.php L1691) and carries
  // extra_cost as the candidate pricecrate. DEFAULT-SAFE: anything other than
  // wooden_create===true → "2"/0 (we never invent a crate signal). The admin
  // adminUpdateForwarderCratePrice editor (editable all statuses) overrides
  // this initial value — propagate.ts never touches crate/pricecrate.
  const momoCrate = extractCrateFromMomoRaw(srcRow.raw);
  // ── Cover image (owner 2026-07-06) — first URL from MOMO raw.images ──────
  // The old code hardcoded fcover="" so forwarder rows never showed a picture.
  // MOMO sends full external URLs (momocargo.com); resolveLegacyUrl passes those
  // through unchanged so forwarder-check / report-cnt render them directly.
  // DEFAULT-SAFE: no images → "" (no regression). Display/data only.
  const momoCover = extractCoverFromMomoRaw(srcRow.raw);
  // CG box numbers (owner 2026-07-19 "เลขกล่อง") — carry them into tb_forwarder.fbox_mark
  // so the physical box identity survives the commit (was dropped · display/data only).
  const momoCg = extractCgFromMomoRaw(srcRow.raw);
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

  // reforder links a forwarder back to its originating ฝากสั่งซื้อ order
  // (tb_header_order.hno). MOMO-commit parcels aren't spawned from a shop
  // order, so this stays "" here — but we name it so the order-advance
  // best-effort below (LANE B step 3 · owner 2026-06-16) reads ONE source of
  // truth, and stays correct if a future commit path ever carries a reforder.
  const reforderValue = "";

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

  // ── 4a½. DEDUP vs the EXISTING tb_forwarder FAMILY (Fix F 2026-07-13 ·
  //         cross-shape upgrade 2026-07-18 owner "ไม่เบิ้ลกล่อง ก็เบิ้ลคิว") ──
  // 💰 The 4b claim below only guards THIS staging row against a double-commit;
  // it cannot see a forwarder row that another path already created (manual
  // /review click on an older staging row · quick-add · แต้ม reconcile). The
  // autocommit cron pre-checks in a BATCH read (auto-commit-momo.ts step 4),
  // but that is read-at-load (TOCTOU) and fails OPEN on a lookup error — so
  // re-assert at the single chokepoint EVERY commit path funnels through.
  //
  // THREE dup shapes (PR050 519218029029 = the cross-shape case: MOMO re-keyed
  // the parcel base → "-1/2"/"-2/2" mid-flight, and each box was committed as
  // an INDEPENDENT row → every group Σ double-counted, หน้าบ้าน+หลังบ้าน):
  //   1. EXACT — a live row with this very tracking → refuse (Fix F เดิม).
  //   2. incoming SUFFIXED "-i/n" + a live BARE base row → the shipment already
  //      exists as an aggregate → refuse; the split/absorb pass (split-box-rows)
  //      owns the aggregate→boxes conversion. Committing here would stack an
  //      independent box row on top of the aggregate = the double-count.
  //   3. incoming BARE + live SUFFIXED rows → the boxes already exist → refuse
  //      (a late bare header would re-create the empty-aggregate residue).
  // Live = fstatus not ''/'0' (checkNotDuplicateTracking semantics · cleared
  // rows never block). A suffixed incoming NEVER blocks on a DIFFERENT suffixed
  // sibling (multi-box commits of distinct boxes stay allowed).
  const familyBase = momoBaseOf(trackingNo);
  const { data: dupRows, error: dupErr } = await admin
    .from("tb_forwarder")
    .select("id, fstatus, ftrackingchn, fweight")
    .or(`ftrackingchn.eq.${familyBase},ftrackingchn.like.${familyBase}-%`)
    .limit(40);
  if (dupErr) {
    // Fail CLOSED — a billable INSERT must not proceed on an unverifiable dedup.
    console.error(`[tb_forwarder dedup lookup] failed`, { code: dupErr.code, message: dupErr.message });
    return { ok: false, error: `db_error:${dupErr.code ?? "unknown"}` };
  }
  // Exact-base filter (the .like can catch a longer tracking sharing the prefix —
  // base "178055573" vs "1780555731") + live-only.
  const family = ((dupRows ?? []) as Array<{ id: number; fstatus: string | null; ftrackingchn: string | null; fweight: number | string | null }>)
    .filter((r) => momoBaseOf(String(r.ftrackingchn ?? "")) === familyBase)
    .filter((r) => r.fstatus != null && r.fstatus !== "0" && r.fstatus !== "");
  const incomingSuffix = momoSuffixOf(trackingNo);
  const liveExact = family.find((r) => String(r.ftrackingchn ?? "").trim() === trackingNo);
  if (liveExact) {
    return {
      ok: false,
      error: `tracking นี้มีในระบบแล้ว (tb_forwarder #${liveExact.id} · fstatus=${liveExact.fstatus}) — ไม่สร้างแถวซ้ำ`,
    };
  }
  if (incomingSuffix > 0) {
    const liveBare = family.find((r) => momoSuffixOf(String(r.ftrackingchn ?? "")) === 0);
    if (liveBare) {
      return {
        ok: false,
        error: `shipment นี้มีแถวรวมอยู่แล้ว (tb_forwarder #${liveBare.id}) — ห้าม commit กล่อง "-${incomingSuffix}/n" ซ้อน (ระบบ box-split/absorb จะแตกกล่องให้เอง)`,
      };
    }
  } else {
    const liveSuffixed = family.filter((r) => momoSuffixOf(String(r.ftrackingchn ?? "")) > 0);
    if (liveSuffixed.length > 0) {
      // ── DISJOINT-LOTS exception (owner + CS 2026-07-21 · 908007350691 = 6 กล่อง) ──
      // MOMO sometimes keys ONE shipment as TWO REAL LOTS: the BARE tracking is its
      // own multi-box lot (908007350691 = 5 กล่อง · 112.5kg) beside a live suffixed
      // lot ("-2" = 1 กล่อง · 10.5kg · already committed). The blanket refusal below
      // would strand the bare lot forever (5 กล่องไม่มีทางเข้าระบบ = เก็บเงินขาด).
      // ALLOW the bare commit ONLY when BOTH corroborations hold (fail-CLOSED —
      // any lookup error / missing signal → the proven refusal stands):
      //   1. momo_box_detail lists the bare AS ITS OWN BOX LINE whose resolved
      //      total ≈ the incoming staged weight (the bare carries ITS OWN value —
      //      an aggregate/re-key header is never listed as a box of itself), AND
      //   2. the incoming weight is DISJOINT from Σ(live suffixed fweight) — a
      //      bare ≈ Σ boxes is the late aggregate header → still refused (that is
      //      the PR050 residue class this guard exists for).
      // Same discriminator as the display side (isAdditiveLotBare · one brain).
      let disjointLotOk = false;
      const liveSuffixSum = liveSuffixed.reduce((s, r) => s + (Number(r.fweight) || 0), 0);
      const incomingWt = Number(metrics.weight) || 0;
      if (incomingWt > 0 && !approxEqualValue(incomingWt, liveSuffixSum)) {
        const { data: bareBoxRows, error: bareBoxErr } = await admin
          .from("momo_box_detail")
          .select("box_tracking, width, length, height, weight_kg, cbm, quantity")
          .eq("base_tracking", familyBase)
          .eq("box_tracking", trackingNo)
          .limit(2);
        if (bareBoxErr) {
          console.error(`[disjoint-lot bare-box lookup] failed`, { code: bareBoxErr.code, message: bareBoxErr.message });
        } else {
          const bb = (bareBoxRows ?? [])[0] as
            | { width: number | string | null; length: number | string | null; height: number | string | null;
                weight_kg: number | string | null; cbm: number | string | null; quantity: number | string | null }
            | undefined;
          if (bb) {
            const basis = resolveMomoBoxBasis({
              width: Number(bb.width) || 0, length: Number(bb.length) || 0, height: Number(bb.height) || 0,
              weightKg: Number(bb.weight_kg) || 0, cbm: Number(bb.cbm) || 0, quantity: Number(bb.quantity) || 0,
            });
            disjointLotOk =
              basis.totalWeightKg > 0 &&
              approxEqualValue(basis.totalWeightKg, incomingWt) &&
              isAdditiveLotBare({ bareValue: incomingWt, siblingValueSum: liveSuffixSum, bareHasOwnBox: true });
            if (disjointLotOk) {
              console.log(
                `[commit-momo] disjoint-lot bare allowed: ${trackingNo} (${incomingWt}kg = own box lot) beside live suffixed Σ${liveSuffixSum}kg (${liveSuffixed.map((r) => `#${r.id}`).join(", ")})`,
              );
            }
          }
        }
      }
      if (!disjointLotOk) {
        return {
          ok: false,
          error: `tracking นี้มีแถวกล่อง (-i/n) อยู่แล้ว (${liveSuffixed.map((r) => `#${r.id}`).join(", ")}) — ไม่สร้างแถวรวมซ้อน`,
        };
      }
    }
  }

  // ── 4b. ATOMICALLY CLAIM the source row before the billable INSERT ──
  // 💰 TOCTOU fix (2026-06-14 forwarder-fidelity audit): the L225 committed_at
  // check is read-at-load, so two concurrent commits (double-click / stale
  // resubmit / cron racing an admin) both pass it and both INSERT, producing
  // TWO billable tb_forwarder rows for ONE parcel (there is no UNIQUE on
  // ftrackingchn). Claim the row with a conditional UPDATE WHERE committed_at
  // IS NULL — exactly one caller wins; a 0-row result means it is already
  // claimed → abort BEFORE the INSERT. committed_forwarder_id is back-filled
  // in step 6 after the row exists; if the INSERT fails we release the claim.
  const { data: claimed, error: claimErr } = await admin
    .from("momo_import_tracks")
    .update({
      committed_at:  nowIso,
      committed_by:  ctx.committedBy,
      commit_userid: customer.userID,
      updated_at:    nowIso,
    })
    .eq("id", srcRow.id)
    .is("committed_at", null)
    .select("id")
    .maybeSingle<{ id: string }>();
  if (claimErr) {
    console.error(`[momo_import_tracks claim] failed`, { code: claimErr.code, message: claimErr.message });
    return { ok: false, error: `db_error:${claimErr.code ?? "unknown"}` };
  }
  if (!claimed) {
    return { ok: false, error: "row นี้ถูก commit แล้ว (มีผู้ทำรายการพร้อมกันหรือกดซ้ำ)" };
  }

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
      // paymethod — '1'=ต้นทาง (pay-at-origin) · '2'=ปลายทาง (เก็บเงินปลายทาง / COD).
      // MOMO cron supplies d.payMethod (zone-aware). Admin /review omits it → derive
      // zone-aware from carrier+address zip (external courier upcountry → COD;
      // self-pickup 'PCS'/own-fleet → ต้นทาง via the own-fleet guard).
      paymethod:             d.payMethod ?? derivePayMethodForDelivery(d.fShipBy, { addressID: null, zip: addr.addresszipcode }),
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
      // crate/pricecrate DERIVED from MOMO raw (owner PR999) — legacy header
      // convention '1'=ตีลังไม้ · '2'=ไม่ตี (function.php L1691). Default-safe
      // to "2"/0 when MOMO sends no wooden_create=true. Admin editor overrides.
      crate:                 momoCrate.crate,
      pricecrate:            momoCrate.pricecrate,
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
      fcover:                momoCover,
      fbox_mark:             momoCg,
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
      reforder:              reforderValue,
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
    // Release the step-4b claim so the parcel can be re-committed after the
    // failure (else it is stuck "committed" with no forwarder behind it).
    await admin
      .from("momo_import_tracks")
      .update({ committed_at: null, committed_by: null, commit_userid: null, updated_at: nowIso })
      .eq("id", srcRow.id);
    return { ok: false, error: insErr?.message ?? "insert failed" };
  }

  // ── 5b. Auto-compute the China→Thailand import rate (faithful port of
  //         legacy api-forwarder-momo.php → calPriceForwarder). The INSERT
  //         above lands frefrate=0 / frefprice='0' / ftotalprice=0; without
  //         this the admin detail page shows "ไม่พบข้อมูล" + ฿0.00. The helper
  //         runs the SAME rate waterfall the admin dimension-edit save uses
  //         and writes ONLY frefrate/frefprice/ftotalprice (money-isolated).
  //
  //   BEST-EFFORT: a rate-compute miss (no rate card for the customer's
  //   warehouse/transport/product tuple, or a transient DB error) must NEVER
  //   fail the commit — the forwarder row is already real + the customer
  //   notification has fired. The helper never persists a silent ฿0 (it
  //   skips the write on rateMissing), so leaving the row at 0 is safe and an
  //   admin can still set the rate manually via the edit form.
  try {
    const rateRes = await computeAndFillForwarderImportRate(admin, row.id);
    if (!rateRes.ok) {
      console.error(`[momo commit: auto-rate] did not resolve (id=${row.id})`, {
        reason: rateRes.reason,
      });
    }
  } catch (e) {
    console.error(`[momo commit: auto-rate] threw AFTER tb_forwarder INSERT (id=${row.id})`, e);
  }

  // ── 5b. Split the shipment into its N scannable box sub-rows (ภูม 2026-07-13) ──
  // MOMO sends one shipment as N boxes (e.g. 800206224068, -2..-8) — each must be its
  // OWN scannable tb_forwarder row (โกดัง ยิงรับเข้าตามเลขกล่อง 800206224068-3). This
  // replaces the on-demand "แตกกล่อง" button (removed) with split-at-import. Now that
  // FIX 1 values the aggregate correctly (Σ == Σ momo_box_detail), the split passes its
  // weight-Σ guard → produces the sub-rows. MONEY-NEUTRAL: allowPriced preserves the
  // priced ftotalprice across the siblings (anchor absorbs the satang · Σ-drift-guarded);
  // shipment-level money (ค่าส่งไทย/เหมาๆ/ตีลัง) stays on the anchor only = ONE customer
  // bill. Best-effort — a miss (e.g. momo_box_detail not synced yet) never fails the
  // commit; the cron liveBoxSplit pass (allowPriced) retries. No-op for single-box.
  try {
    await splitAggregatedMomoBoxRows(admin, [trackingNo], undefined, { allowPriced: true });
  } catch (e) {
    console.error(`[momo commit: box-split] threw (tracking=${trackingNo})`, e);
  }

  // ── 6. Back-fill the forwarder id on the already-claimed source row ──
  // committed_at / committed_by / commit_userid were set atomically in the
  // step-4b claim; only committed_forwarder_id remains to record.
  const { error: stampErr } = await admin
    .from("momo_import_tracks")
    .update({
      committed_forwarder_id: row.id,
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

  // ── 6b. Shop-order status is intentionally NOT written here ──────────────
  // The tb_forwarder INSERT already fires the canonical aggregate trigger
  // (migration 0268). The old direct 4→40 write advanced the WHOLE order when
  // only one shop arrived, bypassing the every-shop/every-token rule (P22328).
  // All writers now converge through derive_shop_order_status instead.

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
