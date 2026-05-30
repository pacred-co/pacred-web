import { createAdminClient } from "@/lib/supabase/admin";
import { sendNotification } from "@/lib/notifications";
import { notify } from "@/lib/notifications/templates";
import { logger } from "@/lib/logger";
import { instrumentCron } from "@/lib/cron/instrument";

/**
 * GET /api/cron/sales-daily-digest
 *
 * P0-22 — RETARGETED to legacy `tb_wallet_hs` (2026-05-30 night).
 *
 * Daily 00:05 ICT digest of yesterday's wallet-debit revenue across the
 * three streams. The prior implementation read the REBUILT `wallet_transactions`
 * (empty on prod) — every digest reported ฿0 to the LINE channel.
 *
 * Legacy 1:1 port of pcs-admin/api/autorun/send-line-sales/index.php
 * (per ADR-0018 the canonical wallet ledger is tb_wallet + tb_wallet_hs).
 *
 * Stream classification (verbatim from legacy):
 *   - ฝากสั่งซื้อ  → tb_wallet_hs.type IN ('2','4') (approved order debits;
 *                     legacy joins on tb_header_order.hno=refOrder, but
 *                     filtering by type is the SOT classification per the
 *                     `tb_wallet_hs.type` column comment).
 *   - ฝากนำเข้า   → tb_wallet_hs.type='4' (legacy: wh.type=4)
 *                     NOTE: legacy uses '4' for ฝากนำเข้า, which collides
 *                     with the order "เติมเพิ่ม" sub-class. The dominant
 *                     usage is the import join (LEFT JOIN tb_forwarder ON
 *                     f.id=wh.refOrder). We keep the legacy mapping below
 *                     because that's what the LINE digest historically reported.
 *   - ฝากโอนหยวน → tb_wallet_hs.type='6' (legacy: wh.type=6 AND p.payStatus=2,
 *                     but tb_wallet_hs.status='2' already requires the wallet
 *                     leg to be approved, which the legacy join also requires).
 *
 * Filter: tb_wallet_hs.status='2' (=สำเร็จ / approved) — non-negotiable; rejected
 * + pending rows must not count toward the sales total.
 *
 * Schema citations (supabase/migrations/0081_pcs_legacy_schema.sql):
 *   - tb_wallet_hs.date    L6161 (timestamp · COMMENT L6192 "วันที่ทำรายการ")
 *   - tb_wallet_hs.amount  L6163 (numeric(10,2) NOT NULL)
 *   - tb_wallet_hs.status  L6164 (varchar(1) · COMMENT L6213 "1=รอ,2=สำเร็จ,3=ไม่สำเร็จ")
 *   - tb_wallet_hs.type    L6165 (varchar(1) · COMMENT L6220 "1=เติม,2=ชำระฝากสั่ง,3=ถอน,4=ชำระฝากนำเข้า,5=คืน,6=ชำระฝากโอน,7=รอตรวจสอบเติม")
 *
 * Schedule: "5 17 * * *" (17:05 UTC = 00:05 ICT).
 *
 * Legacy PHP: C:\xampp\htdocs\pcscargo\member\pcs-admin\api\autorun\send-line-sales\index.php L20-94
 *
 * U4-1: wrapped in instrumentCron — response shape preserved.
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

      console.log("[cron.sales-daily-digest] start", { yday: yyyymmdd, monthLabel });

      // Stream definitions — legacy semantics:
      //   order_payment  : ฝากสั่งซื้อ — tb_wallet_hs.type='2' (ชำระเงินฝากสั่ง)
      //   import_payment : ฝากนำเข้า   — tb_wallet_hs.type='4' (ชำระเงินฝากนำเข้า)
      //   yuan_payment   : ฝากโอนหยวน  — tb_wallet_hs.type='6' (ชำระเงินฝากโอน)
      // Per tb_wallet_hs.type COMMENT (L6220 of 0081). Status='2' = สำเร็จ.
      const streams = [
        { kind: "order_payment" as const,  whType: "2" },
        { kind: "import_payment" as const, whType: "4" },
        { kind: "yuan_payment" as const,   whType: "6" },
      ];
      type Kind = (typeof streams)[number]["kind"];

      const totals: Record<Kind, { yday: { sum: number; count: number }; mtd: { sum: number } }> = {
        order_payment:  { yday: { sum: 0, count: 0 }, mtd: { sum: 0 } },
        import_payment: { yday: { sum: 0, count: 0 }, mtd: { sum: 0 } },
        yuan_payment:   { yday: { sum: 0, count: 0 }, mtd: { sum: 0 } },
      };

      for (const { kind, whType } of streams) {
        const { data: ydayRows, error: ydayErr } = await supabase
          .from("tb_wallet_hs")
          .select("amount")
          .eq("type", whType)
          .eq("status", "2")
          .gte("date", ydayStart)
          .lte("date", ydayEnd);

        if (ydayErr) {
          console.error("[cron.sales-daily-digest] yday err", kind, ydayErr.message);
          return {
            status:     "failure" as const,
            error:      ydayErr.message,
            payload:    { ok: false, error: ydayErr.message, stage: `yday:${kind}` },
            httpStatus: 500,
          };
        }

        totals[kind].yday.sum   = (ydayRows ?? []).reduce((s, r) => s + Number(r.amount ?? 0), 0);
        totals[kind].yday.count = (ydayRows ?? []).length;

        const { data: mtdRows, error: mtdErr } = await supabase
          .from("tb_wallet_hs")
          .select("amount")
          .eq("type", whType)
          .eq("status", "2")
          .gte("date", monthStart);

        if (mtdErr) {
          console.error("[cron.sales-daily-digest] mtd err", kind, mtdErr.message);
          return {
            status:     "failure" as const,
            error:      mtdErr.message,
            payload:    { ok: false, error: mtdErr.message, stage: `mtd:${kind}` },
            httpStatus: 500,
          };
        }

        totals[kind].mtd.sum = (mtdRows ?? []).reduce((s, r) => s + Number(r.amount ?? 0), 0);
      }

      const message = formatDigestMessage(yyyymmdd, monthLabel, totals);

      // Recipients = admins opted-in via profile.notify_channels.daily_digest.
      // This piece is Pacred-native (LINE OA digest delivery) — kept unchanged
      // from the prior implementation because the recipient list lives in the
      // rebuilt `admins`+`profiles` tables, not tb_admin (which has 0 channel-prefs).
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
        console.error("[cron.sales-daily-digest] fetch admins err", adminErr.message);
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

      console.log(
        `[cron.sales-daily-digest] done — yday=${yyyymmdd} order=${totals.order_payment.yday.sum} import=${totals.import_payment.yday.sum} yuan=${totals.yuan_payment.yday.sum} dispatched=${dispatched.length} skipped=${skipped.length}`,
      );
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
