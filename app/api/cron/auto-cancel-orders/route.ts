import { createAdminClient } from "@/lib/supabase/admin";
import { instrumentCron } from "@/lib/cron/instrument";
import { autoExpireOverdueShopOrder } from "@/lib/service-order/auto-expire";

export const dynamic = "force-dynamic";

/**
 * GET /api/cron/auto-cancel-orders
 *
 * Cancels overdue ฝากสั่งซื้อ (shop) orders on the LIVE legacy table
 * `tb_header_order` — the same canonical table the customer/admin pages read.
 * Mirrors the legacy auto-cancel rule from pcscargo (detail.php L73 /
 * update.php L72: hStatus=2 AND hDatePayment<NOW() → hStatus=6).
 *
 * ⚠️ History: this cron previously queried the REBUILT `service_orders`
 * table, which is a 0-row dead twin in production → the cron was a silent
 * no-op. The real expiry happens lazily on admin page-views via
 * `autoExpireOverdueShopOrder`. This cron now batch-applies that SAME
 * battle-tested function across all eligible rows, so the sweep matches
 * the lazy path EXACTLY (same status filter, same past-due-date condition,
 * same idempotent optimistic UPDATE guard).
 *
 * We do NOT reimplement the expiry rule. We:
 *   1. Pre-filter candidates in SQL (hstatus='2' AND hdatepayment<now) — a
 *      conservative superset. `hdatepayment` is stored as an ISO timestamp
 *      string (see actions/admin/wallet-hs.ts hDatePaymentIso), so `.lt`
 *      string-compares correctly (same pattern as actions/admin/pay-user.ts).
 *   2. Hand each candidate to `autoExpireOverdueShopOrder`, which re-checks
 *      every guard (hstatus==='2', finite date, due < Date.now()) and applies
 *      the optimistic `WHERE id=? AND hstatus='2'` UPDATE. The function's own
 *      `due >= Date.now()` re-check means we can never cancel MORE than the
 *      lazy path would — if the SQL filter is ever loose, the function trims.
 *
 * Idempotent: re-running is safe (the optimistic guard flips each row at most
 * once; an already-cancelled '6' row is excluded by the `hstatus='2'` filter).
 *
 * Schedule via vercel.json:
 *   { "crons": [{ "path": "/api/cron/auto-cancel-orders", "schedule": "*\/15 * * * *" }] }
 *
 * Authentication + cron_invocations logging are handled by
 * instrumentCron (see lib/cron/instrument.ts). The response shape is
 * preserved (ok / cancelled / h_nos / ran_at) — Vercel + uptime monitors
 * depend on it.
 */
export async function GET(request: Request) {
  return instrumentCron({
    cronPath: "/api/cron/auto-cancel-orders",
    request,
    handler: async () => {
      const supabase = createAdminClient();
      const nowIso   = new Date().toISOString();

      // Candidate superset: status-2 (รอชำระเงิน) orders whose payment
      // deadline has already passed. The per-row function below re-validates
      // before flipping, so this filter only needs to be conservative-enough.
      const { data: candidates, error: selErr } = await supabase
        .from("tb_header_order")
        .select("id, hno, hstatus, hdatepayment")
        .eq("hstatus", "2")
        .not("hdatepayment", "is", null)
        .lt("hdatepayment", nowIso);

      if (selErr) {
        console.error("[cron auto-cancel-orders] candidate select failed", {
          code: selErr.code, message: selErr.message,
        });
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
          payload: { ok: true, cancelled: 0, ran_at: nowIso },
        };
      }

      // Reuse the battle-tested lazy-path function for EACH row — identical
      // guards + idempotent optimistic UPDATE. Sequential to keep the admin
      // client footprint small and the ordering deterministic.
      const cancelledHNos: string[] = [];
      for (const row of candidates) {
        const r = row as unknown as {
          id: number; hno: string | null;
          hstatus: string | null; hdatepayment: string | null;
        };
        const flipped = await autoExpireOverdueShopOrder({
          id: r.id, hstatus: r.hstatus, hdatepayment: r.hdatepayment,
        });
        if (flipped && r.hno) cancelledHNos.push(r.hno);
      }

      const cancelled = cancelledHNos.length;
      // Some candidates may not flip (e.g. a concurrent re-quote moved them off
      // '2' between SELECT and UPDATE) — report partial so the health log stays honest.
      const status =
        cancelled === candidates.length ? ("success" as const) : ("partial" as const);

      return {
        status,
        summary: { candidates: candidates.length, cancelled },
        payload: {
          ok:        true,
          cancelled,
          h_nos:     cancelledHNos,
          ran_at:    nowIso,
        },
      };
    },
  });
}
