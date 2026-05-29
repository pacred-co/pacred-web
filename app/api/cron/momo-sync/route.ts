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
      const start = override.start ?? dateIsoForCron(1); // yesterday (or override)
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
        scanned: 0, attempted: 0, succeeded: 0, failed: 0, skipped: 0, perRow: [],
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
          // Wave 30.6 #230 — match-by-tracking propagation summary so ภูม can
          // see at a glance whether MOMO → tb_forwarder writes are landing.
          propagation_scanned:     sync.propagation?.scanned ?? 0,
          propagation_matched:     sync.propagation?.matched ?? 0,
          propagation_updated:     sync.propagation?.updated ?? 0,
          propagation_cabinet:     sync.propagation?.cabinetWrites ?? 0,
          propagation_arrived:     sync.propagation?.arrivedWrites ?? 0,
          propagation_status_advance: sync.propagation?.statusAdvanceWrites ?? 0,
          propagation_status_skipped_by_gate: sync.propagation?.statusAdvanceSkippedByGate ?? 0,
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
          },
          autoCommit: {
            enabled:   autoCommitEnabled,
            scanned:   commit.scanned,
            attempted: commit.attempted,
            succeeded: commit.succeeded,
            failed:    commit.failed,
            skipped:   commit.skipped,
            // Don't dump perRow into the response payload — it can be
            // hundreds of rows. The cron-invocations table has its own
            // result_summary jsonb; perRow stays in-memory only.
          },
        },
      };
    },
  });
}
