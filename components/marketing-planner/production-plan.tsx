"use client";

/**
 * แผนการผลิต (Production Plan · ปอน 2026-07-01 · per-day pins ปอน 2026-07-18) — set the
 * monthly quota (long clips per pillar + short total) AND a daily baseline for
 * บทความ/โพสต์, see it spread across the month ("อะไรลงวันไหน"), track progress vs
 * quota, and generate the idea slots into the calendar.
 *
 * Distribution: "auto" spreads the quota over every day; "manual" (เลือกวันเอง) lets
 * you click days to place content on AND กำหนดเองต่อวัน — พิมพ์เลขในช่อง หรือ ลาก chip
 * ประเภท ลงวัน = pin วันนั้น แล้วระบบเกลี่ยจำนวนที่เหลือของประเภทนั้นไปวันที่เลือกอื่นให้.
 */
import { useMemo, useState } from "react";
import { CalendarRange, FileText, Film, PenLine, Sparkles } from "lucide-react";
import { usePlanner } from "@/lib/marketing-planner/store";
import { daysInMonth, distributeMonth, targetsTotal, type DayOverride, type DaySlot, type PlanOverrides } from "@/lib/marketing-planner/production-plan";
import { pad2, TH_MONTHS } from "@/lib/marketing-planner/util";
import { btnPrimary, cx, inputCls, MetricCard, SectionCard, useConfirm } from "./ui";

const LONG_TYPE = "contentType-long";
const SHORT_TYPE = "contentType-short";
const ARTICLE_TYPE = "contentType-article";
const POST_TYPE = "contentType-post";

// Fixed-width numeric input — NOT inputCls: its `w-full` beats an appended `w-16`
// (Tailwind source-order), so the input blew out to full width and squeezed the
// pillar name to nothing. shrink-0 keeps it a small box so the name stays readable.
const numInput = "shrink-0 rounded-lg border border-border bg-white px-2 py-1 text-right text-sm text-foreground outline-none transition focus:border-primary-400 focus:ring-2 focus:ring-primary-100 dark:bg-surface dark:focus:ring-primary-900/30";

type DistMode = "auto" | "manual";

// drag chips → drop on a day = +1 that day (pin). mirror content-calendar.tsx pattern.
const CHIP_MIME = "text/plan-chip";
const CHIP_TYPES: { type: keyof DayOverride; label: string; cls: string }[] = [
  { type: "long", label: "คลิปยาว", cls: "border-primary-300 bg-primary-50 text-primary-700 dark:bg-primary-900/20" },
  { type: "short", label: "คลิปสั้น", cls: "border-sky-300 bg-sky-50 text-sky-700 dark:bg-sky-900/20" },
  { type: "article", label: "บทความ", cls: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20" },
  { type: "post", label: "โพสต์", cls: "border-amber-300 bg-amber-50 text-amber-700 dark:bg-amber-900/20" },
];

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
  // per-day pins (กำหนดเอง) — local/transient like selectedDays. undefined = auto-spread.
  const [overrides, setOverrides] = useState<PlanOverrides>(() => new Map());

  const pillars = byGroup("contentPillar");
  const days = daysInMonth(y, m - 1);
  const isManual = mode === "manual";
  // เปลี่ยนเดือน → รีเซ็ตวันที่เลือก + ที่กำหนดเอง (render-time reset · React-recommended
  // แทน setState-in-effect · เหมือน prevRateKey ใน quote-tab).
  const [prevYm, setPrevYm] = useState(ym);
  if (ym !== prevYm) {
    setPrevYm(ym);
    setSelectedDays(new Set());
    setOverrides(new Map());
  }

  // Effective day count that the plan actually lands on (all days, or the chosen ones).
  const activeDays = isManual ? selectedDays.size : days;
  const totals = targetsTotal(targets, activeDays);
  const slots = useMemo(
    () => distributeMonth(y, m - 1, targets, isManual ? selectedDays : null, isManual ? overrides : null),
    [y, m, targets, isManual, selectedDays, overrides],
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

  // Count exactly what will be placed (mode + day-selection + pins aware) by summing the plan.
  const slotLong = useMemo(() => slots.reduce((a, s) => a + s.longs.reduce((x, l) => x + l.count, 0), 0), [slots]);
  const slotShort = useMemo(() => slots.reduce((a, s) => a + s.short, 0), [slots]);
  const slotArticle = useMemo(() => slots.reduce((a, s) => a + s.article, 0), [slots]);
  const slotPost = useMemo(() => slots.reduce((a, s) => a + s.post, 0), [slots]);

  const genLongN = genLong ? slotLong : 0;
  const genShortN = genShort ? slotShort : 0;
  const genArticleN = genArticle ? slotArticle : 0;
  const genPostN = genPost ? slotPost : 0;
  const genTotal = genLongN + genShortN + genArticleN + genPostN;

  // ── per-day pin (กำหนดเอง) ──────────────────────────────────────────────────
  const slotByDay = useMemo(() => new Map(slots.map((s) => [s.day, s])), [slots]);
  const dayValue = (day: number, type: keyof DayOverride): number => {
    const s = slotByDay.get(day);
    if (!s) return 0;
    return type === "long" ? s.longs.reduce((a, l) => a + l.count, 0) : type === "short" ? s.short : type === "article" ? s.article : s.post;
  };
  const setDayOverride = (day: number, type: keyof DayOverride, value: number | null) =>
    setOverrides((prev) => {
      const next = new Map(prev);
      const cur: DayOverride = { ...(next.get(day) ?? {}) };
      if (value == null) delete cur[type];
      else cur[type] = Math.max(0, Math.floor(value));
      if (Object.keys(cur).length === 0) next.delete(day);
      else next.set(day, cur);
      return next;
    });
  const clearDayOverride = (day: number) =>
    setOverrides((prev) => { if (!prev.has(day)) return prev; const next = new Map(prev); next.delete(day); return next; });
  const dropChip = (day: number, type: keyof DayOverride) => {
    const cur = dayValue(day, type); // ค่าที่โชว์อยู่ตอนนี้ (0 ถ้ายังไม่เลือกวัน) → pin ที่ +1
    setSelectedDays((prev) => (prev.has(day) ? prev : new Set(prev).add(day)));
    setDayOverride(day, type, cur + 1);
  };
  // เตือนถ้า pin รวมเกินโควต้าของประเภทนั้น (วันอื่นของประเภทนั้นจะเป็น 0).
  const overPinned = useMemo(() => {
    if (!isManual || overrides.size === 0) return false;
    const sum = (k: keyof DayOverride) => [...overrides.values()].reduce((a, o) => a + (o[k] ?? 0), 0);
    const longPool = Object.values(targets.longByPillar).reduce((a, n) => a + (n > 0 ? n : 0), 0);
    return sum("long") > longPool || sum("short") > targets.shortTotal
      || sum("article") > (targets.articlePerDay ?? 0) * activeDays
      || sum("post") > (targets.postPerDay ?? 0) * activeDays;
  }, [isManual, overrides, targets, activeDays]);

  const toggleDay = (day: number) => {
    const wasSelected = selectedDays.has(day);
    setSelectedDays((prev) => {
      const next = new Set(prev);
      if (next.has(day)) next.delete(day);
      else next.add(day);
      return next;
    });
    if (wasSelected) clearDayOverride(day); // เอาวันออก → ล้างที่ pin ของวันนั้น
  };
  const selectAllDays = () => setSelectedDays(new Set(Array.from({ length: days }, (_, i) => i + 1)));
  const clearDays = () => { setSelectedDays(new Set()); setOverrides(new Map()); };
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
    if (ok) generateFromPlan(y, m - 1, { long: genLong, short: genShort, article: genArticle, post: genPost }, isManual ? [...selectedDays] : null, isManual ? overrides : null);
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
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground" title={p.name}>{p.name}</span>
                  <span className="shrink-0 whitespace-nowrap text-[11px] text-muted">ทำแล้ว {done}</span>
                  <input type="number" min={0} className={cx(numInput, "w-16")} value={target} onChange={(e) => setLongTarget(p.id, Number(e.target.value))} />
                </div>
              );
            })}
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-border bg-sky-50/40 p-2 dark:bg-sky-900/10">
            <Film className="h-4 w-4 shrink-0 text-sky-600" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-foreground">คลิปสั้น</span>
              <span className="block text-[11px] leading-tight text-muted">Reels / TikTok · รวมทั้งเดือน</span>
            </span>
            <span className="shrink-0 whitespace-nowrap text-[11px] text-muted">ทำแล้ว {createdShort}</span>
            <input type="number" min={0} className={cx(numInput, "w-20")} value={targets.shortTotal} onChange={(e) => setShortTarget(Number(e.target.value))} />
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-border bg-emerald-50/40 p-2 dark:bg-emerald-900/10">
            <FileText className="h-4 w-4 shrink-0 text-emerald-600" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-foreground">บทความ</span>
              <span className="block text-[11px] leading-tight text-muted">ต่อวัน · × {activeDays} = {totals.article}/เดือน</span>
            </span>
            <span className="shrink-0 whitespace-nowrap text-[11px] text-muted">ทำแล้ว {createdArticle}</span>
            <input type="number" min={0} className={cx(numInput, "w-16")} value={targets.articlePerDay ?? 0} onChange={(e) => setArticlePerDay(Number(e.target.value))} />
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-border bg-amber-50/40 p-2 dark:bg-amber-900/10">
            <PenLine className="h-4 w-4 shrink-0 text-amber-600" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-foreground">โพสต์</span>
              <span className="block text-[11px] leading-tight text-muted">ต่อวัน · × {activeDays} = {totals.post}/เดือน</span>
            </span>
            <span className="shrink-0 whitespace-nowrap text-[11px] text-muted">ทำแล้ว {createdPost}</span>
            <input type="number" min={0} className={cx(numInput, "w-16")} value={targets.postPerDay ?? 0} onChange={(e) => setPostPerDay(Number(e.target.value))} />
          </div>
        </div>
      </SectionCard>

      {/* Distribution preview + mode */}
      <SectionCard title="เฉลี่ยลงวัน (แผนการลงคอนเทนต์)" actions={modeToggle}>
        {isManual && (
          <>
            <div className="mb-2 flex flex-wrap items-center gap-2 rounded-lg border border-primary-200 bg-primary-50/50 px-2.5 py-1.5 dark:border-primary-900/40 dark:bg-primary-900/10">
              <span className="text-[12px] font-semibold text-primary-700 dark:text-primary-300">
                เลือกแล้ว {selectedDays.size.toLocaleString("th-TH")} วัน
                <span className="ml-1 font-normal text-primary-600/60 dark:text-primary-300/60">· พิมพ์/ลากใส่วัน = กำหนดเอง</span>
              </span>
              <div className="ml-auto flex flex-wrap gap-1">
                <button type="button" onClick={selectAllDays} className="rounded-md border border-border bg-white px-2 py-0.5 text-[11px] text-foreground transition hover:bg-primary-50 dark:bg-surface">เลือกทั้งเดือน</button>
                <button type="button" onClick={selectWeekdays} className="rounded-md border border-border bg-white px-2 py-0.5 text-[11px] text-foreground transition hover:bg-primary-50 dark:bg-surface">จันทร์–ศุกร์</button>
                {overrides.size > 0 && (
                  <button type="button" onClick={() => setOverrides(new Map())} className="rounded-md border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] text-amber-700 transition hover:bg-amber-100 dark:bg-amber-900/20">ล้างที่กำหนดเอง</button>
                )}
                <button type="button" onClick={clearDays} className="rounded-md border border-border bg-white px-2 py-0.5 text-[11px] text-foreground transition hover:bg-primary-50 dark:bg-surface">ล้าง</button>
              </div>
            </div>
            <div className="mb-2 flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-muted">ลากลงวัน:</span>
              {CHIP_TYPES.map((c) => (
                <div key={c.type} draggable onDragStart={(e) => e.dataTransfer.setData(CHIP_MIME, c.type)}
                  className={cx("cursor-grab select-none rounded-full border px-2 py-0.5 text-[11px] font-medium active:cursor-grabbing", c.cls)}
                  title={`ลาก "${c.label}" ลงวัน = +1 วันนั้น`}>
                  ＋ {c.label}
                </div>
              ))}
            </div>
            {overPinned && (
              <p className="mb-2 text-[11px] text-amber-600">⚠ กำหนดเองเกินโควต้าบางประเภท — วันอื่นของประเภทนั้นจะเป็น 0</p>
            )}
          </>
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
              isManual && !selected && "cursor-pointer hover:border-primary-300",
              selected ? "border-primary-400 ring-1 ring-primary-300" : "border-border",
              dim && "opacity-40",
            );
            const style = !dim && load ? { backgroundColor: `rgba(179,0,0,${0.04 + intensity * 0.14})` } : undefined;
            const title = s.longs.map((l) => `${labelOf(l.pillarId)} ×${l.count}`).join("\n") || undefined;
            const onDrop = isManual
              ? (e: { preventDefault: () => void; dataTransfer: DataTransfer }) => { e.preventDefault(); const t = e.dataTransfer.getData(CHIP_MIME); if (t) dropChip(s.day, t as keyof DayOverride); }
              : undefined;

            // auto mode → read-only
            if (!isManual) {
              return <div key={s.date} className={cls} style={style} title={title}><ReadonlyDay s={s} longN={longN} /></div>;
            }
            // manual · unselected → แค่เลขวัน (สะอาด · แตะเพื่อเลือก · เป็น drop target ด้วย)
            if (!selected) {
              return (
                <button key={s.date} type="button" onClick={() => toggleDay(s.day)} className={cx(cls, "flex items-center justify-center")} style={style} title="แตะเพื่อเลือกวันนี้"
                  onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
                  <span className="text-[13px] font-semibold text-foreground">{s.day}</span>
                </button>
              );
            }
            // manual · selected → editable (4 pin inputs)
            const ov = overrides.get(s.day);
            return (
              <div key={s.date} className={cx(cls, "space-y-0.5 text-left")} style={style} title={title}
                onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
                <button type="button" onClick={() => toggleDay(s.day)} className="mb-0.5 flex w-full items-center justify-center gap-1 text-[11px] font-bold leading-none text-foreground hover:text-primary-600" title="เอาวันนี้ออก">
                  {s.day}<span className="text-[9px] text-muted">✕</span>
                </button>
                <PinInput label="ยาว" color="text-primary-700" value={ov?.long} placeholder={longN} onChange={(v) => setDayOverride(s.day, "long", v)} />
                <PinInput label="สั้น" color="text-sky-600" value={ov?.short} placeholder={s.short} onChange={(v) => setDayOverride(s.day, "short", v)} />
                <PinInput label="บท" color="text-emerald-600" value={ov?.article} placeholder={s.article} onChange={(v) => setDayOverride(s.day, "article", v)} />
                <PinInput label="โพ" color="text-amber-600" value={ov?.post} placeholder={s.post} onChange={(v) => setDayOverride(s.day, "post", v)} />
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-[11px] text-muted">
          {isManual
            ? "เลือกวัน แล้วพิมพ์จำนวนในช่อง (หรือลาก chip ลงวัน) = กำหนดเองวันนั้น (pin) · ระบบเกลี่ยจำนวนที่เหลือของประเภทนั้นไปวันที่เลือกอื่นให้ · เว้นว่าง = เกลี่ยอัตโนมัติ"
            : "ตัวเลขแต่ละวัน = จำนวนที่ควรลง (คลิปเฉลี่ยจากโควต้าเดือน · บทความ/โพสต์ ยืนพื้นเท่ากันทุกวัน) · ความเข้มของสี = ปริมาณคลิป · ชี้ค้างเพื่อดูเสาหลัก"}
        </p>
      </SectionCard>

      {/* Generate */}
      <SectionCard title={<span className="inline-flex items-center gap-1.5"><Sparkles className="h-4 w-4 text-primary-600" /> สร้างคอนเทนต์ตามแผน</span>}>
        <p className="mb-2 text-[12px] text-muted">
          กดสร้างเพื่อให้ระบบวางสล็อตคอนเทนต์ (สถานะ Idea) ลงปฏิทินเดือนนี้ตามโควต้า
          {isManual ? " เฉพาะวันที่เลือก (ตามที่กำหนดเอง)" : " เกลี่ยทุกวัน"} แล้วทีมทยอยเปิดเติมรายละเอียด/แปะลิงก์/วัดผล
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

/** อ่านอย่างเดียว (โหมด auto / วันที่ยังไม่เลือก). */
function ReadonlyDay({ s, longN }: { s: DaySlot; longN: number }) {
  return (
    <>
      <p className="text-[11px] font-bold text-foreground">{s.day}</p>
      <p className="text-[11px] leading-tight text-primary-700">ยาว {longN}</p>
      <p className="text-[11px] leading-tight text-sky-600">สั้น {s.short}</p>
      <p className="hidden text-[11px] leading-tight text-muted sm:block">บท {s.article} · โพ {s.post}</p>
    </>
  );
}

/** ช่องกำหนดเองต่อวัน — ว่าง = เกลี่ยอัตโนมัติ (placeholder จาง) · พิมพ์ = pin (ไฮไลต์ให้เห็นชัด). */
function PinInput({ label, color, value, placeholder, onChange }: {
  label: string; color: string; value: number | undefined; placeholder: number; onChange: (v: number | null) => void;
}) {
  const pinned = value != null;
  return (
    <label className="flex items-center gap-1 leading-none" onClick={(e) => e.stopPropagation()}>
      <span className={cx("w-5 shrink-0 text-[10px] font-medium", color)}>{label}</span>
      <input
        type="number" min={0} inputMode="numeric"
        value={pinned ? String(value) : ""}
        placeholder={String(placeholder)}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => { const v = e.target.value.trim(); onChange(v === "" ? null : Math.max(0, Math.floor(Number(v) || 0))); }}
        className={cx(
          "h-5 min-w-0 flex-1 rounded border bg-white px-1 text-right text-[11px] tabular-nums text-foreground outline-none placeholder:text-muted/40 focus:border-primary-400 focus:ring-1 focus:ring-primary-200 dark:bg-surface",
          pinned ? "border-primary-300 bg-primary-50/50 font-semibold dark:bg-primary-900/15" : "border-border/70",
        )}
      />
    </label>
  );
}
