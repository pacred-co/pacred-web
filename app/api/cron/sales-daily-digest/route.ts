import { createAdminClient } from "@/lib/supabase/admin";
import { sendNotification } from "@/lib/notifications";
import { notify } from "@/lib/notifications/templates";
import { logger } from "@/lib/logger";
import { instrumentCron } from "@/lib/cron/instrument";

/**
 * GET /api/cron/sales-daily-digest
 *
 * Daily 00:05 ICT digest of yesterday's paid sales totals across the
 * three revenue streams: ฝากสั่งซื้อ (service-orders), ฝากนำเข้า
 * (forwarders), ฝากโอนหยวน (yuan transfers). Mirrors legacy
 * pcs-admin/api/autorun/send-line-sales/index.php.
 *
 * Schedule: "5 17 * * *" (17:05 UTC = 00:05 ICT).
 *
 * U4-1: wrapped in instrumentCron — response shape preserved.
 *
 * @see C:\xampp\htdocs\pcscargo\member\pcs-admin\api\autorun\send-line-sales\index.php
 */
export async function GET(request: Request) {
  return instrumentCron({
    cronPath: "/api/cron/sales-daily-digest",
    request,
    handler: async () => {
      const supabase = createAdminClient();
      const now      = new Date();

      const ictNow      = new Date(now.getTime() + 7 * 60 * 60 * 1000);
      const ictYday     = new Date(ictNow);
      ictYday.setUTCDate(ictYday.getUTCDate() - 1);
      const yyyymmdd    = ictYday.toISOString().slice(0, 10);
      const ydayStart   = new Date(`${yyyymmdd}T00:00:00+07:00`).toISOString();
      const ydayEnd     = new Date(`${yyyymmdd}T23:59:59.999+07:00`).toISOString();
      const monthStart  = new Date(`${yyyymmdd.slice(0, 7)}-01T00:00:00+07:00`).toISOString();
      const monthLabel  = `${yyyymmdd.slice(0, 7)}`;

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
          return {
            status:     "failure" as const,
            error:      ydayErr.message,
            payload:    { ok: false, error: ydayErr.message, stage: "yday" },
            httpStatus: 500,
          };
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
          return {
            status:     "failure" as const,
            error:      mtdErr.message,
            payload:    { ok: false, error: mtdErr.message, stage: "mtd" },
            httpStatus: 500,
          };
        }

        totals[kind].mtd.sum = (mtdRows ?? []).reduce((s, r) => s + Number(r.amount ?? 0), 0);
      }

      const message = formatDigestMessage(yyyymmdd, monthLabel, totals);

      type AdminRow = {
        profile_id: string;
        profile:
          | { notify_channels: { daily_digest?: boolean } | null }
          | { notify_channels: { daily_digest?: boolean } | null }[]
          | null;
      };
      const { data: targetAdmins, error: adminErr } = await supabase
        .from("admins")
        .select("profile_id, profile:profiles!profile_id ( notify_channels )")
        .in("role", ["super", "sales_admin"])
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
      for (const row of (targetAdmins ?? []) as AdminRow[]) {
        const pid = row.profile_id;
        if (!pid || seen.has(pid)) continue;
        seen.add(pid);

        const profile = Array.isArray(row.profile) ? row.profile[0] ?? null : row.profile;
        const optedIn = profile?.notify_channels?.daily_digest === true;
        if (!optedIn) {
          skipped.push(pid);
          continue;
        }

        await sendNotification(pid, notify.salesDigest({ yyyymmdd, message }));
        dispatched.push(pid);
      }

      logger.info("cron.sales-daily-digest", "digest dispatched", {
        yyyymmdd,
        monthLabel,
        dispatched_count: dispatched.length,
        skipped_count:    skipped.length,
        order_yday_sum:   totals.order_payment.yday.sum,
        import_yday_sum:  totals.import_payment.yday.sum,
        yuan_yday_sum:    totals.yuan_payment.yday.sum,
      });

      return {
        status:  "success" as const,
        summary: {
          yyyymmdd,
          month:      monthLabel,
          dispatched: dispatched.length,
          skipped:    skipped.length,
          order_yday: totals.order_payment.yday.sum,
          import_yday: totals.import_payment.yday.sum,
          yuan_yday:  totals.yuan_payment.yday.sum,
        },
        payload: {
          ok:        true,
          yyyymmdd,
          month:     monthLabel,
          totals,
          message,
          dispatched_count: dispatched.length,
          skipped_count:    skipped.length,
        },
      };
    },
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
