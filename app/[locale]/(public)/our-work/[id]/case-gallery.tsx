"use client";

import { useState, useCallback, useEffect } from "react";
import Image from "next/image";
import { Camera, X, ChevronLeft, ChevronRight, BadgeCheck } from "lucide-react";

/**
 * Trip.com-style case gallery — a photo MOSAIC (1 big + 2×2 thumbnails) that opens
 * a full-screen LIGHTBOX carousel ("ดูรูปทั้งหมด"). Client component (lightbox state +
 * keyboard nav). Images come from `reviewGalleryImages()` (the case's own cover +
 * same-type real Pacred work photos). Sits at the top of the hero card; the card's
 * `overflow-hidden rounded` clips the top corners, so this renders no rounding itself.
 */
export function CaseGallery({
  images,
  alt,
  verifiedLabel,
}: {
  images: string[];
  alt: string;
  verifiedLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(0);
  const total = images.length;

  const openAt = useCallback((i: number) => {
    setIdx(i);
    setOpen(true);
  }, []);
  const close = useCallback(() => setOpen(false), []);
  const prev = useCallback(() => setIdx((i) => (i - 1 + total) % total), [total]);
  const next = useCallback(() => setIdx((i) => (i + 1) % total), [total]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowLeft") prev();
      else if (e.key === "ArrowRight") next();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, close, prev, next]);

  if (total === 0) return null;

  const big = images[0];
  const thumbs = images.slice(1, 5);
  const moreCount = total - (1 + thumbs.length);

  return (
    <>
      <div className="relative">
        {/* Desktop mosaic (md+) — 1 big + up to 4 thumbnails */}
        {total >= 2 ? (
          <div className="hidden h-[420px] grid-cols-4 grid-rows-2 gap-1.5 bg-border md:grid">
            <button
              type="button"
              onClick={() => openAt(0)}
              aria-label="ดูรูปใหญ่"
              className="group relative col-span-2 row-span-2 overflow-hidden bg-surface-alt"
            >
              <Image src={big} alt={alt} fill sizes="(max-width: 1140px) 60vw, 560px" quality={92} priority className="object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
            </button>
            {thumbs.map((src, i) => {
              const showMore = i === thumbs.length - 1 && moreCount > 0;
              return (
                <button
                  key={`${src}-${i}`}
                  type="button"
                  onClick={() => openAt(i + 1)}
                  aria-label={showMore ? `ดูรูปทั้งหมด ${total} รูป` : `ดูรูปที่ ${i + 2}`}
                  className="group relative overflow-hidden bg-surface-alt"
                >
                  <Image src={src} alt={`${alt} — ${i + 2}`} fill sizes="280px" quality={90} className="object-cover transition-transform duration-500 group-hover:scale-[1.05]" />
                  {showMore ? (
                    <span className="absolute inset-0 grid place-items-center bg-black/55 text-[15px] font-black text-white backdrop-blur-[1px]">
                      +{moreCount} รูป
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        ) : (
          <button type="button" onClick={() => openAt(0)} aria-label="ดูรูปใหญ่" className="hidden h-[420px] w-full overflow-hidden bg-surface-alt md:block">
            <Image src={big} alt={alt} fill sizes="(max-width: 1140px) 100vw, 1120px" quality={92} priority className="object-cover" />
          </button>
        )}

        {/* Mobile — single big image, tap to open the full gallery */}
        <button type="button" onClick={() => openAt(0)} aria-label={`ดูรูปทั้งหมด ${total} รูป`} className="relative block h-[260px] w-full overflow-hidden bg-surface-alt md:hidden">
          <Image src={big} alt={alt} fill sizes="100vw" quality={92} priority className="object-cover" />
        </button>

        {/* "ดูรูปทั้งหมด" pill (Trip.com photos button) — bottom-left */}
        <button
          type="button"
          onClick={() => openAt(0)}
          className="absolute bottom-3 left-3 z-10 inline-flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1.5 text-[11px] font-black text-[#111827] shadow-sm backdrop-blur-sm transition hover:bg-white md:text-[12px]"
        >
          <Camera className="h-3.5 w-3.5" strokeWidth={2.6} />
          ดูรูปทั้งหมด {total} รูป
        </button>

        {/* Verified badge — bottom-right */}
        <span className="pointer-events-none absolute bottom-3 right-3 z-10 inline-flex items-center gap-1 rounded-full bg-black/55 px-3 py-1.5 text-[11px] font-black text-white backdrop-blur-sm md:text-[12px]">
          <BadgeCheck className="h-3.5 w-3.5" strokeWidth={2.8} />
          {verifiedLabel}
        </span>
      </div>

      {/* Lightbox */}
      {open ? (
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
              <button type="button" aria-label="ก่อนหน้า" onClick={(e) => { e.stopPropagation(); prev(); }} className="absolute left-3 grid h-11 w-11 place-items-center rounded-full bg-white/15 text-white transition hover:bg-white/25 md:left-6">
                <ChevronLeft className="h-6 w-6" />
              </button>
              <button type="button" aria-label="ถัดไป" onClick={(e) => { e.stopPropagation(); next(); }} className="absolute right-3 grid h-11 w-11 place-items-center rounded-full bg-white/15 text-white transition hover:bg-white/25 md:right-6">
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
      ) : null}
    </>
  );
}
