/**
 * Wave C BI — กำไร & มาร์จิ้น ฝากนำเข้า (forwarder profit/margin analytics).
 *
 * The "10× value" report (cluster-doc 02-cargo-forwarder.md §5 U-1): mines the
 * 47k×114 tb_forwarder dataset for profit / cost / margin grouped by carrier
 * (fshipby) · China warehouse (fwarehousename) · transport mode (ftransporttype)
 * + overall — so ops can find loss-making lanes/carriers. Distinct from the
 * per-order P&L list at /admin/reports/forwarder-profit.
 *
 * Read-only · createAdminClient (RLS-bypass via the action) · force-dynamic.
 * Date range via ?from=YYYY-MM-DD&to=YYYY-MM-DD (default last 30 days) + quick
 * range chips. Mobile-first (cards stack, tables scroll-x).
 */

import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { getForwarderProfitAnalytics } from "@/actions/admin/reports-profit";
import { exportProfitAnalyticsAll } from "@/actions/admin/export/report-profit-analytics";
import type { ProfitGroupRow } from "@/actions/admin/reports-profit-types";
import { CsvButton, type CsvRow, type CsvCol } from "@/components/admin/csv-button";
import {
  resolveDateRange,
  thb,
  intTh,
  decTh,
} from "@/lib/admin/reports/types";

export const dynamic = "force-dynamic";

// Quick-range chips → translate to ?from=&to= so they share resolveDateRange.
function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}
function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

const QUICK_RANGES: { days: number; label: string }[] = [
  { days: 7, label: "7 วัน" },
  { days: 30, label: "30 วัน" },
  { days: 90, label: "90 วัน" },
  { days: 365, label: "1 ปี" },
];

/** Margin-% tone: green ≥15%, amber 0–15%, red < 0 (loss). */
function marginTone(pct: number): string {
  if (pct < 0) return "text-red-600";
  if (pct < 15) return "text-amber-600";
  return "text-emerald-600";
}

export default async function ForwarderProfitAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  await requireAdmin(["super", "accounting"]);

  const sp = await searchParams;
  const range = resolveDateRange(sp);
  const res = await getForwarderProfitAnalytics(range);

  const data = res.ok
    ? res.data
    : { summary: { order_count: 0, total_revenue: 0, total_cost: 0, total_profit: 0, margin_pct: 0, with_cost_count: 0 }, byCarrier: [], byWarehouse: [], byMode: [] };
  const { summary } = data;

  // Active quick-range = which chip matches the current from→to span.
  const spanDays = Math.round(
    (new Date(range.to).getTime() - new Date(range.from).getTime()) / 86_400_000,
  );

  // CSV — flatten all three on-screen breakdown tables into one list (a "กลุ่ม"
  // column tags which table each row came from). Columns mirror the <thead> 1:1.
  const csvCols: CsvCol[] = [
    { key: "group", label: "กลุ่ม" },
    { key: "label", label: "รายการ" },
    { key: "count", label: "ออเดอร์" },
    { key: "revenue", label: "ยอดขาย" },
    { key: "cost", label: "ต้นทุน" },
    { key: "profit", label: "กำไร" },
    { key: "margin_pct", label: "มาร์จิ้น" },
  ];
  const csvRowFor = (group: string, r: ProfitGroupRow): CsvRow => ({
    group,
    label: r.label,
    count: intTh(r.count),
    revenue: thb(r.revenue),
    cost: thb(r.cost),
    profit: thb(r.profit),
    margin_pct: `${decTh(r.margin_pct, 1)}%`,
  });
  const csvRows: CsvRow[] = [
    ...data.byCarrier.map((r) => csvRowFor("ขนส่ง (carrier)", r)),
    ...data.byWarehouse.map((r) => csvRowFor("โกดังจีน (warehouse)", r)),
    ...data.byMode.map((r) => csvRowFor("รูปแบบขนส่ง (mode)", r)),
  ];

  return (
    <main className="p-4 sm:p-6 lg:p-8 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-600">
            ADMIN · REPORTS · BI
          </p>
          <h1 className="mt-1 text-xl sm:text-2xl font-bold">
            กำไร &amp; มาร์จิ้น ฝากนำเข้า
          </h1>
          <p className="mt-1 text-sm text-muted">
            วิเคราะห์กำไร · ต้นทุน · มาร์จิ้น จาก tb_forwarder ·{" "}
            {range.from} → {range.to}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <CsvButton
            rows={csvRows}
            cols={csvCols}
            filename={`กำไร-มาร์จิ้น-ฝากนำเข้า-${range.from}-ถึง-${range.to}.csv`}
            fetchAll={async () => {
              "use server";
              return exportProfitAnalyticsAll(range);
            }}
          />
          <Link
            href="/admin/reports"
            className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-alt"
          >
            ← กลับรีพอร์ตหลัก
          </Link>
        </div>
      </div>

      {/* Date-range chips */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-muted">ช่วงเวลา:</span>
        {QUICK_RANGES.map((q) => {
          const isActive = spanDays === q.days;
          return (
            <Link
              key={q.days}
              href={`/admin/reports/profit-analytics?from=${isoDaysAgo(q.days)}&to=${isoToday()}`}
              className={`rounded-lg border px-3 py-1.5 text-xs ${
                isActive
                  ? "border-primary-500 bg-primary-50 text-primary-700 font-medium"
                  : "border-border bg-white dark:bg-surface text-muted hover:text-foreground"
              }`}
            >
              {q.label}
            </Link>
          );
        })}
      </div>

      {!res.ok && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          โหลดข้อมูลไม่สำเร็จ: {res.error}
        </div>
      )}

      {/* Summary stat cards */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="กำไรรวม" value={thb(summary.total_profit)} tone="primary" small />
        <Stat label="ต้นทุนรวม" value={thb(summary.total_cost)} small />
        <Stat
          label="มาร์จิ้นเฉลี่ย"
          value={`${decTh(summary.margin_pct, 1)}%`}
          valueClass={marginTone(summary.margin_pct)}
        />
        <Stat label="จำนวนออเดอร์" value={intTh(summary.order_count)} />
      </section>

      <p className="text-[11px] text-muted">
        ยอดขายรวม {thb(summary.total_revenue)} · กรอกต้นทุนแล้ว{" "}
        {intTh(summary.with_cost_count)} / {intTh(summary.order_count)} ออเดอร์ ·
        ไม่นับ fstatus=99 (ยกเลิก) · กำไร = ราคาขาย − ส่วนลด − ต้นทุน
      </p>

      {/* Breakdown tables */}
      <BreakdownTable
        title="กำไรตามขนส่ง (carrier)"
        firstColLabel="ขนส่ง"
        rows={data.byCarrier}
        maxProfit={Math.max(0, ...data.byCarrier.map((r) => r.profit))}
      />
      <BreakdownTable
        title="กำไรตามโกดัง (warehouse)"
        firstColLabel="โกดังจีน"
        rows={data.byWarehouse}
        maxProfit={Math.max(0, ...data.byWarehouse.map((r) => r.profit))}
      />
      <BreakdownTable
        title="กำไรตามรูปแบบขนส่ง (mode)"
        firstColLabel="ขนส่งจีน→ไทย"
        rows={data.byMode}
        maxProfit={Math.max(0, ...data.byMode.map((r) => r.profit))}
      />

      <p className="text-[11px] text-muted">
        แสดงผลรวมจากตัวอย่างสูงสุด 20,000 แถวล่าสุดในช่วงที่เลือก · สำหรับงวดยาว
        ใช้ช่วงเวลาแบบกำหนดเอง (?from=&amp;to=) แล้วแบ่งช่วง
      </p>
    </main>
  );
}

// ── components ────────────────────────────────────────────────────────────

function Stat({
  label,
  value,
  tone,
  small,
  valueClass,
}: {
  label: string;
  value: string;
  tone?: "primary";
  small?: boolean;
  valueClass?: string;
}) {
  return (
    <div
      className={`rounded-2xl border p-4 shadow-sm ${
        tone === "primary"
          ? "border-primary-200 bg-primary-50/60 dark:bg-primary-950/20"
          : "border-border bg-white dark:bg-surface"
      }`}
    >
      <p className="text-xs font-medium text-muted">{label}</p>
      <p
        className={`mt-1 font-bold font-mono ${small ? "text-base sm:text-lg" : "text-lg sm:text-xl"} ${
          valueClass ?? (tone === "primary" ? "text-primary-700" : "text-foreground")
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function BreakdownTable({
  title,
  firstColLabel,
  rows,
  maxProfit,
}: {
  title: string;
  firstColLabel: string;
  rows: ProfitGroupRow[];
  maxProfit: number;
}) {
  return (
    <section className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm">
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold">{title}</h2>
      </div>
      <div className="overflow-x-auto scrollbar-x-visible">
        <table className="w-full text-sm">
          <thead className="bg-surface-alt/50 text-left uppercase tracking-wide text-[10px] text-muted">
            <tr>
              <th className="px-3 py-2.5">{firstColLabel}</th>
              <th className="px-3 py-2.5 text-right">ออเดอร์</th>
              <th className="px-3 py-2.5 text-right">ยอดขาย</th>
              <th className="px-3 py-2.5 text-right">ต้นทุน</th>
              <th className="px-3 py-2.5 text-right">กำไร</th>
              <th className="px-3 py-2.5 text-right">มาร์จิ้น</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-8 text-center text-muted">
                  ไม่มีรายการในช่วงนี้
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const pct = maxProfit > 0 ? Math.max(0, (r.profit / maxProfit) * 100) : 0;
                const tone =
                  r.margin_pct < 0
                    ? "text-red-600"
                    : r.margin_pct < 15
                      ? "text-amber-600"
                      : "text-emerald-600";
                return (
                  <tr key={r.key} className="border-t border-border">
                    <td className="px-3 py-2">
                      <div className="font-medium">{r.label}</div>
                      {/* mini profit bar (relative to the top group) */}
                      <div className="mt-1 h-1.5 w-full max-w-[140px] rounded-full bg-surface-alt overflow-hidden">
                        <div
                          className={`h-full rounded-full ${r.profit < 0 ? "bg-red-400" : "bg-primary-500"}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right font-mono">{intTh(r.count)}</td>
                    <td className="px-3 py-2 text-right font-mono">{thb(r.revenue)}</td>
                    <td className="px-3 py-2 text-right font-mono">{thb(r.cost)}</td>
                    <td className="px-3 py-2 text-right font-mono font-semibold">{thb(r.profit)}</td>
                    <td className={`px-3 py-2 text-right font-mono ${tone}`}>
                      {decTh(r.margin_pct, 1)}%
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
