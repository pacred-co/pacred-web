"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";

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
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  function resetTimer() {
    if (timer.current) clearInterval(timer.current);
    timer.current = setInterval(() => {
      setCurrent((c) => (c + 1) % slides.length);
    }, delay ?? 4000);
  }

  useEffect(() => {
    resetTimer();
    return () => { if (timer.current) clearInterval(timer.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slides.length]);

  return (
    <div className={containerClass}>
      {/* Track */}
      <div
        className="flex h-full transition-transform duration-500 ease-in-out"
        style={{ transform: `translateX(-${current * 100}%)` }}
      >
        {slides.map((src, i) => (
          <div key={src} className="relative w-full h-full shrink-0">
            <Image
              src={src}
              alt={`Slide ${i + 1}`}
              fill
              sizes="(max-width: 768px) 100vw, 730px"
              className="object-contain md:object-cover"
              priority={i === 0}
            />
          </div>
        ))}
      </div>

      {/* Dots */}
      <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-1.5">
        {slides.map((_, i) => (
          <button
            key={i}
            onClick={() => { setCurrent(i); resetTimer(); }}
            suppressHydrationWarning
            className={`h-1.5 rounded-full transition-all ${
              current === i ? "w-5 bg-primary-500" : "w-1.5 bg-black/20 dark:bg-white/30"
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
