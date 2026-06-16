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
import { getShopsProfitReport, getShopsProfitDailySeries } from "@/actions/admin/reports";
import { DailyProfitChart } from "../_components/daily-profit-chart";
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
  arrived_china_warehouse: "ถึงโกดังจีน", // owner 2026-06-16 · MOMO arrival
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
  const [res, seriesRes] = await Promise.all([
    getShopsProfitReport(range),
    // Daily profit series (legacy graph: hStatus=5 SUM(hTotalPriceUser)−SUM(hCostAllTH) by day).
    getShopsProfitDailySeries(range),
  ]);
  const series = seriesRes.ok ? seriesRes.data : [];

  const rows = res.ok ? res.data : [];
  // Legacy report-shops-profit.php only sums rows with a cost entered
  // (hCostAll != 0); "รอคำนวณ" rows are excluded from the footer totals.
  const costedRows = rows.filter((r) => !r.awaiting_cost);
  const totalCost   = costedRows.reduce((s, r) => s + r.cost_thb, 0);
  const totalSale   = costedRows.reduce((s, r) => s + r.sale_thb, 0);
  const totalProfit = costedRows.reduce((s, r) => s + r.service_fee, 0);
  const totalVat    = costedRows.reduce((s, r) => s + r.vat7, 0);
  const rowsWithCost = costedRows.length;

  // Legacy shows "รอคำนวณ" in the money cells for rows with no cost yet.
  // The shell's formatter only sees the cell value (not the row), so a string
  // sentinel renders verbatim while numbers go through the baht formatter.
  const moneyFmt = (v: unknown) =>
    typeof v === "string" ? v : Number(v) > 0 ? thb(v as number) : "—";
  const saleFmt = (v: unknown) =>
    typeof v === "string" ? v : thb(v as number);

  const data: ReportData = {
    columns: [
      { key: "created_at",    label: "วันที่สร้าง",     format: (v) => dateTh(v as string) },
      { key: "h_no",          label: "เลขที่ออเดอร์" },
      { key: "customer_name", label: "ลูกค้า" },
      { key: "title",         label: "ข้อมูลสินค้า" },
      { key: "cost_thb",      label: "ราคาต้นทุน (บาท)", align: "right", format: moneyFmt },
      { key: "sale_thb",      label: "ราคาขาย (บาท)",  align: "right", format: saleFmt },
      { key: "service_fee",   label: "ค่าบริการ (บาท)", align: "right", format: moneyFmt },
      { key: "vat7",          label: "ภาษีฯ 7% (บาท)",  align: "right", format: moneyFmt },
      { key: "status",        label: "สถานะ",          format: (v) => STATUS_LABEL[String(v)] ?? String(v) },
    ],
    rows: rows.map((r) => ({
      id: r.id,
      created_at:    r.created_at,
      h_no:          r.h_no,
      customer_name: `${r.member_code ? `[${r.member_code}] ` : ""}${r.customer_name}`,
      title:         r.item_count > 1 ? `${r.title} และอีก ${r.item_count - 1} รายการ` : r.title,
      // "รอคำนวณ" when cost not entered (legacy L224-225) — excluded from totals.
      cost_thb:      r.awaiting_cost ? "รอคำนวณ" : r.cost_thb,
      sale_thb:      r.awaiting_cost ? "รอคำนวณ" : r.sale_thb,
      service_fee:   r.awaiting_cost ? "รอคำนวณ" : r.service_fee,
      vat7:          r.awaiting_cost ? "รอคำนวณ" : r.vat7,
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
    <>
      <div className="px-6 pt-6 lg:px-8 lg:pt-8 space-y-4">
        <DailyProfitChart points={series} label="กราฟกำไรรายวัน (ฝากสั่งซื้อ · เฉพาะสถานะสำเร็จ)" />
        {/* Guide (owner #4 "มีไกด์แนะนำ") — explains the live-recompute formula. */}
        <div className="rounded-2xl border border-sky-200 bg-sky-50/60 dark:bg-sky-950/20 p-4 text-sm">
          <p className="font-semibold text-sky-900 dark:text-sky-200">📘 วิธีคิดกำไรในตารางนี้ (คำนวณสดจากเรท/ต้นทุนล่าสุด)</p>
          <ul className="mt-2 space-y-1 text-sky-800 dark:text-sky-300 leading-relaxed">
            <li>• <b>ราคาขาย</b> = ปัดขึ้น(2 ตำแหน่ง) ของ <code className="font-mono">(ราคาสินค้า¥ + ค่าส่งในจีน¥) × เรทขาย</code></li>
            <li>• <b>ราคาต้นทุน</b> = ปัดขึ้น(2 ตำแหน่ง) ของ <code className="font-mono">เรทต้นทุน × ต้นทุนรวม¥</code></li>
            <li>• <b>ค่าบริการ (กำไร)</b> = ราคาขาย − ราคาต้นทุน &nbsp;·&nbsp; <b>VAT 7%</b> = กำไร × 0.07</li>
            <li>• ออเดอร์ที่ยัง<b>ไม่ได้กรอกต้นทุน</b> จะขึ้นว่า <span className="font-mono">รอคำนวณ</span> และ<b>ไม่ถูกนำไปรวม</b>ในยอดสรุปด้านล่าง</li>
          </ul>
        </div>
      </div>
      <ReportShell
        title="กำไรฝากสั่งซื้อสินค้า"
        subtitle="ระบบจะแสดงข้อมูลออเดอร์ในช่วงเวลาที่เลือก (ยกเว้นยกเลิก) — กำไรคำนวณสดจากเรท/ต้นทุน"
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
            ? "Source: tb_header_order (ทุก status ยกเว้น cancelled · คำนวณกำไรสด) — port of report-shops-profit.php · graph: hStatus=5"
            : `❌ โหลดข้อมูลล้มเหลว: ${res.error}`
        }
      />
    </>
  );
}
