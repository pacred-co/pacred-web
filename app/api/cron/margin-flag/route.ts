import { createAdminClient } from "@/lib/supabase/admin";
import { notifyStaffGroup } from "@/lib/notifications/staff-group";
import { logger } from "@/lib/logger";
import { instrumentCron } from "@/lib/cron/instrument";

/**
 * GET /api/cron/margin-flag
 *
 * CEO directive 2026-06-01 follow-up — auto-flag over-cap deliveries.
 *
 * Per CLAUDE.md PM section:
 *   "pricing profit-cap ≤15k฿/ตู้ + sales quote-comparison tool"
 *
 * The Margin Monitor dashboard (/admin/accounting/margin-monitor) is the
 * canonical surface — but it requires staff to OPEN the page to see
 * over-cap or loss orders. Per CEO directive: auto-flag review-worthy
 * orders straight into the staff LINE group so collection-team /
 * sales-leads / ops review them within the day.
 *
 * Daily runs at 17:10 UTC = 00:10 ICT. Scans yesterday's deliveries
 * (tb_forwarder WHERE fstatus='7' AND fdate yesterday) and groups them:
 *   - 🚨 OVER-CAP (margin > ฿15k) — likely under-priced customer
 *   - 🔴 LOSS    (margin < 0)     — rate sheet error or pass-through bug
 *
 * If both lists are empty (or only 1-2 mild over-caps), the cron still
 * pings a "ทุกอย่างปกติ" check-in (gated by FLAG_QUIET env to skip if
 * staff prefer no notification on clean days).
 *
 * Sends ONE Flex card with totals + deep-link to /admin/accounting/margin-monitor
 * for the full breakdown.
 *
 * Wired into vercel.json crons block.
 *
 * Per AGENTS.md §0c — every Supabase query destructures `error`.
 */
export async function GET(request: Request) {
  return instrumentCron({
    cronPath: "/api/cron/margin-flag",
    request,
    handler: async () => {
      const supabase = createAdminClient();
      const now      = new Date();

      // ICT yesterday window
      const ictNow    = new Date(now.getTime() + 7 * 60 * 60 * 1000);
      const ictYday   = new Date(ictNow);
      ictYday.setUTCDate(ictYday.getUTCDate() - 1);
      const yyyymmdd  = ictYday.toISOString().slice(0, 10);
      const ydayStart = new Date(`${yyyymmdd}T00:00:00+07:00`).toISOString();
      const ydayEnd   = new Date(`${yyyymmdd}T23:59:59.999+07:00`).toISOString();

      console.log("[cron.margin-flag] start", { yday: yyyymmdd });

      // Pull yesterday's delivered forwarders (margin realised)
      const { data: rows, error: rowsErr } = await supabase
        .from("tb_forwarder")
        .select("id, userid, ftrackingchn, ftotalprice, fcosttotalprice, fdiscount")
        .eq("fstatus", "7")
        .gte("fdate", ydayStart)
        .lte("fdate", ydayEnd)
        .limit(5000);

      if (rowsErr) {
        logger.error("cron.margin-flag", "tb_forwarder query failed", rowsErr, {});
        return {
          status:     "failure" as const,
          error:      rowsErr.message,
          payload:    { ok: false, error: rowsErr.message, stage: "fetch_forwarders" },
          httpStatus: 500,
        };
      }

      type Row = {
        id: number;
        userid: string | null;
        ftrackingchn: string | null;
        ftotalprice: number | string | null;
        fcosttotalprice: number | string | null;
        fdiscount: number | string | null;
      };
      const fwd = (rows ?? []) as Row[];

      // Compute per-row margin
      const enriched = fwd.map((r) => {
        const sale     = Number(r.ftotalprice ?? 0);
        const cost     = Number(r.fcosttotalprice ?? 0);
        const discount = Number(r.fdiscount ?? 0);
        const margin   = sale - cost - discount;
        return { ...r, margin };
      });

      const overCap = enriched
        .filter((r) => r.margin > 15_000)
        .sort((a, b) => b.margin - a.margin);
      const losses  = enriched
        .filter((r) => r.margin < 0)
        .sort((a, b) => a.margin - b.margin);

      const totalMargin = enriched.reduce((sum, r) => sum + r.margin, 0);
      const totalRows   = enriched.length;
      const avgMargin   = totalRows > 0 ? totalMargin / totalRows : 0;

      // Quiet mode — skip notification on clean days (no over-cap, no loss)
      const quiet = process.env.MARGIN_FLAG_QUIET === "true";
      if (overCap.length === 0 && losses.length === 0 && quiet) {
        console.log("[cron.margin-flag] clean day · quiet mode · skipping notify", { yday: yyyymmdd, totalRows });
        return {
          status:  "success" as const,
          summary: { yyyymmdd, totalRows, overCap: 0, losses: 0, sent: false, reason: "quiet_clean_day" },
          payload: { ok: true, yyyymmdd, totalRows, overCap: 0, losses: 0 },
        };
      }

      const message = formatMarginFlagMessage(yyyymmdd, totalRows, totalMargin, avgMargin, overCap, losses);

      const sent = await notifyStaffGroup(message, {
        url:      "/admin/accounting/margin-monitor",
        urlLabel: "เปิด Margin Monitor",
        title:    overCap.length > 0 || losses.length > 0
          ? "⚠️ Margin Flag — ตู้ที่ต้อง review"
          : "✅ Margin Flag — รายงานประจำวัน",
      });

      console.log(
        `[cron.margin-flag] done — yday=${yyyymmdd} rows=${totalRows} overCap=${overCap.length} losses=${losses.length} avg=${avgMargin.toFixed(2)} sent=${sent}`,
      );
      logger.info("cron.margin-flag", "flag dispatched", {
        yyyymmdd,
        totalRows,
        overCap_count: overCap.length,
        losses_count:  losses.length,
        total_margin:  Math.round(totalMargin * 100) / 100,
        avg_margin:    Math.round(avgMargin * 100) / 100,
        sent,
      });

      return {
        status:  "success" as const,
        summary: {
          yyyymmdd,
          totalRows,
          overCap: overCap.length,
          losses:  losses.length,
          avgMargin: Math.round(avgMargin * 100) / 100,
          sent,
        },
        payload: {
          ok:        true,
          yyyymmdd,
          totalRows,
          overCap_count: overCap.length,
          losses_count:  losses.length,
          total_margin:  Math.round(totalMargin * 100) / 100,
          avg_margin:    Math.round(avgMargin * 100) / 100,
          message,
          sent,
        },
      };
    },
  });
}

function formatMarginFlagMessage(
  yyyymmdd: string,
  totalRows: number,
  totalMargin: number,
  avgMargin: number,
  overCap: Array<{ id: number; userid: string | null; ftrackingchn: string | null; margin: number }>,
  losses:  Array<{ id: number; userid: string | null; ftrackingchn: string | null; margin: number }>,
): string {
  const fmt = (n: number) => n.toLocaleString("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

  const lines: string[] = [
    `📊 Margin Flag · ${yyyymmdd}`,
    "",
    `ตู้ส่งสำเร็จ ${totalRows} ตู้ · กำไรรวม ฿${fmt(totalMargin)} · เฉลี่ย ฿${fmt(avgMargin)}/ตู้`,
  ];

  if (overCap.length > 0) {
    lines.push("");
    lines.push(`🚨 OVER-CAP (กำไร > ฿15k · CEO policy ขอ review):`);
    for (const r of overCap.slice(0, 5)) {
      lines.push(`  #${r.id} ${r.userid ?? "—"} · ฿${fmt(r.margin)}`);
    }
    if (overCap.length > 5) lines.push(`  …และอีก ${overCap.length - 5} ตู้`);
  }

  if (losses.length > 0) {
    lines.push("");
    lines.push(`🔴 LOSS (กำไรติดลบ · เช็ค rate sheet):`);
    for (const r of losses.slice(0, 5)) {
      lines.push(`  #${r.id} ${r.userid ?? "—"} · ฿${fmt(r.margin)}`);
    }
    if (losses.length > 5) lines.push(`  …และอีก ${losses.length - 5} ตู้`);
  }

  if (overCap.length === 0 && losses.length === 0) {
    lines.push("");
    lines.push("✅ ทุกตู้อยู่ใน policy ของ CEO (0-15k/ตู้) — ไม่มีรายการ review");
  }

  return lines.join("\n");
}
