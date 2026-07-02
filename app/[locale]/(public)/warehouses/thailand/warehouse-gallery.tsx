"use client";

/**
 * Warehouse photo gallery — horizontal scroller with prev/next arrows.
 * The scrollbar is hidden for a clean look, so a plain mouse can't drag-scroll;
 * the arrows give desktop users an explicit left/right control (mobile keeps the
 * native touch-swipe). Arrows fade out at each edge.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight } from "lucide-react";

export type GalleryPhoto = { src: string; alt: string; label: string };

export function WarehouseGallery({ photos }: { photos: GalleryPhoto[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 4);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    update();
    const el = ref.current;
    if (!el) return;
    el.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      el.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [update]);

  const scrollByPage = (dir: 1 | -1) => {
    const el = ref.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.9, behavior: "smooth" });
  };

  const arrowCls =
    "hidden md:flex absolute top-1/2 -translate-y-1/2 z-10 h-10 w-10 items-center justify-center rounded-full bg-white/95 dark:bg-surface/95 border border-border shadow-[0_4px_14px_rgba(15,23,42,0.14)] text-primary-700 transition hover:bg-primary-50 hover:border-primary-300 disabled:opacity-0 disabled:pointer-events-none";

  return (
    <div className="relative mt-4 md:mt-5">
      <div
        ref={ref}
        className="grid grid-rows-2 md:grid-rows-1 grid-flow-col auto-cols-[170px] md:auto-cols-[280px] gap-2.5 md:gap-3 overflow-x-auto scroll-smooth snap-x snap-mandatory -mx-3 md:-mx-4 px-3 md:px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {photos.map((photo) => (
          <div
            key={photo.src}
            className="group relative aspect-[4/3] rounded-xl md:rounded-2xl overflow-hidden border border-border shadow-[0_6px_18px_rgba(15,23,42,0.06)] snap-start"
          >
            <Image
              src={photo.src}
              alt={photo.alt}
              fill
              sizes="(max-width: 768px) 170px, 280px"
              className="object-cover transition-transform duration-500 group-hover:scale-[1.06]"
            />
            <div className="absolute bottom-1.5 left-1.5 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/90 dark:bg-surface/90 backdrop-blur-sm text-[9.5px] md:text-[11px] font-black text-primary-600">
              {photo.label}
            </div>
          </div>
        ))}
      </div>

      {/* Desktop prev/next — mobile keeps native touch-swipe */}
      <button type="button" onClick={() => scrollByPage(-1)} disabled={!canLeft} aria-label="เลื่อนซ้าย" className={`${arrowCls} left-1`}>
        <ChevronLeft className="h-5 w-5" strokeWidth={2.6} />
      </button>
      <button type="button" onClick={() => scrollByPage(1)} disabled={!canRight} aria-label="เลื่อนขวา" className={`${arrowCls} right-1`}>
        <ChevronRight className="h-5 w-5" strokeWidth={2.6} />
      </button>
    </div>
  );
}
