"use client";

/**
 * แผนการผลิต (Production Plan · ปอน 2026-07-01) — set the monthly quota (long
 * clips per pillar + short total) AND a daily baseline for บทความ/โพสต์, see it
 * spread across the month ("อะไรลงวันไหน"), track progress vs quota, and
 * generate the idea slots into the calendar. Every number is editable in-app.
 */
import { useMemo, useState } from "react";
import { CalendarRange, FileText, Film, PenLine, Sparkles } from "lucide-react";
import { usePlanner } from "@/lib/marketing-planner/store";
import { daysInMonth, distributeMonth, targetsTotal } from "@/lib/marketing-planner/production-plan";
import { pad2, TH_MONTHS } from "@/lib/marketing-planner/util";
import { btnPrimary, cx, inputCls, MetricCard, SectionCard, useConfirm } from "./ui";

const LONG_TYPE = "contentType-long";
const SHORT_TYPE = "contentType-short";
const ARTICLE_TYPE = "contentType-article";
const POST_TYPE = "contentType-post";

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

  const pillars = byGroup("contentPillar");
  const days = daysInMonth(y, m - 1);
  const totals = targetsTotal(targets, days);
  const slots = useMemo(() => distributeMonth(y, m - 1, targets), [y, m, targets]);

  const monthContents = useMemo(
    () => contents.filter((c) => !c.archivedAt && (c.publishDate ?? "").slice(0, 7) === ym),
    [contents, ym],
  );
  const createdLong = monthContents.filter((c) => c.contentTypeId === LONG_TYPE).length;
  const createdShort = monthContents.filter((c) => c.contentTypeId === SHORT_TYPE).length;
  const createdArticle = monthContents.filter((c) => c.contentTypeId === ARTICLE_TYPE).length;
  const createdPost = monthContents.filter((c) => c.contentTypeId === POST_TYPE).length;
  const createdLongByPillar = (pid: string) => monthContents.filter((c) => c.contentTypeId === LONG_TYPE && c.contentPillarId === pid).length;

  const genLongN = genLong ? totals.long : 0;
  const genShortN = genShort ? totals.short : 0;
  const genArticleN = genArticle ? totals.article : 0;
  const genPostN = genPost ? totals.post : 0;
  const genTotal = genLongN + genShortN + genArticleN + genPostN;

  const generate = async () => {
    if (genTotal === 0) return;
    const ok = await confirm({
      title: "สร้างคอนเทนต์ตามแผน",
      message: `จะสร้างสล็อตคอนเทนต์ ${genTotal.toLocaleString("th-TH")} ชิ้น (คลิปยาว ${genLongN} · คลิปสั้น ${genShortN} · บทความ ${genArticleN} · โพสต์ ${genPostN}) ลงปฏิทินเดือน ${TH_MONTHS[m - 1]} ${y + 543} เป็นสถานะ Idea — กดสร้างได้เลย แล้วทยอยเปิดเติมรายละเอียดในแต่ละชิ้น`,
      confirmText: "สร้างลงปฏิทิน",
    });
    if (ok) generateFromPlan(y, m - 1, { long: genLong, short: genShort, article: genArticle, post: genPost });
  };

  // Heatmap intensity from the VARIABLE load (long+short) — บทความ/โพสต์ are a flat daily baseline.
  const maxDayVar = Math.max(1, ...slots.map((s) => s.longs.reduce((a, l) => a + l.count, 0) + s.short));

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
        <MetricCard label="เฉลี่ย / วัน" value={(totals.total / days).toFixed(1)} sub={`${days} วัน`} />
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
            <span className="flex-1 text-[12px] font-semibold text-foreground">บทความ — ยืนพื้น/วัน <span className="font-normal text-muted">(× {days} วัน = {totals.article}/เดือน)</span></span>
            <span className="text-[11px] text-muted">ทำแล้ว {createdArticle}</span>
            <input type="number" min={0} className={cx(inputCls, "w-16 px-2 py-1 text-right")} value={targets.articlePerDay ?? 0} onChange={(e) => setArticlePerDay(Number(e.target.value))} />
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-border bg-amber-50/40 p-2 dark:bg-amber-900/10">
            <PenLine className="h-4 w-4 shrink-0 text-amber-600" />
            <span className="flex-1 text-[12px] font-semibold text-foreground">โพสต์ — ยืนพื้น/วัน <span className="font-normal text-muted">(× {days} วัน = {totals.post}/เดือน)</span></span>
            <span className="text-[11px] text-muted">ทำแล้ว {createdPost}</span>
            <input type="number" min={0} className={cx(inputCls, "w-16 px-2 py-1 text-right")} value={targets.postPerDay ?? 0} onChange={(e) => setPostPerDay(Number(e.target.value))} />
          </div>
        </div>
      </SectionCard>

      {/* Distribution preview */}
      <SectionCard title="เฉลี่ยลงวัน (แผนการลงคอนเทนต์)">
        <div className="grid grid-cols-7 gap-1">
          {slots.map((s) => {
            const longN = s.longs.reduce((a, l) => a + l.count, 0);
            const intensity = (longN + s.short) / maxDayVar;
            return (
              <div key={s.date} className="rounded-lg border border-border p-1.5 text-center" style={{ backgroundColor: longN + s.short ? `rgba(179,0,0,${0.04 + intensity * 0.14})` : undefined }} title={s.longs.map((l) => `${labelOf(l.pillarId)} ×${l.count}`).join("\n")}>
                <p className="text-[11px] font-bold text-foreground">{s.day}</p>
                <p className="text-[11px] leading-tight text-primary-700">ยาว {longN}</p>
                <p className="text-[11px] leading-tight text-sky-600">สั้น {s.short}</p>
                <p className="text-[11px] leading-tight text-muted">บท {s.article} · โพ {s.post}</p>
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-[11px] text-muted">ตัวเลขแต่ละวัน = จำนวนที่ควรลง (คลิปเฉลี่ยจากโควต้าเดือน · บทความ/โพสต์ ยืนพื้นเท่ากันทุกวัน) · ความเข้มของสี = ปริมาณคลิป · ชี้ค้างเพื่อดูเสาหลัก</p>
      </SectionCard>

      {/* Generate */}
      <SectionCard title={<span className="inline-flex items-center gap-1.5"><Sparkles className="h-4 w-4 text-primary-600" /> สร้างคอนเทนต์ตามแผน</span>}>
        <p className="mb-2 text-[12px] text-muted">กดสร้างเพื่อให้ระบบวางสล็อตคอนเทนต์ (สถานะ Idea) ลงปฏิทินเดือนนี้ตามโควต้า แล้วทีมทยอยเปิดเติมรายละเอียด/แปะลิงก์/วัดผล</p>
        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex items-center gap-1.5 text-[13px] text-foreground">
            <input type="checkbox" checked={genLong} onChange={(e) => setGenLong(e.target.checked)} /> คลิปยาว ({totals.long})
          </label>
          <label className="inline-flex items-center gap-1.5 text-[13px] text-foreground">
            <input type="checkbox" checked={genShort} onChange={(e) => setGenShort(e.target.checked)} /> คลิปสั้น ({totals.short})
          </label>
          <label className="inline-flex items-center gap-1.5 text-[13px] text-foreground">
            <input type="checkbox" checked={genArticle} onChange={(e) => setGenArticle(e.target.checked)} /> บทความ ({totals.article})
          </label>
          <label className="inline-flex items-center gap-1.5 text-[13px] text-foreground">
            <input type="checkbox" checked={genPost} onChange={(e) => setGenPost(e.target.checked)} /> โพสต์ ({totals.post})
          </label>
          <button type="button" className={btnPrimary} onClick={generate} disabled={genTotal === 0}>
            <Sparkles className="h-4 w-4" /> สร้าง {genTotal.toLocaleString("th-TH")} สล็อตลงปฏิทิน
          </button>
        </div>
        <p className="mt-2 text-[11px] text-amber-600">⚠ กดซ้ำจะสร้างเพิ่ม (ไม่เขียนทับของเดิม) — สร้างครั้งเดียวต่อเดือน หรือลบของเก่าก่อน</p>
      </SectionCard>
    </div>
  );
}
