import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

/**
 * GET /api/cron/refresh-active-customers
 *
 * Sweeps profiles whose recent activity warrants `is_active=true` and
 * flips the flag. Mirrors legacy
 * pcs-admin/api/autorun/update-active-customers/index.php which
 * filtered tb_users.userActive based on order/forwarder/payment activity.
 *
 * SCAFFOLD STATE — built by เดฟ for ภูม to verify + ship.
 *   ✅ activity rules ported from PHP (3 streams)
 *   ✅ idempotent — only flips false→true (never demotes)
 *   ⚠️  ภูม: P-13 already has a "recently-active customers" admin page
 *      reading wallet_transactions directly — confirm this cron isn't
 *      duplicating/conflicting work before enabling the schedule.
 *
 * Schedule via vercel.json (suggested daily 01:00 UTC = 08:00 ICT):
 *   { "path": "/api/cron/refresh-active-customers", "schedule": "0 1 * * *" }
 *
 * Authentication: same pattern as /api/cron/auto-cancel-orders.
 *
 * Legacy rules (from update-active-customers/index.php):
 *   - service_orders past status 2 (hStatus 3/4/5) →
 *     status IN ('ordered','awaiting_chn_dispatch','completed')
 *     equivalently NOT IN ('pending','awaiting_payment','cancelled')
 *   - forwarders past 'pending_payment' (any other status = paid+)
 *   - yuan_payments status='completed'
 *
 * @see C:\xampp\htdocs\pcscargo\member\pcs-admin\api\autorun\update-active-customers\index.php
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
  const profileIds = new Set<string>();

  // Stream 1 — service-order activity (paid or beyond)
  const { data: orderRows, error: orderErr } = await supabase
    .from("service_orders")
    .select("profile_id")
    .not("status", "in", "(pending,awaiting_payment,cancelled)");

  if (orderErr) {
    return NextResponse.json({ ok: false, stage: "service_orders", error: orderErr.message }, { status: 500 });
  }
  for (const row of orderRows ?? []) {
    if (row.profile_id) profileIds.add(row.profile_id);
  }

  // Stream 2 — forwarder activity (paid+ — past status 'pending_payment')
  // TODO(ภูม): verify forwarder status enum — 0010_forwarder.sql shows
  // 'pending_payment' is the initial unpaid state; everything beyond is
  // active. If the enum has more nuance ('rejected' etc.), refine the
  // exclusion list here.
  const { data: fwdRows, error: fwdErr } = await supabase
    .from("forwarders")
    .select("profile_id")
    .neq("status", "pending_payment");

  if (fwdErr) {
    return NextResponse.json({ ok: false, stage: "forwarders", error: fwdErr.message }, { status: 500 });
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
    return NextResponse.json({ ok: false, stage: "yuan_payments", error: payErr.message }, { status: 500 });
  }
  for (const row of payRows ?? []) {
    if (row.profile_id) profileIds.add(row.profile_id);
  }

  if (profileIds.size === 0) {
    return NextResponse.json({ ok: true, scanned: 0, flipped: 0 });
  }

  // Only flip false→true. Don't touch already-active rows (saves write
  // load + keeps audit clean). RLS-bypassed via admin client.
  const { data: flipped, error: updErr } = await supabase
    .from("profiles")
    .update({ is_active: true })
    .in("id", [...profileIds])
    .eq("is_active", false)
    .select("id");

  if (updErr) {
    return NextResponse.json({ ok: false, stage: "update", error: updErr.message }, { status: 500 });
  }

  logger.info("cron.refresh-active-customers", "swept", {
    scanned: profileIds.size,
    flipped: (flipped ?? []).length,
  });

  return NextResponse.json({
    ok:      true,
    scanned: profileIds.size,
    flipped: (flipped ?? []).length,
  });
}
