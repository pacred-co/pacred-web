import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

/**
 * GET /api/cron/expire-driver-assignments
 *
 * Sweeps forwarder_driver rows where status=1 (assigned) and the
 * assignment timestamp is older than 17 hours → flip to status=3
 * (expired). Driver lost the chance to accept; admin can re-assign.
 *
 * Mirrors driver-half of legacy pcs-admin/api/autorun/check-apprentice/.
 *
 * Schedule via vercel.json: "0 * * * *" = every hour. Hourly resolution
 * is fine — drivers get an extra few minutes past the strict 17h cutoff
 * but never more than 60 min.
 *
 * Authentication: same pattern as /api/cron/auto-cancel-orders.
 *
 * DECISION (ภูม, per §6): no admin_audit_log — same reasoning as
 * P-17 expire-probation cron (see that route's header).
 *
 * Idempotent: only flips status=1 (already-expired/accepted/completed
 * rows ignored).
 */
export async function GET(request: Request) {
  const isProd     = process.env.NODE_ENV === "production";
  const vercelCron = request.headers.get("x-vercel-cron") === "1";
  const authHeader = request.headers.get("authorization");
  const secret     = process.env.CRON_SECRET;
  const bearerOk   = !!secret && authHeader === `Bearer ${secret}`;

  if (isProd && !vercelCron && !bearerOk) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  // 17 hours in milliseconds. Computed in JS rather than via SQL
  // `interval '17 hours'` to keep the route portable + testable.
  const cutoffIso = new Date(Date.now() - 17 * 60 * 60 * 1000).toISOString();

  const { data: expired, error: updErr } = await supabase
    .from("forwarder_driver")
    .update({ status: 3 })
    .eq("status", 1)
    .lt("fd_date", cutoffIso)
    .select("id");

  if (updErr) {
    return NextResponse.json({ ok: false, stage: "update", error: updErr.message }, { status: 500 });
  }

  const expiredCount = (expired ?? []).length;

  if (expiredCount > 0) {
    logger.info("cron.expire-driver-assignments", "expired stale assignments", {
      cutoffIso,
      expiredCount,
    });
  }

  return NextResponse.json({
    ok:      true,
    cutoff:  cutoffIso,
    expired: expiredCount,
  });
}
