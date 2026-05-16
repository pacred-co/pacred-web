"use client";

import { useState } from "react";
import Image from "next/image";
import { Quote, ChevronLeft, ChevronRight } from "lucide-react";

// Slide order: หนังสือรับรองนิติบุคคล (DBD) appears first per ปอน 2026-05-17.
// Auto-rotate removed — user controls via chevron / dot indicators.
const SLIDES = [
  {
    src: "/images/aboutus/rubrong.png",
    alt: "หนังสือรับรองนิติบุคคล กรมพัฒนาธุรกิจการค้า — Pacred Shipping",
    caption: "หนังสือรับรองนิติบุคคล",
    sub: "DBD · ขึ้นทะเบียนถูกต้อง",
    fit: "contain" as const,
  },
  {
    src: "/images/aboutus/samakom.png",
    alt: "หนังสือรับรองสมาคมตัวแทนออกของรับอนุญาตไทย — Pacred Shipping",
    caption: "สมาคมตัวแทนออกของฯ",
    sub: "Shipping License ถูกกฎหมาย",
    fit: "contain" as const,
  },
  {
    src: "/images/companyofficethai.png",
    alt: "ทีมงาน Pacred Shipping",
    caption: "ทีมงาน Pacred Shipping",
    sub: "15+ ปี · เคลียร์ทุกด่านในไทย",
    fit: "cover" as const,
  },
];

export function CertsSlideshow() {
  const [idx, setIdx] = useState(0);

  const active = SLIDES[idx];

  return (
    <div className="relative rounded-2xl md:rounded-3xl overflow-hidden border border-border shadow-[0_14px_36px_-10px_rgba(15,23,42,0.18)] aspect-[5/6] w-full max-w-[340px] lg:max-w-none mx-auto lg:mx-0 bg-white dark:bg-surface">
      {SLIDES.map((s, i) => (
        <Image
          key={s.src}
          src={s.src}
          alt={s.alt}
          fill
          sizes="(max-width: 1024px) 100vw, 480px"
          quality={92}
          className={`transition-opacity duration-700 ${
            s.fit === "contain" ? "object-contain p-3 md:p-5" : "object-cover"
          } ${i === idx ? "opacity-100" : "opacity-0"}`}
          priority={i === 0}
        />
      ))}

      {/* Bottom gradient + caption — only over the active slide */}
      <div className="absolute inset-0 bg-gradient-to-t from-primary-900/80 via-primary-800/30 to-transparent pointer-events-none" />
      <Quote
        aria-hidden
        className="absolute top-4 left-4 w-10 h-10 text-white/30"
        strokeWidth={1.5}
      />
      <div className="absolute bottom-0 left-0 right-0 px-4 md:px-5 py-3.5 md:py-4 text-white">
        <p
          key={`cap-${idx}`}
          className="text-[15px] md:text-[17px] font-black leading-tight tracking-tight drop-shadow-[0_2px_8px_rgba(0,0,0,0.45)] truncate"
        >
          {active.caption}
        </p>
        <p className="mt-1 text-[12px] md:text-[12.5px] font-semibold opacity-95 leading-snug drop-shadow-[0_1px_4px_rgba(0,0,0,0.4)] truncate">
          {active.sub}
        </p>
      </div>

      {/* Dots indicator */}
      <div className="absolute top-3 right-3 flex gap-1.5">
        {SLIDES.map((s, i) => (
          <button
            key={s.src}
            type="button"
            suppressHydrationWarning
            aria-label={`ภาพที่ ${i + 1}`}
            onClick={() => setIdx(i)}
            className={`h-1.5 rounded-full transition-all ${
              i === idx ? "bg-white w-5" : "bg-white/50 w-1.5 hover:bg-white/80"
            }`}
          />
        ))}
      </div>

      {/* Prev/Next chevron buttons — visible mobile + desktop */}
      <button
        type="button"
        suppressHydrationWarning
        aria-label="ภาพก่อนหน้า"
        onClick={() => setIdx((i) => (i - 1 + SLIDES.length) % SLIDES.length)}
        className="absolute left-2 md:left-3 top-1/2 -translate-y-1/2 z-10 flex items-center justify-center w-9 h-9 md:w-10 md:h-10 rounded-full bg-white/90 hover:bg-white text-[#111827] shadow-[0_4px_12px_rgba(0,0,0,0.25)] hover:scale-105 transition-all duration-200"
      >
        <ChevronLeft className="w-5 h-5 md:w-6 md:h-6" strokeWidth={2.8} />
      </button>
      <button
        type="button"
        suppressHydrationWarning
        aria-label="ภาพถัดไป"
        onClick={() => setIdx((i) => (i + 1) % SLIDES.length)}
        className="absolute right-2 md:right-3 top-1/2 -translate-y-1/2 z-10 flex items-center justify-center w-9 h-9 md:w-10 md:h-10 rounded-full bg-white/90 hover:bg-white text-[#111827] shadow-[0_4px_12px_rgba(0,0,0,0.25)] hover:scale-105 transition-all duration-200"
      >
        <ChevronRight className="w-5 h-5 md:w-6 md:h-6" strokeWidth={2.8} />
      </button>
    </div>
  );
}
