"use client";

/**
 * แผนการผลิต (Production Plan · ปอน 2026-07-01) — set the monthly quota (long
 * clips per pillar + short total) AND a daily baseline for บทความ/โพสต์, see it
 * spread across the month ("อะไรลงวันไหน"), track progress vs quota, and
 * generate the idea slots into the calendar. Every number is editable in-app.
 *
 * Distribution has two modes: "auto" spreads the quota over every day of the
 * month; "manual" (เลือกวันเอง) lets the user click the days to place content on
 * and confines the whole plan + generation to just those days.
 */
import { useEffect, useMemo, useState } from "react";
import { CalendarRange, FileText, Film, PenLine, Sparkles } from "lucide-react";
import { usePlanner } from "@/lib/marketing-planner/store";
import { daysInMonth, distributeMonth, targetsTotal } from "@/lib/marketing-planner/production-plan";
import { pad2, TH_MONTHS } from "@/lib/marketing-planner/util";
import { btnPrimary, cx, inputCls, MetricCard, SectionCard, useConfirm } from "./ui";

const LONG_TYPE = "contentType-long";
const SHORT_TYPE = "contentType-short";
const ARTICLE_TYPE = "contentType-article";
const POST_TYPE = "contentType-post";

type DistMode = "auto" | "manual";

export function ProductionPlan() {
  const { targets, setLongTarget, setShortTarget, setArticlePerDay, setPostPerDay, generateFromPlan, byGroup, contents, labelOf } = usePlanner();
  const confirm = useConfirm();
  const now = new Date();
  const [ym, setYm] = useState(`${now.getFullYear()}-${pad2(now.getMonth() + 1)}`);
  const [y, m] = ym.split("-").map(Number);
  const [genLong, setGenLong] = useState(true);
  const [genShort, setGenShort] = useState(true);
  const [genArticle, setGenArticle] = useState(true);
  const [genPost, setGenPost] = useState(true);
  const [mode, setMode] = useState<DistMode>("auto");
  const [selectedDays, setSelectedDays] = useState<Set<number>>(() => new Set());

  const pillars = byGroup("contentPillar");
  const days = daysInMonth(y, m - 1);
  const isManual = mode === "manual";
  // A different month has different valid day numbers → start the manual pick fresh.
  useEffect(() => { setSelectedDays(new Set()); }, [ym]);

  // Effective day count that the plan actually lands on (all days, or the chosen ones).
  const activeDays = isManual ? selectedDays.size : days;
  const totals = targetsTotal(targets, activeDays);
  const slots = useMemo(
    () => distributeMonth(y, m - 1, targets, isManual ? selectedDays : null),
    [y, m, targets, isManual, selectedDays],
  );

  const monthContents = useMemo(
    () => contents.filter((c) => !c.archivedAt && (c.publishDate ?? "").slice(0, 7) === ym),
    [contents, ym],
  );
  const createdLong = monthContents.filter((c) => c.contentTypeId === LONG_TYPE).length;
  const createdShort = monthContents.filter((c) => c.contentTypeId === SHORT_TYPE).length;
  const createdArticle = monthContents.filter((c) => c.contentTypeId === ARTICLE_TYPE).length;
  const createdPost = monthContents.filter((c) => c.contentTypeId === POST_TYPE).length;
  const createdLongByPillar = (pid: string) => monthContents.filter((c) => c.contentTypeId === LONG_TYPE && c.contentPillarId === pid).length;

  // Count exactly what will be placed (mode + day-selection aware) by summing the plan.
  const slotLong = useMemo(() => slots.reduce((a, s) => a + s.longs.reduce((x, l) => x + l.count, 0), 0), [slots]);
  const slotShort = useMemo(() => slots.reduce((a, s) => a + s.short, 0), [slots]);
  const slotArticle = useMemo(() => slots.reduce((a, s) => a + s.article, 0), [slots]);
  const slotPost = useMemo(() => slots.reduce((a, s) => a + s.post, 0), [slots]);

  const genLongN = genLong ? slotLong : 0;
  const genShortN = genShort ? slotShort : 0;
  const genArticleN = genArticle ? slotArticle : 0;
  const genPostN = genPost ? slotPost : 0;
  const genTotal = genLongN + genShortN + genArticleN + genPostN;

  const toggleDay = (day: number) =>
    setSelectedDays((prev) => {
      const next = new Set(prev);
      if (next.has(day)) next.delete(day);
      else next.add(day);
      return next;
    });
  const selectAllDays = () => setSelectedDays(new Set(Array.from({ length: days }, (_, i) => i + 1)));
  const clearDays = () => setSelectedDays(new Set());
  const selectWeekdays = () => {
    const s = new Set<number>();
    for (let d = 1; d <= days; d += 1) {
      const dow = new Date(y, m - 1, d).getDay();
      if (dow >= 1 && dow <= 5) s.add(d);
    }
    setSelectedDays(s);
  };

  const generate = async () => {
    if (genTotal === 0) return;
    const dayNote = isManual ? ` ใน ${selectedDays.size.toLocaleString("th-TH")} วันที่เลือก` : "";
    const ok = await confirm({
      title: "สร้างคอนเทนต์ตามแผน",
      message: `จะสร้างสล็อตคอนเทนต์ ${genTotal.toLocaleString("th-TH")} ชิ้น (คลิปยาว ${genLongN} · คลิปสั้น ${genShortN} · บทความ ${genArticleN} · โพสต์ ${genPostN}) ลงปฏิทินเดือน ${TH_MONTHS[m - 1]} ${y + 543}${dayNote} เป็นสถานะ Idea — กดสร้างได้เลย แล้วทยอยเปิดเติมรายละเอียดในแต่ละชิ้น`,
      confirmText: "สร้างลงปฏิทิน",
    });
    if (ok) generateFromPlan(y, m - 1, { long: genLong, short: genShort, article: genArticle, post: genPost }, isManual ? [...selectedDays] : null);
  };

  // Heatmap intensity from the VARIABLE load (long+short) — บทความ/โพสต์ are a flat daily baseline.
  const maxDayVar = Math.max(1, ...slots.map((s) => s.longs.reduce((a, l) => a + l.count, 0) + s.short));

  const modeToggle = (
    <div className="inline-flex rounded-lg border border-border p-0.5">
      {(["auto", "manual"] as const).map((mk) => (
        <button key={mk} type="button" onClick={() => setMode(mk)}
          className={cx("rounded-md px-2.5 py-1 text-[12px] font-medium transition", mode === mk ? "bg-primary-600 text-white" : "text-muted hover:text-foreground")}>
          {mk === "auto" ? "ให้ระบบกระจายเอง" : "เลือกวันเอง"}
        </button>
      ))}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="inline-flex items-center gap-2 text-base font-bold text-foreground">
          <CalendarRange className="h-5 w-5 text-primary-600" /> แผนการผลิตเดือน {TH_MONTHS[m - 1]} {y + 543}
        </h2>
        <input type="month" className={cx(inputCls, "w-auto")} value={ym} onChange={(e) => setYm(e.target.value || ym)} />
      </div>

      {/* Quota summary */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
        <MetricCard label="คลิปยาว / เดือน" value={totals.long} sub={`ทำแล้ว ${createdLong}`} accent="#B30000" />
        <MetricCard label="คลิปสั้น / เดือน" value={totals.short} sub={`ทำแล้ว ${createdShort}`} accent="#0ea5e9" />
        <MetricCard label="บทความ / เดือน" value={totals.article} sub={`ทำแล้ว ${createdArticle}`} accent="#16a34a" />
        <MetricCard label="โพสต์ / เดือน" value={totals.post} sub={`ทำแล้ว ${createdPost}`} accent="#d97706" />
        <MetricCard label="รวมทั้งเดือน" value={totals.total} />
        <MetricCard label="เฉลี่ย / วัน" value={activeDays > 0 ? (totals.total / activeDays).toFixed(1) : "0"} sub={`${activeDays} วัน`} />
      </div>

      {/* Quota editor */}
      <SectionCard title="โควต้ารายเดือน (แก้ได้)">
        <div className="space-y-2">
          <p className="text-[12px] font-semibold text-foreground">คลิปยาว — ต่อเสาหลัก</p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {pillars.map((p) => {
              const target = targets.longByPillar[p.id] ?? 0;
              const done = createdLongByPillar(p.id);
              return (
                <div key={p.id} className="flex items-center gap-2 rounded-lg border border-border p-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: p.color }} />
                  <span className="min-w-0 flex-1 truncate text-[12px] text-foreground" title={p.name}>{p.name}</span>
                  <span className="text-[11px] text-muted">ทำแล้ว {done}</span>
                  <input type="number" min={0} className={cx(inputCls, "w-16 px-2 py-1 text-right")} value={target} onChange={(e) => setLongTarget(p.id, Number(e.target.value))} />
                </div>
              );
            })}
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-border bg-sky-50/40 p-2 dark:bg-sky-900/10">
            <Film className="h-4 w-4 shrink-0 text-sky-600" />
            <span className="flex-1 text-[12px] font-semibold text-foreground">คลิปสั้น / Reels / TikTok — รวมทั้งเดือน</span>
            <span className="text-[11px] text-muted">ทำแล้ว {createdShort}</span>
            <input type="number" min={0} className={cx(inputCls, "w-20 px-2 py-1 text-right")} value={targets.shortTotal} onChange={(e) => setShortTarget(Number(e.target.value))} />
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-border bg-emerald-50/40 p-2 dark:bg-emerald-900/10">
            <FileText className="h-4 w-4 shrink-0 text-emerald-600" />
            <span className="flex-1 text-[12px] font-semibold text-foreground">บทความ — ยืนพื้น/วัน <span className="font-normal text-muted">(× {activeDays} วัน = {totals.article})</span></span>
            <span className="text-[11px] text-muted">ทำแล้ว {createdArticle}</span>
            <input type="number" min={0} className={cx(inputCls, "w-16 px-2 py-1 text-right")} value={targets.articlePerDay ?? 0} onChange={(e) => setArticlePerDay(Number(e.target.value))} />
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-border bg-amber-50/40 p-2 dark:bg-amber-900/10">
            <PenLine className="h-4 w-4 shrink-0 text-amber-600" />
            <span className="flex-1 text-[12px] font-semibold text-foreground">โพสต์ — ยืนพื้น/วัน <span className="font-normal text-muted">(× {activeDays} วัน = {totals.post})</span></span>
            <span className="text-[11px] text-muted">ทำแล้ว {createdPost}</span>
            <input type="number" min={0} className={cx(inputCls, "w-16 px-2 py-1 text-right")} value={targets.postPerDay ?? 0} onChange={(e) => setPostPerDay(Number(e.target.value))} />
          </div>
        </div>
      </SectionCard>

      {/* Distribution preview + mode */}
      <SectionCard title="เฉลี่ยลงวัน (แผนการลงคอนเทนต์)" actions={modeToggle}>
        {isManual && (
          <div className="mb-2 flex flex-wrap items-center gap-2 rounded-lg border border-primary-200 bg-primary-50/50 px-2.5 py-1.5 dark:border-primary-900/40 dark:bg-primary-900/10">
            <span className="text-[12px] font-semibold text-primary-700 dark:text-primary-300">
              คลิกวันบนปฏิทินเพื่อเลือกวันลง · เลือกแล้ว {selectedDays.size.toLocaleString("th-TH")} วัน
            </span>
            <div className="ml-auto flex flex-wrap gap-1">
              <button type="button" onClick={selectAllDays} className="rounded-md border border-border bg-white px-2 py-0.5 text-[11px] text-foreground transition hover:bg-primary-50 dark:bg-surface">เลือกทั้งเดือน</button>
              <button type="button" onClick={selectWeekdays} className="rounded-md border border-border bg-white px-2 py-0.5 text-[11px] text-foreground transition hover:bg-primary-50 dark:bg-surface">จันทร์–ศุกร์</button>
              <button type="button" onClick={clearDays} className="rounded-md border border-border bg-white px-2 py-0.5 text-[11px] text-foreground transition hover:bg-primary-50 dark:bg-surface">ล้าง</button>
            </div>
          </div>
        )}
        <div className="grid grid-cols-7 gap-1">
          {slots.map((s) => {
            const longN = s.longs.reduce((a, l) => a + l.count, 0);
            const load = longN + s.short;
            const intensity = load / maxDayVar;
            const selected = selectedDays.has(s.day);
            const dim = isManual && !selected;
            const cls = cx(
              "rounded-lg border p-1.5 text-center transition",
              isManual && "cursor-pointer hover:border-primary-300",
              selected ? "border-primary-400 ring-1 ring-primary-300" : "border-border",
              dim && "opacity-40",
            );
            const style = !dim && load ? { backgroundColor: `rgba(179,0,0,${0.04 + intensity * 0.14})` } : undefined;
            const title = s.longs.map((l) => `${labelOf(l.pillarId)} ×${l.count}`).join("\n") || undefined;
            const body = (
              <>
                <p className="text-[11px] font-bold text-foreground">{s.day}</p>
                <p className="text-[11px] leading-tight text-primary-700">ยาว {longN}</p>
                <p className="text-[11px] leading-tight text-sky-600">สั้น {s.short}</p>
                <p className="text-[11px] leading-tight text-muted">บท {s.article} · โพ {s.post}</p>
              </>
            );
            return isManual ? (
              <button key={s.date} type="button" onClick={() => toggleDay(s.day)} className={cls} style={style} title={title} aria-pressed={selected}>
                {body}
              </button>
            ) : (
              <div key={s.date} className={cls} style={style} title={title}>
                {body}
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-[11px] text-muted">
          {isManual
            ? "โหมดเลือกวันเอง — คลิกวันที่ต้องการลงคอนเทนต์ ระบบจะกระจายโควต้าลงเฉพาะวันที่เลือก · วันที่ไม่ได้เลือก = 0"
            : "ตัวเลขแต่ละวัน = จำนวนที่ควรลง (คลิปเฉลี่ยจากโควต้าเดือน · บทความ/โพสต์ ยืนพื้นเท่ากันทุกวัน) · ความเข้มของสี = ปริมาณคลิป · ชี้ค้างเพื่อดูเสาหลัก"}
        </p>
      </SectionCard>

      {/* Generate */}
      <SectionCard title={<span className="inline-flex items-center gap-1.5"><Sparkles className="h-4 w-4 text-primary-600" /> สร้างคอนเทนต์ตามแผน</span>}>
        <p className="mb-2 text-[12px] text-muted">
          กดสร้างเพื่อให้ระบบวางสล็อตคอนเทนต์ (สถานะ Idea) ลงปฏิทินเดือนนี้ตามโควต้า
          {isManual ? " เฉพาะวันที่เลือก" : " เกลี่ยทุกวัน"} แล้วทีมทยอยเปิดเติมรายละเอียด/แปะลิงก์/วัดผล
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex items-center gap-1.5 text-[13px] text-foreground">
            <input type="checkbox" checked={genLong} onChange={(e) => setGenLong(e.target.checked)} /> คลิปยาว ({slotLong})
          </label>
          <label className="inline-flex items-center gap-1.5 text-[13px] text-foreground">
            <input type="checkbox" checked={genShort} onChange={(e) => setGenShort(e.target.checked)} /> คลิปสั้น ({slotShort})
          </label>
          <label className="inline-flex items-center gap-1.5 text-[13px] text-foreground">
            <input type="checkbox" checked={genArticle} onChange={(e) => setGenArticle(e.target.checked)} /> บทความ ({slotArticle})
          </label>
          <label className="inline-flex items-center gap-1.5 text-[13px] text-foreground">
            <input type="checkbox" checked={genPost} onChange={(e) => setGenPost(e.target.checked)} /> โพสต์ ({slotPost})
          </label>
          <button type="button" className={btnPrimary} onClick={generate} disabled={genTotal === 0}>
            <Sparkles className="h-4 w-4" /> สร้าง {genTotal.toLocaleString("th-TH")} สล็อตลงปฏิทิน
          </button>
        </div>
        {isManual && selectedDays.size === 0 && (
          <p className="mt-2 text-[11px] text-primary-600">เลือกวันบนปฏิทินด้านบนก่อน แล้วปุ่มสร้างจะกดได้</p>
        )}
        <p className="mt-2 text-[11px] text-amber-600">⚠ กดซ้ำจะสร้างเพิ่ม (ไม่เขียนทับของเดิม) — สร้างครั้งเดียวต่อเดือน หรือลบของเก่าก่อน</p>
      </SectionCard>
    </div>
  );
}
