/**
 * Gap #8 — Shared layout shell for admin report pages (faithful to legacy
 * PCS Cargo report-*.php frames).
 *
 * Renders:
 *   - Title row (with optional subtitle + "back to reports" link)
 *   - Date-range form (defaults to last 30 days; URL-shareable)
 *   - CSV download button
 *   - Summary cards (one per metric the report wants to surface)
 *   - The report table (columns + rows + totals footer)
 *
 * Style mirrors the existing /admin/reports + /admin/admins chrome — no new
 * CSS file. Children pages just hand the shell `ReportData` + (optional)
 * summary cards.
 *
 *   See: docs/research/d1-deep-audit-2026-05-24.md §1 Gap #8.
 */

import { Link } from "@/i18n/navigation";
import { Suspense } from "react";
import { CsvButton, type CsvRow } from "@/components/admin/csv-button";
import { ReportDateForm } from "@/components/admin/reports/report-date-form";
import type { ReportData, DateRange } from "@/lib/admin/reports/types";

export type ReportSummaryCard = {
  label:     string;
  value:     string;
  tone?:     "default" | "green" | "red" | "primary";
};

export type ReportShellProps = {
  /** Shown in the small uppercase eyebrow. Default: "ADMIN · REPORTS". */
  eyebrow?:   string;
  /** Main page heading. */
  title:      string;
  /** Optional one-line description under the title. */
  subtitle?:  string;
  /** Selected date range — drives the date form's initial values. */
  range:      DateRange;
  /** Path of THIS report page (e.g. `/admin/reports/sales-monthly`). */
  pathname:   string;
  /** Optional extra query params to preserve when changing the date range. */
  extraQuery?: Record<string, string | undefined>;
  /** Summary cards rendered above the table. */
  summary?:   ReportSummaryCard[];
  /** The report payload (columns + rows + totals). */
  data:       ReportData;
  /** CSV file slug (no extension). */
  csvSlug:    string;
  /** Empty-state copy. Default: "ไม่มีข้อมูลในช่วงเวลานี้". */
  emptyLabel?: string;
  /** Source note (legacy PHP file + tables) — rendered as fine-print. */
  sourceNote?: string;
  /** Optional extra controls (filter chips, etc.) — rendered next to the date form. */
  extraControls?: React.ReactNode;
};

export function ReportShell({
  eyebrow = "ADMIN · REPORTS",
  title,
  subtitle,
  range,
  pathname,
  extraQuery,
  summary,
  data,
  csvSlug,
  emptyLabel = "ไม่มีข้อมูลในช่วงเวลานี้",
  sourceNote,
  extraControls,
}: ReportShellProps) {
  const { columns, rows, totals } = data;

  // ── CSV — labels become headers; values come straight off each row. ──
  const csvCols = columns.map((c) => ({ key: c.key, label: c.label }));
  const csvRows: CsvRow[] = rows.map((r) => {
    const out: CsvRow = {};
    for (const c of columns) {
      const raw = r[c.key];
      out[c.key] = c.format ? c.format(raw) : (raw ?? "");
    }
    return out;
  });
  const csvFilename = `${csvSlug}_${range.from}_${range.to}.csv`;

  return (
    <main className="p-6 lg:p-8 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-600">{eyebrow}</p>
          <h1 className="mt-1 text-2xl font-bold">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
        </div>
        <Link href="/admin/reports" className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-alt">
          ← กลับรีพอร์ตหลัก
        </Link>
      </div>

      {/* Controls: date range + CSV */}
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div className="flex items-center gap-3 flex-wrap">
          <Suspense>
            <ReportDateForm pathname={pathname} range={range} extraQuery={extraQuery} />
          </Suspense>
          {extraControls}
        </div>
        <CsvButton rows={csvRows} cols={csvCols} filename={csvFilename} />
      </div>

      {/* Summary cards */}
      {summary && summary.length > 0 && (
        <div className={`grid gap-3 sm:grid-cols-2 ${gridCols(summary.length)}`}>
          {summary.map((s, i) => (
            <SummaryCard key={i} {...s} />
          ))}
        </div>
      )}

      {/* Report table */}
      <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
        {rows.length === 0 ? (
          <p className="p-12 text-center text-sm text-muted">{emptyLabel}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  {columns.map((c) => (
                    <th
                      key={c.key}
                      className={`px-4 py-3 ${alignClass(c.align)} whitespace-nowrap`}
                    >
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, idx) => (
                  <tr key={String(r.id ?? idx)} className="border-t border-border hover:bg-surface-alt/30 align-top">
                    {columns.map((c) => (
                      <td
                        key={c.key}
                        className={`px-4 py-3 text-xs ${alignClass(c.align)} ${
                          c.align === "right" ? "font-mono" : ""
                        }`}
                      >
                        {c.format ? c.format(r[c.key]) : (r[c.key] ?? "—")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
              {totals && (
                <tfoot className="bg-surface-alt/30 font-bold">
                  <tr className="border-t-2 border-border">
                    {columns.map((c, idx) => (
                      <td
                        key={c.key}
                        className={`px-4 py-3 text-xs ${alignClass(c.align)} ${
                          c.align === "right" ? "font-mono" : ""
                        }`}
                      >
                        {idx === 0 && totals[c.key] === undefined ? "รวมทั้งสิ้น" : (totals[c.key] ?? "")}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>

      {sourceNote && <p className="text-[11px] text-muted">{sourceNote}</p>}
    </main>
  );
}

function alignClass(a: ReportSummaryCard["tone"] | "left" | "right" | "center" | undefined): string {
  if (a === "right") return "text-right";
  if (a === "center") return "text-center";
  return "text-left";
}
function gridCols(n: number): string {
  if (n >= 4) return "lg:grid-cols-4";
  if (n === 3) return "lg:grid-cols-3";
  if (n === 2) return "lg:grid-cols-2";
  return "lg:grid-cols-1";
}

function SummaryCard({ label, value, tone = "default" }: ReportSummaryCard) {
  const valueClass =
    tone === "green"   ? "text-green-700"   :
    tone === "red"     ? "text-red-700"     :
    tone === "primary" ? "text-primary-700" :
    "";
  const borderClass = tone === "primary" ? "border-primary-200" : "border-border";
  return (
    <div className={`rounded-2xl border bg-white dark:bg-surface p-4 shadow-sm ${borderClass}`}>
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-1 text-2xl font-bold font-mono ${valueClass}`}>{value}</p>
    </div>
  );
}
