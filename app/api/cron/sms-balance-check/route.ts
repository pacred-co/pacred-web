import { createAdminClient } from "@/lib/supabase/admin";
import { checkSmsBalance } from "@/lib/sms/gateway";
import { sendNotification } from "@/lib/notifications";
import { notify } from "@/lib/notifications/templates";
import { logger } from "@/lib/logger";
import { instrumentCron } from "@/lib/cron/instrument";

/**
 * GET /api/cron/sms-balance-check
 *
 * Closes U1-2 + chat audit L-3 (silent OTP SMS credit depletion).
 *
 * Schedule: daily at 06:00 ICT (= 23:00 UTC the previous day).
 *   vercel.json: { "path": "/api/cron/sms-balance-check", "schedule": "0 23 * * *" }
 *
 * U4-1: wrapped in instrumentCron so each run is logged to
 * cron_invocations. Response shape preserved.
 */
export async function GET(request: Request) {
  return instrumentCron({
    cronPath: "/api/cron/sms-balance-check",
    request,
    handler: async () => {
      // Step 1: check balance
      const result = await checkSmsBalance();
      const threshold = Number(process.env.SMS_LOW_THRESHOLD ?? "100");

      if (!result.ok) {
        logger.info("cron.sms-balance-check", "balance check failed", { error: result.error });
        // Don't alert on transient failures — alert only when we KNOW balance is low.
        return {
          status:  "failure" as const,
          summary: { reason: "provider_unreachable", threshold },
          error:   result.error,
          // Original route returned 200 even when provider failed (so Vercel
          // doesn't retry storm). Preserve that.
          payload: { ok: false, error: result.error, threshold },
        };
      }

      const balance = result.balance ?? 0;
      const isLow = balance < threshold;

      logger.info("cron.sms-balance-check", "balance probed", {
        balance,
        unit:      result.unit ?? "unknown",
        threshold,
        is_low:    isLow,
      });

      if (!isLow) {
        return {
          status:  "success" as const,
          summary: { balance, threshold, is_low: false, dispatched: 0 },
          payload: {
            ok:               true,
            balance,
            unit:             result.unit ?? "messages",
            threshold,
            is_low:           false,
            dispatched_count: 0,
          },
        };
      }

      // Step 2: alert admins (opted-in only)
      const supabase = createAdminClient();
      type AdminRow = {
        profile_id: string;
        profile:
          | { notify_channels: { sms_balance_alert?: boolean } | null }
          | { notify_channels: { sms_balance_alert?: boolean } | null }[]
          | null;
      };

      const { data: targetAdmins, error: adminErr } = await supabase
        .from("admins")
        .select("profile_id, profile:profiles!profile_id ( notify_channels )")
        .in("role", ["super", "ops", "accounting", "ultra"])
        .eq("is_active", true);

      if (adminErr) {
        return {
          status:     "failure" as const,
          error:      adminErr.message,
          payload:    { ok: false, error: adminErr.message, stage: "fetch_admins" },
          httpStatus: 500,
        };
      }

      const dispatched: string[] = [];
      const skipped:    string[] = [];
      const seen = new Set<string>();
      for (const row of (targetAdmins ?? []) as unknown as AdminRow[]) {
        const pid = row.profile_id;
        if (!pid || seen.has(pid)) continue;
        seen.add(pid);

        const profile = Array.isArray(row.profile) ? row.profile[0] ?? null : row.profile;
        const optedIn = profile?.notify_channels?.sms_balance_alert === true;
        if (!optedIn) {
          skipped.push(pid);
          continue;
        }

        await sendNotification(pid, notify.smsBalanceLow({
          balance,
          unit:      result.unit ?? "messages",
          threshold,
        }));
        dispatched.push(pid);
      }

      return {
        status:  "success" as const,
        summary: {
          balance,
          threshold,
          is_low: true,
          dispatched: dispatched.length,
          skipped:    skipped.length,
        },
        payload: {
          ok:               true,
          balance,
          unit:             result.unit ?? "messages",
          threshold,
          is_low:           true,
          dispatched_count: dispatched.length,
          skipped_count:    skipped.length,
        },
      };
    },
  });
}
