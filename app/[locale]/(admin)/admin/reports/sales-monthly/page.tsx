/**
 * Gap #8 — ยอดพนักงานขายรายเดือน (Monthly sales-by-rep)
 *
 * Faithful port of legacy `report-sale.php`. Groups ฝากนำเข้า delivered
 * orders by (YYYY-MM, sales rep), with commission = 1% of revenue.
 *
 * Legacy SQL (paraphrased):
 *   SELECT YEAR(srDate), MONTH(srDate), srAdminIDSale,
 *          COUNT(sr.ID), SUM(fWeight), SUM(fVolume),
 *          SUM(fTotalPrice)+SUM(fTransportPrice)+SUM(fPriceUpdate) AS price
 *   FROM tb_sales_report sr
 *   LEFT JOIN tb_forwarder f ON f.ID=sr.fID
 *   WHERE f.fStatus=7
 *   GROUP BY MONTH(srDate), srAdminIDSale
 *   ORDER BY sr.ID DESC;
 *
 * Pacred mapping:
 *   - tb_forwarder.fStatus=7         → forwarders.status='delivered'
 *   - tb_forwarder.fDateStatus7      → forwarders.date_delivered
 *   - tb_admin.adminID (sales rep)   → profiles.sales_admin_id
 *   - fTotalPrice + fTransportPrice  → forwarders.total_price (already summed)
 *
 * Date range via ?from=YYYY-MM-DD&to=YYYY-MM-DD (default last 30 days).
 */

import { requireAdmin } from "@/lib/auth/require-admin";
import { ReportShell } from "@/components/admin/reports/report-shell";
import { getSalesMonthlyReport } from "@/actions/admin/reports";
import {
  resolveDateRange, thb, intTh, decTh, type ReportData,
} from "@/lib/admin/reports/types";

export const dynamic = "force-dynamic";

export default async function SalesMonthlyReportPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  await requireAdmin(["super", "accounting", "ops"]);

  const sp = await searchParams;
  const range = resolveDateRange(sp);
  const res = await getSalesMonthlyReport(range);

  const rows = res.ok ? res.data : [];
  const totalRevenue = rows.reduce((s, r) => s + r.revenue_thb, 0);
  const totalCommission = totalRevenue * 0.01;
  const totalOrders = rows.reduce((s, r) => s + r.order_count, 0);
  const totalKg     = rows.reduce((s, r) => s + r.weight_kg, 0);
  const totalCbm    = rows.reduce((s, r) => s + r.volume_cbm, 0);

  const data: ReportData = {
    columns: [
      { key: "month",          label: "เดือน",          align: "left" },
      { key: "rep_id",         label: "ชื่อ-นามสกุล (Sale)", align: "left" },
      { key: "order_count",    label: "จำนวนออเดอร์",     align: "right", format: (v) => intTh(v as number) },
      { key: "volume_cbm",     label: "ปริมาตร (CBM)",   align: "right", format: (v) => decTh(v as number, 5) },
      { key: "weight_kg",      label: "น้ำหนัก (Kg)",     align: "right", format: (v) => decTh(v as number, 2) },
      { key: "revenue_thb",    label: "ยอดรวม (บาท)",    align: "right", format: (v) => thb(v as number) },
      { key: "commission_thb", label: "ยอดที่ได้จริง (บาท)", align: "right", format: (v) => thb(v as number) },
    ],
    rows,
    totals: {
      month: "รวมทั้งสิ้น",
      order_count: intTh(totalOrders),
      volume_cbm:  decTh(totalCbm, 5),
      weight_kg:   decTh(totalKg, 2),
      revenue_thb: thb(totalRevenue),
      commission_thb: thb(totalCommission),
    },
  };

  return (
    <ReportShell
      title="ยอดพนักงานขายรายเดือน"
      subtitle="ยอดที่ได้จริง คิดเป็น 1% ของยอดออเดอร์ที่สถานะส่งสำเร็จแล้ว"
      range={range}
      pathname="/admin/reports/sales-monthly"
      summary={[
        { label: "จำนวนออเดอร์รวม",   value: intTh(totalOrders) },
        { label: "ยอดรวม (บาท)",       value: thb(totalRevenue), tone: "primary" },
        { label: "ค่าคอมรวม 1% (บาท)", value: thb(totalCommission), tone: "green" },
        { label: "จำนวน sales rep",   value: intTh(new Set(rows.map((r) => r.rep_id)).size) },
      ]}
      data={data}
      csvSlug="sales-monthly"
      sourceNote={
        res.ok
          ? "Source: forwarders (status=delivered) ± profiles.sales_admin_id — port of report-sale.php"
          : `❌ โหลดข้อมูลล้มเหลว: ${res.error}`
      }
    />
  );
}
