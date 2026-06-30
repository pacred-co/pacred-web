"use client";

/** Result & analytics (owner brief §2.6) — totals + breakdown by platform /
 *  type / owner / month, plus the "ลงแล้วยังไม่กรอกผล" queue. */
import { useMemo } from "react";
import { BarChart3 } from "lucide-react";
import type { ContentItem } from "@/lib/marketing-planner/types";
import { usePlanner } from "@/lib/marketing-planner/store";
import { isResultEmpty } from "@/lib/marketing-planner/performance";
import { notArchived, topByScore, totals, withResult } from "@/lib/marketing-planner/analytics";
import { fmtMoney, fmtNum } from "@/lib/marketing-planner/util";
import { btnGhost, cx, EmptyState, MetricCard, OwnerBadge, SectionCard } from "./ui";

type AggRow = { key: string; label: string; count: number; lead: number; deal: number; revenue: number; scoreSum: number; scoreN: number };

function aggregate(items: ContentItem[], keyOf: (c: ContentItem) => string | undefined, labelFn: (k: string) => string): AggRow[] {
  const m = new Map<string, AggRow>();
  for (const c of items) {
    const key = keyOf(c);
    if (!key) continue;
    const row = m.get(key) ?? { key, label: labelFn(key), count: 0, lead: 0, deal: 0, revenue: 0, scoreSum: 0, scoreN: 0 };
    row.count += 1;
    const r = c.result;
    if (r) {
      row.lead += r.lead ?? 0;
      row.deal += r.deal ?? 0;
      row.revenue += r.revenue ?? 0;
      if (typeof r.performanceScore === "number" && !isResultEmpty(r)) {
        row.scoreSum += r.performanceScore;
        row.scoreN += 1;
      }
    }
    m.set(key, row);
  }
  return [...m.values()].sort((a, b) => b.count - a.count);
}

function AggTable({ rows }: { rows: AggRow[] }) {
  if (rows.length === 0) return <p className="py-3 text-center text-[12px] text-muted/70">ไม่มีข้อมูล</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12px]">
        <thead>
          <tr className="border-b border-border text-left text-muted">
            <th className="py-1.5 pr-2 font-semibold">รายการ</th>
            <th className="py-1.5 px-2 text-right font-semibold">คอนเทนต์</th>
            <th className="py-1.5 px-2 text-right font-semibold">Lead</th>
            <th className="py-1.5 px-2 text-right font-semibold">ปิดได้</th>
            <th className="py-1.5 px-2 text-right font-semibold">รายได้</th>
            <th className="py-1.5 pl-2 text-right font-semibold">คะแนนเฉลี่ย</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-b border-border last:border-0">
              <td className="py-1.5 pr-2 font-medium text-foreground">{r.label}</td>
              <td className="py-1.5 px-2 text-right">{r.count}</td>
              <td className="py-1.5 px-2 text-right">{fmtNum(r.lead)}</td>
              <td className="py-1.5 px-2 text-right">{fmtNum(r.deal)}</td>
              <td className="py-1.5 px-2 text-right">{fmtMoney(r.revenue)}</td>
              <td className="py-1.5 pl-2 text-right font-bold text-primary-700">{r.scoreN ? Math.round(r.scoreSum / r.scoreN) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AnalyticsView({ onOpenContent, onResult }: { onOpenContent: (id: string) => void; onResult: (id: string) => void }) {
  const { contents, byGroup, labelOf, userName } = usePlanner();
  const live = useMemo(() => notArchived(contents), [contents]);
  const measured = useMemo(() => withResult(live), [live]);
  const t = useMemo(() => totals(live), [live]);
  const roas = t.cost > 0 ? (t.revenue / t.cost).toFixed(2) : "—";
  const avgScore = measured.length ? Math.round(measured.reduce((s, c) => s + (c.result?.performanceScore ?? 0), 0) / measured.length) : 0;

  const byPlatform = useMemo(() => aggregate(live, (c) => c.platformId, labelOf), [live, labelOf]);
  const byType = useMemo(() => aggregate(live, (c) => c.contentTypeId, labelOf), [live, labelOf]);
  const byOwner = useMemo(() => aggregate(live, (c) => c.ownerId, userName), [live, userName]);
  const byMonth = useMemo(() => aggregate(live, (c) => c.publishDate?.slice(0, 7), (k) => k), [live]);

  const doneIds = new Set(byGroup("status").filter((s) => s.meta && s.meta.isDone).map((s) => s.id));
  const noResult = live.filter((c) => c.statusId && doneIds.has(c.statusId) && isResultEmpty(c.result));
  const top = topByScore(live, 8);

  return (
    <div className="space-y-4">
      {/* Totals */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
        <MetricCard label="Reach รวม" value={fmtNum(t.reach)} />
        <MetricCard label="View รวม" value={fmtNum(t.view)} />
        <MetricCard label="Engagement" value={fmtNum(t.engagement)} />
        <MetricCard label="ทัก/DM" value={fmtNum(t.inbox)} />
        <MetricCard label="Lead รวม" value={fmtNum(t.lead)} accent="#0ea5e9" />
        <MetricCard label="ปิดการขาย" value={fmtNum(t.deal)} accent="#16a34a" />
        <MetricCard label="รายได้รวม" value={fmtMoney(t.revenue)} accent="#16a34a" />
        <MetricCard label="ต้นทุนรวม" value={fmtMoney(t.cost)} />
        <MetricCard label="ROAS" value={roas} />
        <MetricCard label="คะแนนเฉลี่ย" value={avgScore} accent="#B30000" />
        <MetricCard label="วัดผลแล้ว" value={`${measured.length}/${live.length}`} />
      </div>

      {noResult.length > 0 && (
        <SectionCard title={`ลงแล้วยังไม่กรอกผล (${noResult.length})`}>
          <ul className="divide-y divide-border">
            {noResult.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2 py-1.5">
                <button type="button" onClick={() => onOpenContent(c.id)} className="min-w-0 flex-1 truncate text-left text-[12px] font-medium text-foreground hover:text-primary-700">{c.title}</button>
                <button type="button" className={cx(btnGhost, "py-1")} onClick={() => onResult(c.id)}><BarChart3 className="h-3.5 w-3.5" /> กรอกผล</button>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        <SectionCard title="สรุปตามแพลตฟอร์ม"><AggTable rows={byPlatform} /></SectionCard>
        <SectionCard title="สรุปตามประเภทคอนเทนต์"><AggTable rows={byType} /></SectionCard>
        <SectionCard title="สรุปตามผู้รับผิดชอบ"><AggTable rows={byOwner} /></SectionCard>
        <SectionCard title="สรุปรายเดือน"><AggTable rows={byMonth} /></SectionCard>
      </div>

      <SectionCard title="คอนเทนต์ผลลัพธ์ดีที่สุด">
        {top.length === 0 ? (
          <EmptyState icon={<BarChart3 className="h-6 w-6" />} title="ยังไม่มีผลลัพธ์" message="กรอกผลคอนเทนต์ที่ลงแล้วเพื่อดูอันดับ" />
        ) : (
          <ul className="divide-y divide-border">
            {top.map((c, i) => (
              <li key={c.id} className="flex items-center gap-2 py-1.5">
                <span className="w-5 text-center text-[12px] font-bold text-muted">{i + 1}</span>
                <button type="button" onClick={() => onOpenContent(c.id)} className="min-w-0 flex-1 truncate text-left text-[12px] font-medium text-foreground hover:text-primary-700">{c.title}</button>
                <OwnerBadge ownerId={c.ownerId} withName={false} />
                <span className="w-10 text-right text-[13px] font-black text-primary-700">{c.result?.performanceScore ?? 0}</span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
