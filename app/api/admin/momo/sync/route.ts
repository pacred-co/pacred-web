/**
 * POST /api/admin/momo/sync
 *
 * Body: { start: "YYYY-MM-DD", end: "YYYY-MM-DD", sackNo?: string }
 *
 * Real sync: fetches MOMO + normalizes + UPSERTS into the new MOMO-
 * isolated tables ONLY (`momo_import_tracks`, `momo_container_closed`,
 * `momo_sack_infos`), plus a row in `momo_sync_logs`.
 *
 * ⚠️ Per brief 2026-05-28 (ปอน):
 *   ✅ writes ONLY to momo_* tables
 *   ❌ NEVER writes to legacy cargo_* / tb_* / any existing table
 *   ❌ NEVER touches existing /api/cron/momo-sync (the cron-driver
 *      that writes to spine cargo_* — separate codepath, isolated)
 *
 * Guard: super/ops/warehouse/accounting.
 */

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminRoles } from "@/lib/auth/require-admin";
import { getCurrentUser } from "@/lib/auth/get-user";
import {
  getImportTrack,
  getContainerClosed,
  getSackInfo,
  mapImportTrackArray,
  mapContainerClosedArray,
  mapSackInfoSingle,
  type MomoInternalAdminRecord,
} from "@/lib/integrations/momo-isolated";
import { guardAdmin, errorStatus } from "../_shared";

export const dynamic = "force-dynamic";

type Body = { start?: unknown; end?: unknown; sackNo?: unknown };
type SyncError = { scope: string; error: string; message: string };

export async function POST(request: Request) {
  const denied = await guardAdmin();
  if (denied) return denied;

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    body = {};
  }
  const start  = typeof body.start  === "string" ? body.start  : null;
  const end    = typeof body.end    === "string" ? body.end    : null;
  const sackNo = typeof body.sackNo === "string" ? body.sackNo.trim() : "";
  const wantDateRange = !!(start && end);

  if (!wantDateRange && !sackNo) {
    return NextResponse.json(
      { ok: false, error: "MOMO_VALIDATION_ERROR", message: "ต้องส่ง start+end หรือ sackNo" },
      { status: 400 },
    );
  }

  if (wantDateRange) {
    const re = /^\d{4}-\d{2}-\d{2}$/;
    if (!re.test(start as string) || !re.test(end as string)) {
      return NextResponse.json(
        { ok: false, error: "MOMO_VALIDATION_ERROR", message: "start/end ต้องเป็น YYYY-MM-DD" },
        { status: 400 },
      );
    }
  }
  if (sackNo && !/^[A-Za-z0-9._-]+$/.test(sackNo)) {
    return NextResponse.json(
      { ok: false, error: "MOMO_VALIDATION_ERROR", message: "sackNo รูปแบบไม่ถูกต้อง" },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const me = await getCurrentUser();

  const errors: SyncError[] = [];
  let importTrackCount    = 0;
  let containerClosedCount = 0;
  let sackInfoCount       = 0;
  let upsertedCount       = 0;
  let failedCount         = 0;

  // ── 1. import_track ──
  let importMapped: MomoInternalAdminRecord[] = [];
  if (wantDateRange) {
    const res = await getImportTrack(start as string, end as string);
    if (res.ok) {
      importMapped = mapImportTrackArray(res.data);
      importTrackCount = importMapped.length;

      const upRows = importMapped
        .filter((r) => r.trackingNo) // upsert requires the unique key
        .map((r) => ({
          momo_tracking_no:  r.trackingNo,
          momo_sack_no:      r.sackNo,
          momo_container_no: r.containerNo,
          // ── 0118 mirror columns ──
          momo_user_code:    r.momoUserCode,
          momo_user_group:   r.momoUserGroup,
          momo_cg_no:        r.momoCgNo,
          ship_by:           r.shipBy,
          weight_kg:         r.weightKg,
          cbm:               r.cbm,
          quantity:          r.quantity,
          // ── status + range ──
          date_from:         start,
          date_to:           end,
          phase:             r.phase,
          shipment_status:   r.shipmentStatus,
          billing_status:    r.billingStatus,
          job_status:        r.jobStatus,
          issue_status:      r.issueStatus,
          admin_status_text: r.adminStatusText,
          current_location:  r.currentLocation,
          etd:               r.etd,
          eta:               r.eta,
          momo_updated_at:   r.momoUpdatedAt,
          raw:               r.raw as never,
          last_synced_at:    new Date().toISOString(),
          updated_at:        new Date().toISOString(),
        }));
      if (upRows.length > 0) {
        const { error: upErr } = await admin
          .from("momo_import_tracks")
          .upsert(upRows, { onConflict: "momo_tracking_no" });
        if (upErr) {
          failedCount += upRows.length;
          errors.push({
            scope:   "import_track_upsert",
            error:   "MOMO_DB_UPSERT_FAILED",
            message: upErr.message,
          });
        } else {
          upsertedCount += upRows.length;
        }
      }
    } else {
      errors.push({ scope: "import_track", error: res.error, message: res.message });
    }

    // ── 2. container_closed ──
    const ccRes = await getContainerClosed(start as string, end as string);
    if (ccRes.ok) {
      const mapped = mapContainerClosedArray(ccRes.data);
      containerClosedCount = mapped.length;

      const upRows = mapped
        .filter((r) => r.containerNo)
        .map((r) => ({
          momo_container_no: r.containerNo,
          momo_sack_no:      r.sackNo,
          // ── 0118 mirror columns ──
          ship_by:           r.shipBy,
          total_kg:          r.totalKg,
          total_cbm:         r.totalCbm,
          total_parcel:      r.totalParcel,
          // ── status + range ──
          date_from:         start,
          date_to:           end,
          closed_at:         r.momoUpdatedAt,
          phase:             r.phase,
          shipment_status:   r.shipmentStatus,
          admin_status_text: r.adminStatusText,
          raw:               r.raw as never,
          last_synced_at:    new Date().toISOString(),
          updated_at:        new Date().toISOString(),
        }));
      if (upRows.length > 0) {
        const { error: upErr } = await admin
          .from("momo_container_closed")
          .upsert(upRows, { onConflict: "momo_container_no" });
        if (upErr) {
          failedCount += upRows.length;
          errors.push({
            scope:   "container_closed_upsert",
            error:   "MOMO_DB_UPSERT_FAILED",
            message: upErr.message,
          });
        } else {
          upsertedCount += upRows.length;
        }
      }
    } else {
      errors.push({ scope: "container_closed", error: ccRes.error, message: ccRes.message });
    }
  }

  // ── 3. sack_info ──
  if (sackNo) {
    const siRes = await getSackInfo(sackNo);
    if (siRes.ok) {
      const mapped = mapSackInfoSingle(siRes.data);
      const r = mapped[0];
      sackInfoCount = mapped.length;
      if (!r) {
        errors.push({
          scope:   "sack_info_parse",
          error:   "MOMO_PARSE_ERROR",
          message: "Sack response not parseable",
        });
      } else {

      const row = {
        momo_sack_no:      r.sackNo || sackNo, // fallback to requested key
        momo_tracking_no:  r.trackingNo,
        momo_container_no: r.containerNo,
        // ── 0118 mirror columns ──
        ship_by:           r.shipBy,
        weight_kg:         r.weightKg,
        cbm:               r.cbm,
        total_parcel:      r.totalParcel,
        // ── status ──
        phase:             r.phase,
        shipment_status:   r.shipmentStatus,
        billing_status:    r.billingStatus,
        job_status:        r.jobStatus,
        issue_status:      r.issueStatus,
        admin_status_text: r.adminStatusText,
        current_location:  r.currentLocation,
        etd:               r.etd,
        eta:               r.eta,
        momo_updated_at:   r.momoUpdatedAt,
        raw:               r.raw as never,
        last_synced_at:    new Date().toISOString(),
        updated_at:        new Date().toISOString(),
      };
      const { error: upErr } = await admin
        .from("momo_sack_infos")
        .upsert(row, { onConflict: "momo_sack_no" });
      if (upErr) {
        failedCount += 1;
        errors.push({
          scope:   "sack_info_upsert",
          error:   "MOMO_DB_UPSERT_FAILED",
          message: upErr.message,
        });
      } else {
        upsertedCount += 1;
      }
      } // close `} else { ... ` opened earlier (if (!r) {...} else {...})
    } else {
      errors.push({ scope: "sack_info", error: siRes.error, message: siRes.message });
    }
  }

  // ── 4. log this sync ──
  const totalScanned = importTrackCount + containerClosedCount + sackInfoCount;
  const mappedCount  = importMapped.filter((r) => r.shipmentStatus != null).length;
  const unmappedCount = importTrackCount - mappedCount;

  const status =
    errors.length === 0 ? "success" :
    upsertedCount > 0   ? "partial" :
                          "failed";

  await admin.from("momo_sync_logs").insert({
    sync_type:              "sync",
    date_from:              start,
    date_to:                end,
    sack_no:                sackNo || null,
    status,
    import_track_count:     importTrackCount,
    container_closed_count: containerClosedCount,
    sack_info_count:        sackInfoCount,
    mapped_count:           mappedCount,
    unmapped_count:         unmappedCount,
    upserted_count:         upsertedCount,
    failed_count:           failedCount,
    errors:                 errors as never,
    created_by:             me?.id ?? null,
  });

  // If MOMO returned no data AT ALL (every call errored) → 502
  if (errors.length > 0 && totalScanned === 0) {
    const primary = errors[0];
    return NextResponse.json(
      {
        ok: false,
        dryRun: false,
        error: primary.error,
        message: primary.message,
        errors,
      },
      { status: errorStatus(primary.error as never) },
    );
  }

  return NextResponse.json({
    ok: true,
    dryRun: false,
    start:  start ?? null,
    end:    end ?? null,
    sackNo: sackNo || null,
    importTrackCount,
    containerClosedCount,
    sackInfoCount,
    mappedCount,
    unmappedCount,
    upsertedCount,
    failedCount,
    errors,
  });
}
