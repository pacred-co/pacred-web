/**
 * Gap #8 — กำไรฝากสั่งซื้อสินค้า (Shop-order P&L per order)
 *
 * Faithful port of legacy `report-shops-profit.php`. Order-by-order P&L
 * for ฝากสั่งซื้อ; cost in THB vs sale in THB.
 *
 * Legacy SQL (paraphrased):
 *   SELECT ho.*, (hTotalPriceCHN+hShippingCHN)*hRate AS priceUser,
 *                hRateCost*hCostAll AS pricePCS
 *   FROM tb_header_order ho
 *   WHERE hStatus<>6 AND hDate BETWEEN $from AND $to;
 *   profit = priceUser - pricePCS
 *   vat7   = profit * 0.07
 *
 * Pacred mapping:
 *   - hCostAll, hRateCost                → service_orders.cost_all_thb (pre-computed)
 *   - (hTotalPriceCHN+hShippingCHN)*hRate → service_orders.total_thb   (pre-computed)
 *
 * Date range via ?from=YYYY-MM-DD&to=YYYY-MM-DD (default last 30 days).
 *
 * Role gate: super, accounting (financial — money admins only).
 */

import { requireAdmin } from "@/lib/auth/require-admin";
import { ReportShell } from "@/components/admin/reports/report-shell";
import { getShopsProfitReport } from "@/actions/admin/reports";
import {
  resolveDateRange, thb, dateTh, intTh, type ReportData,
} from "@/lib/admin/reports/types";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  pending:       "รอดำเนินการ",
  awaiting_payment: "รอชำระเงิน",
  ordered:       "สั่งสินค้า",
  processing:    "สั่งสินค้า",
  awaiting_chn_dispatch: "รอร้านจีนจัดส่ง",
  shipped_china: "จัดส่งแล้ว",
  completed:     "สำเร็จ",
};

export default async function ShopsProfitReportPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  await requireAdmin(["super", "accounting"]);

  const sp = await searchParams;
  const range = resolveDateRange(sp);
  const res = await getShopsProfitReport(range);

  const rows = res.ok ? res.data : [];
  const totalCost   = rows.reduce((s, r) => s + r.cost_thb, 0);
  const totalSale   = rows.reduce((s, r) => s + r.sale_thb, 0);
  const totalProfit = rows.reduce((s, r) => s + r.service_fee, 0);
  const totalVat    = rows.reduce((s, r) => s + r.vat7, 0);
  const rowsWithCost = rows.filter((r) => r.cost_thb > 0).length;

  const data: ReportData = {
    columns: [
      { key: "created_at",    label: "วันที่สร้าง",     format: (v) => dateTh(v as string) },
      { key: "h_no",          label: "เลขที่ออเดอร์" },
      { key: "customer_name", label: "ลูกค้า" },
      { key: "title",         label: "ข้อมูลสินค้า" },
      { key: "cost_thb",      label: "ราคาต้นทุน (บาท)", align: "right", format: (v) => Number(v) > 0 ? thb(v as number) : "—" },
      { key: "sale_thb",      label: "ราคาขาย (บาท)",  align: "right", format: (v) => thb(v as number) },
      { key: "service_fee",   label: "ค่าบริการ (บาท)", align: "right", format: (v) => Number(v) > 0 ? thb(v as number) : "—" },
      { key: "vat7",          label: "ภาษีฯ 7% (บาท)",  align: "right", format: (v) => Number(v) > 0 ? thb(v as number) : "—" },
      { key: "status",        label: "สถานะ",          format: (v) => STATUS_LABEL[String(v)] ?? String(v) },
    ],
    rows: rows.map((r) => ({
      id: r.id,
      created_at:    r.created_at,
      h_no:          r.h_no,
      customer_name: `${r.member_code ? `[${r.member_code}] ` : ""}${r.customer_name}`,
      title:         r.item_count > 1 ? `${r.title} และอีก ${r.item_count - 1} รายการ` : r.title,
      cost_thb:      r.cost_thb,
      sale_thb:      r.sale_thb,
      service_fee:   r.service_fee,
      vat7:          r.vat7,
      status:        r.status,
    })),
    totals: {
      created_at: "รวมทั้งสิ้น",
      cost_thb:   thb(totalCost),
      sale_thb:   thb(totalSale),
      service_fee: thb(totalProfit),
      vat7:       thb(totalVat),
    },
  };

  return (
    <ReportShell
      title="กำไรฝากสั่งซื้อสินค้า"
      subtitle="ระบบจะแสดงข้อมูลออเดอร์ในช่วงเวลาที่เลือก (ยกเว้นยกเลิก)"
      range={range}
      pathname="/admin/reports/shops-profit"
      summary={[
        { label: "ออเดอร์ทั้งหมด",       value: intTh(rows.length) },
        { label: "กรอกต้นทุนแล้ว",      value: `${intTh(rowsWithCost)} / ${intTh(rows.length)}` },
        { label: "ราคาขายรวม",          value: thb(totalSale) },
        { label: "ค่าบริการ (กำไรรวม)",  value: thb(totalProfit), tone: "primary" },
      ]}
      data={data}
      csvSlug="shops-profit"
      sourceNote={
        res.ok
          ? "Source: service_orders (ทุก status ยกเว้น cancelled) — port of report-shops-profit.php"
          : `❌ โหลดข้อมูลล้มเหลว: ${res.error}`
      }
    />
  );
}
