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
import { ReportShell } from "@/components/admin/reports/report-shell";
import { getYuanProfitReport } from "@/actions/admin/reports";
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
  alipay: "Alipay",
  wechat: "WeChat",
  bank:   "โอนธนาคารจีน",
};

export default async function YuanProfitReportPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  await requireAdmin(["super", "accounting"]);

  const sp = await searchParams;
  const range = resolveDateRange(sp);
  const res = await getYuanProfitReport(range);

  const rows = res.ok ? res.data : [];
  const totalYuan   = rows.reduce((s, r) => s + r.yuan_amount, 0);
  const totalCost   = rows.reduce((s, r) => s + r.cost_thb, 0);
  const totalSale   = rows.reduce((s, r) => s + r.sale_thb, 0);
  const totalProfit = rows.reduce((s, r) => s + r.profit, 0);
  const totalVat    = rows.reduce((s, r) => s + r.vat7, 0);
  const rowsWithCost = rows.filter((r) => r.cost_thb > 0).length;

  const data: ReportData = {
    columns: [
      { key: "created_at",   label: "เวลาทำรายการ", format: (v) => dateTh(v as string) },
      { key: "customer_name", label: "ลูกค้า" },
      { key: "channel",      label: "ช่องทาง", format: (v) => CHANNEL_LABEL[String(v)] ?? String(v) },
      { key: "yuan_amount",  label: "หยวน",          align: "right", format: (v) => "¥" + decTh(v as number, 2) },
      { key: "exchange_rate", label: "เรทขาย",        align: "right", format: (v) => decTh(v as number, 4) },
      { key: "cost_rate",    label: "เรทต้นทุน",     align: "right", format: (v) => v != null ? decTh(v as number, 4) : "—" },
      { key: "cost_thb",     label: "ราคาต้นทุน (บาท)", align: "right", format: (v) => Number(v) > 0 ? thb(v as number) : "—" },
      { key: "sale_thb",     label: "ราคาขาย (บาท)",  align: "right", format: (v) => thb(v as number) },
      { key: "profit",       label: "กำไร (บาท)",     align: "right", format: (v) => Number(v) > 0 ? thb(v as number) : "—" },
      { key: "vat7",         label: "ภาษีฯ 7% (บาท)", align: "right", format: (v) => Number(v) > 0 ? thb(v as number) : "—" },
      { key: "status",       label: "สถานะ",         format: (v) => STATUS_LABEL[String(v)] ?? String(v) },
    ],
    rows: rows.map((r) => ({
      id: r.id,
      created_at:    r.created_at,
      customer_name: `${r.member_code ? `[${r.member_code}] ` : ""}${r.customer_name}`,
      channel:       r.channel,
      yuan_amount:   r.yuan_amount,
      exchange_rate: r.exchange_rate,
      cost_rate:     r.cost_rate,
      cost_thb:      r.cost_thb,
      sale_thb:      r.sale_thb,
      profit:        r.profit,
      vat7:          r.vat7,
      status:        r.status,
    })),
    totals: {
      created_at: "รวมทั้งสิ้น",
      yuan_amount: "¥" + decTh(totalYuan, 2),
      cost_thb:   thb(totalCost),
      sale_thb:   thb(totalSale),
      profit:     thb(totalProfit),
      vat7:       thb(totalVat),
    },
  };

  return (
    <ReportShell
      title="กำไรฝากโอน/ชำระเงิน (หยวน)"
      subtitle="ราคาขายและราคาต้นทุนหยวนของรายการฝากโอน (ไม่นับสถานะยกเลิก / ปฏิเสธ / ล้มเหลว)"
      range={range}
      pathname="/admin/reports/yuan-profit"
      summary={[
        { label: "รายการทั้งหมด",        value: intTh(rows.length) },
        { label: "กรอกต้นทุนแล้ว",       value: `${intTh(rowsWithCost)} / ${intTh(rows.length)}` },
        { label: "ราคาขายรวม",           value: thb(totalSale) },
        { label: "กำไรรวม",              value: thb(totalProfit), tone: "primary" },
      ]}
      data={data}
      csvSlug="yuan-profit"
      sourceNote={
        res.ok
          ? "Source: yuan_payments — port of report-payments-profit.php"
          : `❌ โหลดข้อมูลล้มเหลว: ${res.error}`
      }
    />
  );
}
