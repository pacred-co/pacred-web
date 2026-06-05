/**
 * GET /api/cron/sync-container-cost-sheet — LANE A continuous sync.
 *
 * Pulls แสง's container-cost Google Sheet
 * (`13ufkMUoYGnz9sm4gQXiaFp9G6Lx1mRR9to0rqEVK0FA` tab `main`) into the
 * `container_cost_sheet_cache` table so the cost-reconciliation worklist
 * (`/admin/forwarders/container-cost-check`) + the per-parcel diff
 * (`/admin/report-cnt/{cnt}?action=cost-update`) read fast + stay fresh.
 *
 * READ-ONLY mirror — it NEVER writes tb_forwarder. Applying sheet costs
 * into the live cost column stays a confirm-gated admin action.
 *
 * Auth: `instrumentCron` handles the CRON_SECRET / x-vercel-cron header
 * check + writes a row to `cron_invocations` for /admin/system/crons.
 * Schedule: registered in vercel.json + lib/cron/registry.ts (every 20m).
 *
 * Reads แสง's PUBLIC sheet via the CSV export (no auth, no service account,
 * invisible to the sheet owner — owner directive 2026-06-05 "ดึงต่อใช้เองออโต้
 * ... ไม่ต้องเข้ามาให้เขารู้ตัว"). No credential needed. Falls back to the
 * authenticated Sheets API only if the sheet goes private AND
 * GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON is set; degrades gracefully otherwise.
 */
import { instrumentCron } from "@/lib/cron/instrument";
import { syncContainerCostSheet } from "@/lib/integrations/google-sheets/container-cost-sheet-sync";

export async function GET(request: Request) {
  return instrumentCron({
    cronPath: "/api/cron/sync-container-cost-sheet",
    request,
    handler: async () => {
      const res = await syncContainerCostSheet();

      if (res.status === "failure") {
        return {
          status: "failure",
          summary: { reason: res.reason, message: res.message },
          payload: { ok: false, error: `sync_container_cost_sheet: ${res.reason}` },
        };
      }

      return {
        status: "success",
        summary: {
          parcelCount: res.parcelCount,
          cabinetCount: res.cabinetCount,
          rawRowCount: res.rawRowCount,
          inserted: res.inserted,
        },
        payload: {
          ok: true,
          parcelCount: res.parcelCount,
          cabinetCount: res.cabinetCount,
          inserted: res.inserted,
        },
      };
    },
  });
}
