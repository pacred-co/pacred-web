"use server";

/**
 * Admin > MOMO review-grid commit actions — synthesis G1 (P0).
 *
 * Context: ภูม flag 2026-05-28 — *"ไม่เป็นโลจิก ไม่เป็นอัตโนมัติ"*. The
 * synthesis (`docs/research/legacy-deep-dive/_SYNTHESIS.md` §3 G1) named
 * the missing piece: legacy MOMO has a review-grid where admin clicks
 * "สร้างใหม่" per row → ONE atomic INSERT lands fStatus + fCabinetNumber
 * + fDateToThai + fDateContainerClose together. Pacred had the sync (ปอน
 * Wave 24) but no commit UX — so MOMO data sits in `momo_import_tracks`
 * with no path to `tb_forwarder`.
 *
 * What this file ships: two server actions —
 *   - commitMomoRowToForwarder(rowId, formData) → single-row commit
 *   - commitMomoRowsBatch(rowIds, defaultsByRow) → bulk-commit several
 *     prefilled rows at once
 *
 * Atomic INSERT pattern: every commit does ONE `.insert({...})` call on
 * `tb_forwarder` with all status + cabinet + date fields in the same
 * call — mirrors legacy `api-forwarder-momo.php:247` (the canonical
 * 51-column INSERT) and Pacred's existing `api-forwarder-manual.ts:429`.
 *
 * Isolation: writes ONLY to:
 *   - tb_forwarder (new row)
 *   - momo_import_tracks (committed_at + committed_forwarder_id stamps)
 *   - admin_audit_log
 *   - momo_sync_logs (best-effort audit row)
 * Reads from tb_users + tb_address + tb_address_main only.
 * NEVER touches cargo_* / any other legacy table.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";
import { getCurrentUser } from "@/lib/auth/get-user";

// ────────────────────────────────────────────────────────────
// resolveLegacyAdminId — same pattern as api-forwarder-manual.ts.
// `tb_forwarder.adminid*` columns are varchar(10) → clip to 10.
// ────────────────────────────────────────────────────────────
async function resolveLegacyAdminId(): Promise<string> {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) {
    console.error(`[supabase getUser] failed`, { code: error.code, message: error.message });
  }
  const email = user?.email ?? null;
  if (!email) return "system";

  const admin = createAdminClient();
  const { data, error: lookupErr } = await admin
    .from("tb_admin")
    .select("adminID")
    .eq("adminEmail", email)
    .maybeSingle<{ adminID: string | null }>();
  if (lookupErr) {
    console.error(`[tb_admin lookup] failed`, { code: lookupErr.code, message: lookupErr.message });
  }
  if (data?.adminID) return data.adminID;
  return email.slice(0, 10);
}

// ────────────────────────────────────────────────────────────
// PCS pickup address — same canonical block used in
// api-forwarder-manual.ts. Replicated here to avoid a "use server"
// cross-module re-export gotcha (Next 16 rejects ALL non-async-function
// value exports from "use server" files — see docs/learnings/nextjs-
// 16-quirks.md 2026-05-28). Keep one block per consumer.
//
// `addresstel` digits-only (varchar(10) in tb_forwarder) per Wave 23
// bug-fix.
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
  addresstel:         "024447046",
  addresstel2:        "",
  addressno:          "12 ซอย เพชรเกษม 77 แยก 3-6",
  addresssubdistrict: "หนองค้างพลู",
  addressdistrict:    "หนองแขม",
  addressprovince:    "กรุงเทพมหานคร",
  addresszipcode:     "10160",
  addressnote:        "",
};

// ────────────────────────────────────────────────────────────
// Zod schema — admin-supplied overrides for a single MOMO commit.
// The base row data (tracking · cabinet · dates) comes from
// momo_import_tracks; admin only needs to supply userID + shipBy +
// productsType (+ optional address). The atomic INSERT merges both.
// ────────────────────────────────────────────────────────────

const PRODUCT_TYPE_OPTIONS = ["1", "2", "3", "4"] as const;
const TRANSPORT_OPTIONS    = ["1", "2"] as const; // 1=EK truck, 2=SEA — legacy code values

// Wave 30 #2 — demoted from `export const` to plain const per Next 16
// "use server" rule: a "use server" file can only export async functions.
// Per docs/learnings/nextjs-16-quirks.md (Wave 25 #196 case study). Internal-
// only Zod schemas + types stay (types are erased at compile time).
const commitMomoRowSchema = z.object({
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
 * the defaults before the action body sees them.
 */
export type CommitMomoRowInput = z.input<typeof commitMomoRowSchema>;

// ────────────────────────────────────────────────────────────
// Helper: derive transport type code from MOMO's ship_by raw string.
// MOMO ships use "car"/"ship"/"air" — legacy tb_forwarder.ftransporttype
// uses "1" (truck/EK) or "2" (sea). Air rare in cargo — bucket to "1".
// ────────────────────────────────────────────────────────────
function deriveTransportTypeFromMomoRaw(raw: unknown): "1" | "2" {
  if (!raw || typeof raw !== "object") return "1";
  const r = raw as Record<string, unknown>;
  const shipBy = typeof r.ship_by === "string" ? r.ship_by.toLowerCase() : "";
  if (shipBy === "ship") return "2";
  return "1";
}

// ────────────────────────────────────────────────────────────
// Helper: extract package metrics (kg, cbm, w/l/h, qty) from MOMO raw.
// ────────────────────────────────────────────────────────────
function extractMetricsFromMomoRaw(raw: unknown): {
  weight: number; cbm: number; width: number; length: number; height: number; qty: number;
} {
  const empty = { weight: 0, cbm: 0, width: 0, length: 0, height: 0, qty: 1 };
  if (!raw || typeof raw !== "object") return empty;
  const r = raw as Record<string, unknown>;
  const num = (v: unknown): number => {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string") {
      const n = Number(v);
      return Number.isFinite(n) ? n : 0;
    }
    return 0;
  };
  return {
    weight: num(r.kg),
    cbm:    num(r.cbm),
    width:  num(r.width),
    length: num(r.length),
    height: num(r.height),
    qty:    Math.max(1, Math.round(num(r.quantity))),
  };
}

// ────────────────────────────────────────────────────────────
// commitMomoRowToForwarder — single-row commit (the main button)
// ────────────────────────────────────────────────────────────

export async function commitMomoRowToForwarder(
  rawInput: CommitMomoRowInput,
): Promise<AdminActionResult<{ forwarderId: number; fIDorCO: string }>> {
  const parsed = commitMomoRowSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  return withAdmin<{ forwarderId: number; fIDorCO: string }>(
    ["super", "ops", "warehouse"],
    async ({ adminId }) => {
      const admin            = createAdminClient();
      const legacyAdminIdRaw = await resolveLegacyAdminId();
      const legacyAdminId    = legacyAdminIdRaw.slice(0, 10);

      // ── 1. Load the source row from momo_import_tracks ────────
      const { data: srcRow, error: srcErr } = await admin
        .from("momo_import_tracks")
        .select(
          "id, momo_tracking_no, momo_container_no, momo_sack_no, shipment_status, raw, momo_updated_at, committed_at, committed_forwarder_id",
        )
        .eq("id", d.rowId)
        .maybeSingle<{
          id:                     string;
          momo_tracking_no:       string | null;
          momo_container_no:      string | null;
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
      const containerNo = srcRow.momo_container_no ?? "";
      const metrics     = extractMetricsFromMomoRaw(srcRow.raw);
      const fTransportType =
        d.fTransportType ?? deriveTransportTypeFromMomoRaw(srcRow.raw);

      // Legacy "feel automatic" atomicity:
      //   - fstatus: 2 if no manifest/container yet · 3 if container assigned
      //   - fcabinetnumber: containerNo (or '')
      //   - fdatetothai: today + 7 (EK) / +14 (SEA) when status=3
      //   - fdatecontainerclose: today (the MOMO confirmation point)
      //
      // Mirrors legacy api-forwarder-momo.php:151-170 logic. We collapse
      // into THE ONE atomic INSERT below.
      const hasContainer = !!containerNo;
      const fStatusNew = hasContainer ? "3" : "2";

      // Date fields. Legacy uses `manifest_date` from the SM payload —
      // MOMO Status Sync stores `momo_updated_at` (the latest status_date
      // timestamp from the raw). Use that as the manifest reference; if
      // missing, fall back to today.
      const todayIso = new Date().toISOString().slice(0, 10);
      const manifestDate = srcRow.momo_updated_at
        ? srcRow.momo_updated_at.slice(0, 10)
        : todayIso;

      let fDateToThai = "";
      let fDateContainerClose: string = "0000-00-00";
      let fCabinetNumber = "";
      const fDateStatus3 = hasContainer ? manifestDate : "";
      if (hasContainer) {
        const daysAhead = fTransportType === "1" ? 7 : 14;
        const eta = new Date(`${manifestDate}T00:00:00Z`);
        eta.setUTCDate(eta.getUTCDate() + daysAhead);
        fDateToThai = eta.toISOString().slice(0, 10);
        fDateContainerClose = manifestDate;
        fCabinetNumber = containerNo;
      }
      const fDateStatus2 = manifestDate;

      // fIDorCO — legacy uses 'CC'+productID. For MOMO Status Sync rows,
      // productID isn't in scope; use 'MO' (MOMO marker) + tracking suffix
      // to keep it unique + traceable. Distinguishes from legacy CC# rows.
      const fIDorCO = `MO${trackingNo}`.slice(0, 30);

      const smParts = (srcRow.momo_sack_no ?? "").split("-");
      const smPCS = smParts[0] ?? "";

      const fUserCompany = customer.userCompany === "1" ? null : "0";

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
          fwarehousename:        "7",       // MOMO = Cargo Center per legacy
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
          fdatetothai:           fDateToThai || null,
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
          fdatecontainerclose:   fDateContainerClose,
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
      const me = await getCurrentUser();
      const { error: stampErr } = await admin
        .from("momo_import_tracks")
        .update({
          committed_at:           nowIso,
          committed_forwarder_id: row.id,
          committed_by:           me?.id ?? null,
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
      await logAdminAction(
        adminId,
        "forwarder.momo_review.commit",
        "tb_forwarder",
        String(row.id),
        {
          momo_row_id:       srcRow.id,
          momo_tracking_no:  trackingNo,
          momo_container_no: containerNo,
          momo_sack_no:      srcRow.momo_sack_no,
          userid:            customer.userID,
          ship_by:           d.fShipBy,
          fStatusNew,
          fIDorCO,
          stamp_failed:      stampErr != null,
        },
      );

      // Best-effort sync log for analytics.
      try {
        await admin.from("momo_sync_logs").insert({
          sync_type:          "commit",
          status:             "success",
          import_track_count: 1,
          upserted_count:     1,
          created_by:         me?.id ?? null,
          errors:             [],
        });
      } catch (e) {
        console.error("[momo_sync_logs commit row] best-effort insert failed", e);
      }

      revalidatePath(`/admin/api-forwarder-momo`);
      revalidatePath(`/admin/api-forwarder-momo/review`);
      revalidatePath(`/admin/api-forwarder-momo/sync`);
      revalidatePath(`/admin/forwarders`);
      revalidatePath(`/admin/forwarders/${row.id}`);

      return { ok: true, data: { forwarderId: row.id, fIDorCO } };
    },
  );
}

// ────────────────────────────────────────────────────────────
// commitMomoRowsBatch — bulk commit the "สร้างทั้งหมด" button.
// Calls commitMomoRowToForwarder sequentially (not in parallel — the
// tb_forwarder unique constraint on tracking + foreign-key reads need
// stable ordering). Collects per-row results so the UI can show which
// succeeded / which failed.
// ────────────────────────────────────────────────────────────

const commitMomoBatchSchema = z.object({
  rows: z.array(commitMomoRowSchema).min(1).max(200),
});

export type CommitMomoBatchInput = z.input<typeof commitMomoBatchSchema>;

export type CommitMomoBatchResult = {
  total:    number;
  succeeded: number;
  failed:    number;
  results:  Array<{ rowId: string; ok: boolean; forwarderId?: number; error?: string }>;
};

export async function commitMomoRowsBatch(
  input: CommitMomoBatchInput,
): Promise<AdminActionResult<CommitMomoBatchResult>> {
  const parsed = commitMomoBatchSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_batch_input" };
  }

  return withAdmin<CommitMomoBatchResult>(
    ["super", "ops", "warehouse"],
    async () => {
      const results: CommitMomoBatchResult["results"] = [];
      let succeeded = 0;
      let failed = 0;
      for (const r of parsed.data.rows) {
        const res = await commitMomoRowToForwarder(r);
        if (res.ok) {
          succeeded++;
          results.push({ rowId: r.rowId, ok: true, forwarderId: res.data?.forwarderId });
        } else {
          failed++;
          results.push({ rowId: r.rowId, ok: false, error: res.error });
        }
      }
      return {
        ok: true,
        data: {
          total:     parsed.data.rows.length,
          succeeded,
          failed,
          results,
        },
      };
    },
  );
}
