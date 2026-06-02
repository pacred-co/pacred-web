"use server";

/**
 * actions/admin/pcs-sync.ts — admin manual control for the PCS↔Pacred sync.
 *
 * Two actions:
 *   1. runPcsSyncNow()   — manual trigger using the SAME orchestrator as
 *                          the cron (`lib/integrations/pcs-sync/sync.ts`)
 *   2. testPcsEndpoint() — fetch the last 1 hour deltas, return raw
 *                          response so admin can eyeball the contract
 *
 * Both `withAdmin(["super"])` — sync controls are CEO-only.
 *
 * Next 16 use-server rule: only async function exports allowed. No const
 * value exports in this file (see actions/admin/margin-monitor.ts header).
 */

import { withAdmin, type AdminActionResult, logAdminAction } from "@/actions/admin/common";
import { createAdminClient } from "@/lib/supabase/admin";
import { runPcsSync, type RunPcsSyncResult } from "@/lib/integrations/pcs-sync/sync";
import { fetchPcsDeltas, PcsSyncFetchError, type PcsDeltaResponse } from "@/lib/integrations/pcs-sync/client";
import { logger } from "@/lib/logger";

// ────────────────────────────────────────────────────────────────
// 1. Manual trigger — runs the exact same flow as the cron
// ────────────────────────────────────────────────────────────────

export async function runPcsSyncNow(): Promise<AdminActionResult<RunPcsSyncResult>> {
  return withAdmin(["super"], async ({ adminId }) => {
    try {
      const admin = createAdminClient();
      const result = await runPcsSync(admin);
      await logAdminAction(adminId, "pcs_sync.manual_trigger", "pcs_sync", String(result.logId ?? "0"), {
        rowsSeen:     result.rowsSeen,
        rowsUpserted: result.rowsUpserted,
        rowsFailed:   result.rowsFailed,
        error:        result.error,
      });
      return { ok: true, data: result };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      logger.error("admin.pcs-sync.runPcsSyncNow", "manual run threw", e);
      return { ok: false, error: msg };
    }
  });
}

// ────────────────────────────────────────────────────────────────
// 2. Endpoint test — last hour deltas, raw response
// ────────────────────────────────────────────────────────────────

export type TestPcsEndpointResult = {
  ok:       true;
  response: PcsDeltaResponse;
  since:    string;
};

export async function testPcsEndpoint(): Promise<AdminActionResult<TestPcsEndpointResult>> {
  return withAdmin(["super"], async ({ adminId }) => {
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    try {
      const response = await fetchPcsDeltas({ since, limit: 50 });
      await logAdminAction(adminId, "pcs_sync.endpoint_test", "pcs_sync", "test", {
        since,
        count: response.count,
      });
      return { ok: true, data: { ok: true, response, since } };
    } catch (e) {
      const isPcsErr = e instanceof PcsSyncFetchError;
      const code     = isPcsErr ? e.code : "PCS_NETWORK_ERROR";
      const msg      = e instanceof Error ? e.message : String(e);
      logger.error("admin.pcs-sync.testPcsEndpoint", "endpoint test failed", e);
      return { ok: false, error: `${code}: ${msg}` };
    }
  });
}
