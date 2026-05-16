import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkSmsBalance } from "@/lib/sms/gateway";
import { sendNotification } from "@/lib/notifications";
import { notify } from "@/lib/notifications/templates";
import { logger } from "@/lib/logger";

/**
 * GET /api/cron/sms-balance-check
 *
 * Closes U1-2 + chat audit L-3 (silent OTP SMS credit depletion).
 *
 * Schedule: daily at 06:00 ICT (= 23:00 UTC the previous day).
 *   vercel.json: { "path": "/api/cron/sms-balance-check", "schedule": "0 23 * * *" }
 *
 * Wired into vercel.json 2026-05-17 — เดฟ confirmed Pacred is on the Vercel
 * Pro plan (100-cron ceiling; this is cron #6). See docs/runbook/vercel-cron-plan.md.
 *
 * Logic:
 *   1. Call checkSmsBalance() (provider abstraction in lib/sms/gateway.ts)
 *   2. If balance < SMS_LOW_THRESHOLD (default 100), alert admins opted in
 *      via notify_channels.sms_balance_alert = true
 *   3. Always log the current balance + threshold + alert dispatch count
 *
 * Authentication: matches existing cron pattern (x-vercel-cron header OR
 * Bearer CRON_SECRET).
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

  // Step 1: check balance
  const result = await checkSmsBalance();
  const threshold = Number(process.env.SMS_LOW_THRESHOLD ?? "100");

  if (!result.ok) {
    logger.info("cron.sms-balance-check", "balance check failed", { error: result.error });
    // Don't alert on transient failures — alert only when we KNOW balance is low.
    // If the provider is genuinely down, that's a separate concern (handled by /status page).
    return NextResponse.json({
      ok:      false,
      error:   result.error,
      threshold,
    }, { status: 200 });  // return 200 so Vercel doesn't retry storm
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
    return NextResponse.json({
      ok:        true,
      balance,
      unit:      result.unit ?? "messages",
      threshold,
      is_low:    false,
      dispatched_count: 0,
    });
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
    .in("role", ["super", "ops", "accounting"])
    .eq("is_active", true);

  if (adminErr) {
    return NextResponse.json({ ok: false, error: adminErr.message, stage: "fetch_admins" }, { status: 500 });
  }

  const dispatched: string[] = [];
  const skipped:    string[] = [];
  const seen = new Set<string>();
  for (const row of (targetAdmins ?? []) as AdminRow[]) {
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

  return NextResponse.json({
    ok:               true,
    balance,
    unit:             result.unit ?? "messages",
    threshold,
    is_low:           true,
    dispatched_count: dispatched.length,
    skipped_count:    skipped.length,
  });
}
