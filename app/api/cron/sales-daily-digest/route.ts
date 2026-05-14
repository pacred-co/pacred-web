import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

/**
 * GET /api/cron/sales-daily-digest
 *
 * Daily 00:05 ICT digest of yesterday's paid sales totals across the
 * three revenue streams: ฝากสั่งซื้อ (service-orders), ฝากนำเข้า
 * (forwarders), ฝากโอนหยวน (yuan transfers). Mirrors legacy
 * pcs-admin/api/autorun/send-line-sales/index.php.
 *
 * SCAFFOLD STATE — built by เดฟ for ภูม to finish.
 *   ✅ auth + Supabase admin client + aggregation queries wired
 *   ❌ recipient strategy + LINE/email dispatch left as TODO
 *
 * Schedule via vercel.json:
 *   { "path": "/api/cron/sales-daily-digest", "schedule": "5 17 * * *" }
 *   (17:05 UTC = 00:05 ICT — Vercel cron runs in UTC)
 *
 * Authentication: same pattern as /api/cron/auto-cancel-orders —
 * Vercel's `x-vercel-cron` header OR `Bearer ${CRON_SECRET}`.
 *
 * Legacy mapping (tb_wallet_hs.type → wallet_transactions.kind):
 *   3 ชำระฝากสั่ง  → 'order_payment'
 *   5 ชำระนำเข้า   → 'import_payment'
 *   7 ชำระโอนหยวน → 'yuan_payment'
 *
 * @see C:\xampp\htdocs\pcscargo\member\pcs-admin\api\autorun\send-line-sales\index.php
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
  const now      = new Date();

  // Compute "yesterday" + "this month so far" boundaries in ICT (UTC+7)
  // since the report is for a Thai-business audience and the legacy
  // PHP runs at 00:05 ICT.
  const ictNow      = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  const ictYday     = new Date(ictNow);
  ictYday.setUTCDate(ictYday.getUTCDate() - 1);
  const yyyymmdd    = ictYday.toISOString().slice(0, 10);                          // "2026-05-13"
  const ydayStart   = new Date(`${yyyymmdd}T00:00:00+07:00`).toISOString();
  const ydayEnd     = new Date(`${yyyymmdd}T23:59:59.999+07:00`).toISOString();
  const monthStart  = new Date(`${yyyymmdd.slice(0, 7)}-01T00:00:00+07:00`).toISOString();
  const monthLabel  = `${yyyymmdd.slice(0, 7)}`;                                   // "2026-05"

  // Aggregate yesterday + month-to-date totals per kind.
  const kinds = ["order_payment", "import_payment", "yuan_payment"] as const;
  type Kind   = typeof kinds[number];

  const totals: Record<Kind, { yday: { sum: number; count: number }; mtd: { sum: number } }> = {
    order_payment:  { yday: { sum: 0, count: 0 }, mtd: { sum: 0 } },
    import_payment: { yday: { sum: 0, count: 0 }, mtd: { sum: 0 } },
    yuan_payment:   { yday: { sum: 0, count: 0 }, mtd: { sum: 0 } },
  };

  for (const kind of kinds) {
    const { data: ydayRows, error: ydayErr } = await supabase
      .from("wallet_transactions")
      .select("amount")
      .eq("kind", kind)
      .eq("status", "completed")
      .gte("created_at", ydayStart)
      .lte("created_at", ydayEnd);

    if (ydayErr) {
      return NextResponse.json({ ok: false, error: ydayErr.message, stage: "yday" }, { status: 500 });
    }

    totals[kind].yday.sum   = (ydayRows ?? []).reduce((s, r) => s + Number(r.amount ?? 0), 0);
    totals[kind].yday.count = (ydayRows ?? []).length;

    const { data: mtdRows, error: mtdErr } = await supabase
      .from("wallet_transactions")
      .select("amount")
      .eq("kind", kind)
      .eq("status", "completed")
      .gte("created_at", monthStart);

    if (mtdErr) {
      return NextResponse.json({ ok: false, error: mtdErr.message, stage: "mtd" }, { status: 500 });
    }

    totals[kind].mtd.sum = (mtdRows ?? []).reduce((s, r) => s + Number(r.amount ?? 0), 0);
  }

  // ────────────────────────────────────────────────────────────
  // TODO(ภูม): recipient strategy + LINE/email dispatch
  //
  // Legacy PHP broadcasts to a single LINE Notify token (now EOL).
  // Pacred options:
  //   (a) Loop admins where role IN ('super','sales_admin') AND
  //       notify_channels.daily_digest === true → call sendNotification()
  //       per admin (writes to notifications table + LINE push)
  //   (b) Use LINE Messaging API multicast to a fixed LINE OA group
  //       (set LINE_DIGEST_GROUP_ID env var)
  //   (c) Email-only via Resend to a configured admin distribution list
  //
  // For (a), need to extend lib/notifications/types.ts NotifyPayload to
  // accept multi-line markdown body, and add a `daily_digest` channel
  // toggle to profiles.notify_channels jsonb.
  //
  // Recommend (a) — already integrates with notifications inbox so admins
  // see the digest in-app even if LINE/email are bypassed.
  // ────────────────────────────────────────────────────────────

  const message = formatDigestMessage(yyyymmdd, monthLabel, totals);

  logger.info("cron.sales-daily-digest", "computed digest — dispatch not yet wired", {
    yyyymmdd,
    monthLabel,
    order_yday_sum:  totals.order_payment.yday.sum,
    import_yday_sum: totals.import_payment.yday.sum,
    yuan_yday_sum:   totals.yuan_payment.yday.sum,
  });

  return NextResponse.json({
    ok:        true,
    scaffold:  true,
    yyyymmdd,
    month:     monthLabel,
    totals,
    message,
    note:      "dispatch to admins not yet wired — see TODO in route.ts",
  });
}

function formatDigestMessage(
  yyyymmdd: string,
  month: string,
  totals: Record<"order_payment" | "import_payment" | "yuan_payment", { yday: { sum: number; count: number }; mtd: { sum: number } }>,
): string {
  const fmt = (n: number) => n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return [
    `ยอด Pacred วันที่ ${yyyymmdd}`,
    "",
    `ฝากสั่งซื้อ ${fmt(totals.order_payment.yday.sum)} บาท · ${totals.order_payment.yday.count} รายการ`,
    `ฝากนำเข้า  ${fmt(totals.import_payment.yday.sum)} บาท · ${totals.import_payment.yday.count} รายการ`,
    `ฝากโอนหยวน ${fmt(totals.yuan_payment.yday.sum)} บาท · ${totals.yuan_payment.yday.count} รายการ`,
    "",
    `สะสมเดือน ${month}`,
    `ฝากสั่งซื้อ ${fmt(totals.order_payment.mtd.sum)}  ฝากนำเข้า ${fmt(totals.import_payment.mtd.sum)}  ฝากโอนหยวน ${fmt(totals.yuan_payment.mtd.sum)}`,
    "(ยอดค่าสินค้าไม่ได้หมายถึงกำไร)",
  ].join("\n");
}
