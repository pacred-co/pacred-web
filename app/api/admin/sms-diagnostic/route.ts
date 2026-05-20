/**
 * GET /api/admin/sms-diagnostic
 *
 * One-shot SMS gateway probe. Auth: EITHER admin session (just sign in
 * + visit the URL in browser) OR Bearer CRON_SECRET (curl from terminal).
 * Built urgently 2026-05-20 night for the "ส่ง SMS ไม่สำเร็จ" prod incident:
 * register form was returning `sms_failed` and we needed to see the real
 * ThaiBulkSMS reply without waiting on the next failed user surfacing in
 * Vercel logs.
 *
 *   # In browser (easiest — just sign in as admin first):
 *   https://pacred.co.th/api/admin/sms-diagnostic
 *   https://pacred.co.th/api/admin/sms-diagnostic?phone=0626030456
 *
 *   # OR from terminal:
 *   curl -H "authorization: Bearer $CRON_SECRET" \
 *     "https://pacred.co.th/api/admin/sms-diagnostic?phone=0626030456"
 *
 * Response shape (always 200 when auth'd — read the JSON):
 *   {
 *     env:     { hasKey, hasSecret, keyPrefix, sender, otpBypass, smsProvider },
 *     balance: { ok, balance?, unit?, error? },
 *     send:    { ok, messageId?, error?, status?, body? }   // omitted when phone unset
 *   }
 *
 * Env effect: ZERO. Sends one real SMS only when `?phone=` is supplied.
 * The fingerprint fields (`keyPrefix`, length-only) never expose the
 * full secret — just enough to tell apart placeholder/real/empty.
 */

import { NextResponse } from "next/server";
import { sendSms, checkSmsBalance } from "@/lib/sms/gateway";
import { getAdminRoles } from "@/lib/auth/require-admin";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  // Auth path 1 — admin session cookie (browser visit after login)
  const adminRoles = await getAdminRoles();
  const isAdmin    = Array.isArray(adminRoles) && adminRoles.length > 0;

  // Auth path 2 — Bearer CRON_SECRET (curl from terminal)
  const auth     = request.headers.get("authorization");
  const secret   = process.env.CRON_SECRET;
  const cronOk   = !!secret && auth === `Bearer ${secret}`;

  if (!isAdmin && !cronOk) {
    return NextResponse.json(
      { ok: false, error: "unauthorized", hint: "sign in as admin OR pass Authorization: Bearer $CRON_SECRET" },
      { status: 401 },
    );
  }

  const url   = new URL(request.url);
  const phone = url.searchParams.get("phone");

  const apiKey    = process.env.THAIBULKSMS_API_KEY ?? "";
  const apiSecret = process.env.THAIBULKSMS_API_SECRET ?? "";

  const env = {
    hasKey:      Boolean(apiKey),
    hasSecret:   Boolean(apiSecret),
    keyLength:   apiKey.length,
    keyPrefix:   apiKey.slice(0, 4),       // e.g. "YOUR" (placeholder!) or "abc1" (real)
    keySuffix:   apiKey.slice(-3),
    placeholder: apiKey.startsWith("YOUR_") || apiSecret.startsWith("YOUR_"),
    sender:      process.env.THAIBULKSMS_SENDER ?? "Pacred",
    provider:    process.env.SMS_PROVIDER ?? "thaibulksms",
    otpBypass:   process.env.OTP_BYPASS === "true",
  };

  // 1) balance probe (safe — no SMS sent)
  const balance = await checkSmsBalance();

  // 2) optional live send — only when ?phone= is supplied
  let send: unknown = "skipped (pass ?phone=66... or 09... to actually send)";
  if (phone) {
    const sms = await sendSms(
      phone,
      `Pacred diagnostic ${new Date().toISOString().slice(11, 19)}`,
    );
    send = sms;
  }

  return NextResponse.json({
    ok: true,
    note: "DIAGNOSTIC — keys are never echoed; only length/prefix",
    env,
    balance,
    send,
  });
}
