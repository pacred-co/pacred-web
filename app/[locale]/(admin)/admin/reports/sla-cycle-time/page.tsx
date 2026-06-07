/**
 * Wave C BI · Theme 1 — SLA / Cycle-time intelligence (ฝากนำเข้า)
 *
 * NEW analytics report (not a legacy port). Mines the per-stage timestamp
 * trail every `tb_forwarder` order already carries (`fdate` → `fdatestatus2..7`)
 * to surface:
 *   - end-to-end cycle time (avg + p90 over delivered orders),
 *   - per-stage dwell time (avg · p50 · p90 · count) — where orders sit,
 *   - the slowest stage (the bottleneck),
 *   - a stuck-orders board (orders parked at one stage past a threshold —
 *     e.g. fstatus=5 "รอชำระเงิน" with an old fdatestatus5 = cash waiting;
 *     the big audit found 457 such rows).
 *
 * Source: docs/research/big-audit-2026-06-01/02-cargo-forwarder.md §5 U-2.
 * Stage labels = canonical legacy map (lib/admin/forwarder-status.ts).
 * Read-only · mobile-first · empty-state via ReportShell.
 *
 * Reachability (AGENTS.md §0d): this page is NOT yet linked from the reports
 * hub (reports/page.tsx — out of scope for this change; do-not-touch). It is
 * reachable by URL; whoever owns the hub should add a card under the analytics
 * group → href "/admin/reports/sla-cycle-time".
 */

import { requireAdmin } from "@/lib/auth/require-admin";
import { ReportShell } from "@/components/admin/reports/report-shell";
import { getForwarderSlaReport } from "@/actions/admin/reports-sla";
import { CsvButton, type CsvRow, type CsvCol } from "@/components/admin/csv-button";
import { exportSlaStuckAll } from "@/actions/admin/export/report-sla-cycle-time";
import {
  resolveDateRange, intTh, decTh, type ReportData,
} from "@/lib/admin/reports/types";

export const dynamic = "force-dynamic";

// Canonical fstatus → stage label (lib/admin/forwarder-status.ts FSTATUS_CFG ·
// function.php statusForwarderBadge L879-892). Duplicated here (not imported)
// to keep the label adjacent to the column it renders.
const STAGE_LABEL: Record<string, string> = {
  "1": "รอเข้าโกดังจีน",
  "2": "ถึงโกดังจีนแล้ว",
  "3": "กำลังส่งมาไทย",
  "4": "ถึงไทยแล้ว",
  "5": "รอชำระเงิน",
  "6": "เตรียมส่ง",
  "7": "ส่งแล้ว",
};

/** "เวลาต่อสเตจ" — render N days, TH-locale 2dp (or — when no samples). */
function days(n: number, count: number): string {
  if (count === 0) return "—";
  return `${decTh(n, 2)} วัน`;
}

export default async function ForwarderSlaCycleTimePage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  await requireAdmin(["super", "accounting"]);

  const sp = await searchParams;
  const range = resolveDateRange(sp);
  const res = await getForwarderSlaReport(range);

  const report = res.ok
    ? res.data
    : {
        stages: [], stuck: [], cycleAvgDays: 0, cycleP90Days: 0,
        deliveredCount: 0, stuckTotal: 0, slowestStage: "",
        slowestAvgDays: 0, stuckThresholdDays: 7,
      };

  const slowestLabel = report.slowestStage
    ? `${STAGE_LABEL[report.slowestStage] ?? report.slowestStage} (${decTh(report.slowestAvgDays, 1)} วัน)`
    : "—";

  // ── Stuck-orders table (ReportShell gives date-form + CSV + empty-state) ──
  const data: ReportData = {
    columns: [
      { key: "fNo",       label: "เลขที่ออเดอร์" },
      { key: "stageLabel", label: "สเตจปัจจุบัน" },
      { key: "daysStuck", label: "ค้างมาแล้ว (วัน)", align: "right" },
      { key: "customer",  label: "ลูกค้า" },
    ],
    rows: report.stuck.map((s) => ({
      id: s.id,
      fNo: s.fNo,
      stageLabel: STAGE_LABEL[s.stage] ?? s.stage,
      daysStuck: s.daysStuck,
      customer: s.customer,
    })),
  };

  // ── CSV export-all (stuck-orders board) — the UI caps the stuck table at 300
  //    rows; this button re-runs the EXACT filtered query unpaginated + audits.
  const stuckCsvCols: CsvCol[] = data.columns.map((c) => ({ key: c.key, label: c.label }));
  const stuckCsvRows: CsvRow[] = data.rows.map((r) => ({
    fNo: r.fNo,
    stageLabel: r.stageLabel,
    daysStuck: r.daysStuck,
    customer: r.customer,
  }));
  const stuckCsvFilename = `report-sla-cycle-time_${range.from}_${range.to}.csv`;

  return (
    <main className="p-6 lg:p-8 space-y-5">
      {res.ok && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <span className="mr-auto text-xs text-muted">
            Export ออเดอร์ค้าง (CSV) — “ทั้งหมด” = ครบทุกแถวตามช่วงเวลา (ไม่จำกัดเฉพาะ 300 แถวที่แสดง)
          </span>
          <CsvButton
            rows={stuckCsvRows}
            cols={stuckCsvCols}
            filename={stuckCsvFilename}
            fetchAll={async () => {
              "use server";
              return exportSlaStuckAll({ range, stuckThresholdDays: report.stuckThresholdDays });
            }}
          />
        </div>
      )}
      <ReportShell
        title="SLA / เวลาต่อสเตจ (ฝากนำเข้า)"
        subtitle={
          `เวลาเฉลี่ยที่ออเดอร์อยู่ในแต่ละสเตจ + ออเดอร์ค้าง (ค้างเกิน ` +
          `${intTh(report.stuckThresholdDays)} วัน) — อ้างอิงไทม์สแตมป์ fdatestatus2..7`
        }
        range={range}
        pathname="/admin/reports/sla-cycle-time"
        summary={[
          { label: "รอบเวลาเฉลี่ย (สร้าง→ส่งแล้ว)", value: days(report.cycleAvgDays, report.deliveredCount), tone: "primary" },
          { label: "รอบเวลา p90",                    value: days(report.cycleP90Days, report.deliveredCount) },
          { label: "ออเดอร์ค้าง",                    value: intTh(report.stuckTotal), tone: report.stuckTotal > 0 ? "red" : "green" },
          { label: "สเตจที่ช้าที่สุด",                value: slowestLabel },
        ]}
        data={data}
        csvSlug="forwarder-sla-stuck"
        emptyLabel={
          res.ok
            ? `ไม่มีออเดอร์ค้างเกิน ${intTh(report.stuckThresholdDays)} วันในช่วงเวลานี้ 🎉`
            : `❌ โหลดข้อมูลล้มเหลว: ${res.error}`
        }
        extraControls={
          <span className="text-xs text-muted">
            ออเดอร์ที่ยังจอดอยู่สเตจเดิมนานเกินกำหนด (เรียงค้างนานสุดก่อน · แสดงสูงสุด 300 แถว)
          </span>
        }
        sourceNote={
          res.ok
            ? `Source: tb_forwarder (fdate→fdatestatus2..7 · LIVE) — dwell = เวลาเข้าสเตจถัดไป − เวลาเข้าสเตจนี้ · ตัดค่าติดลบ/เพี้ยน (>730 วัน) ออก`
            : undefined
        }
      />

      {/* Per-stage dwell table — rendered inline (the shell holds one table) */}
      <section className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
        <div className="border-b border-border px-4 py-3 sm:px-6">
          <h2 className="text-base font-bold">เวลาเฉลี่ยต่อสเตจ (dwell time)</h2>
          <p className="mt-0.5 text-xs text-muted">
            เวลาที่ออเดอร์อยู่ในแต่ละสเตจก่อนเลื่อนไปสเตจถัดไป — ดูว่าคอขวดอยู่ตรงไหน
          </p>
        </div>
        {report.stages.every((s) => s.count === 0) ? (
          <p className="p-12 text-center text-sm text-muted">
            {res.ok ? "ยังไม่มีออเดอร์ที่ผ่านสเตจครบในช่วงเวลานี้" : `❌ โหลดข้อมูลล้มเหลว: ${res.error}`}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3 whitespace-nowrap">สเตจ</th>
                  <th className="px-4 py-3 text-right whitespace-nowrap">เฉลี่ย (avg)</th>
                  <th className="px-4 py-3 text-right whitespace-nowrap">มัธยฐาน (p50)</th>
                  <th className="px-4 py-3 text-right whitespace-nowrap">p90</th>
                  <th className="px-4 py-3 text-right whitespace-nowrap">จำนวนออเดอร์</th>
                </tr>
              </thead>
              <tbody>
                {report.stages.map((s) => {
                  const isSlowest = s.stage === report.slowestStage && s.count > 0;
                  return (
                    <tr
                      key={s.stage}
                      className={`border-t border-border align-top ${isSlowest ? "bg-red-50 dark:bg-red-950/20" : "hover:bg-surface-alt/30"}`}
                    >
                      <td className="px-4 py-3 text-xs">
                        {STAGE_LABEL[s.stage] ?? s.stage}
                        {isSlowest && (
                          <span className="ml-2 rounded bg-red-500 px-1.5 py-0.5 text-[10px] font-semibold text-red-50">
                            ช้าสุด
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-xs font-mono">{days(s.avgDays, s.count)}</td>
                      <td className="px-4 py-3 text-right text-xs font-mono">{days(s.p50Days, s.count)}</td>
                      <td className="px-4 py-3 text-right text-xs font-mono">{days(s.p90Days, s.count)}</td>
                      <td className="px-4 py-3 text-right text-xs font-mono">{intTh(s.count)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
