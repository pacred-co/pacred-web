/**
 * GET /api/cron/sheets-sync-ctt — Gap #1 foundation, CTT pilot.
 *
 * Pulls the CTT warehouse Google Sheet and (when fully wired) writes
 * new rows into `tb_forwarder` + pushes an ops-team notification.
 * Currently runs in DRY-RUN mode (see `lib/integrations/google-sheets/
 * ctt-adapter.ts` docstring for the open-handoff items).
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

      return {
        status: "success",
        summary: {
          mode: res.mode,
          lastNumrow: res.lastNumrow,
          newRowCount: res.newRowCount,
          sheetId: res.sheetId,
          range: res.range,
        },
        payload: {
          ok: true,
          mode: res.mode,
          lastNumrow: res.lastNumrow,
          newRowCount: res.newRowCount,
          sampleNewRow: res.sampleNewRow,
        },
      };
    },
  });
}
