"use client";

/** Marketing overview dashboard (owner brief §2.1) — month-scoped cards,
 *  charts, and action lists. Read-only; clicking an item opens its detail. */
import { useMemo, useState } from "react";
import { Repeat, AlertTriangle, Trophy, ClipboardList } from "lucide-react";
import { usePlanner } from "@/lib/marketing-planner/store";
import { countByField, inMonth, needReworkItems, notArchived, postsByDayOfMonth, shouldRepeatItems, topByScore, totals } from "@/lib/marketing-planner/analytics";
import { isResultEmpty } from "@/lib/marketing-planner/performance";
import { fmtMoney, fmtNum, pad2, TH_MONTHS } from "@/lib/marketing-planner/util";
import { cx, inputCls, MetricCard, SectionCard } from "./ui";
import type { ContentItem } from "@/lib/marketing-planner/types";

function BarList({ rows, max, empty }: { rows: { label: string; count: number; color?: string }[]; max?: number; empty?: string }) {
  const top = max ?? Math.max(1, ...rows.map((r) => r.count));
  if (rows.length === 0) return <p className="py-3 text-center text-[12px] text-muted/70">{empty ?? "ไม่มีข้อมูล"}</p>;
  return (
    <div className="space-y-1.5">
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-2">
          <span className="w-28 shrink-0 truncate text-[12px] text-foreground">{r.label}</span>
          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted/15">
            <div className="h-full rounded-full" style={{ width: `${(r.count / top) * 100}%`, backgroundColor: r.color || "#B30000" }} />
          </div>
          <span className="w-8 shrink-0 text-right text-[12px] font-semibold text-foreground">{r.count}</span>
        </div>
      ))}
    </div>
  );
}

function MiniList({ items, onOpen, metric }: { items: ContentItem[]; onOpen: (id: string) => void; metric?: (c: ContentItem) => string }) {
  if (items.length === 0) return <p className="py-3 text-center text-[12px] text-muted/70">ไม่มีรายการ</p>;
  return (
    <ul className="divide-y divide-border">
      {items.map((c) => (
        <li key={c.id}>
          <button type="button" onClick={() => onOpen(c.id)} className="flex w-full items-center justify-between gap-2 py-1.5 text-left hover:text-primary-700">
            <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-foreground">{c.title}</span>
            {metric && <span className="shrink-0 text-[12px] font-bold text-primary-700">{metric(c)}</span>}
          </button>
        </li>
      ))}
    </ul>
  );
}

export function Dashboard({ onOpenContent }: { onOpenContent: (id: string) => void }) {
  const { contents, byGroup, labelOf, colorOf, userName, userColor } = usePlanner();
  const now = new Date();
  const [ym, setYm] = useState(`${now.getFullYear()}-${pad2(now.getMonth() + 1)}`);
  const [y, m] = ym.split("-").map(Number);

  const live = useMemo(() => notArchived(contents), [contents]);
  const month = useMemo(() => inMonth(live, ym), [live, ym]);

  const statuses = byGroup("status");
  const statusCount = useMemo(() => {
    const map = new Map(countByField(month, "statusId").map((x) => [x.id, x.count]));
    return statuses.map((s) => ({ s, count: map.get(s.id) ?? 0 }));
  }, [month, statuses]);

  const t = useMemo(() => totals(month), [month]);
  const dayBars = useMemo(() => postsByDayOfMonth(live, y, m - 1), [live, y, m]);
  const maxDay = Math.max(1, ...dayBars);

  const platformRows = countByField(month, "platformId").map((x) => ({ label: labelOf(x.id), count: x.count, color: colorOf(x.id) }));
  const goalRows = countByField(month, "marketingGoalId").map((x) => ({ label: labelOf(x.id), count: x.count, color: colorOf(x.id) }));
  const ownerRows = countByField(month, "ownerId").map((x) => ({ label: userName(x.id), count: x.count, color: userColor(x.id) }));

  const top = topByScore(month, 5);
  const repeat = shouldRepeatItems(month);
  const rework = needReworkItems(month);
  const doneIds = new Set(statuses.filter((s) => s.meta && s.meta.isDone).map((s) => s.id));
  const noResult = month.filter((c) => c.statusId && doneIds.has(c.statusId) && isResultEmpty(c.result));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-bold text-foreground">ภาพรวมเดือน {TH_MONTHS[m - 1]} {y + 543}</h2>
        <input type="month" className={cx(inputCls, "w-auto")} value={ym} onChange={(e) => setYm(e.target.value || ym)} />
      </div>

      {/* Status cards */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
        <MetricCard label="คอนเทนต์เดือนนี้" value={month.length} accent="#B30000" />
        {statusCount.filter(({ count }) => count > 0).slice(0, 5).map(({ s, count }) => (
          <MetricCard key={s.id} label={s.name} value={count} accent={s.color} />
        ))}
      </div>

      {/* Result totals */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
        <MetricCard label="Reach รวม" value={fmtNum(t.reach)} />
        <MetricCard label="View รวม" value={fmtNum(t.view)} />
        <MetricCard label="Engagement" value={fmtNum(t.engagement)} />
        <MetricCard label="ทัก/DM" value={fmtNum(t.inbox)} />
        <MetricCard label="Lead รวม" value={fmtNum(t.lead)} accent="#0ea5e9" />
        <MetricCard label="รายได้" value={fmtMoney(t.revenue)} accent="#16a34a" />
      </div>

      {/* Charts */}
      <div className="grid gap-3 lg:grid-cols-2">
        <SectionCard title="โพสต์ตามวัน (ทั้งเดือน)">
          <div className="flex h-32 items-end gap-0.5">
            {dayBars.map((v, i) => (
              <div key={i} className="flex flex-1 flex-col items-center justify-end" title={`วันที่ ${i + 1}: ${v} โพสต์`}>
                <div className="w-full rounded-t bg-primary-500/80" style={{ height: `${(v / maxDay) * 100}%`, minHeight: v > 0 ? 4 : 0 }} />
              </div>
            ))}
          </div>
          <div className="mt-1 flex justify-between text-[10px] text-muted"><span>1</span><span>{dayBars.length}</span></div>
        </SectionCard>
        <SectionCard title="คอนเทนต์ตามแพลตฟอร์ม"><BarList rows={platformRows} empty="ยังไม่มีคอนเทนต์เดือนนี้" /></SectionCard>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <SectionCard title="ตามเป้าหมายการตลาด"><BarList rows={goalRows} /></SectionCard>
        <SectionCard title="ตามผู้รับผิดชอบ"><BarList rows={ownerRows} /></SectionCard>
      </div>

      {/* Action lists */}
      <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-4">
        <SectionCard title={<span className="inline-flex items-center gap-1.5"><Trophy className="h-4 w-4 text-amber-500" /> ผลลัพธ์ดีที่สุด</span>}>
          <MiniList items={top} onOpen={onOpenContent} metric={(c) => `${c.result?.performanceScore ?? 0}`} />
        </SectionCard>
        <SectionCard title={<span className="inline-flex items-center gap-1.5"><Repeat className="h-4 w-4 text-green-600" /> ควรทำซ้ำ</span>}>
          <MiniList items={repeat} onOpen={onOpenContent} />
        </SectionCard>
        <SectionCard title={<span className="inline-flex items-center gap-1.5"><AlertTriangle className="h-4 w-4 text-orange-500" /> ต้องแก้/ปรับใหม่</span>}>
          <MiniList items={rework} onOpen={onOpenContent} />
        </SectionCard>
        <SectionCard title={<span className="inline-flex items-center gap-1.5"><ClipboardList className="h-4 w-4 text-primary-600" /> ลงแล้ว ยังไม่กรอกผล</span>}>
          <MiniList items={noResult} onOpen={onOpenContent} />
        </SectionCard>
      </div>
    </div>
  );
}
