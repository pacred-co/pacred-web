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
import { aggregateTrackDetailMetrics } from "@/lib/admin/momo-raw-helpers";
import {
  advanceDepartedContainerForwarders,
  type AdvanceDepartedResult,
} from "@/lib/admin/advance-departed-containers";
import { backlinkStagingCommitted } from "@/lib/admin/backlink-staging-committed";
import { isMomoWebConfigured } from "@/lib/integrations/momo-web/client";
import { type LiveStatusPropagationResult } from "@/lib/integrations/momo-web/propagate-live-status";
import {
  propagateMomoLiveStatusAndData,
  type LiveDataFillResult,
} from "@/lib/integrations/momo-web/propagate-live-data";
import { type BoxDetailFillResult } from "@/lib/integrations/momo-web/box-detail";
import { type BoxSplitResult } from "@/lib/integrations/momo-web/split-box-rows";
import { type LiveCabinetFillResult } from "@/lib/integrations/momo-web/live-cabinet";

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
   *  propagate.ts for the safety rules + the env gate MOMO_SYNC_PROPAGATE_STATUS
   *  (DEFAULT-ON since 2026-06-19 · disables only when set to "false"). */
  propagation:         PropagationResult | null;
  /** 2026-07-01 — after MOMO propagation, advance forwarders stuck at '1'/'2' in a
   *  DEPARTED container (แต้ม ETD in the past) to '3' (กำลังส่งมาไทย). Fills the gap
   *  where MOMO's API drops parcels once they leave China. `null` if the pass threw
   *  (best-effort · never fails the sync). See lib/admin/advance-departed-containers.ts. */
  departedAdvance:     AdvanceDepartedResult | null;
  /** 2026-07-01 — after the partner-feed + departed-container passes, propagate STATUS
   *  from MOMO's OWN web boards (momocargo.com master account — the richer source that
   *  keeps a status even after the partner API drops the parcel). Forward-only + status-
   *  only. `null` when MOMO web isn't configured OR the pass threw (best-effort · never
   *  fails the sync). See lib/integrations/momo-web/propagate-live-status.ts. */
  liveStatusPropagation: LiveStatusPropagationResult | null;
  /** 2026-07-01 — the DATA companion to liveStatusPropagation: fill the missing
   *  fweight/fvolume/dims/famount from the SAME MOMO Live boards (one login serves
   *  both). FILL-WHEN-EMPTY · TOTAL (per-piece × qty) · skip billed rows (fstatus
   *  5/6/7) · never overwrite · flag mismatches. `null` when MOMO web isn't
   *  configured OR the pass threw (best-effort · never fails the sync). See
   *  lib/integrations/momo-web/propagate-live-data.ts. */
  liveDataFill: LiveDataFillResult | null;
  /** 2026-07-02 — the PER-BOX detail companion to the Live status/data passes:
   *  persist each split box's real ก×ย×ส into momo_box_detail (display-only · NEVER
   *  touches tb_forwarder / any money path). Runs on the SAME single MOMO login as
   *  liveStatusPropagation + liveDataFill. `null` when MOMO web isn't configured OR
   *  the combined pass threw (best-effort · never fails the sync). See
   *  lib/integrations/momo-web/box-detail.ts. */
  liveBoxDetail: BoxDetailFillResult | null;
  /** 2026-07-02 — the CABINET companion: fill the REAL เลขตู้ (fcabinetnumber ← GZS/
   *  GZE/GZA) + วันปิดตู้ (fdatecontainerclose) from the SAME MOMO Live boards.
   *  FILL-WHEN-EMPTY-OR-PLACEHOLDER (cabinet) · FILL-WHEN-EMPTY (close date) · never
   *  overwrites a real ตู้/existing date · skips billed rows (fstatus 5/6/7) · TOCTOU-
   *  safe. This is what makes the real เลขตู้ + วันปิดตู้ auto-fill every 10-min cron
   *  (no human /live click needed). `null` when MOMO web isn't configured OR the
   *  combined pass threw (best-effort · never fails the sync). See
   *  lib/integrations/momo-web/live-cabinet.ts. */
  liveCabinetFill: LiveCabinetFillResult | null;
  /** 2026-07-02 — BOX-SPLIT companion: turn an aggregate tb_forwarder row (famount=N ·
   *  boxes in momo_box_detail) into N sibling rows (one per box · matches MOMO's "-i/n")
   *  so 1 box = 1 row. Money-neutral guard (unbilled · unpriced · Σ preserved) +
   *  idempotent. `null` when MOMO web isn't configured OR the combined pass threw
   *  (best-effort · never fails the sync). See lib/integrations/momo-web/split-box-rows.ts. */
  liveBoxSplit: BoxSplitResult | null;
};

/** Max rows per staging upsert call. Chunking bounds the blast radius of a
 *  single failing row (a value overflow) to its chunk instead of the whole
 *  rolling window, and keeps the payload under PostgREST's practical ceiling. */
const MOMO_UPSERT_CHUNK = 500;

/**
 * Resilient upsert for the MOMO staging tables (2026-07-13 · owner-delivery fix).
 *
 * The old code wrote the ENTIRE rolling-window `upRows` in ONE `.upsert(...)`.
 * A single bad row — two rows sharing the conflict key (Postgres 21000
 * "ON CONFLICT DO UPDATE cannot affect row a second time") or one value that
 * overflows a column — failed the WHOLE batch → `upsertedCount=0`, nothing
 * landed, and the cron re-failed it every run for ~7 days ("whole days of
 * parcels vanish"). This isolates the damage:
 *   1. dedup by the conflict key (keep the LAST occurrence) — kills the 21000.
 *   2. chunk (~500 rows/call) — bounds a payload / single-row failure.
 *   3. on a chunk error, retry that chunk PER-ROW so ONE offender is isolated
 *      (counted into `failed` + reported with its key) instead of sinking the
 *      ~500 good rows beside it.
 * Returns the same {upserted, failed, errors} the caller folds into the
 * existing upsertedCount / failedCount / errors[] — return shape unchanged.
 */
async function resilientMomoUpsert(
  admin: SupabaseClient,
  table: string,
  rows: Record<string, unknown>[],
  conflictKey: string,
  scope: string,
): Promise<{ upserted: number; failed: number; errors: RunMomoSyncError[] }> {
  // 1. dedup by conflict key — keep the LAST occurrence (freshest row wins).
  const byKey = new Map<unknown, Record<string, unknown>>();
  for (const row of rows) byKey.set(row[conflictKey], row);
  const deduped = Array.from(byKey.values());
  if (deduped.length < rows.length) {
    console.warn(
      `[runMomoSync] ${scope}: collapsed ${rows.length}→${deduped.length} rows by ${conflictKey} (in-window duplicates)`,
    );
  }

  const errors: RunMomoSyncError[] = [];
  let upserted = 0;
  let failed   = 0;

  for (let i = 0; i < deduped.length; i += MOMO_UPSERT_CHUNK) {
    const chunk = deduped.slice(i, i + MOMO_UPSERT_CHUNK);
    const { error: chunkErr } = await admin
      .from(table)
      .upsert(chunk, { onConflict: conflictKey });
    if (!chunkErr) {
      upserted += chunk.length;
      continue;
    }
    // 3. chunk failed → isolate the offender(s) by retrying each row alone,
    //    so one bad row can't sink the good rows beside it.
    console.error(
      `[runMomoSync] ${scope}: chunk upsert failed → per-row fallback`,
      { code: chunkErr.code, message: chunkErr.message, chunkSize: chunk.length },
    );
    for (const row of chunk) {
      const { error: rowErr } = await admin
        .from(table)
        .upsert(row, { onConflict: conflictKey });
      if (rowErr) {
        failed += 1;
        errors.push({
          scope,
          error:   "MOMO_DB_UPSERT_FAILED",
          message: `${conflictKey}=${String(row[conflictKey])}: ${rowErr.message}`,
        });
      } else {
        upserted += 1;
      }
    }
  }
  return { upserted, failed, errors };
}

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
        const upResult = await resilientMomoUpsert(
          admin, "momo_import_tracks", upRows, "momo_tracking_no", "import_track_upsert",
        );
        upsertedCount += upResult.upserted;
        failedCount   += upResult.failed;
        if (upResult.errors.length > 0) errors.push(...upResult.errors);
      } else if (importTrackCount > 0) {
        // Finding 3 (visibility) — MOMO returned rows but NONE carried a
        // momo_tracking_no, so nothing could be staged. Almost always a MOMO
        // field-shape change (the tracking key moved/renamed) that would
        // otherwise vanish silently. Make it LOUD.
        console.error(
          `[runMomoSync] import_track: ${importTrackCount} rows returned but 0 had a tracking number — MOMO field shape may have changed; NOTHING staged.`,
        );
        errors.push({
          scope:   "import_track_upsert",
          error:   "MOMO_ALL_ROWS_LOST_TRACKING",
          message: `importTrackCount=${importTrackCount} but 0 rows had a momo_tracking_no — MOMO field shape may have changed; nothing was staged.`,
        });
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
        const upResult = await resilientMomoUpsert(
          admin, "momo_container_closed", upRows, "momo_container_no", "container_closed_upsert",
        );
        upsertedCount += upResult.upserted;
        failedCount   += upResult.failed;
        if (upResult.errors.length > 0) errors.push(...upResult.errors);
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
          // ── HARVEST cabinet + per-parcel weight/cbm (2026-06-29 · ภูม) ──
          // Each track_detail = {reTrack, kg, cbm}. aggregateTrackDetailMetrics
          // emits a key for BOTH the exact reTrack (own metric) AND the base
          // tracking (the SUM across "<base>-i/n" parcels), because the staging
          // row is keyed by the BASE. The OLD code wrote ONLY the cabinet via a
          // bulk `.in(reTracks)` over the SUFFIXED reTracks — so (a) a split
          // tracking ("1781515241-1/3") never matched its base-keyed staging row
          // ("1781515241") → it got NO cabinet AND no weight, and (b) kg/cbm were
          // never copied at all → every committed tb_forwarder landed weight=0
          // and the warehouse couldn't bill (ภูม PR012 #52105 · 1781683835).
          // Now we update each tracking key with its own metric. weight/cbm are
          // written only when MOMO actually carries them (>0), so a container
          // MOMO hasn't measured yet never clobbers an existing value.
          const metricsByTracking = aggregateTrackDetailMetrics(trackDetails);
          if (Object.keys(metricsByTracking).length === 0) continue;
          // ── ARRIVAL STAMP (LANE A · owner 2026-06-16) ────────────────
          // When this container raw carries `is_arrival === true` (MOMO's
          // "ของถึงไทยแล้ว" flag → AT_WAREHOUSE_TH in mapper.ts:286-289), stamp
          // shipment_status onto the matched import-track rows so the per-parcel
          // propagator (propagateMomoToForwarders) can advance the matched
          // tb_forwarder rows to fstatus='4' (ถึงไทยแล้ว · Option-B manual-review).
          // `shipment_status` + `momo_updated_at` exist on momo_import_tracks
          // since 0116.
          const isArrival = c.is_arrival === true;
          const nowIso = new Date().toISOString();
          for (const [tn, m] of Object.entries(metricsByTracking)) {
            const upd: Record<string, unknown> = {
              container_batch_no: cabinetNo,
              updated_at:         nowIso,
            };
            if (m.kg > 0)  upd.weight_kg = Number(m.kg.toFixed(2));
            if (m.cbm > 0) upd.cbm       = Number(m.cbm.toFixed(6));
            if (isArrival) {
              upd.shipment_status = "AT_WAREHOUSE_TH";
              upd.momo_updated_at = nowIso;
            }
            const { error: upErr } = await admin
              .from("momo_import_tracks")
              .update(upd)
              .eq("momo_tracking_no", tn);
            if (upErr) {
              console.error(
                `[runMomoSync] cabinet/metrics propagate failed cid=${cabinetNo}`,
                { code: upErr.code, message: upErr.message, tracking: tn },
              );
              errors.push({
                scope:   "cabinet_propagate",
                error:   "MOMO_DB_UPDATE_FAILED",
                message: `cid=${cabinetNo} tracking=${tn}: ${upErr.message}`,
              });
            }
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
  // fstatus advancement is gated by MOMO_SYNC_PROPAGATE_STATUS — DEFAULT-ON
  // since 2026-06-19 (disables only when ="false"). Status-only + forward-only
  // and fires NO customer notification (verified in propagate.ts). So a row
  // reaching ถึงโกดังจีน (fstatus '2') from MOMO is AUTOMATIC every ~5 min —
  // NOT a side-effect of any cost-pay or admin click. See momo-status-drift-
  // 2026-05-30.md + forwarder-status-cost-domestic-clarity-2026-06-25.md.
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

  // ── 3.55 (2026-07-20 · owner "มีในระบบแล้วทำไมยังโชว์ยังไม่เข้าระบบ") — staging
  // back-link heal. A tb_forwarder row can exist WITHOUT the staging stamp
  // (box-split fan-out · manual add · bare-anchor commits) → ตรวจตู้ shows it
  // pending forever + every commit bounces "มีในระบบแล้ว". Stamp uncommitted
  // staging rows that match a live forwarder (exact → base-anchor → bare→box ·
  // dup-live skipped). METADATA-ONLY (never writes tb_forwarder) · idempotent ·
  // best-effort — must NEVER fail the sync.
  try {
    const bl = await backlinkStagingCommitted(admin, { apply: true });
    if (bl.stamped > 0 || bl.errors.length > 0) {
      console.info(
        `[runMomoSync] staging back-link: scanned=${bl.scannedStaging} matched=${bl.matches.length} stamped=${bl.stamped} dupSkipped=${bl.dupSkipped.length} errors=${bl.errors.length}`,
      );
    }
    for (const msg of bl.errors) {
      errors.push({ scope: "staging_backlink", error: "MOMO_BACKLINK_ROW_FAILED", message: msg });
    }
  } catch (err) {
    console.error("[runMomoSync] staging back-link threw", err);
    errors.push({
      scope:   "staging_backlink",
      error:   "MOMO_BACKLINK_THREW",
      message: err instanceof Error ? err.message : "unknown",
    });
  }

  // ── 3.6 (2026-07-01) — DEPARTED-container auto-advance ──
  // MOMO's import/track API stops feeding a parcel a status once it leaves China, so
  // rows stay stuck at '1'/'2' though the container already DEPARTED. AFTER MOMO
  // propagation (so MOMO wins whenever it DOES have a status), fill the gap: any
  // forwarder still at '1'/'2' whose container has a แต้ม ETD in the past → advance to
  // '3' (กำลังส่งมาไทย). Forward-only + STATUS-ONLY (writes only fstatus/fdatestatus3/
  // adminidupdate · no money) + idempotent. Runs every sync regardless of whether MOMO
  // returned import rows this cycle (the fix is driven by แต้ม ETD, not the MOMO pull).
  // Best-effort — its failure must NEVER fail the sync.
  let departedAdvance: AdvanceDepartedResult | null = null;
  try {
    departedAdvance = await advanceDepartedContainerForwarders(admin);
    if (departedAdvance.errors.length > 0) {
      for (const e of departedAdvance.errors) {
        errors.push({
          scope:   "departed_advance",
          error:   "MOMO_DEPARTED_ADVANCE_ROW_FAILED",
          message: `${e.container}: ${e.message}`,
        });
      }
    }
  } catch (err) {
    console.error("[runMomoSync] departed-container advance threw", err);
    errors.push({
      scope:   "departed_advance",
      error:   "MOMO_DEPARTED_ADVANCE_THREW",
      message: err instanceof Error ? err.message : "unknown",
    });
  }

  // ── 3.7 (2026-07-01 · box+cabinet added 2026-07-02) — MOMO Live-board propagate ──
  // MOMO's partner import/track feed DROPS a parcel once it advances past
  // "ออกจากโกดังจีน" — losing BOTH its status AND its measurement AND the real เลขตู้ —
  // but MOMO's OWN web (momocargo.com, master account) still shows it in the right board
  // WITH the full น้ำหนัก/คิว/ขนาด/จำนวนชิ้น + the real container. AFTER the partner-feed +
  // departed-container passes (so those win when they DO have a signal), scrape the Live
  // boards ONCE (single MOMO login) and run ALL FOUR passes (propagateMomoLiveStatusAndData
  // fetches the boards once and threads them through every pass — no second login):
  //   • STATUS — advance any matched tb_forwarder row toward the MOMO-Live status.
  //     Forward-only + STATUS-ONLY (fstatus/fdatestatusN/adminidupdate · no money) +
  //     idempotent + TOCTOU-safe (China-side, capped at '3').
  //   • DATA — fill fweight/fvolume/dims/famount, FILL-WHEN-EMPTY only, using the TOTAL
  //     (per-piece × qty) MOMO's web shows, SKIPPING billed rows (fstatus 5/6/7), never
  //     overwriting a non-zero value, flagging (not overwriting) any mismatch.
  //   • PER-BOX — persist each split box's real ก×ย×ส into momo_box_detail. DISPLAY-ONLY
  //     (report-cnt "แยกตามขนาด" panel + the per-box editor); NEVER touches tb_forwarder
  //     or any money path.
  //   • CABINET — fill the REAL เลขตู้ (fcabinetnumber ← GZS/GZE/GZA) + วันปิดตู้
  //     (fdatecontainerclose). FILL-WHEN-EMPTY-OR-PLACEHOLDER (cabinet) · FILL-WHEN-EMPTY
  //     (date) · never overwrites a real ตู้/existing date · skips billed rows · TOCTOU-
  //     safe. THIS is what makes the real เลขตู้ + วันปิดตู้ auto-fill every 10-min cron
  //     (previously they filled only when a human clicked /live · owner ภูม 2026-07-02).
  // Only runs when MOMO web creds are configured. Best-effort — a scrape/login/fill
  // failure must NEVER fail the sync (the momo_* writes already landed). Each of the DATA/
  // PER-BOX/CABINET passes is individually try/caught inside propagateMomoLiveStatusAndData,
  // so a box/cabinet failure NEVER rolls back the STATUS writes; the outer try here guards
  // the shared scrape/login.
  let liveStatusPropagation: LiveStatusPropagationResult | null = null;
  let liveDataFill: LiveDataFillResult | null = null;
  let liveBoxDetail: BoxDetailFillResult | null = null;
  let liveCabinetFill: LiveCabinetFillResult | null = null;
  let liveBoxSplit: BoxSplitResult | null = null;
  if (isMomoWebConfigured()) {
    try {
      const combined = await propagateMomoLiveStatusAndData(admin);
      liveStatusPropagation = combined.status;
      liveDataFill = combined.data;
      liveBoxDetail = combined.boxDetail;
      liveCabinetFill = combined.cabinet;
      liveBoxSplit = combined.boxSplit;
      if (liveStatusPropagation.errors.length > 0) {
        for (const e of liveStatusPropagation.errors) {
          errors.push({
            scope:   "live_status_propagate",
            error:   "MOMO_LIVE_STATUS_ROW_FAILED",
            message: `${e.scope}: ${e.message}`,
          });
        }
      }
      if (liveDataFill.errors.length > 0) {
        for (const e of liveDataFill.errors) {
          errors.push({
            scope:   "live_data_fill",
            error:   "MOMO_LIVE_DATA_ROW_FAILED",
            message: `${e.scope}: ${e.message}`,
          });
        }
      }
      if (liveBoxDetail.errors.length > 0) {
        for (const e of liveBoxDetail.errors) {
          errors.push({
            scope:   "live_box_detail",
            error:   "MOMO_LIVE_BOX_DETAIL_ROW_FAILED",
            message: `${e.scope}: ${e.message}`,
          });
        }
      }
      if (liveCabinetFill.errors.length > 0) {
        for (const e of liveCabinetFill.errors) {
          errors.push({
            scope:   "live_cabinet_fill",
            error:   "MOMO_LIVE_CABINET_ROW_FAILED",
            message: `${e.scope}: ${e.message}`,
          });
        }
      }
      if (liveBoxSplit.errors.length > 0) {
        for (const e of liveBoxSplit.errors) {
          errors.push({
            scope:   "live_box_split",
            error:   "MOMO_LIVE_BOX_SPLIT_ROW_FAILED",
            message: `${e.scope}: ${e.message}`,
          });
        }
      }
    } catch (err) {
      console.error("[runMomoSync] live-status/data propagate threw", err);
      errors.push({
        scope:   "live_status_propagate",
        error:   "MOMO_LIVE_STATUS_THREW",
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
    departedAdvance,
    liveStatusPropagation,
    liveDataFill,
    liveBoxDetail,
    liveCabinetFill,
    liveBoxSplit,
  };
}
