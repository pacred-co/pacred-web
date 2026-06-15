"use client";

import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Play, ArrowRight, ChevronLeft, ChevronRight, BookOpen, Newspaper } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { KNOWLEDGE_ARTICLES } from "@/lib/knowledge-articles";
import { PACRED_NEWS } from "@/components/sections/pacred-news-data";

const CATEGORY_BADGE: Record<string, string> = {
  นำเข้า:  "bg-primary-50 text-primary-700 border-primary-200",
  เคลียร์: "bg-blue-50 text-blue-700 border-blue-200",
  ส่งออก:  "bg-orange-50 text-orange-700 border-orange-200",
  ข่าวด่วน:      "bg-rose-50 text-rose-700 border-rose-200",
  อัปเดตบริการ:  "bg-emerald-50 text-emerald-700 border-emerald-200",
  กิจกรรม:       "bg-amber-50 text-amber-700 border-amber-200",
};

const YOUTUBE_CHANNEL = "https://www.youtube.com/@PacredShipping";

type Video = {
  id: string;
  title: string;
  sub: string;
  badge?: string;
  /** Vertical (9:16) YouTube Short — renders the side card portrait instead of 16:9. */
  vertical?: boolean;
};

const BIG_VIDEO: Video = {
  id: "0kK32T-6wHw",
  title: "ชิปปิ้ง เคลียร์สินค้าติดด่าน เคลียร์ภาษี พิธีการศุลกากร",
  sub: "เคลียร์สินค้าติดด่าน · พิธีการกรมศุลกากร Pacred Shipping",
  badge: "แนะนำ",
};

const SIDE_VIDEOS: Video[] = [
  {
    id: "Qi7yFVGakGM",
    title: 'นำเข้าผิดชีวิต "เสี่ยง" อยากนำเข้าของเล่นและเครื่องใช้ไฟฟ้าห้ามพลาดคลิปนี้!',
    sub: "เตือนภัยนำเข้าผิด",
    badge: "ต้องรู้",
  },
  {
    id: "xSxUksThsh8",
    title: 'พาบุกโรงงานเครื่องจักร "Manas Automation" ที่ต่างชาติยังต้องจ้างผลิต!!',
    sub: "ตลุยโรงงานเครื่องจักร",
    badge: "พาชม",
  },
  {
    id: "oTVkgUuAzsk",
    title: "เคลียร์สินค้าติดด่าน เคลียร์ภาษี พิธีการศุลกากร",
    sub: "ชิปปิ้งเคลียร์ภาษี Pacred Shipping",
    badge: "คลิปสั้น",
  },
  {
    id: "z6rcn18Wb-w",
    title: "เคล็ดลับนำเข้าสินค้าจีน ครบจบในที่เดียว Pacred Shipping",
    sub: "เคล็ดลับนำเข้า",
    badge: "เคล็ดลับ",
  },
];

const thumbHd = (id: string) => `https://img.youtube.com/vi/${id}/maxresdefault.jpg`;
const thumbFallback = (id: string) => `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
const embed = (id: string) =>
  `https://www.youtube.com/embed/${id}?autoplay=1&rel=0&modestbranding=1`;

function onThumbError(e: React.SyntheticEvent<HTMLImageElement>, id: string) {
  const img = e.currentTarget;
  if (img.src.endsWith("maxresdefault.jpg")) {
    img.src = thumbFallback(id);
  }
}

export function Blog() {
  const t = useTranslations("blog");
  const [active, setActive] = useState<string | null>(null);
  const [tab, setTab] = useState<"knowledge" | "news">("knowledge");

  return (
    <section id="blog" className="py-4 md:py-8">
      <div className="mx-auto w-full max-w-[1140px] px-[10px] flex flex-col gap-4">

        {/* Container 1 — heading + ดูทั้งหมด button */}
        <div className="mx-auto w-full max-w-[1120px] flex items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5 text-primary-600 text-[13px] font-black tracking-[0.08em] uppercase">
              <span className="w-2 h-2 rounded-full bg-primary-600 shrink-0" />
              {t("c1Badge")}
            </div>
            <h2 className="text-[24px] md:text-[30px] leading-[1.2] font-black tracking-[-0.03em] text-[#111827] dark:text-white">
              {t("c1Title")}{" "}
              <span className="text-primary-600">Pacred</span>
            </h2>
          </div>
          <a
            href={YOUTUBE_CHANNEL}
            target="_blank"
            rel="noopener noreferrer"
            className="hidden sm:inline-flex shrink-0 items-center gap-1.5 h-9 md:h-10 px-3.5 md:px-4 rounded-full bg-white text-[#111827] border border-border text-[12px] md:text-[13px] font-black hover:bg-primary-600 hover:text-white hover:border-primary-600 transition-all duration-300"
          >
            ดูทั้งหมด
            <ArrowRight className="w-3.5 h-3.5" strokeWidth={3} />
          </a>
        </div>

        {/* Container 2 — Video grid (1 big + 4 stacked) */}
        <div className="mx-auto w-full max-w-[1120px] flex flex-col md:flex-row gap-3 md:gap-4">

          {/* Big featured video — left 70% */}
          <VideoCardBig
            video={BIG_VIDEO}
            isActive={active === BIG_VIDEO.id}
            onPlay={() => setActive(BIG_VIDEO.id)}
          />

          {/* 4 stacked side videos — right 30% */}
          <div className="md:w-[30%] grid grid-cols-2 md:grid-cols-1 gap-3 md:gap-2.5">
            {SIDE_VIDEOS.map((v) => (
              <VideoCardSide
                key={v.id}
                video={v}
                isActive={active === v.id}
                onPlay={() => setActive(v.id)}
              />
            ))}
          </div>
        </div>

        {/* "ดูทั้งหมด" mobile button */}
        <a
          href={YOUTUBE_CHANNEL}
          target="_blank"
          rel="noopener noreferrer"
          className="sm:hidden mx-auto inline-flex items-center gap-1.5 h-9 px-4 rounded-full bg-white text-[#111827] border border-border text-[12px] font-black hover:bg-primary-600 hover:text-white hover:border-primary-600 transition-all duration-300"
        >
          ดูทั้งหมด
          <ArrowRight className="w-3.5 h-3.5" strokeWidth={3} />
        </a>

        {/* Container 3 — heading + tab switcher + ดูทั้งหมด button */}
        <div className="mx-auto w-full max-w-[1120px] mt-4 md:mt-6 flex items-end justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1 text-primary-600 text-[12.5px] md:text-[13px] font-black tracking-[0.08em] uppercase">
              <span className="w-2 h-2 rounded-full bg-primary-600 shrink-0" />
              {tab === "news" ? "PACRED NEWS" : "KNOWLEDGE BASE"}
            </div>
            <h2 className="text-[22px] md:text-[28px] leading-[1.2] font-black tracking-[-0.03em] text-[#111827] dark:text-white">
              {tab === "news" ? (
                <>ข่าวสาร <span className="text-primary-600">Pacred</span></>
              ) : (
                <>สาระน่ารู้ <span className="text-primary-600">นำเข้า–ส่งออก</span></>
              )}
            </h2>
          </div>
          <Link
            href={tab === "news" ? "/news" : "/knowledge"}
            className="hidden sm:inline-flex shrink-0 items-center gap-1.5 h-9 md:h-10 px-3.5 md:px-4 rounded-full bg-white text-[#111827] border border-border text-[12px] md:text-[13px] font-black hover:bg-primary-600 hover:text-white hover:border-primary-600 transition-all duration-300"
          >
            ดูทั้งหมด
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
            สาระน่ารู้
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
            ข่าวสาร Pacred
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
          {tab === "news" ? "ดูทั้งหมดข่าวสาร" : "ดูทั้งหมดสาระน่ารู้"}
          <ArrowRight className="w-3.5 h-3.5" strokeWidth={3} />
        </Link>

      </div>
    </section>
  );
}

// ─────────── Big card ───────────
function VideoCardBig({ video, isActive, onPlay }: { video: Video; isActive: boolean; onPlay: () => void }) {
  if (isActive) {
    return (
      <div className="relative md:w-[70%] aspect-video md:aspect-auto md:min-h-[420px] rounded-xl overflow-hidden bg-black shadow-[0_14px_32px_rgba(15,23,42,0.18)]">
        <iframe
          src={embed(video.id)}
          title={video.title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          className="absolute inset-0 w-full h-full"
        />
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={onPlay}
      suppressHydrationWarning
      className="group relative md:w-[70%] aspect-video md:aspect-auto md:min-h-[420px] rounded-xl overflow-hidden bg-primary-600 shadow-[0_10px_24px_rgba(15,23,42,0.10)] hover:shadow-[0_18px_36px_rgba(15,23,42,0.18)] transition-all duration-300 hover:-translate-y-1 text-left cursor-pointer"
    >
      {/* Blurred background — fills any aspect mismatch (รองรับ Shorts แนวตั้ง) */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={thumbHd(video.id)}
        onError={(e) => onThumbError(e, video.id)}
        alt=""
        aria-hidden
        className="absolute inset-0 h-full w-full object-cover scale-110 blur-2xl opacity-70"
      />
      {/* Sharp foreground — object-contain เพื่อให้เห็นปกเต็มไม่ครอป */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={thumbHd(video.id)}
        onError={(e) => onThumbError(e, video.id)}
        alt={video.title}
        className="relative h-full w-full object-contain transition-transform duration-500 group-hover:scale-[1.03]"
      />

      {/* Dark gradient — bottom for text + top for badge */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />

      {/* Big play button center */}
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="w-[72px] h-[72px] md:w-[88px] md:h-[88px] rounded-full bg-primary-600/95 backdrop-blur flex items-center justify-center shadow-[0_10px_28px_rgba(0,0,0,0.4)] border-[3px] md:border-4 border-white transition-transform duration-300 group-hover:scale-110">
          <Play className="w-7 h-7 md:w-9 md:h-9 text-white fill-white translate-x-[2px]" strokeWidth={0} />
        </span>
      </div>

      {/* Badge */}
      {video.badge && (
        <div className="absolute top-4 left-4 inline-flex items-center px-3 py-1 rounded-md bg-primary-600 text-white text-[11px] md:text-[12px] font-black tracking-wide shadow-[0_4px_10px_rgba(0,0,0,0.25)]">
          {video.badge}
        </div>
      )}

      {/* Title + subtitle */}
      <div className="absolute left-4 right-4 bottom-4 z-10">
        <h3 className="text-white text-[20px] md:text-[26px] font-black leading-tight tracking-tight drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)]">
          {video.title}
        </h3>
        <p className="mt-1 text-white/90 text-[12px] md:text-[14px] font-bold drop-shadow-[0_1px_4px_rgba(0,0,0,0.6)]">
          {video.sub}
        </p>
      </div>
    </button>
  );
}

// ─────────── Side card ───────────
function VideoCardSide({ video, isActive, onPlay }: { video: Video; isActive: boolean; onPlay: () => void }) {
  const ratio = video.vertical ? "aspect-[9/16]" : "aspect-video";
  if (isActive) {
    return (
      <div className={`relative ${ratio} rounded-xl overflow-hidden bg-black shadow-[0_8px_20px_rgba(15,23,42,0.12)]`}>
        <iframe
          src={embed(video.id)}
          title={video.title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          className="absolute inset-0 w-full h-full"
        />
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={onPlay}
      suppressHydrationWarning
      className={`group relative ${ratio} rounded-xl overflow-hidden bg-primary-600 shadow-[0_8px_20px_rgba(15,23,42,0.10)] hover:shadow-[0_14px_28px_rgba(15,23,42,0.16)] hover:-translate-y-1 transition-all duration-300 text-left cursor-pointer`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={thumbHd(video.id)}
        onError={(e) => onThumbError(e, video.id)}
        alt={video.title}
        className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
      />

      {/* Dark gradient — bottom for text */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent" />

      {/* Play button center */}
      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
        <span className="w-10 h-10 rounded-full bg-primary-600/95 backdrop-blur flex items-center justify-center shadow-[0_6px_16px_rgba(0,0,0,0.4)] border-2 border-white">
          <Play className="w-4 h-4 text-white fill-white translate-x-[1px]" strokeWidth={0} />
        </span>
      </div>

      {/* Badge */}
      {video.badge && (
        <div className="absolute top-2 left-2 inline-flex items-center px-2 py-0.5 rounded-md bg-primary-600 text-white text-[9.5px] md:text-[10px] font-black tracking-wide shadow-[0_2px_6px_rgba(0,0,0,0.25)]">
          {video.badge}
        </div>
      )}

      {/* Title */}
      <div className="absolute left-2.5 right-2.5 bottom-2 z-10">
        <h3 className="text-white text-[11px] md:text-[12px] font-black leading-[1.25] line-clamp-2 drop-shadow-[0_1px_4px_rgba(0,0,0,0.6)]">
          {video.title}
        </h3>
      </div>
    </button>
  );
}

// ─────────── Knowledge Carousel — native scroll + drag + nav ───────────
function KnowledgeCarousel() {
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
        aria-label="เลื่อนซ้าย"
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
                  "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black tracking-wider border shadow-[0_2px_6px_rgba(0,0,0,0.10)]",
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
        aria-label="เลื่อนขวา"
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
        aria-label="เลื่อนซ้าย"
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
                  "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black tracking-wider border shadow-[0_2px_6px_rgba(0,0,0,0.10)]",
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
        aria-label="เลื่อนขวา"
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
