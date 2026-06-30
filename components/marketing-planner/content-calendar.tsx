"use client";

/**
 * Calendar view (owner brief §2.3) — month/week/day over publishDate.
 * Drag a chip to another day to reschedule (setContentDate). Click a chip to
 * open it; click a day (or +) to create on that date. Status colours, platform
 * dot, owner, time, and draft/final/result icons per chip.
 */
import { useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, FileEdit, CheckCircle2, BarChart3, Plus } from "lucide-react";
import type { ContentItem } from "@/lib/marketing-planner/types";
import { usePlanner } from "@/lib/marketing-planner/store";
import { isResultEmpty } from "@/lib/marketing-planner/performance";
import { TH_DAYS, TH_MONTHS, monthMatrix, sameYmd, toDateStr, weekDays } from "@/lib/marketing-planner/util";
import { btnGhost, cx } from "./ui";

type ViewMode = "month" | "week" | "day";

function flags(c: ContentItem, labelOf: (id?: string) => string) {
  const draft = c.links.some((l) => /draft|ดราฟ|ร่าง/i.test(labelOf(l.linkTypeId)));
  const final = c.links.some((l) => /final|publish|งานจริง|โพสต์|เผยแพร่/i.test(labelOf(l.linkTypeId)));
  const result = !!c.result && !isResultEmpty(c.result);
  return { draft, final, result };
}

function Chip({ c, onOpen, draggable = true }: { c: ContentItem; onOpen: (id: string) => void; draggable?: boolean }) {
  const { colorOf, labelOf } = usePlanner();
  const color = colorOf(c.statusId) || "#94a3b8";
  const platformColor = colorOf(c.platformId);
  const f = flags(c, labelOf);
  return (
    <button
      type="button"
      draggable={draggable}
      onDragStart={(e) => e.dataTransfer.setData("text/planner-id", c.id)}
      onClick={() => onOpen(c.id)}
      className="group flex w-full items-center gap-1 rounded-md border-l-[3px] bg-white px-1.5 py-1 text-left text-[11px] shadow-sm transition hover:shadow dark:bg-surface"
      style={{ borderLeftColor: color }}
      title={c.title}
    >
      {platformColor && <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: platformColor }} />}
      {c.publishTime && <span className="shrink-0 font-mono text-[10px] text-muted">{c.publishTime}</span>}
      <span className="min-w-0 flex-1 truncate font-medium text-foreground">{c.title}</span>
      <span className="flex shrink-0 items-center gap-0.5 text-muted">
        {f.draft && <FileEdit className="h-3 w-3" />}
        {f.final && <CheckCircle2 className="h-3 w-3 text-green-600" />}
        {f.result && <BarChart3 className="h-3 w-3 text-primary-600" />}
      </span>
    </button>
  );
}

export function ContentCalendar({ items, onOpenContent, onCreateOn }: { items?: ContentItem[]; onOpenContent: (id: string) => void; onCreateOn: (date: string) => void }) {
  const { contents, byId } = usePlanner();
  const src = items ?? contents;
  const now = new Date();
  const [view, setView] = useState<ViewMode>("month");
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [ref, setRef] = useState<Date>(now); // for week/day

  const { setContentDate } = usePlanner();

  // Map dateStr → contents (honor status.meta.inCalendar; items with no status show)
  const byDate = useMemo(() => {
    const m = new Map<string, ContentItem[]>();
    for (const c of src) {
      if (c.archivedAt || !c.publishDate) continue;
      const st = byId(c.statusId);
      if (st && st.meta && st.meta.inCalendar === false) continue;
      const arr = m.get(c.publishDate) ?? [];
      arr.push(c);
      m.set(c.publishDate, arr);
    }
    for (const arr of m.values()) arr.sort((a, b) => (a.publishTime ?? "").localeCompare(b.publishTime ?? ""));
    return m;
  }, [src, byId]);

  const drop = (e: React.DragEvent, date: Date) => {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/planner-id");
    if (id) setContentDate(id, toDateStr(date));
  };

  const go = (delta: number) => {
    if (view === "month") {
      const d = new Date(year, month + delta, 1);
      setYear(d.getFullYear());
      setMonth(d.getMonth());
    } else {
      const step = view === "week" ? 7 : 1;
      setRef((r) => new Date(r.getFullYear(), r.getMonth(), r.getDate() + delta * step));
    }
  };
  const goToday = () => {
    const t = new Date();
    setYear(t.getFullYear());
    setMonth(t.getMonth());
    setRef(t);
  };

  const headerLabel =
    view === "month"
      ? `${TH_MONTHS[month]} ${year + 543}`
      : view === "week"
        ? `สัปดาห์ของ ${ref.getDate()} ${TH_MONTHS[ref.getMonth()]} ${ref.getFullYear() + 543}`
        : `${ref.getDate()} ${TH_MONTHS[ref.getMonth()]} ${ref.getFullYear() + 543}`;

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <button type="button" className={cx(btnGhost, "px-2")} onClick={() => go(-1)}><ChevronLeft className="h-4 w-4" /></button>
          <button type="button" className={btnGhost} onClick={goToday}>วันนี้</button>
          <button type="button" className={cx(btnGhost, "px-2")} onClick={() => go(1)}><ChevronRight className="h-4 w-4" /></button>
          <span className="ml-1 inline-flex items-center gap-1.5 text-sm font-bold text-foreground"><CalendarDays className="h-4 w-4 text-primary-600" />{headerLabel}</span>
        </div>
        <div className="inline-flex rounded-lg border border-border p-0.5">
          {(["month", "week", "day"] as ViewMode[]).map((v) => (
            <button key={v} type="button" onClick={() => setView(v)}
              className={cx("rounded-md px-3 py-1 text-[12px] font-medium transition", view === v ? "bg-primary-600 text-white" : "text-muted hover:text-foreground")}>
              {v === "month" ? "เดือน" : v === "week" ? "สัปดาห์" : "วัน"}
            </button>
          ))}
        </div>
      </div>

      {view === "month" && <MonthGrid year={year} month={month} byDate={byDate} onOpen={onOpenContent} onCreate={onCreateOn} onDrop={drop} onSeeAll={(d) => { setRef(d); setView("day"); }} />}
      {view === "week" && <DayColumns days={weekDays(ref)} byDate={byDate} onOpen={onOpenContent} onCreate={onCreateOn} onDrop={drop} />}
      {view === "day" && <DayColumns days={[ref]} byDate={byDate} onOpen={onOpenContent} onCreate={onCreateOn} onDrop={drop} wide />}
    </div>
  );
}

function MonthGrid({ year, month, byDate, onOpen, onCreate, onDrop, onSeeAll }: {
  year: number; month: number; byDate: Map<string, ContentItem[]>;
  onOpen: (id: string) => void; onCreate: (d: string) => void; onDrop: (e: React.DragEvent, d: Date) => void; onSeeAll: (d: Date) => void;
}) {
  const weeks = monthMatrix(year, month);
  const today = new Date();
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-white dark:bg-surface">
      <div className="grid grid-cols-7 border-b border-border bg-primary-50/40 dark:bg-primary-900/10">
        {TH_DAYS.map((d) => <div key={d} className="px-2 py-1.5 text-center text-[11px] font-bold text-muted">{d}</div>)}
      </div>
      <div className="grid grid-cols-7">
        {weeks.flat().map((d, i) => {
          const ds = toDateStr(d);
          const items = byDate.get(ds) ?? [];
          const inMonth = d.getMonth() === month;
          const isToday = sameYmd(d, today);
          return (
            <div key={ds + i} onDragOver={(e) => e.preventDefault()} onDrop={(e) => onDrop(e, d)}
              className={cx("group min-h-[104px] border-b border-r border-border p-1 last:border-r-0", !inMonth && "bg-muted/5", (i + 1) % 7 === 0 && "border-r-0")}>
              <div className="mb-1 flex items-center justify-between">
                <span className={cx("inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px]", isToday ? "bg-primary-600 font-bold text-white" : inMonth ? "text-foreground" : "text-muted/50")}>{d.getDate()}</span>
                <button type="button" onClick={() => onCreate(ds)} className="rounded p-0.5 text-muted opacity-0 transition hover:bg-primary-50 hover:text-primary-700 group-hover:opacity-100" title="สร้างคอนเทนต์วันนี้"><Plus className="h-3.5 w-3.5" /></button>
              </div>
              <div className="space-y-1">
                {items.slice(0, 3).map((c) => <Chip key={c.id} c={c} onOpen={onOpen} />)}
                {items.length > 3 && (
                  <button type="button" onClick={() => onSeeAll(d)} className="w-full rounded-md px-1.5 py-0.5 text-left text-[11px] font-medium text-primary-700 hover:bg-primary-50">
                    +{items.length - 3} ดูทั้งหมด
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DayColumns({ days, byDate, onOpen, onCreate, onDrop, wide }: {
  days: Date[]; byDate: Map<string, ContentItem[]>;
  onOpen: (id: string) => void; onCreate: (d: string) => void; onDrop: (e: React.DragEvent, d: Date) => void; wide?: boolean;
}) {
  const today = new Date();
  return (
    <div className={cx("grid gap-2", wide ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-7")}>
      {days.map((d) => {
        const ds = toDateStr(d);
        const items = byDate.get(ds) ?? [];
        const isToday = sameYmd(d, today);
        return (
          <div key={ds} onDragOver={(e) => e.preventDefault()} onDrop={(e) => onDrop(e, d)} className="min-h-[160px] rounded-xl border border-border bg-white p-2 dark:bg-surface">
            <div className="mb-2 flex items-center justify-between">
              <span className={cx("text-[12px] font-bold", isToday ? "text-primary-700" : "text-foreground")}>
                {TH_DAYS[d.getDay()]} {d.getDate()}/{d.getMonth() + 1}
              </span>
              <button type="button" onClick={() => onCreate(ds)} className="rounded p-0.5 text-muted hover:bg-primary-50 hover:text-primary-700"><Plus className="h-3.5 w-3.5" /></button>
            </div>
            <div className="space-y-1.5">
              {items.length === 0 && <p className="py-3 text-center text-[11px] text-muted/70">ว่าง</p>}
              {items.map((c) => <Chip key={c.id} c={c} onOpen={onOpen} />)}
            </div>
          </div>
        );
      })}
    </div>
  );
}
