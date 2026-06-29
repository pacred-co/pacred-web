"use server";

/**
 * Admin > MOMO > "พัสดุที่ขาด" — add ONE missing closed-container parcel to
 * tb_forwarder (2026-06-29 · ภูม).
 *
 * THE BUG THIS SOLVES
 * ───────────────────
 * MOMO's `import/track` API only returns parcels in the FIRST status. A parcel
 * that advances (ถึงโกดังจีน → กำลังส่งมาไทย) drops out of that feed, so the sync
 * never lands its `tb_forwarder` row — even though MOMO's `container/closed`
 * feed still lists it (with weight/cbm in `track_details[]`, but WITHOUT the
 * customer member code). Example: parcel KY982669997 = customer PR145, real
 * parcel, but no tb_forwarder row. Staff (ภูม) reads the member code off MOMO's
 * own web UI → this action lets them fill it in → create the billable row.
 *
 * WHY THIS ISN'T `commitMomoRowCore`
 * ──────────────────────────────────
 * `commitMomoRowCore` (lib/admin/commit-momo-row-core.ts) starts from a
 * `momo_import_tracks` row (it takes a `rowId`). The missing parcels here are
 * EXACTLY the ones that never reached `momo_import_tracks` — so there's no
 * source row to claim. We therefore build the `tb_forwarder` INSERT directly,
 * mirroring commit-momo-row-core's EXACT field set so a manually-added parcel
 * is byte-identical to an auto-committed one (same fusercompany convention,
 * same fwarehousename "8", same fstatus, same NOT-NULL defaults, same
 * varchar(10)-safe admin ids). The lead reviews this field set line-by-line.
 *
 * MONEY-SAFETY (the lead reviews this):
 *   - GUARD 1 (dedup, TOCTOU-aware) — SELECT by base ftrackingchn → abort if
 *     a row already exists. (tb_forwarder has no UNIQUE on ftrackingchn, so a
 *     concurrent double-submit could still slip past a read-then-insert; the
 *     subsequent re-load on the page hides the dup and the lead can reconcile.
 *     We keep the same read-then-insert posture the manual-add path uses.)
 *   - GUARD 2 (member-validate) — the member code MUST exist in tb_users
 *     (.eq("userID", …)) → abort otherwise. This drives fusercompany too.
 *   - The INSERT lands frefrate/frefprice/ftotalprice = 0; the BEST-EFFORT
 *     auto-rate fill (computeAndFillForwarderImportRate) prices it the same way
 *     the MOMO commit + manual-add do. A rate miss NEVER fails the create (the
 *     admin can still set the rate on the edit form); the helper never persists
 *     a silent ฿0.
 *
 * @see lib/admin/commit-momo-row-core.ts — the canonical field set this mirrors
 * @see app/api/admin/momo/container-closed/route.ts — where the missing parcels come from
 * @see app/api/admin/momo/track-completeness/route.ts — which parcels are already in tb_forwarder
 */

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";
import { deriveTransportTypeFromCabinet } from "@/lib/admin/momo-raw-helpers";
import { computeAndFillForwarderImportRate } from "@/lib/forwarder/live-rate";
import { bustAdminChrome } from "@/lib/cache/revalidate-chrome";

// ────────────────────────────────────────────────────────────
// Zod schema — NOT exported ("use server" files only export async fns).
// The client supplies the per-parcel facts read off the MOMO container_closed
// feed (tracking · cabinet · weight · cbm · shipBy) + the member code staff
// read off the MOMO web UI.
// ────────────────────────────────────────────────────────────
const SHIP_BY_OPTIONS = ["car", "ship", "air"] as const;

const addMissingMomoParcelSchema = z.object({
  // The MOMO reTrack as shown in container_closed.track_details — may carry a
  // "-i/n" split suffix; we strip it to the base before any DB touch.
  tracking:   z.string().trim().min(1, "ต้องมีเลขแทรกกิ้ง").max(60),
  cabinet:    z.string().trim().min(1, "ต้องมีเลขตู้").max(40),
  memberCode: z.string().trim().regex(/^PR\d+$/i, "รหัสลูกค้าต้องเป็น PR####").max(20),
  // Weights/volumes from the closed-container weigh-in. Bound generously but
  // finitely (a fat-finger 5→5,000,000 can't pass) — same posture as the
  // manual-add range guards.
  weightKg:   z.number().nonnegative("น้ำหนักต้องไม่ติดลบ").max(1_000_000, "น้ำหนักเกินช่วงที่รับได้"),
  cbm:        z.number().nonnegative("คิวต้องไม่ติดลบ").max(100_000, "คิวเกินช่วงที่รับได้"),
  // raw MOMO ship_by ("car"/"ship"/"air") — only used as the LAST-resort
  // transport-mode fallback when the cabinet code can't decide. Optional.
  shipBy:     z.enum(SHIP_BY_OPTIONS).optional(),
});

export type AddMissingMomoParcelInput = z.input<typeof addMissingMomoParcelSchema>;

/** Strip a MOMO "-i/n" (or "-i") split suffix → base tracking (matches the API route). */
function baseTrackingOf(re: string): string {
  return re.trim().replace(/-\d+(\/\d+)?$/, "");
}

/**
 * resolveLegacyAdminId — same pattern as momo-commit.ts / api-forwarder-manual.ts.
 * `tb_forwarder.adminid*` columns are varchar(10) → the caller clips to 10. We
 * NEVER write the long profiles uuid into those columns (a real past bug).
 */
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

/** round to N decimals without float drift in the obvious cases. */
function roundTo(value: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * f) / f;
}

export async function addMissingMomoParcel(
  rawInput: unknown,
): Promise<AdminActionResult<{ fid: number; fIDorCO: string }>> {
  return withAdmin<{ fid: number; fIDorCO: string }>(
    ["super", "ops", "warehouse", "accounting"],
    async ({ adminId }) => {
      const parsed = addMissingMomoParcelSchema.safeParse(rawInput);
      if (!parsed.success) {
        return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
      }
      const d = parsed.data;

      const admin         = createAdminClient();
      const legacyAdminId = (await resolveLegacyAdminId()).slice(0, 10);

      const base    = baseTrackingOf(d.tracking);
      const cabinet = d.cabinet.trim();
      const userID  = d.memberCode.toUpperCase();

      // ── GUARD 1 — dedup (read-then-insert, base-tracking keyed) ──────────
      // tb_forwarder.ftrackingchn holds the BASE tracking (e.g. "KY982669997",
      // not "KY982669997-1/2"). If a billable row already exists for this base,
      // abort — never create a 2nd billable row for one parcel.
      const { data: dup, error: dupErr } = await admin
        .from("tb_forwarder")
        .select("id")
        .eq("ftrackingchn", base)
        .limit(1)
        .maybeSingle<{ id: number }>();
      if (dupErr) {
        console.error(`[momo-add-missing dup-check] failed`, { code: dupErr.code, message: dupErr.message });
        return { ok: false, error: `ตรวจสอบรายการซ้ำไม่สำเร็จ: ${dupErr.message}` };
      }
      if (dup) {
        return { ok: false, error: `พัสดุนี้มีในระบบแล้ว (#${dup.id})` };
      }

      // ── GUARD 2 — validate member (drives fusercompany too) ─────────────
      // Mirror commit-momo-row-core step 2: .eq("userID", …) selecting
      // userCompany so the fusercompany convention matches exactly.
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
        return { ok: false, error: `ไม่พบรหัสลูกค้า ${userID} ในระบบ` };
      }

      // ── Derive the cargo fields (mirror commit-momo-row-core) ───────────
      // This parcel is in a CLOSED container → it always has a cabinet → the
      // legacy "feel automatic" status is "3" (ออกจากโกดังจีน / in transit),
      // exactly like commit-momo-row-core when hasContainer === true.
      const fStatusNew = "3";

      // Transport mode: prefer the REAL cabinet (GZS=เรือ "2" / GZE=รถ "1" — the
      // physical truth, since per-parcel ship_by can be MOMO-miskeyed). Fall
      // back to ship_by only when the cabinet code is unknown. Default "1" (รถ)
      // if neither decides — matches deriveTransportTypeFromMomoRaw's default.
      const shipByLower    = (d.shipBy ?? "").toLowerCase();
      const fTransportType =
        deriveTransportTypeFromCabinet(cabinet) ??
        (shipByLower === "ship" ? "2" : "1");

      // fusercompany — "" = company customer · "0" = individual. EXACT mirror of
      // commit-momo-row-core L486 (NOT NULL constraint; legacy wrote "" for
      // company customers via PHP string-interpolation of NULL).
      const fUserCompany = customer.userCompany === "1" ? "" : "0";

      // fwarehousename "8" = MOMO (WAREHOUSE_LABEL in report-cnt).
      // fwarehousechina "1" = กวางโจว default.
      // fIDorCO — "MO" + base tracking, clipped to 30 (mirror core L473).
      const fIDorCO = `MO${base}`.slice(0, 30);

      const fWeight = roundTo(d.weightKg, 2);
      const fVolume = roundTo(d.cbm, 6);

      const nowIso   = new Date().toISOString();
      const todayIso = nowIso.slice(0, 10);

      // ── ATOMIC INSERT into tb_forwarder ─────────────────────────────────
      // EXACT field set of commit-momo-row-core's INSERT (the canonical 51-col
      // shape), specialised for a closed-container parcel:
      //   - fcabinetnumber = the closed cabinet · fstatus "3"
      //   - fdatecontainerclose = today (the MOMO confirmation point)
      //   - fdatestatus2 (เข้าโกดัง) = today · fdatestatus3 (ออกโกดัง) = today
      //     (it's already out — in a closed container heading to TH)
      //   - fdatetothai = today + 7 (รถ/EK) / +14 (เรือ/SEA) per the mode
      //   - address: EMPTY (เซล/ลูกค้ากรอกที่อยู่จัดส่งเองภายหลัง — same as the
      //     ภูม 2026-06-25 "ตัดออก" rule; never default to "รับเองโกดัง")
      //   - crate "2"/pricecrate 0 (no MOMO crate signal here; admin editor overrides)
      const daysAhead = fTransportType === "1" ? 7 : 14;
      const eta = new Date(`${todayIso}T00:00:00Z`);
      eta.setUTCDate(eta.getUTCDate() + daysAhead);
      const fDateToThai = eta.toISOString().slice(0, 10);

      const { data: row, error: insErr } = await admin
        .from("tb_forwarder")
        .insert({
          // ── core identity ─────────────────────────────────
          ftrackingchn:          base,
          famount:               1,
          fdate:                 nowIso,
          userid:                customer.userID,
          fshipby:               "",          // ยังไม่ระบุขนส่ง → เซล/ลูกค้าเลือกภายหลัง
          ftransporttype:        fTransportType,
          adminidcreator:        legacyAdminId,
          subuserid:             "",
          paymethod:             "1",         // ต้นทาง — legacy default (admin /review parity)
          fusercompany:          fUserCompany,
          priceother:            0,
          fwarehousename:        "8",         // MOMO
          fdatestatus2:          todayIso,    // เข้าโกดังจีน
          fdatestatus3:          todayIso,    // ออกจากโกดังจีน (already in a closed container)
          fcosttotalpricesheet:  0,
          fstatus:               fStatusNew,

          // ── address (EMPTY — sales/customer fills later) ──
          faddressname:          "",
          faddresslastname:      "",
          faddressno:            "",
          faddresssubdistrict:   "",
          faddressdistrict:      "",
          faddressprovince:      "",
          faddresszipcode:       "",
          faddressnote:          "",
          faddresstel:           "",
          faddresstel2:          "",

          // ── package metrics (from the closed-container weigh-in) ──
          fdatetothai:           fDateToThai,
          fweight:               fWeight,
          fwidth:                0,
          flength:               0,
          fheight:               0,
          fvolume:               fVolume,
          ftransportprice:       0,
          fwarehousechina:       "1",         // กวางโจว default
          fproductstype:         "1",         // ทั่วไป default (admin edits if needed)
          fdiscount:             0,

          // ── cabinet + cost defaults ───────────────────────
          crate:                 "2",         // ไม่ตีลังไม้ (no MOMO crate signal here)
          pricecrate:            0,
          ftransportpricechnthb: 0,
          pricemore:             "0",
          customrate:            "0",
          frefrate:              0,
          frefprice:             "0",
          ftotalprice:           0,
          customratekg:          0,
          customratecbm:         0,
          fcabinetnumber:        cabinet,
          fdatecontainerclose:   todayIso,
          fidorco:               fIDorCO,
          famountcount:          1,
          smpcs:                 "",

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
          session:               "admin-momo-add-missing",
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
        console.error(`[momo-add-missing insert] failed`, { code: insErr?.code, message: insErr?.message });
        return { ok: false, error: insErr?.message ?? "insert failed" };
      }

      // ── Auto-price (BEST-EFFORT) ────────────────────────────────────────
      // The INSERT lands frefrate=0 / frefprice='0' / ftotalprice=0; fill them
      // via the SAME money-isolated helper the MOMO commit + manual-add use, so
      // the admin detail page isn't ฿0. A rate miss NEVER fails the create (the
      // helper skips the write on rateMissing — never persists a silent ฿0).
      try {
        const rateRes = await computeAndFillForwarderImportRate(admin, row.id);
        if (!rateRes.ok) {
          console.error(`[momo-add-missing auto-rate] did not resolve (id=${row.id})`, { reason: rateRes.reason });
        }
      } catch (e) {
        console.error(`[momo-add-missing auto-rate] threw AFTER tb_forwarder INSERT (id=${row.id})`, e);
      }

      // ── Audit ───────────────────────────────────────────────────────────
      await logAdminAction(
        adminId,
        "forwarder.momo_add_missing.create",
        "tb_forwarder",
        String(row.id),
        {
          momo_tracking:    d.tracking,
          base_tracking:    base,
          cabinet,
          userid:           customer.userID,
          ship_by:          d.shipBy ?? null,
          ftransporttype:   fTransportType,
          fweight:          fWeight,
          fvolume:          fVolume,
          fIDorCO,
        },
      );

      // Refresh the admin sidebar queue badges (a new tb_forwarder row changes
      // the forwarder/queue counts). Best-effort — never fail the create.
      try {
        bustAdminChrome();
      } catch (e) {
        console.error("[momo-add-missing bustAdminChrome] best-effort failed", e);
      }

      return { ok: true, data: { fid: row.id, fIDorCO } };
    },
  );
}
