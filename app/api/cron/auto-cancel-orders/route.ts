import { createAdminClient } from "@/lib/supabase/admin";
import { instrumentCron } from "@/lib/cron/instrument";

/**
 * GET /api/cron/auto-cancel-orders
 *
 * Cancels service_orders where status='awaiting_payment' AND
 * payment_due_at < now(). Mirrors the legacy auto-cancel rule from
 * pcscargo (hStatus=2 AND hDatePayment<NOW() → hStatus=6).
 *
 * Schedule via vercel.json:
 *   { "crons": [{ "path": "/api/cron/auto-cancel-orders", "schedule": "*\/15 * * * *" }] }
 *
 * Authentication + cron_invocations logging are handled by
 * instrumentCron (see lib/cron/instrument.ts). The response shape is
 * preserved exactly — Vercel + uptime monitors depend on it.
 */
export async function GET(request: Request) {
  return instrumentCron({
    cronPath: "/api/cron/auto-cancel-orders",
    request,
    handler: async () => {
      const supabase = createAdminClient();
      const nowIso   = new Date().toISOString();

      const { data: candidates, error: selErr } = await supabase
        .from("service_orders")
        .select("id, h_no")
        .eq("status", "awaiting_payment")
        .lt("payment_due_at", nowIso);

      if (selErr) {
        return {
          status:     "failure" as const,
          error:      selErr.message,
          payload:    { ok: false, error: selErr.message },
          httpStatus: 500,
        };
      }

      if (!candidates || candidates.length === 0) {
        return {
          status:  "success" as const,
          summary: { cancelled: 0 },
          payload: { ok: true, cancelled: 0 },
        };
      }

      const ids = candidates.map((r) => r.id);
      const { error: updErr } = await supabase
        .from("service_orders")
        .update({ status: "cancelled" })
        .in("id", ids);

      if (updErr) {
        return {
          status:     "failure" as const,
          error:      updErr.message,
          payload:    { ok: false, error: updErr.message },
          httpStatus: 500,
        };
      }

      return {
        status:  "success" as const,
        summary: { cancelled: candidates.length },
        payload: {
          ok:        true,
          cancelled: candidates.length,
          h_nos:     candidates.map((r) => r.h_no),
          ran_at:    nowIso,
        },
      };
    },
  });
}
