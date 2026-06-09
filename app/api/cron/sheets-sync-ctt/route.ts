/**
 * GET /api/cron/sheets-sync-ctt — Gap #1 CTT pilot (handoff round 7 P1 #2).
 *
 * Pulls the CTT warehouse Google Sheet and (when CTT_CRON_LIVE=true)
 * propagates each row's cabinet / arrival / status fields onto matching
 * `tb_forwarder` rows by tracking number. Mirrors the proven MOMO
 * `propagateMomoToForwarders` safe-writer pattern: EMPTY-ONLY cabinet,
 * forward-only date + status, `fcabinet_locked` respected.
 *
 * Default mode = DRY-RUN (CTT_CRON_LIVE unset/false). The adapter logs +
 * counts but never writes. Flip protocol in
 * `docs/runbook/ctt-cron-activation.md`.
 *
 * Auth: `instrumentCron` handles the CRON_SECRET / x-vercel-cron header
 * check + writes a row to `cron_invocations` for the /admin/system/crons
 * dashboard — same pattern as cargothai-sync + momo-sync.
 *
 * Schedule: registered in vercel.json + lib/cron/registry.ts.
 *
 * Returns a JSON summary mirroring the shape of `CttSyncSummary` so the
 * admin observability page can render the result without a special case.
 */
import { instrumentCron } from "@/lib/cron/instrument";
import { syncCttSheet } from "@/lib/integrations/google-sheets/ctt-adapter";

export async function GET(request: Request) {
  return instrumentCron({
    cronPath: "/api/cron/sheets-sync-ctt",
    request,
    handler: async () => {
      const res = await syncCttSheet();

      if (res.status === "failure") {
        return {
          status: "failure",
          summary: { reason: res.reason, message: res.message },
          payload: { ok: false, error: `sheets_sync_ctt: ${res.reason}` },
        };
      }

      // Surface propagate counts in BOTH summary (→ result_summary jsonb
      // on cron_invocations, rendered by /admin/system/crons) and payload
      // (→ HTTP response body, useful for ad-hoc curl/inspection).
      return {
        status: "success",
        summary: {
          mode:        res.mode,
          lastNumrow:  res.lastNumrow,
          newRowCount: res.newRowCount,
          sheetId:     res.sheetId,
          range:       res.range,
          propagate:   res.propagate ?? null,
        },
        payload: {
          ok:           true,
          mode:         res.mode,
          lastNumrow:   res.lastNumrow,
          newRowCount:  res.newRowCount,
          sampleNewRow: res.sampleNewRow,
          propagate:    res.propagate ?? null,
        },
      };
    },
  });
}
