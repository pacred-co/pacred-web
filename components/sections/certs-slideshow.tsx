"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, X, ZoomIn } from "lucide-react";

// Slide order (per ปอน 2026-05-18, refined later same day):
//   1 (big left)    — ภาพทีมงาน Pacred ที่ออฟฟิศ (row-span-2)
//   2 (top right)   — หนังสือรับรองสมาคมตัวแทนออกของฯ (landscape, fits small)
//   3 (bottom right) — หนังสือรับรองนิติบุคคล DBD (portrait, fits cell)
// 2×2 grid: big-left + 2 stacked thumbnails on the right. Image 2 (สมาคม)
// is landscape so it naturally renders smaller inside its portrait cell —
// that's intentional. Image 3 (DBD) is portrait and fits its cell tightly.
// Each cell opens a full-screen lightbox on click.
const SLIDES = [
  {
    src: "/images/companyofficethai.png",
    alt: "ทีมงาน Pacred Shipping ที่ออฟฟิศจริง 15+ ปี เคลียร์ทุกด่านในไทย",
    caption: "ทีมงาน Pacred Shipping",
    sub: "15+ ปี · เคลียร์ทุกด่านในไทย",
    fit: "cover" as const,
  },
  {
    src: "/images/aboutus/samakom.png",
    alt: "หนังสือรับรองสมาคมตัวแทนออกของรับอนุญาตไทย — Pacred Shipping",
    caption: "สมาคมตัวแทนออกของฯ",
    sub: "Shipping License ถูกกฎหมาย",
    fit: "contain" as const,
  },
  {
    src: "/images/aboutus/rubrong.png",
    alt: "หนังสือรับรองนิติบุคคล กรมพัฒนาธุรกิจการค้า — Pacred Shipping",
    caption: "หนังสือรับรองนิติบุคคล",
    sub: "DBD · ขึ้นทะเบียนถูกต้อง",
    fit: "contain" as const,
  },
];

type CellProps = {
  i: number;
  big?: boolean;
  onOpen: (i: number) => void;
};

function Cell({ i, big, onOpen }: CellProps) {
  const s = SLIDES[i];
  return (
    <button
      type="button"
      suppressHydrationWarning
      onClick={() => onOpen(i)}
      aria-label={`ดูภาพใหญ่ — ${s.caption}`}
      className="group relative block w-full h-full overflow-hidden rounded-xl md:rounded-2xl border border-border bg-white dark:bg-surface shadow-[0_8px_22px_-10px_rgba(15,23,42,0.18)] hover:shadow-[0_14px_30px_-8px_rgba(15,23,42,0.25)] transition-shadow duration-300"
    >
      <Image
        src={s.src}
        alt={s.alt}
        fill
        sizes={big ? "(max-width: 1024px) 65vw, 540px" : "(max-width: 1024px) 33vw, 280px"}
        quality={92}
        className={`transition-transform duration-500 group-hover:scale-[1.04] ${
          s.fit === "contain" ? "object-contain p-1" : "object-cover"
        }`}
        priority={i === 0}
      />

      {/* Bottom gradient + caption (only on the big cell to avoid clutter on the small ones) */}
      {big && (
        <>
          <span aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-t from-primary-900/80 via-primary-800/15 to-transparent" />
          <span className="pointer-events-none absolute bottom-0 left-0 right-0 px-3 md:px-4 py-2.5 md:py-3 text-white">
            <span className="block text-[13px] md:text-[15px] font-black leading-tight tracking-tight drop-shadow-[0_2px_6px_rgba(0,0,0,0.45)] truncate">
              {s.caption}
            </span>
            <span className="block mt-0.5 text-[10.5px] md:text-[12px] font-semibold opacity-95 leading-snug drop-shadow-[0_1px_4px_rgba(0,0,0,0.4)] truncate">
              {s.sub}
            </span>
          </span>
        </>
      )}

      {/* Zoom-in affordance — visible on all cells so user knows it's clickable */}
      <span
        aria-hidden
        className="absolute top-1.5 right-1.5 md:top-2 md:right-2 inline-flex items-center justify-center w-6 h-6 md:w-7 md:h-7 rounded-full bg-white/85 dark:bg-black/55 backdrop-blur-sm text-[#111827] dark:text-white shadow-sm opacity-90 group-hover:opacity-100 group-hover:scale-110 transition-all duration-200"
      >
        <ZoomIn className="w-3.5 h-3.5 md:w-4 md:h-4" strokeWidth={2.4} />
      </span>
    </button>
  );
}

export function CertsSlideshow() {
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const open = (i: number) => setLightboxIdx(i);
  const close = useCallback(() => setLightboxIdx(null), []);
  const prev = useCallback(
    () => setLightboxIdx((i) => (i === null ? null : (i - 1 + SLIDES.length) % SLIDES.length)),
    [],
  );
  const next = useCallback(
    () => setLightboxIdx((i) => (i === null ? null : (i + 1) % SLIDES.length)),
    [],
  );

  // Keyboard: Escape closes, arrows navigate
  useEffect(() => {
    if (lightboxIdx === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowLeft") prev();
      else if (e.key === "ArrowRight") next();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightboxIdx, close, prev, next]);

  // Lock body scroll while lightbox is open
  useEffect(() => {
    if (lightboxIdx === null) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [lightboxIdx]);

  const active = lightboxIdx !== null ? SLIDES[lightboxIdx] : null;

  return (
    <>
      <div className="grid grid-cols-[2fr_1fr] grid-rows-2 gap-1.5 md:gap-2.5 aspect-[5/6] md:aspect-[16/10] w-full max-w-[340px] md:max-w-[860px] mx-auto">
        <div className="row-span-2 min-h-0">
          <Cell i={0} big onOpen={open} />
        </div>
        <div className="min-h-0">
          <Cell i={1} onOpen={open} />
        </div>
        <div className="min-h-0">
          <Cell i={2} onOpen={open} />
        </div>
      </div>

      {active && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`ภาพ — ${active.caption}`}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 md:p-8 animate-in fade-in duration-200"
          onClick={close}
        >
          {/* Image container — stops click propagation so clicks on image don't close */}
          <div
            className="relative w-full h-full max-w-[1100px] flex items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative w-full h-full max-h-[80vh]">
              <Image
                key={active.src}
                src={active.src}
                alt={active.alt}
                fill
                sizes="100vw"
                quality={95}
                className="object-contain drop-shadow-[0_8px_30px_rgba(0,0,0,0.5)]"
                priority
              />
            </div>

            {/* Caption */}
            <div className="absolute bottom-2 md:bottom-4 left-2 md:left-4 right-2 md:right-4 px-3 md:px-4 py-2.5 md:py-3 rounded-xl bg-black/55 backdrop-blur-sm text-white max-w-[640px] mx-auto">
              <p className="text-[14px] md:text-[16px] font-black leading-tight tracking-tight truncate">
                {active.caption}
              </p>
              <p className="mt-0.5 text-[11.5px] md:text-[13px] font-semibold opacity-95 leading-snug truncate">
                {active.sub}
              </p>
            </div>

            {/* Close button — top right of viewport */}
            <button
              type="button"
              suppressHydrationWarning
              onClick={close}
              aria-label="ปิด"
              className="absolute -top-2 -right-2 md:top-2 md:right-2 z-10 flex items-center justify-center w-10 h-10 md:w-11 md:h-11 rounded-full bg-white text-[#111827] shadow-[0_4px_14px_rgba(0,0,0,0.35)] hover:scale-105 transition-transform"
            >
              <X className="w-5 h-5 md:w-6 md:h-6" strokeWidth={2.6} />
            </button>

            {/* Prev / Next */}
            <button
              type="button"
              suppressHydrationWarning
              onClick={prev}
              aria-label="ภาพก่อนหน้า"
              className="absolute left-1 md:left-3 top-1/2 -translate-y-1/2 z-10 flex items-center justify-center w-11 h-11 md:w-12 md:h-12 rounded-full bg-white/90 hover:bg-white text-[#111827] shadow-[0_4px_14px_rgba(0,0,0,0.35)] hover:scale-105 transition-all"
            >
              <ChevronLeft className="w-6 h-6 md:w-7 md:h-7" strokeWidth={2.8} />
            </button>
            <button
              type="button"
              suppressHydrationWarning
              onClick={next}
              aria-label="ภาพถัดไป"
              className="absolute right-1 md:right-3 top-1/2 -translate-y-1/2 z-10 flex items-center justify-center w-11 h-11 md:w-12 md:h-12 rounded-full bg-white/90 hover:bg-white text-[#111827] shadow-[0_4px_14px_rgba(0,0,0,0.35)] hover:scale-105 transition-all"
            >
              <ChevronRight className="w-6 h-6 md:w-7 md:h-7" strokeWidth={2.8} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
