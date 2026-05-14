import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

/**
 * GET /api/cron/expire-probation
 *
 * Daily sweep of probation-status employees whose contract_end_date
 * has passed → set suspended_at = now() so they lose admin access.
 * Mirrors the admin half of legacy pcs-admin/api/autorun/check-apprentice/
 * (driver half deferred to P-18 once forwarder_driver table lands).
 *
 * Schedule via vercel.json: "0 2 * * *" = daily 02:00 UTC = 09:00 ICT.
 * (Spec said "(03:00 ICT)" but 02:00 UTC is actually 09:00 ICT — using
 * spec's cron expression literal; 09:00 ICT is fine for a daily admin
 * sweep that doesn't need to fire overnight.)
 *
 * Authentication: same pattern as /api/cron/auto-cancel-orders —
 * Vercel's `x-vercel-cron` header OR `Bearer ${CRON_SECRET}`.
 *
 * DECISION (ภูม, per §6): no admin_audit_log row written. The audit
 * table requires `admin_id NOT NULL references profiles(id)`, but
 * a cron has no acting admin. Adding a "system" admin_id or making
 * the column nullable is scope expansion beyond P-17 spec. logger.info
 * + the JSON response body provide adequate observability for an
 * automated daily sweep — Vercel log streaming captures every run.
 *
 * Idempotent: only flips rows where suspended_at IS NULL — re-running
 * on the same day matches zero rows.
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
  const today    = new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC ok — date-only field)
  const nowIso   = new Date().toISOString();

  // Find probation employees past their contract end date who are
  // still active. The composite index from migration 0027 covers this.
  const { data: expired, error: queryErr } = await supabase
    .from("admin_contact_extras")
    .select("profile_id, contract_end_date")
    .eq("employee_type", "probation")
    .is("suspended_at", null)
    .not("contract_end_date", "is", null)
    .lt("contract_end_date", today);

  if (queryErr) {
    return NextResponse.json({ ok: false, stage: "query", error: queryErr.message }, { status: 500 });
  }

  if (!expired || expired.length === 0) {
    return NextResponse.json({ ok: true, scanned: 0, suspended: 0 });
  }

  const profileIds = expired.map((e) => e.profile_id);

  const { data: suspendedRows, error: updErr } = await supabase
    .from("admin_contact_extras")
    .update({ suspended_at: nowIso })
    .in("profile_id", profileIds)
    .is("suspended_at", null)              // race guard — don't re-suspend
    .select("profile_id");

  if (updErr) {
    return NextResponse.json({ ok: false, stage: "update", error: updErr.message }, { status: 500 });
  }

  logger.info("cron.expire-probation", "suspended past-due probation employees", {
    scanned:   expired.length,
    suspended: (suspendedRows ?? []).length,
    today,
  });

  return NextResponse.json({
    ok:        true,
    scanned:   expired.length,
    suspended: (suspendedRows ?? []).length,
  });
}
