"use client";

import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { ArrowRight, BookOpen, ChevronLeft, ChevronRight, Newspaper } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { KNOWLEDGE_ARTICLES } from "@/lib/knowledge-articles";
import { PACRED_NEWS } from "@/components/sections/pacred-news-data";

const CATEGORY_BADGE: Record<string, string> = {
  นำเข้า:        "bg-primary-50 text-primary-700 border-primary-200",
  เคลียร์:       "bg-blue-50 text-blue-700 border-blue-200",
  ส่งออก:        "bg-orange-50 text-orange-700 border-orange-200",
  ข่าวด่วน:      "bg-rose-50 text-rose-700 border-rose-200",
  อัปเดตบริการ:  "bg-emerald-50 text-emerald-700 border-emerald-200",
  กิจกรรม:       "bg-amber-50 text-amber-700 border-amber-200",
};

/**
 * Tab-switcher + horizontal carousel for Knowledge / Pacred News.
 * Used on the home Blog section and on the customs landing page so
 * both surfaces share one canonical implementation.
 */
export function KnowledgeNewsBlock() {
  const [tab, setTab] = useState<"knowledge" | "news">("knowledge");
  const t = useTranslations("knowledgeNewsBlock");

  return (
    <div className="flex flex-col gap-4">
      {/* Container 1 — heading + tab switcher + ดูทั้งหมด button */}
      <div className="mx-auto w-full max-w-[1120px] flex items-end justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1 text-primary-600 text-[12.5px] md:text-[13px] font-black tracking-[0.08em] uppercase">
            <span className="w-2 h-2 rounded-full bg-primary-600 shrink-0" />
            {tab === "news" ? "PACRED NEWS" : "KNOWLEDGE BASE"}
          </div>
          <h2 className="text-[22px] md:text-[28px] leading-[1.2] font-black tracking-[-0.03em] text-[#111827] dark:text-white">
            {tab === "news" ? (
              t.rich("newsTitle", { highlight: (chunks) => <span className="text-primary-600">{chunks}</span> })
            ) : (
              t.rich("knowledgeTitle", { highlight: (chunks) => <span className="text-primary-600">{chunks}</span> })
            )}
          </h2>
        </div>
        <Link
          href={tab === "news" ? "/news" : "/knowledge"}
          className="hidden sm:inline-flex shrink-0 items-center gap-1.5 h-9 md:h-10 px-3.5 md:px-4 rounded-full bg-white text-[#111827] border border-border text-[12px] md:text-[13px] font-black hover:bg-primary-600 hover:text-white hover:border-primary-600 transition-all duration-300"
        >
          {t("viewAll")}
          <ArrowRight className="w-3.5 h-3.5" strokeWidth={3} />
        </Link>
      </div>

      {/* Tab switcher — สาระน่ารู้ ↔ ข่าวสาร Pacred */}
      <div className="mx-auto w-full max-w-[1120px] flex items-center gap-2">
        <button
          type="button"
          onClick={() => setTab("knowledge")}
          suppressHydrationWarning
          className={[
            "inline-flex items-center gap-1.5 h-9 md:h-10 px-3.5 md:px-4 rounded-full text-[12px] md:text-[13px] font-black border transition-all duration-300 cursor-pointer",
            tab === "knowledge"
              ? "bg-primary-600 text-white border-primary-600 shadow-[0_4px_12px_rgba(179,0,0,0.25)]"
              : "bg-white dark:bg-surface text-[#111827] dark:text-white border-border hover:border-primary-300 hover:text-primary-700",
          ].join(" ")}
        >
          <BookOpen className="w-3.5 h-3.5" strokeWidth={2.6} />
          {t("tabKnowledge")}
        </button>
        <button
          type="button"
          onClick={() => setTab("news")}
          suppressHydrationWarning
          className={[
            "inline-flex items-center gap-1.5 h-9 md:h-10 px-3.5 md:px-4 rounded-full text-[12px] md:text-[13px] font-black border transition-all duration-300 cursor-pointer",
            tab === "news"
              ? "bg-primary-600 text-white border-primary-600 shadow-[0_4px_12px_rgba(179,0,0,0.25)]"
              : "bg-white dark:bg-surface text-[#111827] dark:text-white border-border hover:border-primary-300 hover:text-primary-700",
          ].join(" ")}
        >
          <Newspaper className="w-3.5 h-3.5" strokeWidth={2.6} />
          {t("tabNews")}
        </button>
      </div>

      {/* Container 4 — Articles carousel (knowledge or news) */}
      <div className="mx-auto w-full max-w-[1120px]">
        {tab === "knowledge" ? <KnowledgeCarousel /> : <NewsCarousel />}
      </div>

      {/* "ดูทั้งหมด" mobile button */}
      <Link
        href={tab === "news" ? "/news" : "/knowledge"}
        className="sm:hidden mx-auto inline-flex items-center gap-1.5 h-9 px-4 rounded-full bg-white text-[#111827] border border-border text-[12px] font-black hover:bg-primary-600 hover:text-white hover:border-primary-600 transition-all duration-300"
      >
        {tab === "news" ? t("viewAllNews") : t("viewAllKnowledge")}
        <ArrowRight className="w-3.5 h-3.5" strokeWidth={3} />
      </Link>
    </div>
  );
}

// ─────────── Knowledge Carousel — native scroll + drag + nav ───────────
function KnowledgeCarousel() {
  const t = useTranslations("knowledgeNewsBlock");
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef({ isDown: false, startX: 0, scrollLeft: 0 });

  const updateButtons = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    if (max <= 5) {
      setCanPrev(false);
      setCanNext(false);
      return;
    }
    setCanPrev(el.scrollLeft > 5);
    setCanNext(el.scrollLeft < max - 5);
  }, []);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    updateButtons();
    const t1 = window.setTimeout(updateButtons, 80);
    const t2 = window.setTimeout(updateButtons, 500);
    el.addEventListener("scroll", updateButtons, { passive: true });
    window.addEventListener("resize", updateButtons);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      el.removeEventListener("scroll", updateButtons);
      window.removeEventListener("resize", updateButtons);
    };
  }, [updateButtons]);

  const scrollAmount = () => {
    const el = scrollerRef.current;
    const card = el?.querySelector<HTMLAnchorElement>("[data-k-card]");
    return card ? (card.offsetWidth + 12) * 2 : 480;
  };

  const goPrev = () => scrollerRef.current?.scrollBy({ left: -scrollAmount(), behavior: "smooth" });
  const goNext = () => scrollerRef.current?.scrollBy({ left:  scrollAmount(), behavior: "smooth" });

  const onMouseDown = (e: MouseEvent<HTMLDivElement>) => {
    if (window.innerWidth <= 767) return;
    const el = scrollerRef.current;
    if (!el) return;
    dragRef.current.isDown = true;
    dragRef.current.startX = e.pageX - el.offsetLeft;
    dragRef.current.scrollLeft = el.scrollLeft;
    setIsDragging(true);
  };
  const onMouseUp = () => { dragRef.current.isDown = false; setIsDragging(false); };
  const onMouseLeave = () => { dragRef.current.isDown = false; setIsDragging(false); };
  const onMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    if (!dragRef.current.isDown) return;
    const el = scrollerRef.current;
    if (!el) return;
    e.preventDefault();
    const x = e.pageX - el.offsetLeft;
    const walk = (x - dragRef.current.startX) * 1.2;
    el.scrollLeft = dragRef.current.scrollLeft - walk;
  };

  return (
    <div className="relative">
      <button
        type="button"
        aria-label={t("scrollLeft")}
        onClick={goPrev}
        suppressHydrationWarning
        className={[
          "hidden md:flex absolute left-[-14px] top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white text-[#111827] items-center justify-center cursor-pointer z-10 shadow-[0_10px_22px_rgba(0,0,0,0.16)] border border-black/5 transition-all duration-300 hover:bg-primary-600 hover:text-white hover:scale-110 hover:border-primary-600 active:scale-90",
          canPrev ? "opacity-100 visible" : "opacity-0 invisible pointer-events-none",
        ].join(" ")}
      >
        <ChevronLeft className="w-5 h-5" strokeWidth={2.6} />
      </button>

      <div
        ref={scrollerRef}
        onMouseDown={onMouseDown}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseLeave}
        onMouseMove={onMouseMove}
        className={[
          "flex gap-2.5 md:gap-3 overflow-x-auto overflow-y-visible [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden py-2 snap-x snap-proximity",
          isDragging ? "md:cursor-grabbing md:select-none" : "md:cursor-grab",
        ].join(" ")}
        style={{ scrollBehavior: isDragging ? "auto" : "smooth", WebkitOverflowScrolling: "touch" }}
      >
        {KNOWLEDGE_ARTICLES.map((article) => (
          <Link
            key={article.id}
            href={`/knowledge/${article.slug}`}
            data-k-card
            className="group relative shrink-0 w-[200px] sm:w-[220px] md:w-[240px] snap-start bg-white dark:bg-surface rounded-2xl overflow-hidden border border-border shadow-[0_4px_14px_rgba(15,23,42,0.05)] hover:shadow-[0_18px_36px_rgba(179,0,0,0.12)] hover:border-primary-200 hover:-translate-y-1 transition-all duration-300"
          >
            <div className="relative aspect-[3/4] overflow-hidden bg-gradient-to-br from-gray-100 to-gray-200">
              <Image
                src={article.image}
                alt={article.title}
                fill
                sizes="(max-width: 767px) 50vw, 240px"
                quality={92}
                className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
              />
              <div className="absolute top-2.5 left-2.5">
                <span className={[
                  "inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-black tracking-wider border shadow-[0_2px_6px_rgba(0,0,0,0.10)]",
                  CATEGORY_BADGE[article.category],
                ].join(" ")}>
                  {article.category}
                </span>
              </div>
            </div>
            <div className="p-3 md:p-3.5">
              <h3 className="text-[12.5px] md:text-[13px] font-black text-[#111827] dark:text-white leading-[1.3] line-clamp-2 group-hover:text-primary-700 transition-colors">
                {article.title}
              </h3>
            </div>
          </Link>
        ))}
      </div>

      <button
        type="button"
        aria-label={t("scrollRight")}
        onClick={goNext}
        suppressHydrationWarning
        className={[
          "hidden md:flex absolute right-[-14px] top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white text-[#111827] items-center justify-center cursor-pointer z-10 shadow-[0_10px_22px_rgba(0,0,0,0.16)] border border-black/5 transition-all duration-300 hover:bg-primary-600 hover:text-white hover:scale-110 hover:border-primary-600 active:scale-90",
          canNext ? "opacity-100 visible" : "opacity-0 invisible pointer-events-none",
        ].join(" ")}
      >
        <ChevronRight className="w-5 h-5" strokeWidth={2.6} />
      </button>
    </div>
  );
}

// ─────────── News Carousel — same scroller pattern, PACRED_NEWS data ───────────
function NewsCarousel() {
  const t = useTranslations("knowledgeNewsBlock");
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef({ isDown: false, startX: 0, scrollLeft: 0 });

  const updateButtons = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    if (max <= 5) {
      setCanPrev(false);
      setCanNext(false);
      return;
    }
    setCanPrev(el.scrollLeft > 5);
    setCanNext(el.scrollLeft < max - 5);
  }, []);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    updateButtons();
    const t1 = window.setTimeout(updateButtons, 80);
    const t2 = window.setTimeout(updateButtons, 500);
    el.addEventListener("scroll", updateButtons, { passive: true });
    window.addEventListener("resize", updateButtons);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      el.removeEventListener("scroll", updateButtons);
      window.removeEventListener("resize", updateButtons);
    };
  }, [updateButtons]);

  const scrollAmount = () => {
    const el = scrollerRef.current;
    const card = el?.querySelector<HTMLAnchorElement>("[data-n-card]");
    return card ? (card.offsetWidth + 12) * 2 : 480;
  };

  const goPrev = () => scrollerRef.current?.scrollBy({ left: -scrollAmount(), behavior: "smooth" });
  const goNext = () => scrollerRef.current?.scrollBy({ left:  scrollAmount(), behavior: "smooth" });

  const onMouseDown = (e: MouseEvent<HTMLDivElement>) => {
    if (window.innerWidth <= 767) return;
    const el = scrollerRef.current;
    if (!el) return;
    dragRef.current.isDown = true;
    dragRef.current.startX = e.pageX - el.offsetLeft;
    dragRef.current.scrollLeft = el.scrollLeft;
    setIsDragging(true);
  };
  const onMouseUp = () => { dragRef.current.isDown = false; setIsDragging(false); };
  const onMouseLeave = () => { dragRef.current.isDown = false; setIsDragging(false); };
  const onMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    if (!dragRef.current.isDown) return;
    const el = scrollerRef.current;
    if (!el) return;
    e.preventDefault();
    const x = e.pageX - el.offsetLeft;
    const walk = (x - dragRef.current.startX) * 1.2;
    el.scrollLeft = dragRef.current.scrollLeft - walk;
  };

  return (
    <div className="relative">
      <button
        type="button"
        aria-label={t("scrollLeft")}
        onClick={goPrev}
        suppressHydrationWarning
        className={[
          "hidden md:flex absolute left-[-14px] top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white text-[#111827] items-center justify-center cursor-pointer z-10 shadow-[0_10px_22px_rgba(0,0,0,0.16)] border border-black/5 transition-all duration-300 hover:bg-primary-600 hover:text-white hover:scale-110 hover:border-primary-600 active:scale-90",
          canPrev ? "opacity-100 visible" : "opacity-0 invisible pointer-events-none",
        ].join(" ")}
      >
        <ChevronLeft className="w-5 h-5" strokeWidth={2.6} />
      </button>

      <div
        ref={scrollerRef}
        onMouseDown={onMouseDown}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseLeave}
        onMouseMove={onMouseMove}
        className={[
          "flex gap-2.5 md:gap-3 overflow-x-auto overflow-y-visible [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden py-2 snap-x snap-proximity",
          isDragging ? "md:cursor-grabbing md:select-none" : "md:cursor-grab",
        ].join(" ")}
        style={{ scrollBehavior: isDragging ? "auto" : "smooth", WebkitOverflowScrolling: "touch" }}
      >
        {PACRED_NEWS.map((news) => (
          <Link
            key={news.id}
            href={`/news/${news.slug}`}
            data-n-card
            className="group relative shrink-0 w-[200px] sm:w-[220px] md:w-[240px] snap-start bg-white dark:bg-surface rounded-2xl overflow-hidden border border-border shadow-[0_4px_14px_rgba(15,23,42,0.05)] hover:shadow-[0_18px_36px_rgba(179,0,0,0.12)] hover:border-primary-200 hover:-translate-y-1 transition-all duration-300"
          >
            <div className="relative aspect-[3/4] overflow-hidden bg-gradient-to-br from-gray-100 to-gray-200">
              <Image
                src={news.image}
                alt={news.title}
                fill
                sizes="(max-width: 767px) 50vw, 240px"
                quality={92}
                className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
              />
              <div className="absolute top-2.5 left-2.5">
                <span className={[
                  "inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-black tracking-wider border shadow-[0_2px_6px_rgba(0,0,0,0.10)]",
                  CATEGORY_BADGE[news.category],
                ].join(" ")}>
                  {news.category}
                </span>
              </div>
            </div>
            <div className="p-3 md:p-3.5">
              <h3 className="text-[12.5px] md:text-[13px] font-black text-[#111827] dark:text-white leading-[1.3] line-clamp-2 group-hover:text-primary-700 transition-colors">
                {news.title}
              </h3>
            </div>
          </Link>
        ))}
      </div>

      <button
        type="button"
        aria-label={t("scrollRight")}
        onClick={goNext}
        suppressHydrationWarning
        className={[
          "hidden md:flex absolute right-[-14px] top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white text-[#111827] items-center justify-center cursor-pointer z-10 shadow-[0_10px_22px_rgba(0,0,0,0.16)] border border-black/5 transition-all duration-300 hover:bg-primary-600 hover:text-white hover:scale-110 hover:border-primary-600 active:scale-90",
          canNext ? "opacity-100 visible" : "opacity-0 invisible pointer-events-none",
        ].join(" ")}
      >
        <ChevronRight className="w-5 h-5" strokeWidth={2.6} />
      </button>
    </div>
  );
}
