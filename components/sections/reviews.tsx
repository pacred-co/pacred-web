"use client";

import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react";
import Image from "next/image";
import { useTranslations, useLocale } from "next-intl";
import {
  ThumbsUp,
  Star,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import {
  REVIEWS,
  reviewSlug,
  reviewProductLabel,
  reviewHsCode,
  type ServiceType,
  type Review,
} from "@/lib/reviews/catalog";

const ICON_BASE = "/images/hero-section/icon-draf";

type ReviewsT = ReturnType<typeof useTranslations<"reviews">>;

export function Reviews({ defaultFilter = "all" }: { defaultFilter?: "all" | ServiceType } = {}) {
  const t = useTranslations("reviews");
  const [filter, setFilter] = useState<"all" | ServiceType>(defaultFilter);

  const FILTERS: Array<{ id: "all" | ServiceType; label: string }> = [
    { id: "all",       label: t("filterAll")        },
    { id: "import",    label: t("filterImport")     },
    { id: "clearance", label: t("filterClearance")  },
  ];

  const TYPE_CONFIG: Record<
    ServiceType,
    { label: string; iconSrc: string; badge: string; hoverRing: string }
  > = {
    import:    { label: t("labelImport"),    iconSrc: `${ICON_BASE}/transfast.png`,       badge: "bg-primary-500/95 text-white border-primary-400/40", hoverRing: "group-hover:ring-primary-300/70" },
    export:    { label: t("labelExport"),    iconSrc: `${ICON_BASE}/pcs-forwarder.png`,   badge: "bg-orange-500/95 text-white border-orange-400/40",   hoverRing: "group-hover:ring-orange-300/70" },
    clearance: { label: t("labelClearance"), iconSrc: `${ICON_BASE}/customclearance.png`, badge: "bg-blue-500/95 text-white border-blue-400/40",       hoverRing: "group-hover:ring-blue-300/70" },
  };

  const filtered = filter === "all" ? REVIEWS : REVIEWS.filter((r) => r.type === filter);
  // ถ้ารีวิวน้อย (≤4) แสดงแถวเดียว / ถ้าเยอะให้แบ่ง 2 แถว
  const splitInto2 = filtered.length > 4;
  const half = splitInto2 ? Math.ceil(filtered.length / 2) : filtered.length;
  const row1 = filtered.slice(0, half);
  const row2 = splitInto2 ? filtered.slice(half) : [];

  return (
    <section className="pt-3 md:pt-10 pb-5 md:pb-14">
      <div className="mx-auto w-full max-w-[1140px] px-[10px]">

        {/* Heading */}
        <div className="mx-auto w-full max-w-[1120px]">
          <div className="flex items-center gap-2 mb-1.5 text-primary-600 text-[13px] font-black tracking-[0.08em] uppercase">
            <span className="w-2 h-2 rounded-full bg-primary-600 shrink-0" />
            Our Case Studies
          </div>
          <h2 className="text-[24px] md:text-[34px] leading-[1.2] font-black tracking-[-0.04em] text-[#111827] dark:text-white">
            <span className="text-primary-600">{t("titleHighlight1")}</span>{" "}
            {t("titleMiddle")}{" "}
            <span className="text-primary-600">{t("titleHighlight2")}</span>
          </h2>
        </div>

        {/* Filter chips */}
        <div className="mx-auto mt-5 md:mt-6 w-full max-w-[1120px] flex flex-wrap gap-1.5 md:gap-2">
          {FILTERS.map((f) => {
            const active = filter === f.id;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                suppressHydrationWarning
                className={[
                  "inline-flex items-center h-8 md:h-9 px-4 md:px-4.5 rounded-full text-[11.5px] md:text-[12.5px] font-black transition-all border",
                  active
                    ? "bg-primary-600 text-white border-primary-600 shadow-[0_6px_14px_rgba(179,0,0,0.25)] scale-[1.02]"
                    : "bg-white dark:bg-surface text-[#111827] dark:text-white border-border hover:border-primary-300",
                ].join(" ")}
              >
                {f.label}
              </button>
            );
          })}
        </div>

        {/* Carousels */}
        <div className="mx-auto mt-5 md:mt-6 w-full max-w-[1120px] space-y-3 md:space-y-4">
          {row1.length > 0 ? (
            <ReviewsCarousel reviews={row1} t={t} typeConfig={TYPE_CONFIG} />
          ) : (
            <div className="rounded-2xl border border-dashed border-border bg-white/40 dark:bg-surface/40 py-10 text-center text-muted text-[13px] font-bold">
              {t("empty")}
            </div>
          )}
          {row2.length > 0 && <ReviewsCarousel reviews={row2} t={t} typeConfig={TYPE_CONFIG} />}
        </div>

      </div>
    </section>
  );
}

// ─────────── Carousel ───────────
type TypeConfig = Record<ServiceType, { label: string; iconSrc: string; badge: string; hoverRing: string }>;

function ReviewsCarousel({ reviews, t, typeConfig }: { reviews: Review[]; t: ReviewsT; typeConfig: TypeConfig }) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef({ isDown: false, startX: 0, scrollLeft: 0, moved: false });

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
  }, [updateButtons, reviews.length]);

  const scrollAmount = () => {
    const el = scrollerRef.current;
    const card = el?.querySelector<HTMLDivElement>("[data-review-card]");
    // เลื่อนทีละ 2 การ์ดเพื่อให้ดูสนุกขึ้น
    return card ? (card.offsetWidth + 12) * 2 : 400;
  };

  // Native scrollBy + CSS scroll-behavior smooth — GPU-accelerated by browser, ลื่นกว่า custom rAF มาก
  const goPrev = () => scrollerRef.current?.scrollBy({ left: -scrollAmount(), behavior: "smooth" });
  const goNext = () => scrollerRef.current?.scrollBy({ left:  scrollAmount(), behavior: "smooth" });

  const onMouseDown = (e: MouseEvent<HTMLDivElement>) => {
    if (window.innerWidth <= 767) return;
    const el = scrollerRef.current;
    if (!el) return;
    dragRef.current.isDown = true;
    dragRef.current.moved = false;
    dragRef.current.startX = e.pageX - el.offsetLeft;
    dragRef.current.scrollLeft = el.scrollLeft;
    setIsDragging(true);
  };
  const onMouseUp = () => {
    dragRef.current.isDown = false;
    setIsDragging(false);
  };
  const onMouseLeave = () => {
    dragRef.current.isDown = false;
    setIsDragging(false);
  };
  const onMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    if (!dragRef.current.isDown) return;
    const el = scrollerRef.current;
    if (!el) return;
    e.preventDefault();
    const x = e.pageX - el.offsetLeft;
    const walk = (x - dragRef.current.startX) * 1.2;
    if (Math.abs(x - dragRef.current.startX) > 6) dragRef.current.moved = true;
    el.scrollLeft = dragRef.current.scrollLeft - walk;
  };

  // Suppress the click that fires after a drag so we don't navigate the card Link
  const onClickCapture = (e: MouseEvent<HTMLDivElement>) => {
    if (dragRef.current.moved) {
      e.preventDefault();
      e.stopPropagation();
      dragRef.current.moved = false;
    }
  };

  return (
    <div className="relative">
      {/* Edge-fade gradients removed — the white var(--color-background) fade
          overlaid the rightmost card as a white "กินขอบ" strip on the right
          (ปอน 2026-05-30 · confirmed via DevTools elementsFromPoint + display:none
          toggle). canPrev/canNext still drive the prev/next arrow buttons below. */}

      <button
        type="button"
        aria-label={t("scrollLeftAria")}
        onClick={goPrev}
        suppressHydrationWarning
        className={[
          "hidden md:flex absolute left-[-14px] top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white text-[#111827] items-center justify-center cursor-pointer z-10",
          "shadow-[0_10px_22px_rgba(0,0,0,0.16)] border border-black/5",
          "transition-all duration-300 ease-out",
          "hover:bg-primary-600 hover:text-white hover:scale-110 hover:shadow-[0_14px_28px_rgba(179,0,0,0.30)] hover:border-primary-600",
          "active:scale-90",
          canPrev ? "opacity-100 visible translate-x-0" : "opacity-0 invisible -translate-x-2 pointer-events-none",
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
        onClickCapture={onClickCapture}
        className={[
          "flex gap-2.5 md:gap-3 overflow-x-auto overflow-y-visible [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden py-2 snap-x snap-proximity",
          isDragging ? "md:cursor-grabbing md:select-none" : "md:cursor-grab",
        ].join(" ")}
        style={{
          scrollBehavior: isDragging ? "auto" : "smooth",
          WebkitOverflowScrolling: "touch",
          willChange: "scroll-position",
          scrollbarGutter: "stable",
        }}
      >
        {reviews.map((r, i) => (
          <ReviewCard key={r.id} review={r} index={i} t={t} typeConfig={typeConfig} />
        ))}
      </div>

      <button
        type="button"
        aria-label={t("scrollRightAria")}
        onClick={goNext}
        suppressHydrationWarning
        className={[
          "hidden md:flex absolute right-[-14px] top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white text-[#111827] items-center justify-center cursor-pointer z-10",
          "shadow-[0_10px_22px_rgba(0,0,0,0.16)] border border-black/5",
          "transition-all duration-300 ease-out",
          "hover:bg-primary-600 hover:text-white hover:scale-110 hover:shadow-[0_14px_28px_rgba(179,0,0,0.30)] hover:border-primary-600",
          "active:scale-90",
          canNext ? "opacity-100 visible translate-x-0" : "opacity-0 invisible translate-x-2 pointer-events-none",
        ].join(" ")}
      >
        <ChevronRight className="w-5 h-5" strokeWidth={2.6} />
      </button>
    </div>
  );
}

// ─────────── Card ───────────
function ReviewCard({ review, index = 0, t, typeConfig }: { review: Review; index?: number; t: ReviewsT; typeConfig: TypeConfig }) {
  const cfg = typeConfig[review.type];
  const title = t(review.titleKey);
  const locale = (useLocale() === "en" ? "en" : "th") as "th" | "en";
  // SEO-pattern slug + product/HS-code tag (ปอน 2026-06-11 · owner ".csv url pattern + HS code")
  const slug = reviewSlug(review, locale);
  const productLabel = reviewProductLabel(review, locale);
  const hsCode = reviewHsCode(review);
  const [liked, setLiked] = useState(false);
  const [popKey, setPopKey] = useState(0);

  const onLike = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();   // don't navigate the wrapping <Link>
    e.stopPropagation();
    setLiked((v) => !v);
    setPopKey((k) => k + 1);
  };

  return (
    <Link
      href={`/our-work/${slug}`}
      data-review-card
      aria-label={`${title} · ${productLabel} · HS ${hsCode}`}
      style={{ contain: "layout paint" }}
      className="group relative shrink-0 w-[calc(50vw-16px)] sm:w-[240px] md:w-[260px] aspect-[3/4] rounded-[22px] overflow-hidden bg-gradient-to-br from-gray-200 via-gray-400 to-gray-700 dark:from-surface-alt dark:via-surface dark:to-background shadow-[0_8px_22px_rgba(15,23,42,0.10)] hover:shadow-[0_22px_44px_rgba(15,23,42,0.22)] hover:-translate-y-1.5 transition-[transform,box-shadow,ring-color] duration-300 cursor-pointer ring-1 ring-black/5 hover:ring-primary-400/30 snap-start"
    >
      {/* Background — placeholder pattern or image */}
      {review.image ? (
        <Image
          src={review.image}
          alt={title}
          fill
          quality={92}
          sizes="(max-width: 767px) 50vw, 320px"
          className="object-cover"
        />
      ) : (
        <>
          {/* Decorative dot pattern */}
          <div
            aria-hidden
            className="absolute inset-0 opacity-[0.10]"
            style={{
              backgroundImage: "radial-gradient(circle at 1px 1px, white 1px, transparent 0)",
              backgroundSize: "18px 18px",
            }}
          />
          {/* Soft radial accent */}
          <div
            aria-hidden
            className="absolute inset-0"
            style={{
              background: "radial-gradient(ellipse at 30% 30%, rgba(255,255,255,0.18) 0%, transparent 55%)",
            }}
          />
          {/* Center "P" watermark */}
          <div
            aria-hidden
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
          >
            <div className="relative">
              <div className="text-white/15 font-black text-[110px] leading-none tracking-tighter select-none">
                P
              </div>
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-white/30 text-[9px] font-black tracking-[0.3em] mt-[110px]">
                  PACRED
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Gradient overlay — bottom dark for tag readability */}
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-1/3 pointer-events-none"
        style={{
          background:
            "linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.55) 50%, rgba(0,0,0,0.85) 100%)",
        }}
      />

      {/* Top-left: type icon badge — grayscale offline → color on hover */}
      <div
        className={[
          "absolute top-3 left-3 w-12 h-12 rounded-full bg-white flex items-center justify-center shadow-[0_6px_14px_rgba(0,0,0,0.25)] border-[3px] border-white transition-all duration-400 group-hover:scale-110 group-hover:-rotate-6 ring-2 ring-gray-300/60 z-[2]",
          cfg.hoverRing,
        ].join(" ")}
      >
        <Image
          src={cfg.iconSrc}
          alt=""
          width={40}
          height={40}
          className="w-8 h-8 object-contain grayscale opacity-50 saturate-0 transition-all duration-400 group-hover:grayscale-0 group-hover:opacity-100 group-hover:saturate-100 group-hover:scale-110"
        />
      </div>

      {/* Top-right: Like button with pop + burst animation */}
      <button
        type="button"
        onClick={onLike}
        suppressHydrationWarning
        aria-label={liked ? t("unlikeAria") : t("likeAria")}
        className={[
          "group/like absolute top-3 right-3 w-9 h-9 rounded-full backdrop-blur flex items-center justify-center shadow-[0_4px_12px_rgba(0,0,0,0.20)] transition-all duration-300 hover:scale-110 cursor-pointer z-[2] overflow-visible",
          liked ? "bg-primary-600 shadow-[0_6px_16px_rgba(179,0,0,0.45)]" : "bg-white/95 hover:bg-primary-50",
        ].join(" ")}
      >
        {/* Burst ring effect when liking */}
        {liked && popKey > 0 && (
          <span
            key={`burst-${popKey}`}
            aria-hidden
            className="absolute inset-0 rounded-full border-2 border-primary-400 pointer-events-none"
            style={{ animation: "like-burst 0.6s ease-out forwards" }}
          />
        )}
        <ThumbsUp
          key={`icon-${popKey}`}
          className={[
            "w-[18px] h-[18px] transition-colors duration-200",
            liked ? "text-white fill-white" : "text-gray-500 group-hover/like:text-primary-600",
          ].join(" ")}
          strokeWidth={2.3}
          style={popKey > 0 ? { animation: "like-pop 0.45s cubic-bezier(0.34,1.56,0.64,1) both" } : undefined}
        />
      </button>

      {/* Top accent line — shows on hover */}
      <div
        aria-hidden
        className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-transparent via-primary-400 to-transparent opacity-0 group-hover:opacity-100 -translate-x-full group-hover:translate-x-0 transition-all duration-700 z-[3]"
      />

      {/* Title overlay — only when no image (mockup mode) */}
      {!review.image && (
        <div className="absolute top-[60px] left-3 right-3 z-[1]">
          <p
            className="text-white text-[13px] md:text-[14px] font-black leading-[1.3] line-clamp-2 tracking-tight"
            style={{ textShadow: "0 2px 6px rgba(0,0,0,0.65)" }}
          >
            {title}
          </p>
        </div>
      )}

      {/* Bottom: rating + tags + status */}
      <div className="absolute bottom-3 left-3 right-3 z-[2] space-y-2">
        {/* Stars */}
        <div className="flex items-center gap-1.5">
          <div className="flex items-center gap-0.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star
                key={i}
                className={[
                  "w-3.5 h-3.5",
                  i < review.rating ? "text-yellow-400 fill-yellow-400 drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]" : "text-white/40 fill-white/20",
                ].join(" ")}
                strokeWidth={1.8}
              />
            ))}
          </div>
          <span className="text-white text-[10.5px] font-black tabular-nums" style={{ textShadow: "0 1px 3px rgba(0,0,0,0.6)" }}>
            {review.rating}.0
          </span>
        </div>

        {/* Product + HS code (ปอน 2026-06-11 · owner "ติดแท็ก ติด hs code ให้เหมาะกับสินค้า") */}
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="inline-flex items-center min-w-0 px-1.5 py-0.5 rounded-md bg-white/95 text-[#111827] text-[9.5px] font-black shadow-[0_2px_4px_rgba(0,0,0,0.20)] backdrop-blur">
            <span className="truncate">{productLabel}</span>
          </span>
          <span className="shrink-0 inline-flex items-center px-1.5 py-0.5 rounded-md bg-primary-600 text-white text-[9.5px] font-black tabular-nums shadow-[0_2px_4px_rgba(0,0,0,0.25)] tracking-wide">
            HS {hsCode}
          </span>
        </div>

        {/* Tags + status badge */}
        <div className="flex items-center justify-between gap-1.5">
          <div className="flex items-center gap-1 flex-wrap min-w-0">
            {review.tagKeys.map((tagKey) => (
              <span
                key={tagKey}
                className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-white/95 text-[#111827] text-[9.5px] font-black shadow-[0_2px_4px_rgba(0,0,0,0.20)] backdrop-blur"
              >
                {t(tagKey)}
              </span>
            ))}
          </div>
          <span
            className={[
              "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9.5px] font-black border whitespace-nowrap shrink-0 shadow-[0_2px_4px_rgba(0,0,0,0.20)]",
              cfg.badge,
            ].join(" ")}
          >
            <span className="w-1 h-1 rounded-full bg-white" />
            {cfg.label}
          </span>
        </div>
      </div>
    </Link>
  );
}
