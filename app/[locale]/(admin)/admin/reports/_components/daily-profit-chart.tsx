"use client";

/**
 * From-scratch responsive SVG bar chart for the daily-profit timeseries on the
 * three profit reports (forwarder-profit / yuan-profit / shops-profit).
 *
 * Legacy PCS rendered these as echarts LINE graphs (report-forwarder-profit.php
 * L77-96 · report-payments-profit.php L77-83 · report-shops-profit.php L79-85).
 * Pacred owns the look (AGENTS.md §0a — "copy the working system, polish the
 * look ourselves"): an echarts line graph → an inline SVG bar chart. NO chart
 * library (none is installed); pure SVG + Tailwind.
 *
 * Props:
 *   - points: { date: "YYYY-MM-DD"; profit: number; count: number }[] (ascending)
 *   - label:  series legend label (e.g. "กำไรรายวัน (ฝากนำเข้า)")
 *
 * Faithful-enough to legacy:
 *   - one bar per day in the window
 *   - ฿ value axis + tooltips (legacy used "{value} บาท")
 *   - max / min / average markers (legacy markPoint/markLine)
 */

import { useId, useMemo, useState } from "react";

export type DailyProfitPoint = { date: string; profit: number; count: number };

const VIEW_W = 1000; // SVG user-space width (scales responsively via viewBox)
const VIEW_H = 320;
const PAD = { top: 24, right: 16, bottom: 56, left: 72 };

function fmtThb(n: number): string {
  return "฿" + n.toLocaleString("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}
function fmtThb2(n: number): string {
  return "฿" + n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
/** "YYYY-MM-DD" → "DD/MM" (no Date object — avoids tz drift + react-hooks/purity). */
function shortDate(iso: string): string {
  const [, m, d] = iso.split("-");
  return d && m ? `${d}/${m}` : iso;
}

export function DailyProfitChart({ points, label }: { points: DailyProfitPoint[]; label: string }) {
  const gradId = useId();
  const [hover, setHover] = useState<number | null>(null);

  const stats = useMemo(() => {
    const profits = points.map((p) => p.profit);
    const max = profits.length ? Math.max(...profits, 0) : 0;
    const min = profits.length ? Math.min(...profits, 0) : 0;
    const totalProfit = profits.reduce((s, v) => s + v, 0);
    const totalCount = points.reduce((s, p) => s + p.count, 0);
    const avg = points.length ? totalProfit / points.length : 0;
    return { max, min, totalProfit, totalCount, avg };
  }, [points]);

  if (points.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-white dark:bg-surface p-8 shadow-sm">
        <p className="text-sm font-semibold">{label}</p>
        <p className="mt-6 text-center text-sm text-muted">ไม่มีข้อมูลกราฟในช่วงเวลานี้</p>
      </div>
    );
  }

  const plotW = VIEW_W - PAD.left - PAD.right;
  const plotH = VIEW_H - PAD.top - PAD.bottom;

  // Domain spans 0 (or the min if profits go negative) up to the max, with a
  // little headroom so the tallest bar doesn't touch the top.
  const domainMax = stats.max > 0 ? stats.max * 1.08 : 1;
  const domainMin = Math.min(stats.min * 1.08, 0);
  const domainSpan = domainMax - domainMin || 1;

  // Map a value → SVG y. Higher value = higher up (smaller y).
  const yOf = (v: number) => PAD.top + plotH * (1 - (v - domainMin) / domainSpan);
  const zeroY = yOf(0);

  // Bars: cap width so a 1-day window still looks sane; gap between bars.
  const slot = plotW / points.length;
  const barW = Math.max(2, Math.min(slot * 0.7, 48));

  // Y gridlines — 4 evenly spaced ticks across the domain.
  const ticks = Array.from({ length: 5 }, (_, i) => domainMin + (domainSpan * i) / 4);

  // X labels — thin out so they never overlap (~12 labels max).
  const xLabelStep = Math.max(1, Math.ceil(points.length / 12));

  return (
    <div className="rounded-2xl border border-border bg-white dark:bg-surface p-4 shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-semibold">{label}</p>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
          <span>กำไรรวม <span className="font-mono font-semibold text-primary-700">{fmtThb2(stats.totalProfit)}</span></span>
          <span>เฉลี่ย/วัน <span className="font-mono">{fmtThb(stats.avg)}</span></span>
          <span>สูงสุด <span className="font-mono">{fmtThb(stats.max)}</span></span>
          <span>{points.length} วัน · {stats.totalCount.toLocaleString("th-TH")} รายการ</span>
        </div>
      </div>

      <div className="relative mt-3">
        <svg
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          className="w-full h-auto"
          role="img"
          aria-label={`${label}: กราฟกำไรรายวัน ${points.length} วัน`}
          preserveAspectRatio="xMidYMid meet"
        >
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#d60000" stopOpacity="0.95" />
              <stop offset="100%" stopColor="#b30000" stopOpacity="0.75" />
            </linearGradient>
          </defs>

          {/* Y gridlines + value labels */}
          {ticks.map((t, i) => {
            const y = yOf(t);
            return (
              <g key={i}>
                <line
                  x1={PAD.left} y1={y} x2={VIEW_W - PAD.right} y2={y}
                  stroke="currentColor" strokeOpacity={t === 0 ? 0.35 : 0.12}
                  className="text-border" strokeWidth={t === 0 ? 1.5 : 1}
                />
                <text
                  x={PAD.left - 10} y={y + 4} textAnchor="end"
                  className="fill-muted" fontSize="13"
                >
                  {fmtThb(t)}
                </text>
              </g>
            );
          })}

          {/* Average marker (legacy markLine 'average') */}
          {stats.avg !== 0 && (
            <line
              x1={PAD.left} y1={yOf(stats.avg)} x2={VIEW_W - PAD.right} y2={yOf(stats.avg)}
              stroke="#0ea5e9" strokeOpacity={0.7} strokeWidth={1.25} strokeDasharray="6 4"
            />
          )}

          {/* Bars */}
          {points.map((p, i) => {
            const cx = PAD.left + slot * i + slot / 2;
            const x = cx - barW / 2;
            const top = p.profit >= 0 ? yOf(p.profit) : zeroY;
            const h = Math.abs(yOf(p.profit) - zeroY);
            const isHover = hover === i;
            const negative = p.profit < 0;
            return (
              <g key={p.date}>
                {/* invisible full-height hit target so tooltips are easy to hover */}
                <rect
                  x={PAD.left + slot * i} y={PAD.top} width={slot} height={plotH}
                  fill="transparent"
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover((h2) => (h2 === i ? null : h2))}
                />
                <rect
                  x={x} y={top} width={barW} height={Math.max(h, p.profit === 0 ? 0 : 1.5)}
                  rx={3}
                  fill={negative ? "#9ca3af" : `url(#${gradId})`}
                  opacity={hover === null || isHover ? 1 : 0.55}
                  className="transition-opacity"
                  pointerEvents="none"
                />
                {/* X label (thinned) */}
                {i % xLabelStep === 0 && (
                  <text
                    x={cx} y={VIEW_H - PAD.bottom + 20} textAnchor="middle"
                    className="fill-muted" fontSize="12"
                    transform={points.length > 18 ? `rotate(45 ${cx} ${VIEW_H - PAD.bottom + 20})` : undefined}
                  >
                    {shortDate(p.date)}
                  </text>
                )}
              </g>
            );
          })}

          {/* Baseline (x axis) */}
          <line
            x1={PAD.left} y1={zeroY} x2={VIEW_W - PAD.right} y2={zeroY}
            stroke="currentColor" strokeOpacity={0.4} className="text-border" strokeWidth={1.5}
          />
        </svg>

        {/* Tooltip — positioned by % across the plot so it tracks responsively */}
        {hover !== null && points[hover] && (
          <div
            className="pointer-events-none absolute -translate-x-1/2 -translate-y-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-xs shadow-lg z-10"
            style={{
              left: `${((PAD.left + slot * hover + slot / 2) / VIEW_W) * 100}%`,
              top: `${(yOf(Math.max(points[hover].profit, 0)) / VIEW_H) * 100}%`,
            }}
          >
            <div className="font-semibold">{points[hover].date}</div>
            <div className="mt-0.5 font-mono text-primary-700">{fmtThb2(points[hover].profit)}</div>
            <div className="text-muted">{points[hover].count.toLocaleString("th-TH")} รายการ</div>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="mt-2 flex items-center gap-2 text-xs text-muted">
        <span className="inline-block h-3 w-3 rounded-sm" style={{ background: "linear-gradient(#d60000,#b30000)" }} />
        {label}
        {stats.min < 0 && (
          <>
            <span className="ml-3 inline-block h-3 w-3 rounded-sm bg-gray-400" /> ขาดทุน
          </>
        )}
        {stats.avg !== 0 && (
          <>
            <span className="ml-3 inline-block h-0.5 w-4" style={{ background: "#0ea5e9" }} /> เฉลี่ย
          </>
        )}
      </div>
    </div>
  );
}
