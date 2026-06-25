"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import Image from "next/image";
import { Camera, X, ChevronLeft, ChevronRight } from "lucide-react";

// Gutter between slide cards (matches gap-3 = 12px) — used by the scroll math.
const GAP = 12;

/**
 * Edge-flush rounded peek filmstrip (design panel 2026-06-25). A horizontal
 * scroll-snap rail of framed rounded cards: the active card sits flush ~16px
 * from the left edge with the next card peeking ~28% on the right (Trip.com
 * "see-more, swipe-me" feel, with NO dead gray gap at the ends). Slide via the
 * arrows, native swipe, or the dots; the active card carries a red inset ring.
 * A single image renders on its own. Tapping opens the fullscreen lightbox.
 */
export function CaseGallery({
  images,
  alt,
}: {
  images: string[];
  alt: string;
  verifiedLabel?: string;
}) {
  const total = images.length;
  const scrollRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(0);

  const openAt = useCallback((i: number) => {
    setIdx(i);
    setOpen(true);
  }, []);
  const close = useCallback(() => setOpen(false), []);
  const prevLb = useCallback(() => setIdx((i) => (i - 1 + total) % total), [total]);
  const nextLb = useCallback(() => setIdx((i) => (i + 1) % total), [total]);

  // Lightbox keyboard nav + scroll lock
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowLeft") prevLb();
      else if (e.key === "ArrowRight") nextLb();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, close, prevLb, nextLb]);

  // Align a card's LEFT edge to the rail (snap-start) — direct scrollLeft= only.
  const go = useCallback(
    (i: number) => {
      const clamped = (i + total) % total;
      setActive(clamped);
      const c = scrollRef.current;
      const el = c?.children[clamped] as HTMLElement | undefined;
      if (c && el) c.scrollLeft = el.offsetLeft - c.clientLeft;
    },
    [total],
  );

  // Arrow step — read the current first-visible index from scroll position
  // (immune to a stale closure), step one card, re-align left.
  const nudge = useCallback((dir: number) => {
    const c = scrollRef.current;
    const first = c?.firstElementChild as HTMLElement | null;
    if (!c || !first) return;
    const cardW = first.offsetWidth + GAP;
    const cur = Math.round(c.scrollLeft / cardW);
    const target = Math.max(0, Math.min(c.children.length - 1, cur + dir));
    const el = c.children[target] as HTMLElement | undefined;
    if (el) c.scrollLeft = el.offsetLeft - c.clientLeft;
    setActive(target);
  }, []);

  // Keep the active ring / dot / pill-target in sync with the scroll position.
  const onScroll = useCallback(() => {
    const c = scrollRef.current;
    const first = c?.firstElementChild as HTMLElement | null;
    if (!c || !first) return;
    const cardW = first.offsetWidth + GAP;
    setActive(Math.max(0, Math.min(c.children.length - 1, Math.round(c.scrollLeft / cardW))));
  }, []);

  if (total === 0) return null;

  const lightbox = open ? (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 p-4"
      onClick={close}
      role="dialog"
      aria-modal="true"
      aria-label="แกลเลอรีรูปผลงาน"
    >
      <button type="button" aria-label="ปิด" onClick={close} className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-full bg-white/15 text-white transition hover:bg-white/25">
        <X className="h-5 w-5" />
      </button>
      {total > 1 ? (
        <>
          <button type="button" aria-label="ก่อนหน้า" onClick={(e) => { e.stopPropagation(); prevLb(); }} className="absolute left-3 grid h-11 w-11 place-items-center rounded-full bg-white/15 text-white transition hover:bg-white/25 md:left-6">
            <ChevronLeft className="h-6 w-6" />
          </button>
          <button type="button" aria-label="ถัดไป" onClick={(e) => { e.stopPropagation(); nextLb(); }} className="absolute right-3 grid h-11 w-11 place-items-center rounded-full bg-white/15 text-white transition hover:bg-white/25 md:right-6">
            <ChevronRight className="h-6 w-6" />
          </button>
        </>
      ) : null}
      <div className="relative h-[78vh] w-[92vw] max-w-[1000px]" onClick={(e) => e.stopPropagation()}>
        <Image src={images[idx]} alt={`${alt} — ${idx + 1}`} fill sizes="92vw" quality={94} className="object-contain" />
      </div>
      <span className="absolute bottom-5 left-1/2 -translate-x-1/2 rounded-full bg-white/15 px-3 py-1 text-[13px] font-bold tabular-nums text-white">
        {idx + 1} / {total}
      </span>
    </div>
  ) : null;

  // Single image — one framed photo, no carousel chrome
  if (total === 1) {
    return (
      <>
        <button
          type="button"
          onClick={() => openAt(0)}
          aria-label="ดูรูปใหญ่"
          className="relative block h-[230px] w-full overflow-hidden rounded-2xl bg-surface-alt ring-1 ring-black/5 md:h-[360px]"
        >
          <Image src={images[0]} alt={alt} fill sizes="100vw" quality={92} priority className="object-cover" />
        </button>
        {lightbox}
      </>
    );
  }

  // Filmstrip — flush rail of framed cards, active card emphasised
  return (
    <>
      <div className="relative">
        <div
          ref={scrollRef}
          onScroll={onScroll}
          className="flex h-[230px] snap-x snap-mandatory items-stretch gap-3 overflow-x-auto scroll-px-4 px-4 scroll-smooth [-ms-overflow-style:none] [scrollbar-width:none] md:h-[360px] [&::-webkit-scrollbar]:hidden"
        >
          {images.map((src, i) => (
            <button
              key={`${src}-${i}`}
              type="button"
              onClick={() => (i === active ? openAt(i) : go(i))}
              aria-label={i === active ? "ดูรูปใหญ่" : `ไปรูปที่ ${i + 1}`}
              className={[
                "group relative h-full w-[72%] shrink-0 snap-start overflow-hidden rounded-2xl bg-black/5 transition-[transform,box-shadow] duration-300 will-change-transform md:w-[46%]",
                i === active ? "shadow-[0_8px_24px_-8px_rgba(0,0,0,0.35)]" : "scale-[0.97] opacity-95",
              ].join(" ")}
            >
              <Image
                src={src}
                alt={`${alt} — ${i + 1}`}
                fill
                sizes="(max-width: 768px) 72vw, 46vw"
                quality={92}
                priority={i === 0}
                className="object-cover"
              />
              <span
                className={[
                  "pointer-events-none absolute inset-0 rounded-2xl ring-inset",
                  i === active ? "ring-2 ring-primary-600/70" : "ring-1 ring-black/10",
                ].join(" ")}
              />
            </button>
          ))}
        </div>

        {/* Slide arrows */}
        <button type="button" aria-label="ก่อนหน้า" onClick={() => nudge(-1)} className="absolute left-2 top-1/2 z-10 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-[#111827] shadow-md backdrop-blur transition hover:bg-white md:left-3">
          <ChevronLeft className="h-5 w-5" strokeWidth={2.4} />
        </button>
        <button type="button" aria-label="ถัดไป" onClick={() => nudge(1)} className="absolute right-2 top-1/2 z-10 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-[#111827] shadow-md backdrop-blur transition hover:bg-white md:right-3">
          <ChevronRight className="h-5 w-5" strokeWidth={2.4} />
        </button>

        {/* Pagination dots */}
        <div className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5">
          {images.map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`รูปที่ ${i + 1}`}
              onClick={() => go(i)}
              className={["h-1.5 rounded-full shadow-sm transition-all", active === i ? "w-4 bg-primary-600" : "w-1.5 bg-black/25 hover:bg-black/40"].join(" ")}
            />
          ))}
        </div>

        {/* "ดูรูปทั้งหมด" — bottom-right */}
        <button
          type="button"
          onClick={() => openAt(active)}
          className="absolute bottom-3 right-3 z-10 inline-flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1.5 text-[12px] font-bold text-white backdrop-blur-sm transition hover:bg-black/75"
        >
          <Camera className="h-3.5 w-3.5" strokeWidth={2.6} />
          ดูรูปทั้งหมด {total} รูป
        </button>
      </div>
      {lightbox}
    </>
  );
}
