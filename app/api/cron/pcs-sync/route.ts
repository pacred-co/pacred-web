/**
 * GET /api/cron/pcs-sync — Pacred-side of the PCS↔Pacred sync.
 *
 * Pulls recent `tb_forwarder` changes from the PHP endpoint on the
 * PCS server (`pcscargo.com/api/pacred-sync.php`), then merges per
 * `lib/integrations/pcs-sync/merge.ts` conflict policy.
 *
 * Cron schedule (vercel.json): every 10 min — sized for staff
 * round-trip on cabinet / driver / status edits. Window auto-walks
 * via `pcs_sync_state.last_sync_at` (advances only on success).
 *
 * Auth: instrumentCron (CRON_SECRET Bearer OR x-vercel-cron) — same
 * gate the other crons use.
 *
 * @see lib/integrations/pcs-sync/sync.ts — runPcsSync orchestrator
 * @see app/[locale]/(admin)/admin/system/pcs-sync/page.tsx — dashboard
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { instrumentCron } from "@/lib/cron/instrument";
import { runPcsSync } from "@/lib/integrations/pcs-sync/sync";

export const maxDuration = 60; // sec — 500 rows × small upserts comfortable

export async function GET(request: Request) {
  return instrumentCron({
    cronPath: "/api/cron/pcs-sync",
    request,
    handler: async () => {
      const admin = createAdminClient();
      const result = await runPcsSync(admin);

      const cronStatus =
        !result.error                       ? "success" :
        result.rowsUpserted > 0             ? "partial" :
                                              "failure";

      return {
        status: cronStatus,
        summary: {
          since:              result.since,
          until:              result.until,
          rows_seen:          result.rowsSeen,
          rows_upserted:      result.rowsUpserted,
          rows_skipped_no_match: result.rowsSkippedNoMatch,
          rows_skipped_no_write: result.rowsSkippedNoWrite,
          rows_failed:        result.rowsFailed,
          duration_ms:        result.durationMs,
          log_id:             result.logId,
        },
        error: result.error ?? undefined,
        payload: {
          ok:                  result.ok,
          since:               result.since,
          until:               result.until,
          rows_seen:           result.rowsSeen,
          rows_upserted:       result.rowsUpserted,
          rows_skipped_no_match: result.rowsSkippedNoMatch,
          rows_skipped_no_write: result.rowsSkippedNoWrite,
          rows_failed:         result.rowsFailed,
          duration_ms:         result.durationMs,
          error:               result.error,
        },
      };
    },
  });
}
