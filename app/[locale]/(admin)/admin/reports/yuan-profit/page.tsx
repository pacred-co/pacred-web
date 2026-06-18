/**
 * Gap #8 — กำไรฝากโอนหยวน (Yuan-transfer P&L per request)
 *
 * Faithful port of legacy `report-payments-profit.php`. Each ฝากโอน has a
 * customer-rate THB (sale) + a cost-rate THB (Pacred's actual yuan cost).
 * Profit = sale - cost.
 *
 * Legacy SQL (paraphrased):
 *   SELECT p.payTHB, p.payTHBCost, ... FROM tb_payment p
 *   WHERE DATE(payDate) BETWEEN $from AND $to
 *     AND (payStatus IN (1,2) OR all);
 *
 * Pacred mapping:
 *   - payTHB     → yuan_payments.thb_amount
 *   - payTHBCost → yuan_payments.cost_thb (admin-internal)
 *   - profit     → yuan_payments.profit_thb (cached) — else thb_amount - cost_thb
 *
 * Date range via ?from=YYYY-MM-DD&to=YYYY-MM-DD (default last 30 days).
 *
 * Role gate: super, accounting (financial — money admins only).
 */

import { requireAdmin } from "@/lib/auth/require-admin";
import { canViewCostProfit } from "@/lib/admin/money-visibility";
import { ReportShell } from "@/components/admin/reports/report-shell";
import { getYuanProfitReport, getYuanProfitDailySeries } from "@/actions/admin/reports";
import { DailyProfitChart } from "../_components/daily-profit-chart";
import {
  resolveDateRange, thb, dateTh, intTh, decTh, type ReportData,
} from "@/lib/admin/reports/types";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  pending:    "รอดำเนินการ",
  processing: "กำลังโอน",
  completed:  "สำเร็จ",
};
const CHANNEL_LABEL: Record<string, string> = {
  // P0-20: action now returns raw legacy paytype codes (1=Alipay, 2=Wechat,
  // 3=Union/bank, 4=USDT) directly from tb_payment.paytype. Keep the slug
  // aliases too for back-compat with any historic data.
  "1":    "Alipay",
  "2":    "WeChat",
  "3":    "โอนธนาคารจีน",
  "4":    "USDT",
  alipay: "Alipay",
  wechat: "WeChat",
  bank:   "โอนธนาคารจีน",
};

export default async function YuanProfitReportPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { roles } = await requireAdmin(["super", "accounting"]);
  // Money-internal visibility (owner 2026-06-18): เรทต้นทุน (cost_rate),
  // ราคาต้นทุน (cost_thb) + the derived กำไร (profit = sale - cost) are money
  // internals — visible ONLY to ultra/accounting/pricing, NOT super. When
  // false we drop those columns from `data.columns` AND those keys from
  // `data.rows`/`data.totals` so they never reach the DOM or the
  // ReportShell-built CSV (CSV is built from `data`, no re-fetch).
  // DERIVED-VALUE TRAP: profit reveals cost, so it is hidden together.
  const showCostProfit = canViewCostProfit(roles);

  const sp = await searchParams;
  const range = resolveDateRange(sp);
  const [res, seriesRes] = await Promise.all([
    getYuanProfitReport(range),
    // Daily profit series (legacy graph: payStatus=2 SUM(payProfitTHB) GROUP BY day).
    getYuanProfitDailySeries(range),
  ]);
  const series = seriesRes.ok ? seriesRes.data : [];

  const rows = res.ok ? res.data : [];
  const totalYuan   = rows.reduce((s, r) => s + r.yuan_amount, 0);
  const totalCost   = rows.reduce((s, r) => s + r.cost_thb, 0);
  const totalSale   = rows.reduce((s, r) => s + r.sale_thb, 0);
  const totalProfit = rows.reduce((s, r) => s + r.profit, 0);
  // Theme B fidelity (2026-05-31 · owner #2): legacy report-payments-profit.php
  // has NO VAT column (VAT7 is shops-only). Column dropped.
  const rowsWithCost = rows.filter((r) => r.cost_thb > 0).length;

  const data: ReportData = {
    columns: [
      { key: "created_at",   label: "เวลาทำรายการ", format: (v) => dateTh(v as string) },
      { key: "customer_name", label: "ลูกค้า" },
      { key: "channel",      label: "ช่องทาง", format: (v) => CHANNEL_LABEL[String(v)] ?? String(v) },
      { key: "yuan_amount",  label: "หยวน",          align: "right", format: (v) => "¥" + decTh(v as number, 2) },
      { key: "exchange_rate", label: "เรทขาย",        align: "right", format: (v) => decTh(v as number, 4) },
      // Money-internal cost columns — ultra/accounting/pricing only.
      ...(showCostProfit
        ? [
            { key: "cost_rate", label: "เรทต้นทุน", align: "right" as const, format: (v: unknown) => v != null ? decTh(v as number, 4) : "—" },
            { key: "cost_thb",  label: "ราคาต้นทุน (บาท)", align: "right" as const, format: (v: unknown) => Number(v) > 0 ? thb(v as number) : "—" },
          ]
        : []),
      { key: "sale_thb",     label: "ราคาขาย (บาท)",  align: "right", format: (v) => thb(v as number) },
      // Derived profit reveals cost → hidden together.
      ...(showCostProfit
        ? [{ key: "profit", label: "กำไร (บาท)", align: "right" as const, format: (v: unknown) => Number(v) > 0 ? thb(v as number) : "—" }]
        : []),
      { key: "status",       label: "สถานะ",         format: (v) => STATUS_LABEL[String(v)] ?? String(v) },
    ],
    rows: rows.map((r) => ({
      id: r.id,
      created_at:    r.created_at,
      customer_name: `${r.member_code ? `[${r.member_code}] ` : ""}${r.customer_name}`,
      channel:       r.channel,
      yuan_amount:   r.yuan_amount,
      exchange_rate: r.exchange_rate,
      // Omit the cost/profit keys from the serialized row when not allowed —
      // the value must never reach the client payload (CSV is built from this).
      ...(showCostProfit
        ? { cost_rate: r.cost_rate, cost_thb: r.cost_thb, profit: r.profit }
        : {}),
      sale_thb:      r.sale_thb,
      status:        r.status,
    })),
    totals: {
      created_at: "รวมทั้งสิ้น",
      yuan_amount: "¥" + decTh(totalYuan, 2),
      ...(showCostProfit ? { cost_thb: thb(totalCost) } : {}),
      sale_thb:   thb(totalSale),
      ...(showCostProfit ? { profit: thb(totalProfit) } : {}),
    },
  };

  // Summary cards — the cost/profit cards are money-internal and only render
  // for ultra/accounting/pricing (the chart below plots daily profit, so it is
  // hidden together).
  const summary = showCostProfit
    ? [
        { label: "รายการทั้งหมด",        value: intTh(rows.length) },
        { label: "กรอกต้นทุนแล้ว",       value: `${intTh(rowsWithCost)} / ${intTh(rows.length)}` },
        { label: "ราคาขายรวม",           value: thb(totalSale) },
        { label: "กำไรรวม",              value: thb(totalProfit), tone: "primary" as const },
      ]
    : [
        { label: "รายการทั้งหมด",        value: intTh(rows.length) },
        { label: "ราคาขายรวม",           value: thb(totalSale) },
      ];

  return (
    <>
      {showCostProfit ? (
        <div className="px-6 pt-6 lg:px-8 lg:pt-8">
          <DailyProfitChart points={series} label="กราฟกำไรรายวัน (ฝากโอน · เฉพาะรายการที่อนุมัติแล้ว)" />
        </div>
      ) : null}
      <ReportShell
        title="กำไรฝากโอน/ชำระเงิน (หยวน)"
        subtitle="ราคาขายและราคาต้นทุนหยวนของรายการฝากโอน (ไม่นับสถานะยกเลิก / ปฏิเสธ / ล้มเหลว)"
        range={range}
        pathname="/admin/reports/yuan-profit"
        summary={summary}
        data={data}
        csvSlug="yuan-profit"
        sourceNote={
          res.ok
            ? "Source: tb_payment — port of report-payments-profit.php · graph: payStatus=2"
            : `❌ โหลดข้อมูลล้มเหลว: ${res.error}`
        }
      />
    </>
  );
}
