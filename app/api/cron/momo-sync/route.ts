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

export async function GET(request: Request) {
  return instrumentCron({
    cronPath: "/api/cron/momo-sync",
    request,
    handler: async () => {
      const admin = createAdminClient();
      const start = dateIsoForCron(1); // yesterday
      const end   = dateIsoForCron(0); // today

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
      // Best-effort: any failure here doesn't fail the cron (rows that
      // didn't commit stay at /review for admin to handle).
      let commit: Awaited<ReturnType<typeof autoCommitEligibleMomoRows>> = {
        scanned: 0, attempted: 0, succeeded: 0, failed: 0, skipped: 0, perRow: [],
      };
      try {
        commit = await autoCommitEligibleMomoRows(admin, 100);
      } catch (err) {
        logger.error("momo-cron", "auto-commit threw", err, {
          syncLogId: sync.syncLogId,
        });
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
          auto_commit_scanned:  commit.scanned,
          auto_commit_eligible: commit.attempted,
          auto_commit_succeeded: commit.succeeded,
          auto_commit_failed:   commit.failed,
          auto_commit_skipped:  commit.skipped,
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
          },
          autoCommit: {
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
