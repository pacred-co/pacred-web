/**
 * Gap #8 — กำไรฝากนำเข้า (Forwarder P&L per order)
 *
 * Faithful port of legacy `report-forwarder-profit.php`. Shows every
 * ฝากนำเข้า in the window with its cost / sale / profit / VAT-7%.
 *
 * Legacy SQL (paraphrased):
 *   SELECT * FROM tb_forwarder WHERE fStatus<>'cancel'
 *           AND DATE(fDate) BETWEEN $from AND $to;
 *   profit = (fTotalPrice+fTransportPrice+fPriceUpdate) - fCostTotalPrice
 *   vat7   = profit * 0.07
 *
 * Pacred mapping:
 *   - fCostTotalPrice                → forwarders.cost_total_price
 *   - fTotalPrice + fTransport + ... → forwarders.total_price (already summed)
 *   - profit_total (cached col)      → used when populated, else computed
 *
 * Date range via ?from=YYYY-MM-DD&to=YYYY-MM-DD (default last 30 days).
 */

import { requireAdmin } from "@/lib/auth/require-admin";
import { ReportShell } from "@/components/admin/reports/report-shell";
import { getForwarderProfitReport } from "@/actions/admin/reports";
import {
  resolveDateRange, thb, dateTh, intTh, type ReportData,
} from "@/lib/admin/reports/types";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  pending_payment:    "รอชำระ",
  shipped_china:      "ออกจีน",
  in_transit:         "กลางทาง",
  arrived_thailand:   "ถึงไทย",
  out_for_delivery:   "ส่ง",
  delivered:          "สำเร็จ",
};
const WAREHOUSE_LABEL: Record<string, string> = { yiwu: "อี้อู", guangzhou: "กวางโจว" };
const TRANSPORT_LABEL: Record<string, string> = { truck: "🚚 รถ", ship: "🚢 เรือ", air: "✈️ เครื่องบิน" };

export default async function ForwarderProfitReportPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  await requireAdmin(["super", "accounting"]);

  const sp = await searchParams;
  const range = resolveDateRange(sp);
  const res = await getForwarderProfitReport(range);

  const rows = res.ok ? res.data : [];
  const totalCost   = rows.reduce((s, r) => s + r.cost_total, 0);
  const totalSale   = rows.reduce((s, r) => s + r.sale_total, 0);
  const totalProfit = rows.reduce((s, r) => s + r.profit, 0);
  const totalVat    = rows.reduce((s, r) => s + r.vat7, 0);
  const rowsWithCost = rows.filter((r) => r.cost_total > 0).length;

  const data: ReportData = {
    columns: [
      { key: "created_at",     label: "วันที่สร้าง",      format: (v) => dateTh(v as string) },
      { key: "f_no",           label: "เลขที่ออเดอร์" },
      { key: "customer_name",  label: "ลูกค้า" },
      { key: "route",          label: "ต้นทาง / ขนส่ง" },
      { key: "cost_total",     label: "ราคาต้นทุน (บาท)",  align: "right", format: (v) => Number(v) > 0 ? thb(v as number) : "—" },
      { key: "sale_total",     label: "ราคาขาย (บาท)",   align: "right", format: (v) => thb(v as number) },
      { key: "profit",         label: "ค่าบริการ (บาท)",  align: "right", format: (v) => Number(v) > 0 ? thb(v as number) : "—" },
      { key: "vat7",           label: "ภาษีฯ 7% (บาท)",   align: "right", format: (v) => Number(v) > 0 ? thb(v as number) : "—" },
      { key: "status",         label: "สถานะ",           format: (v) => STATUS_LABEL[String(v)] ?? String(v) },
    ],
    rows: rows.map((r) => ({
      id: r.id,
      created_at: r.created_at,
      f_no: r.f_no,
      // Pack member_code + name into a single cell — the shell's column
      // formatter only sees the cell value, so collapse customer fields here.
      customer_name: `${r.member_code ? `[${r.member_code}] ` : ""}${r.customer_name}`,
      route: `${WAREHOUSE_LABEL[r.source_warehouse] ?? r.source_warehouse} / ${TRANSPORT_LABEL[r.transport_type] ?? r.transport_type}`,
      cost_total: r.cost_total,
      sale_total: r.sale_total,
      profit:     r.profit,
      vat7:       r.vat7,
      status:     r.status,
    })),
    totals: {
      created_at: "รวมทั้งสิ้น",
      cost_total: thb(totalCost),
      sale_total: thb(totalSale),
      profit:     thb(totalProfit),
      vat7:       thb(totalVat),
    },
  };

  return (
    <ReportShell
      title="กำไรฝากนำเข้า"
      subtitle="ระบบจะแสดงข้อมูลเฉพาะออเดอร์ที่มีการกรอกราคาต้นทุน"
      range={range}
      pathname="/admin/reports/forwarder-profit"
      summary={[
        { label: "ออเดอร์ทั้งหมด",            value: intTh(rows.length) },
        { label: "กรอกต้นทุนแล้ว",           value: `${intTh(rowsWithCost)} / ${intTh(rows.length)}` },
        { label: "ราคาขายรวม",               value: thb(totalSale) },
        { label: "ค่าบริการ (กำไรรวม)",       value: thb(totalProfit), tone: "primary" },
      ]}
      data={data}
      csvSlug="forwarder-profit"
      sourceNote={
        res.ok
          ? "Source: forwarders (ทุก status ยกเว้น cancelled) — port of report-forwarder-profit.php"
          : `❌ โหลดข้อมูลล้มเหลว: ${res.error}`
      }
    />
  );
}
