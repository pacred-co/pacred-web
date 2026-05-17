import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { instrumentCron } from "@/lib/cron/instrument";

/**
 * GET /api/cron/refresh-active-customers
 *
 * Sweeps profiles whose recent activity warrants `is_active=true` and
 * flips the flag. Mirrors legacy
 * pcs-admin/api/autorun/update-active-customers/index.php.
 *
 * U4-1: wrapped in instrumentCron — response shape preserved.
 *
 * @see C:\xampp\htdocs\pcscargo\member\pcs-admin\api\autorun\update-active-customers\index.php
 */
export async function GET(request: Request) {
  return instrumentCron({
    cronPath: "/api/cron/refresh-active-customers",
    request,
    handler: async () => {
      const supabase = createAdminClient();
      const profileIds = new Set<string>();

      // Stream 1 — service-order activity (paid or beyond)
      const { data: orderRows, error: orderErr } = await supabase
        .from("service_orders")
        .select("profile_id")
        .not("status", "in", "(pending,awaiting_payment,cancelled)");

      if (orderErr) {
        return {
          status:     "failure" as const,
          error:      orderErr.message,
          payload:    { ok: false, stage: "service_orders", error: orderErr.message },
          httpStatus: 500,
        };
      }
      for (const row of orderRows ?? []) {
        if (row.profile_id) profileIds.add(row.profile_id);
      }

      // Stream 2 — forwarder activity
      const { data: fwdRows, error: fwdErr } = await supabase
        .from("forwarders")
        .select("profile_id")
        .not("status", "in", "(pending_payment,cancelled)");

      if (fwdErr) {
        return {
          status:     "failure" as const,
          error:      fwdErr.message,
          payload:    { ok: false, stage: "forwarders", error: fwdErr.message },
          httpStatus: 500,
        };
      }
      for (const row of fwdRows ?? []) {
        if (row.profile_id) profileIds.add(row.profile_id);
      }

      // Stream 3 — yuan_payments completed
      const { data: payRows, error: payErr } = await supabase
        .from("yuan_payments")
        .select("profile_id")
        .eq("status", "completed");

      if (payErr) {
        return {
          status:     "failure" as const,
          error:      payErr.message,
          payload:    { ok: false, stage: "yuan_payments", error: payErr.message },
          httpStatus: 500,
        };
      }
      for (const row of payRows ?? []) {
        if (row.profile_id) profileIds.add(row.profile_id);
      }

      if (profileIds.size === 0) {
        return {
          status:  "success" as const,
          summary: { scanned: 0, flipped: 0 },
          payload: { ok: true, scanned: 0, flipped: 0 },
        };
      }

      const { data: flipped, error: updErr } = await supabase
        .from("profiles")
        .update({ is_active: true })
        .in("id", [...profileIds])
        .eq("is_active", false)
        .select("id");

      if (updErr) {
        return {
          status:     "failure" as const,
          error:      updErr.message,
          payload:    { ok: false, stage: "update", error: updErr.message },
          httpStatus: 500,
        };
      }

      logger.info("cron.refresh-active-customers", "swept", {
        scanned: profileIds.size,
        flipped: (flipped ?? []).length,
      });

      return {
        status:  "success" as const,
        summary: { scanned: profileIds.size, flipped: (flipped ?? []).length },
        payload: {
          ok:      true,
          scanned: profileIds.size,
          flipped: (flipped ?? []).length,
        },
      };
    },
  });
}
