import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { instrumentCron } from "@/lib/cron/instrument";

/**
 * GET /api/cron/expire-driver-assignments
 *
 * Sweeps forwarder_driver rows where status=1 (assigned) and the
 * assignment timestamp is older than 17 hours → flip to status=3
 * (expired). Driver lost the chance to accept; admin can re-assign.
 *
 * Schedule: "0 * * * *" = every hour.
 *
 * U4-1: wrapped in instrumentCron — response shape preserved.
 */
export async function GET(request: Request) {
  return instrumentCron({
    cronPath: "/api/cron/expire-driver-assignments",
    request,
    handler: async () => {
      const supabase = createAdminClient();
      const cutoffIso = new Date(Date.now() - 17 * 60 * 60 * 1000).toISOString();

      const { data: expired, error: updErr } = await supabase
        .from("forwarder_driver")
        .update({ status: 3 })
        .eq("status", 1)
        .lt("fd_date", cutoffIso)
        .select("id");

      if (updErr) {
        return {
          status:     "failure" as const,
          error:      updErr.message,
          payload:    { ok: false, stage: "update", error: updErr.message },
          httpStatus: 500,
        };
      }

      const expiredCount = (expired ?? []).length;

      if (expiredCount > 0) {
        logger.info("cron.expire-driver-assignments", "expired stale assignments", {
          cutoffIso,
          expiredCount,
        });
      }

      return {
        status:  "success" as const,
        summary: { cutoff: cutoffIso, expired: expiredCount },
        payload: {
          ok:      true,
          cutoff:  cutoffIso,
          expired: expiredCount,
        },
      };
    },
  });
}
