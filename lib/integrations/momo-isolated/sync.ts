/**
 * Wave 30 — shared MOMO sync orchestrator.
 *
 * Extracted from `app/api/admin/momo/sync/route.ts` so BOTH the admin
 * manual endpoint AND the cron auto-pull (`/api/cron/momo-sync`) can
 * call the exact same flow without duplicating ~250 LOC of upsert logic.
 *
 * The admin route still owns input validation + the auth guard; this
 * helper just executes the sync given an already-built admin client +
 * a validated date range / sackNo.
 *
 * Sync flow (verbatim from the legacy POST route):
 *   1. import_track  — pull MOMO + upsert into momo_import_tracks
 *   2. container_closed — pull MOMO + upsert into momo_container_closed
 *   3. sack_info — pull MOMO + upsert into momo_sack_infos
 *   4. log to momo_sync_logs
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getImportTrack,
  getContainerClosed,
  getSackInfo,
  mapImportTrackArray,
  mapContainerClosedArray,
  mapSackInfoSingle,
  type MomoInternalAdminRecord,
} from "./index";
import {
  propagateMomoToForwarders,
  type PropagationResult,
} from "./propagate";

export type RunMomoSyncOpts = {
  /** ISO date "YYYY-MM-DD" — required for the date-range pulls (track + closed). */
  start: string | null;
  /** ISO date "YYYY-MM-DD" — required for the date-range pulls. */
  end:   string | null;
  /** Optional single-sack lookup (independent of the date range). */
  sackNo: string | null;
  /** Who triggered the sync — admin user.id for manual, null for cron. */
  triggeredBy: string | null;
  /** "manual" (admin clicked /sync) or "cron" (automated). Stamped into sync_type. */
  syncSource: "manual" | "cron";
};

export type RunMomoSyncError = {
  scope:   string;
  error:   string;
  message: string;
};

export type RunMomoSyncResult = {
  ok:                  boolean;
  start:               string | null;
  end:                 string | null;
  sackNo:              string | null;
  importTrackCount:    number;
  containerClosedCount: number;
  sackInfoCount:       number;
  mappedCount:         number;
  unmappedCount:       number;
  upsertedCount:       number;
  failedCount:         number;
  errors:              RunMomoSyncError[];
  /** Status as logged: 'success' | 'partial' | 'failed'. */
  status:              "success" | "partial" | "failed";
  /** The momo_sync_logs row id (if log insert succeeded). */
  syncLogId:           string | null;
  /** Wave 30.6 #230 — tb_forwarder propagation result. `null` when no
   *  import_track records were scanned. See lib/integrations/momo-isolated/
   *  propagate.ts for the safety rules + the env gate
   *  `MOMO_SYNC_PROPAGATE_STATUS=true`. */
  propagation:         PropagationResult | null;
};

/**
 * Execute one MOMO sync cycle. Pure function from `opts → DB writes`.
 * Caller (admin route OR cron) is responsible for auth + input validation.
 */
export async function runMomoSync(
  admin: SupabaseClient,
  opts: RunMomoSyncOpts,
): Promise<RunMomoSyncResult> {
  const { start, end, sackNo, triggeredBy, syncSource } = opts;
  const wantDateRange = !!(start && end);
  const wantSack      = !!sackNo;

  const errors:               RunMomoSyncError[] = [];
  let importTrackCount    = 0;
  let containerClosedCount = 0;
  let sackInfoCount       = 0;
  let upsertedCount       = 0;
  let failedCount         = 0;
  let importMapped:        MomoInternalAdminRecord[] = [];

  // ── 1. import_track (date-range) ──
  if (wantDateRange) {
    const res = await getImportTrack(start!, end!);
    if (res.ok) {
      importMapped = mapImportTrackArray(res.data);
      importTrackCount = importMapped.length;

      const upRows = importMapped
        .filter((r) => r.trackingNo) // upsert requires the unique key
        .map((r) => ({
          momo_tracking_no:  r.trackingNo,
          momo_sack_no:      r.sackNo,
          momo_container_no: r.containerNo,
          momo_user_code:    r.momoUserCode,
          momo_user_group:   r.momoUserGroup,
          momo_cg_no:        r.momoCgNo,
          ship_by:           r.shipBy,
          weight_kg:         r.weightKg,
          cbm:               r.cbm,
          quantity:          r.quantity,
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

    // ── 2. container_closed (date-range) ──
    const ccRes = await getContainerClosed(start!, end!);
    if (ccRes.ok) {
      const mapped = mapContainerClosedArray(ccRes.data);
      containerClosedCount = mapped.length;

      const upRows = mapped
        .filter((r) => r.containerNo)
        .map((r) => ({
          momo_container_no: r.containerNo,
          momo_sack_no:      r.sackNo,
          ship_by:           r.shipBy,
          total_kg:          r.totalKg,
          total_cbm:         r.totalCbm,
          total_parcel:      r.totalParcel,
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

      // ── 2.5. PROPAGATE cabinet (cid) → momo_import_tracks ─────────
      //
      // ภูม flag 2026-05-30 (bug 2c): import_track.container_no is
      // MOMO's INTERNAL ROUTING BATCH ID (e.g. "PR20260527-SEA02"), NOT
      // the cabinet PCS staff/customers actually use. The real cabinet
      // lives on container_closed.cid (e.g. "GZS260525-2"). Each
      // container_closed row carries `track_details[]` with `reTrack`
      // = the tracking number — that's how MOMO joins cabinet → track.
      //
      // We walk every container_closed raw, parse track_details[].reTrack,
      // then UPDATE momo_import_tracks.container_batch_no = container.cid
      // WHERE momo_tracking_no = reTrack. Column name aligns with the
      // matching column on momo_container_closed (added in 0119). New
      // column on momo_import_tracks added in 0126.
      //
      // Idempotent (a re-sync just overwrites with the same cid). Best-
      // effort — failures here log but never fail the sync (next sync
      // re-applies). One-off backfill: scripts/backfill-momo-cabinet.mjs.
      try {
        const rawArray = (ccRes.data && typeof ccRes.data === "object" && Array.isArray((ccRes.data as { data?: unknown }).data))
          ? (ccRes.data as { data: unknown[] }).data
          : Array.isArray(ccRes.data) ? (ccRes.data as unknown[]) : [];
        for (const containerRaw of rawArray) {
          if (!containerRaw || typeof containerRaw !== "object") continue;
          const c = containerRaw as Record<string, unknown>;
          // The cabinet is `cid` (e.g. "GZS260525-2"). Skip if missing.
          const cabinetNo = typeof c.cid === "string" && c.cid.trim() ? c.cid.trim() : null;
          if (!cabinetNo) continue;
          const trackDetails = Array.isArray(c.track_details) ? (c.track_details as unknown[]) : [];
          const reTracks: string[] = [];
          for (const td of trackDetails) {
            if (!td || typeof td !== "object") continue;
            const rt = (td as Record<string, unknown>).reTrack;
            if (typeof rt === "string" && rt.trim()) reTracks.push(rt.trim());
          }
          if (reTracks.length === 0) continue;
          // ── ARRIVAL STAMP (LANE A · owner 2026-06-16) ────────────────
          // When this container raw carries `is_arrival === true` (MOMO's
          // "ของถึงไทยแล้ว" flag → AT_WAREHOUSE_TH in mapper.ts:286-289),
          // stamp shipment_status onto the SAME matched import-track rows so
          // the per-parcel propagator (propagateMomoToForwarders) can advance
          // the matched tb_forwarder rows to fstatus='4' (ถึงไทยแล้ว · Option-B
          // manual-review). Without this the arrival flag lived only on the
          // container record (trackingNo:null → filtered out) and never
          // reached a per-parcel propagatable row. `shipment_status` +
          // `momo_updated_at` both exist on momo_import_tracks since 0116.
          const arrivalUpdate: Record<string, unknown> = {
            container_batch_no: cabinetNo,
            updated_at:         new Date().toISOString(),
          };
          if (c.is_arrival === true) {
            arrivalUpdate.shipment_status = "AT_WAREHOUSE_TH";
            arrivalUpdate.momo_updated_at = new Date().toISOString();
          }
          const { error: upErr } = await admin
            .from("momo_import_tracks")
            .update(arrivalUpdate)
            .in("momo_tracking_no", reTracks);
          if (upErr) {
            console.error(
              `[runMomoSync] cabinet propagate failed cid=${cabinetNo}`,
              { code: upErr.code, message: upErr.message, trackCount: reTracks.length },
            );
            errors.push({
              scope:   "cabinet_propagate",
              error:   "MOMO_DB_UPDATE_FAILED",
              message: `cid=${cabinetNo}: ${upErr.message}`,
            });
          }
        }
      } catch (e) {
        // Defensive — a malformed raw shouldn't crash the whole sync.
        console.error("[runMomoSync] cabinet propagate threw", e);
      }
    } else {
      errors.push({ scope: "container_closed", error: ccRes.error, message: ccRes.message });
    }
  }

  // ── 3. sack_info (single sack) ──
  if (wantSack) {
    const siRes = await getSackInfo(sackNo!);
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
          momo_sack_no:      r.sackNo || sackNo,
          momo_tracking_no:  r.trackingNo,
          momo_container_no: r.containerNo,
          ship_by:           r.shipBy,
          weight_kg:         r.weightKg,
          cbm:               r.cbm,
          total_parcel:      r.totalParcel,
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
      }
    } else {
      errors.push({ scope: "sack_info", error: siRes.error, message: siRes.message });
    }
  }

  // ── 3.5 Wave 30.6 #230 — match-by-tracking propagation into tb_forwarder ──
  // After the isolated momo_* writes land, walk the import_track records and
  // forward-propagate to any tb_forwarder rows that share the same tracking
  // number. Safety: only fills empty fcabinetnumber + fdatetothai by default;
  // fstatus advancement is gated behind MOMO_SYNC_PROPAGATE_STATUS=true (off
  // by default — flipping it fires customer notifications). See
  // docs/research/momo-status-drift-2026-05-30.md for ภูม's diagnosis.
  let propagation: PropagationResult | null = null;
  if (importMapped.length > 0) {
    try {
      propagation = await propagateMomoToForwarders(admin, importMapped);
      if (propagation.errors.length > 0) {
        for (const e of propagation.errors) {
          errors.push({
            scope:   "propagation",
            error:   "MOMO_PROPAGATION_ROW_FAILED",
            message: `${e.trackingNo}: ${e.message}`,
          });
        }
      }
    } catch (err) {
      // Best-effort — propagation must NEVER fail the sync. The momo_*
      // writes already landed; propagation is downstream enrichment.
      console.error("[runMomoSync] propagation threw", err);
      errors.push({
        scope:   "propagation",
        error:   "MOMO_PROPAGATION_THREW",
        message: err instanceof Error ? err.message : "unknown",
      });
    }
  }

  // ── 4. log this sync ──
  const totalScanned = importTrackCount + containerClosedCount + sackInfoCount;
  const mappedCount  = importMapped.filter((r) => r.shipmentStatus != null).length;
  const unmappedCount = importTrackCount - mappedCount;

  const status: "success" | "partial" | "failed" =
    errors.length === 0 ? "success" :
    upsertedCount > 0   ? "partial" :
                          "failed";

  const { data: syncLogRow, error: syncLogErr } = await admin
    .from("momo_sync_logs")
    .insert({
      sync_type:              syncSource,
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
      created_by:             triggeredBy,
    })
    .select("id")
    .maybeSingle<{ id: string }>();

  if (syncLogErr) {
    // Best-effort — don't fail the whole sync if logging failed.
    console.error("[runMomoSync] sync_logs insert failed", { code: syncLogErr.code, message: syncLogErr.message });
  }

  return {
    ok:                  totalScanned > 0 || errors.length === 0,
    start,
    end,
    sackNo,
    importTrackCount,
    containerClosedCount,
    sackInfoCount,
    mappedCount,
    unmappedCount,
    upsertedCount,
    failedCount,
    errors,
    status,
    syncLogId:           syncLogRow?.id ?? null,
    propagation,
  };
}
