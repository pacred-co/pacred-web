import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { instrumentCron } from "@/lib/cron/instrument";

/**
 * GET /api/cron/expire-probation
 *
 * Daily sweep of probation-status employees whose contract_end_date
 * has passed → set suspended_at = now() so they lose admin access.
 *
 * Schedule: "0 2 * * *" = daily 02:00 UTC = 09:00 ICT.
 *
 * U4-1: wrapped in instrumentCron — response shape preserved.
 *
 * Idempotent: only flips rows where suspended_at IS NULL — re-running
 * on the same day matches zero rows.
 */
export async function GET(request: Request) {
  return instrumentCron({
    cronPath: "/api/cron/expire-probation",
    request,
    handler: async () => {
      const supabase = createAdminClient();
      const today    = new Date().toISOString().slice(0, 10);
      const nowIso   = new Date().toISOString();

      const { data: expired, error: queryErr } = await supabase
        .from("admin_contact_extras")
        .select("profile_id, contract_end_date")
        .eq("employee_type", "probation")
        .is("suspended_at", null)
        .not("contract_end_date", "is", null)
        .lt("contract_end_date", today);

      if (queryErr) {
        return {
          status:     "failure" as const,
          error:      queryErr.message,
          payload:    { ok: false, stage: "query", error: queryErr.message },
          httpStatus: 500,
        };
      }

      if (!expired || expired.length === 0) {
        return {
          status:  "success" as const,
          summary: { scanned: 0, suspended: 0 },
          payload: { ok: true, scanned: 0, suspended: 0 },
        };
      }

      const profileIds = expired.map((e) => e.profile_id);

      const { data: suspendedRows, error: updErr } = await supabase
        .from("admin_contact_extras")
        .update({ suspended_at: nowIso })
        .in("profile_id", profileIds)
        .is("suspended_at", null)
        .select("profile_id");

      if (updErr) {
        return {
          status:     "failure" as const,
          error:      updErr.message,
          payload:    { ok: false, stage: "update", error: updErr.message },
          httpStatus: 500,
        };
      }

      logger.info("cron.expire-probation", "suspended past-due probation employees", {
        scanned:   expired.length,
        suspended: (suspendedRows ?? []).length,
        today,
      });

      return {
        status:  "success" as const,
        summary: { scanned: expired.length, suspended: (suspendedRows ?? []).length },
        payload: {
          ok:        true,
          scanned:   expired.length,
          suspended: (suspendedRows ?? []).length,
        },
      };
    },
  });
}
