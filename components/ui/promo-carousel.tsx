"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { Link } from "@/i18n/navigation";

const LEFT_SLIDES = [
  "/images/promotion/clearanceman.png",
  "/images/promotion/fclimportchinjesus.png",
  "/images/promotion/importchinawidth.png",
];
const RIGHT_SLIDES = [
  "/images/promotion/clearanceshort.png",
  "/images/promotion/fclimportchinman.png",
  "/images/promotion/importlclchina.png",
];

function InnerCarousel({
  slides,
  containerClass,
  delay,
}: {
  slides: string[];
  containerClass: string;
  delay?: number;
}) {
  const [current, setCurrent] = useState(0);
  const [paused, setPaused] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (paused) {
      if (timer.current) clearInterval(timer.current);
      return;
    }
    timer.current = setInterval(() => {
      setCurrent((c) => (c + 1) % slides.length);
    }, delay ?? 4000);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [slides.length, delay, paused]);

  return (
    <div
      className={`${containerClass} group/promo transition-all duration-300 hover:shadow-[0_16px_36px_rgba(220,38,38,0.22)] hover:border-primary-300 hover:-translate-y-[2px]`}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* Track */}
      <div
        className="flex h-full transition-transform duration-500 ease-in-out"
        style={{ transform: `translateX(-${current * 100}%)` }}
      >
        {slides.map((src, i) => (
          <Link
            key={src}
            href="/register"
            aria-label="สมัครสมาชิก Pacred"
            className="relative w-full h-full shrink-0 block overflow-hidden cursor-pointer"
          >
            <Image
              src={src}
              alt={`Slide ${i + 1}`}
              fill
              sizes="(max-width: 768px) 100vw, 730px"
              className="object-contain md:object-cover transition-transform duration-500 ease-out group-hover/promo:scale-[1.045]"
              priority={i === 0}
            />
            {/* Soft vignette on hover */}
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 opacity-0 group-hover/promo:opacity-100 transition-opacity duration-300"
              style={{ background: "linear-gradient(180deg, rgba(0,0,0,0) 55%, rgba(0,0,0,0.22) 100%)" }}
            />
            {/* CTA pill that appears on hover */}
            <span className="pointer-events-none absolute top-2.5 right-2.5 inline-flex items-center gap-1 rounded-full bg-white/95 backdrop-blur-sm text-primary-600 text-[11px] md:text-[12px] font-black px-2.5 py-1 shadow-[0_6px_16px_rgba(0,0,0,0.18)] opacity-0 -translate-y-1.5 group-hover/promo:opacity-100 group-hover/promo:translate-y-0 transition-all duration-300">
              สมัครเลย
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            </span>
          </Link>
        ))}
      </div>

      {/* Dots */}
      <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-1.5 z-[2]">
        {slides.map((_, i) => (
          <button
            key={i}
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setCurrent(i); }}
            suppressHydrationWarning
            className={`h-1.5 rounded-full transition-all cursor-pointer ${
              current === i ? "w-5 bg-primary-500" : "w-1.5 bg-black/20 dark:bg-white/30 hover:bg-primary-400"
            }`}
            aria-label={`Slide ${i + 1}`}
          />
        ))}
      </div>
    </div>
  );
}

export function PromoCarousel() {
  return (
    <div className="flex gap-3 md:gap-5">
      {/* LEFT — hidden on mobile, big on desktop */}
      <InnerCarousel
        slides={LEFT_SLIDES}
        containerClass="hidden md:block relative w-[730px] h-[180px] shrink-0 rounded-xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden"
        delay={4000}
      />
      {/* RIGHT — full width on mobile, fixed 350px on desktop */}
      <InnerCarousel
        slides={RIGHT_SLIDES}
        containerClass="relative w-full md:w-[350px] h-[120px] md:h-[180px] shrink-0 rounded-xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden"
        delay={3000}
      />
    </div>
  );
}
