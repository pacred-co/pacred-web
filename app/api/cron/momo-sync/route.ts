/**
 * GET /api/cron/momo-sync — Wave 30 #2 (ภูม brief 2026-05-30 evening).
 *
 * 🆕 PIVOT from the prior daily cron that wrote to spine cargo_* tables
 *    (`syncContainersFromMomo` via momo-jmf integration · DEPRECATED here).
 *
 *    The new flow points at ปอน's Wave 26 MOMO Status Sync — isolated
 *    `momo_*` tables ONLY · runs every 10 minutes (vercel.json schedule
 *    `*\/10 * * * *`) · then auto-commits high-confidence rows to
 *    `tb_forwarder` so admin doesn't have to click /review for every one.
 *
 * Why every 10 min: legacy PCS Cargo had NO cron — admins clicked
 * `?page=updateAPI` manually whenever they wanted fresh data. Pacred
 * does better: 10-min sync = warehouse staff always see today's MOMO
 * activity within ~10 min lag. (Vercel Pro lets us schedule any
 * interval; Hobby is once-per-day.)
 *
 * Eligibility for auto-commit (conservative — see lib/admin/auto-commit-momo.ts):
 *   ✅ row.committed_at IS NULL
 *   ✅ raw.user_group + raw.user_code → valid `tb_users.userID`
 *   ✅ default `fShipBy=PCS` + `fProductsType=1` (admin overrides at /review if needed)
 *   ❌ rows without a userid match stay at /review (admin verifies + commits manually)
 *
 * Window: yesterday → today (covers overnight + intraday updates each run).
 *
 * @see lib/integrations/momo-isolated/sync.ts — runMomoSync orchestrator
 * @see lib/admin/auto-commit-momo.ts            — autoCommitEligibleMomoRows
 * @see app/api/admin/momo/sync/route.ts         — admin manual variant
 * @see docs/integrations/momo-jmf-api-spec.md   — partner API spec
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { instrumentCron } from "@/lib/cron/instrument";
import { runMomoSync } from "@/lib/integrations/momo-isolated/sync";
import { autoCommitEligibleMomoRows } from "@/lib/admin/auto-commit-momo";
import { logger } from "@/lib/logger";

/** Window helper — YYYY-MM-DD for today + yesterday. */
function dateIsoForCron(daysAgo: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

/** Accept ?start=YYYY-MM-DD&?end=YYYY-MM-DD overrides ONLY on non-prod
 *  (or when the caller has a valid CRON_SECRET Bearer). Lets ops manually
 *  reseed a wider range after an outage / env-var fix without redeploy.
 *  Prod cron (vercel.json schedule) never sends query params → falls back
 *  to yesterday..today as before. */
function parseDateOverride(url: URL, request: Request): { start?: string; end?: string } {
  const isProd     = process.env.NODE_ENV === "production";
  const secret     = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  const bearerOk   = !!secret && authHeader === `Bearer ${secret}`;
  if (isProd && !bearerOk) return {};
  const re = /^\d{4}-\d{2}-\d{2}$/;
  const start = url.searchParams.get("start");
  const end   = url.searchParams.get("end");
  return {
    start: start && re.test(start) ? start : undefined,
    end:   end   && re.test(end)   ? end   : undefined,
  };
}

export async function GET(request: Request) {
  return instrumentCron({
    cronPath: "/api/cron/momo-sync",
    request,
    handler: async () => {
      const admin = createAdminClient();
      const url = new URL(request.url);
      const override = parseDateOverride(url, request);
      // 2026-06-03 — widened from 1 → 7 days (ภูม flag #51994 GZS260601-1).
      // Symptom: containers that close > 1 day ago never enter `momo_container_closed`
      // because the cron window missed them. Propagation reads from that table,
      // so cabinet never propagates to tb_forwarder.fcabinetnumber. 7-day window
      // catches containers that close anytime within the past week — Vercel cron
      // runs every 10 min so the extra API calls are cheap, MOMO API is fast.
      const start = override.start ?? dateIsoForCron(7);
      const end   = override.end   ?? dateIsoForCron(0); // today (or override)

      // ── 1. Pull MOMO → upsert momo_import_tracks + momo_container_closed ──
      const sync = await runMomoSync(admin, {
        start,
        end,
        sackNo:      null,
        triggeredBy: null,   // cron has no admin user
        syncSource:  "cron",
      });

      // If MOMO API itself died (every fetch errored), surface as failure
      // so the cron-health log shows the issue + future runs can recover.
      const allFailed =
        sync.errors.length > 0 && sync.upsertedCount === 0;

      // ── 2. Auto-commit eligible rows → tb_forwarder ──
      // Wave 30.5: GATED behind MOMO_CRON_AUTOCOMMIT (default OFF). The
      // auto-commit path now works (commitMomoRowSystem — no withAdmin
      // gate), but committing money-path rows automatically can bill the
      // wrong customer if MOMO's user_group/user_code is mistagged. So we
      // ship pull-only by default; ภูม flips the env to "true" after
      // eyeballing a sample of would-be auto-commits at /review.
      // Best-effort either way: a failure here never fails the cron — rows
      // that don't commit stay at /review for admin to handle.
      const autoCommitEnabled = process.env.MOMO_CRON_AUTOCOMMIT === "true";
      let commit: Awaited<ReturnType<typeof autoCommitEligibleMomoRows>> = {
        scanned: 0, attempted: 0, succeeded: 0, failed: 0, skipped: 0,
        rejectionRate: 0, alerted: false, perRow: [],
      };
      if (autoCommitEnabled) {
        try {
          commit = await autoCommitEligibleMomoRows(admin, 100);
        } catch (err) {
          logger.error("momo-cron", "auto-commit threw", err, {
            syncLogId: sync.syncLogId,
          });
        }
      }

      const cronStatus =
        allFailed                        ? "failure" :
        sync.status === "partial"        ? "partial" :
        commit.failed > 0                ? "partial" :
                                           "success";

      return {
        status: cronStatus,
        summary: {
          window:               { start, end },
          import_tracks:        sync.importTrackCount,
          containers_closed:    sync.containerClosedCount,
          upserted:             sync.upsertedCount,
          sync_errors:          sync.errors.length,
          auto_commit_enabled:  autoCommitEnabled,
          auto_commit_scanned:  commit.scanned,
          auto_commit_eligible: commit.attempted,
          auto_commit_succeeded: commit.succeeded,
          auto_commit_failed:   commit.failed,
          auto_commit_skipped:  commit.skipped,
          // Wave 30.7 — safety-net health metric. > 0.5 triggers a LINE
          // staff ping (see lib/admin/auto-commit-momo-safety.ts).
          auto_commit_rejection_rate: commit.rejectionRate,
          auto_commit_alerted:  commit.alerted,
          // Wave 30.6 #230 — match-by-tracking propagation summary so ภูม can
          // see at a glance whether MOMO → tb_forwarder writes are landing.
          propagation_scanned:     sync.propagation?.scanned ?? 0,
          propagation_matched:     sync.propagation?.matched ?? 0,
          propagation_updated:     sync.propagation?.updated ?? 0,
          propagation_cabinet:     sync.propagation?.cabinetWrites ?? 0,
          propagation_arrived:     sync.propagation?.arrivedWrites ?? 0,
          propagation_status_advance: sync.propagation?.statusAdvanceWrites ?? 0,
          propagation_status_skipped_by_gate: sync.propagation?.statusAdvanceSkippedByGate ?? 0,
          // 2026-07-01 — departed-container auto-advance ('1'/'2' → '3' when the
          // แต้ม ETD has passed but MOMO dropped the parcel). See lib/admin/
          // advance-departed-containers.ts.
          departed_advance_scanned:  sync.departedAdvance?.scanned ?? 0,
          departed_advanced:         sync.departedAdvance?.advanced ?? 0,
          // 2026-07-01 — MOMO Live-board STATUS propagate (the richer momocargo.com
          // web source · forward-only · status-only). See lib/integrations/momo-web/
          // propagate-live-status.ts.
          live_status_matched:       sync.liveStatusPropagation?.matched ?? 0,
          live_status_advanced:      sync.liveStatusPropagation?.advanced ?? 0,
          live_status_shop_advanced: sync.liveStatusPropagation?.shopOrdersAdvanced ?? 0,
          // 2026-07-01 — MOMO Live-board DATA fill (น้ำหนัก/คิว/ขนาด/จำนวนชิ้น · fill-when-
          // empty · TOTAL · skip billed). See lib/integrations/momo-web/propagate-live-data.ts.
          live_data_matched:         sync.liveDataFill?.matched ?? 0,
          live_data_filled:          sync.liveDataFill?.filled ?? 0,
          live_data_skipped_billed:  sync.liveDataFill?.skippedBilled ?? 0,
          live_data_flagged_mismatch: sync.liveDataFill?.flaggedMismatch ?? 0,
          // 2026-07-02 — MOMO Live-board PER-BOX detail (each split box's ก×ย×ส →
          // momo_box_detail · display-only). See lib/integrations/momo-web/box-detail.ts.
          live_box_upserted:         sync.liveBoxDetail?.upserted ?? 0,
          // 2026-07-02 — MOMO Live-board CABINET fill (real เลขตู้ + วันปิดตู้ into
          // tb_forwarder · fill-when-empty · never-overwrite). This proves the real ตู้
          // now auto-fills every cron (no /live click). See lib/integrations/momo-web/
          // live-cabinet.ts.
          live_cabinet_filled:       sync.liveCabinetFill?.filled ?? 0,
          live_closedate_filled:     sync.liveCabinetFill?.closeDateFilled ?? 0,
          sync_log_id:          sync.syncLogId,
        },
        payload: {
          ok:    !allFailed,
          start,
          end,
          sync: {
            importTrackCount:    sync.importTrackCount,
            containerClosedCount: sync.containerClosedCount,
            upsertedCount:       sync.upsertedCount,
            failedCount:         sync.failedCount,
            errors:              sync.errors,
            status:              sync.status,
            syncLogId:           sync.syncLogId,
            // Wave 30.6 #230 — propagation summary (see ./propagate.ts).
            propagation:         sync.propagation
              ? {
                  scanned:                  sync.propagation.scanned,
                  matched:                  sync.propagation.matched,
                  updated:                  sync.propagation.updated,
                  cabinetWrites:            sync.propagation.cabinetWrites,
                  arrivedWrites:            sync.propagation.arrivedWrites,
                  statusAdvanceWrites:      sync.propagation.statusAdvanceWrites,
                  statusAdvanceSkippedByGate: sync.propagation.statusAdvanceSkippedByGate,
                  errorCount:               sync.propagation.errors.length,
                }
              : null,
            // 2026-07-01 — departed-container auto-advance (see lib/admin/
            // advance-departed-containers.ts).
            departedAdvance:     sync.departedAdvance
              ? {
                  scanned:     sync.departedAdvance.scanned,
                  advanced:    sync.departedAdvance.advanced,
                  containers:  sync.departedAdvance.containers,
                  errorCount:  sync.departedAdvance.errors.length,
                }
              : null,
            // 2026-07-01 — MOMO Live-board STATUS propagate (see lib/integrations/
            // momo-web/propagate-live-status.ts).
            liveStatusPropagation: sync.liveStatusPropagation
              ? {
                  boardsFetched:      sync.liveStatusPropagation.boardsFetched,
                  parcelsSeen:        sync.liveStatusPropagation.parcelsSeen,
                  matched:            sync.liveStatusPropagation.matched,
                  advanced:           sync.liveStatusPropagation.advanced,
                  shopOrdersAdvanced: sync.liveStatusPropagation.shopOrdersAdvanced,
                  errorCount:         sync.liveStatusPropagation.errors.length,
                }
              : null,
            // 2026-07-01 — MOMO Live-board DATA fill (see lib/integrations/
            // momo-web/propagate-live-data.ts).
            liveDataFill:        sync.liveDataFill
              ? {
                  baseTrackingsSeen: sync.liveDataFill.baseTrackingsSeen,
                  matched:           sync.liveDataFill.matched,
                  filled:            sync.liveDataFill.filled,
                  skippedBilled:     sync.liveDataFill.skippedBilled,
                  skippedHasValue:   sync.liveDataFill.skippedHasValue,
                  flaggedMismatch:   sync.liveDataFill.flaggedMismatch,
                  errorCount:        sync.liveDataFill.errors.length,
                }
              : null,
            // 2026-07-02 — MOMO Live-board PER-BOX detail (see lib/integrations/
            // momo-web/box-detail.ts · display-only).
            liveBoxDetail:       sync.liveBoxDetail
              ? {
                  boxesSeen:  sync.liveBoxDetail.boxesSeen,
                  upserted:   sync.liveBoxDetail.upserted,
                  errorCount: sync.liveBoxDetail.errors.length,
                }
              : null,
            // 2026-07-02 — MOMO Live-board CABINET fill: real เลขตู้ + วันปิดตู้ now
            // auto-fill every cron (see lib/integrations/momo-web/live-cabinet.ts).
            liveCabinetFill:     sync.liveCabinetFill
              ? {
                  baseTrackingsWithContainer: sync.liveCabinetFill.baseTrackingsWithContainer,
                  matched:                    sync.liveCabinetFill.matched,
                  filled:                     sync.liveCabinetFill.filled,
                  closeDateFilled:            sync.liveCabinetFill.closeDateFilled,
                  skippedBilled:              sync.liveCabinetFill.skippedBilled,
                  skippedHasReal:             sync.liveCabinetFill.skippedHasReal,
                  errorCount:                 sync.liveCabinetFill.errors.length,
                }
              : null,
          },
          autoCommit: {
            enabled:       autoCommitEnabled,
            scanned:       commit.scanned,
            attempted:     commit.attempted,
            succeeded:     commit.succeeded,
            failed:        commit.failed,
            skipped:       commit.skipped,
            rejectionRate: commit.rejectionRate,
            alerted:       commit.alerted,
            // Don't dump perRow into the response payload — it can be
            // hundreds of rows. The cron-invocations table has its own
            // result_summary jsonb; perRow stays in-memory only.
          },
        },
      };
    },
  });
}
