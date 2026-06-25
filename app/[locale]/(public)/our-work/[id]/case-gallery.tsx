"use client";

import { useState, useCallback, useEffect } from "react";
import Image from "next/image";
import { Camera, X, ChevronLeft, ChevronRight } from "lucide-react";

/**
 * Mosaic case gallery (ปอน 2026-06-25 redesign — "จัดเรียงภาพแบบ collage").
 * A Facebook / Trip.com album-style collage: one large hero image + a grid of
 * thumbnails, with a "+N" overlay on the last visible tile when more images
 * exist. Replaces the horizontal scroll-filmstrip. Any tile opens the
 * fullscreen lightbox (keyboard arrows · swipe · click-out to close).
 * Degrades cleanly for 2 / 3 / 4 images; a single image renders on its own.
 */
const MAX_TILES = 5;

// Grid template per image count — the hero+thumbnails mosaic only kicks in at
// 5+; smaller sets get a tidy equal/2-up layout so there are never empty cells.
function gridClass(total: number): string {
  if (total === 2) return "grid-cols-2 grid-rows-1";
  if (total === 3 || total === 4) return "grid-cols-2 grid-rows-2";
  // 5+ : mobile = wide hero on top + 2×2 thumbs · desktop = tall hero left + 2×2
  return "grid-cols-2 grid-rows-[2fr_1fr_1fr] md:grid-cols-4 md:grid-rows-2";
}

// Span for the hero tile (index 0). Everything else is a 1×1 cell.
function tileSpan(i: number, total: number): string {
  if (total >= 5) return i === 0 ? "col-span-2 row-span-1 md:row-span-2" : "";
  if (total === 3) return i === 0 ? "row-span-2" : ""; // tall hero on the left
  return "";
}

export function CaseGallery({
  images,
  alt,
}: {
  images: string[];
  alt: string;
  verifiedLabel?: string;
}) {
  const total = images.length;
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

  // Single image — one framed photo, no collage chrome
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

  // Mosaic collage — hero + thumbnails, "+N" on the last visible tile
  const shown = images.slice(0, MAX_TILES);
  const extra = total - shown.length;

  return (
    <>
      <div className="relative">
        <div className={`grid h-[360px] gap-2 md:h-[440px] ${gridClass(total)}`}>
          {shown.map((src, i) => {
            const isLast = i === shown.length - 1;
            const showMore = isLast && extra > 0;
            return (
              <button
                key={`${src}-${i}`}
                type="button"
                onClick={() => openAt(i)}
                aria-label={showMore ? `ดูรูปทั้งหมด ${total} รูป` : `ดูรูปที่ ${i + 1}`}
                className={[
                  "group relative overflow-hidden rounded-2xl bg-black/5",
                  tileSpan(i, total),
                ].join(" ")}
              >
                <Image
                  src={src}
                  alt={`${alt} — ${i + 1}`}
                  fill
                  sizes={i === 0 ? "(max-width: 768px) 100vw, 50vw" : "(max-width: 768px) 50vw, 25vw"}
                  quality={92}
                  priority={i === 0}
                  className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                />
                <span className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-inset ring-black/10" />
                {showMore ? (
                  <span className="absolute inset-0 grid place-items-center rounded-2xl bg-black/55 text-white backdrop-blur-[1px] transition group-hover:bg-black/65">
                    <span className="text-[22px] font-black leading-none md:text-[30px]">+{extra}</span>
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        {/* ดูรูปทั้งหมด — bottom-right */}
        <button
          type="button"
          onClick={() => openAt(0)}
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
