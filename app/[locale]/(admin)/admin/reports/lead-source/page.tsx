/**
 * /admin/reports/lead-source — รายงานแหล่งที่มาของลูกค้า (Lead-source attribution).
 *
 * READ-ONLY marketing/BI dashboard: which acquisition channel drives
 * leads → orders → revenue. CEO North-Star (scale via marketing/CRM) — the
 * data was captured but NO page surfaced it, so marketing was blind.
 *
 * ── Scope honesty (2026-06-09) ──
 * No ad-spend / Meta-Ads / UTM / fb_ad_touchpoints table exists in the DB, so
 * this report shows NO ROAS / cost-per-lead (omitted, not fabricated). It
 * groups REAL customer rows by the source dimensions that DO exist on
 * tb_users — registration channel (userregisterwith) + referral (userrecom) —
 * and joins each bucket to downstream ฝากนำเข้า orders (tb_forwarder) for a
 * source → lead → order → revenue funnel. When (e.g.) FB ad ingestion comes
 * online later, this page is the natural home for the spend/ROAS columns.
 *
 * Built with the report chrome primitives directly (header · ReportDateForm ·
 * CsvButton · summary cards) rather than <ReportShell> because it renders TWO
 * tables (channel funnel + top referrers) + a funnel visual — same pattern the
 * cockpit page uses. Matches the sibling /admin/reports/* design (Tailwind +
 * Lucide, mobile-ok, force-dynamic, every query destructures error in the
 * data layer per §0c).
 *
 * Role gate: same roles the sibling BI reports (cockpit / profit-analytics)
 * gate to — super + accounting (leadership/finance). The rows expose customer
 * acquisition + revenue, so kept off the broader ops roles.
 *
 * Data layer: actions/admin/reports-attribution.ts → getAttributionReport.
 */

import { requireAdmin } from "@/lib/auth/require-admin";
import { Link } from "@/i18n/navigation";
import { Suspense } from "react";
import { Megaphone } from "lucide-react";
import { ReportDateForm } from "@/components/admin/reports/report-date-form";
import { CsvButton, type CsvRow, type CsvCol } from "@/components/admin/csv-button";
import { getAttributionReport } from "@/actions/admin/reports-attribution";
import {
  resolveDateRange,
  intTh,
  thb,
  decTh,
  type DateRange,
} from "@/lib/admin/reports/types";
import type { SourceRow } from "@/actions/admin/reports-attribution-types";

export const dynamic = "force-dynamic";

export default async function LeadSourceReportPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  // Match the reports-hub gate (ops/accounting/sales_admin · super implicit) —
  // the hub renders this link to all three, so the page must accept all three
  // or office roles get a dead 403 click (audit D1, 2026-06-09).
  await requireAdmin(["ops", "accounting", "sales_admin"]);

  const sp = await searchParams;
  const range: DateRange = resolveDateRange(sp);
  const res = await getAttributionReport(range);

  const report = res.ok
    ? res.data
    : {
        sources: [],
        referrals: [],
        totalLeads: 0,
        totalCold: 0,
        totalConverted: 0,
        totalRevenue: 0,
        capped: false,
        empty: true,
      };

  const overallConv =
    report.totalLeads > 0 ? (report.totalConverted / report.totalLeads) * 100 : 0;
  const leadMax = Math.max(1, ...report.sources.map((s) => s.leads));

  // CSV — the channel funnel table.
  const csvCols: CsvCol[] = [
    { key: "label", label: "ช่องทาง" },
    { key: "leads", label: "ลูกค้า/ลีด" },
    { key: "cold", label: "ลีดเย็น (ยังไม่ติดต่อ)" },
    { key: "converted", label: "สั่งซื้อแล้ว" },
    { key: "conv_pct", label: "% Conversion" },
    { key: "revenue", label: "ยอดขายฝากนำเข้า (฿)" },
  ];
  const csvRows: CsvRow[] = report.sources.map((s) => ({
    label: s.label,
    leads: s.leads,
    cold: s.cold,
    converted: s.converted,
    conv_pct: decTh(s.conv_pct, 1) + "%",
    revenue: s.revenue.toFixed(2),
  }));

  return (
    <main className="p-6 lg:p-8 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-600">
            ADMIN · REPORTS · MARKETING
          </p>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold">
            <Megaphone className="h-6 w-6 text-primary-600" />
            แหล่งที่มาของลูกค้า (Lead Source)
          </h1>
          <p className="mt-1 text-sm text-muted">
            ลูกค้ามาจากช่องทางไหน → กลายเป็นออเดอร์ → สร้างรายได้เท่าไหร่ (อ่านอย่างเดียว)
          </p>
        </div>
        <Link
          href="/admin/reports"
          className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-alt"
        >
          ← กลับรีพอร์ตหลัก
        </Link>
      </div>

      {/* Controls: date range + CSV */}
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <Suspense>
          <ReportDateForm pathname="/admin/reports/lead-source" range={range} />
        </Suspense>
        <CsvButton
          rows={csvRows}
          cols={csvCols}
          filename={`lead-source_${range.from}_${range.to}.csv`}
        />
      </div>

      {/* Summary cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard label="ลูกค้าใหม่ในช่วงนี้" value={intTh(report.totalLeads)} />
        <SummaryCard
          label="ลีดเย็น (ยังไม่ติดต่อ)"
          value={intTh(report.totalCold)}
          tone="red"
        />
        <SummaryCard
          label="สั่งซื้อแล้ว (converted)"
          value={`${intTh(report.totalConverted)} · ${decTh(overallConv, 1)}%`}
          tone="green"
        />
        <SummaryCard
          label="ยอดขายฝากนำเข้า"
          value={thb(report.totalRevenue)}
          tone="primary"
        />
      </div>

      {/* Empty state — valuable the moment data arrives */}
      {report.empty ? (
        <div className="rounded-2xl border border-dashed border-border bg-white dark:bg-surface p-12 text-center">
          <Megaphone className="mx-auto h-8 w-8 text-muted" />
          <p className="mt-3 text-sm font-medium">
            {res.ok
              ? "ยังไม่มีลูกค้าใหม่ในช่วงเวลานี้"
              : "โหลดข้อมูลไม่สำเร็จ"}
          </p>
          <p className="mt-1 text-xs text-muted">
            {res.ok
              ? "ลองขยายช่วงวันที่ — หรือเชื่อมต่อ Facebook/LINE/แหล่งที่มาเพิ่มเพื่อเริ่มเก็บข้อมูลแหล่งที่มา"
              : "error: " + res.error}
          </p>
        </div>
      ) : (
        <>
          {/* Channel funnel table */}
          <section className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
            <div className="border-b border-border px-4 py-3">
              <h2 className="text-sm font-semibold">
                ช่องทางการสมัคร → ออเดอร์ → รายได้
              </h2>
              <p className="mt-0.5 text-xs text-muted">
                จัดกลุ่มตามวิธีสมัครสมาชิก (tb_users.userregisterwith) · นับออเดอร์ฝากนำเข้าที่เชื่อมด้วย userid
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-4 py-3 whitespace-nowrap">ช่องทาง</th>
                    <th className="px-4 py-3 whitespace-nowrap min-w-[140px]">ลูกค้า/ลีด</th>
                    <th className="px-4 py-3 text-right whitespace-nowrap">ลีดเย็น</th>
                    <th className="px-4 py-3 text-right whitespace-nowrap">สั่งซื้อแล้ว</th>
                    <th className="px-4 py-3 text-right whitespace-nowrap">% Conv.</th>
                    <th className="px-4 py-3 text-right whitespace-nowrap">ยอดขาย</th>
                  </tr>
                </thead>
                <tbody>
                  {report.sources.map((s) => (
                    <FunnelRow key={s.key} s={s} leadMax={leadMax} />
                  ))}
                </tbody>
                <tfoot className="bg-surface-alt/30 font-bold">
                  <tr className="border-t-2 border-border">
                    <td className="px-4 py-3 text-xs">รวมทั้งสิ้น</td>
                    <td className="px-4 py-3 text-xs font-mono">{intTh(report.totalLeads)}</td>
                    <td className="px-4 py-3 text-right text-xs font-mono">{intTh(report.totalCold)}</td>
                    <td className="px-4 py-3 text-right text-xs font-mono">{intTh(report.totalConverted)}</td>
                    <td className="px-4 py-3 text-right text-xs font-mono">{decTh(overallConv, 1)}%</td>
                    <td className="px-4 py-3 text-right text-xs font-mono">{thb(report.totalRevenue)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>

          {/* Top referrers */}
          <section className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
            <div className="border-b border-border px-4 py-3">
              <h2 className="text-sm font-semibold">ผู้แนะนำสูงสุด (Referrals)</h2>
              <p className="mt-0.5 text-xs text-muted">
                ใครพาลูกค้าเข้ามามากที่สุด (tb_users.userrecom) — Top {report.referrals.length}
              </p>
            </div>
            {report.referrals.length === 0 ? (
              <p className="p-8 text-center text-sm text-muted">
                ยังไม่มีข้อมูลผู้แนะนำในช่วงเวลานี้
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
                    <tr>
                      <th className="px-4 py-3 whitespace-nowrap">#</th>
                      <th className="px-4 py-3 whitespace-nowrap">ผู้แนะนำ (รหัส/ชื่อ)</th>
                      <th className="px-4 py-3 text-right whitespace-nowrap">จำนวนลูกค้าที่แนะนำ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.referrals.map((r, i) => (
                      <tr key={r.key} className="border-t border-border hover:bg-surface-alt/30">
                        <td className="px-4 py-3 text-xs text-muted">{i + 1}</td>
                        <td className="px-4 py-3 text-xs font-medium">{r.label}</td>
                        <td className="px-4 py-3 text-right text-xs font-mono">{intTh(r.leads)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      {report.capped && (
        <p className="text-[11px] text-amber-600">
          ⚠️ ดึงข้อมูลถึงเพดาน — ตัวเลขอาจไม่ครบ ลองแคบช่วงวันที่ลง
        </p>
      )}
      <p className="text-[11px] text-muted">
        {res.ok
          ? "Source: tb_users (userregisterwith · userrecom · useractive · userregistered) ⨝ tb_forwarder (userid · ftotalprice) — READ-ONLY · ไม่มีตาราง ad-spend/UTM ในระบบจึงไม่แสดง ROAS"
          : `❌ โหลดข้อมูลล้มเหลว: ${res.error}`}
      </p>
    </main>
  );
}

// ── helpers ──────────────────────────────────────────────────────────────

function FunnelRow({ s, leadMax }: { s: SourceRow; leadMax: number }) {
  const pct = Math.round((s.leads / leadMax) * 100);
  return (
    <tr className="border-t border-border hover:bg-surface-alt/30 align-top">
      <td className="px-4 py-3 text-xs font-medium whitespace-nowrap">{s.label}</td>
      <td className="px-4 py-3 text-xs">
        <div className="flex items-center gap-2">
          <div className="h-2 flex-1 min-w-[60px] rounded-full bg-surface-alt overflow-hidden">
            <div
              className="h-full rounded-full bg-primary-500"
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="font-mono tabular-nums">{intTh(s.leads)}</span>
        </div>
      </td>
      <td className="px-4 py-3 text-right text-xs font-mono">{intTh(s.cold)}</td>
      <td className="px-4 py-3 text-right text-xs font-mono">{intTh(s.converted)}</td>
      <td className="px-4 py-3 text-right text-xs font-mono">{decTh(s.conv_pct, 1)}%</td>
      <td className="px-4 py-3 text-right text-xs font-mono">{thb(s.revenue)}</td>
    </tr>
  );
}

function SummaryCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "green" | "red" | "primary";
}) {
  const valueClass =
    tone === "green"
      ? "text-green-700"
      : tone === "red"
        ? "text-red-700"
        : tone === "primary"
          ? "text-primary-700"
          : "";
  const borderClass = tone === "primary" ? "border-primary-200" : "border-border";
  return (
    <div className={`rounded-2xl border ${borderClass} bg-white dark:bg-surface p-4 shadow-sm`}>
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-1 text-xl font-bold ${valueClass}`}>{value}</p>
    </div>
  );
}
