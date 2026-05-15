"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import {
  ChevronLeft,
  ChevronRight,
  ArrowRight,
  FileText,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import { trackCtaClick } from "@/lib/analytics";
import { CUSTOMS_PORTS, type CustomsPort } from "./customs-port-data";

const PARENT_PATH = "/customs-clearance-shipping-suvarnabhumi";

/**
 * Per-port pricing carousel for the customs-clearance landing.
 *
 * Cards loop infinitely (เลื่อนหมุนเป็นวงกลม per ปอน 2026-05-15).
 *
 * Mechanic: render 3 identical copies of CUSTOMS_PORTS so the scroller's
 * scrollWidth = 3 × setWidth. Mount-time we centre the start of the
 * middle set on screen, then a requestAnimationFrame ticker nudges
 * scrollLeft forward 0.4px per frame. When scrollLeft crosses 2 sets we
 * subtract one setWidth (jump back invisibly because the next set
 * renders identical content). Going left under 0 we add one setWidth.
 *
 * Manual control:
 *   - hover (desktop) or touchstart/wheel (mobile/scroll wheel) pauses
 *     auto-rotation; idle 1.5s after release resumes
 *   - chevron buttons call scrollBy(±card) on the same scroller, which
 *     plays nicely with the loop because of the edge-jump check
 */
const SETS = 3;
const TRIPLED_PORTS: CustomsPort[] = Array.from({ length: SETS }, () =>
  CUSTOMS_PORTS,
).flat();
const MIDDLE_SET_INDEX = CUSTOMS_PORTS.length;
/**
 * Sub-pixel accumulator approach — many browsers (Chromium-based,
 * Firefox via some embedders) floor `scrollLeft` to integer when set,
 * so a sub-1px increment never lands. Accumulate fractional progress
 * separately, only writing to scrollLeft when at least 1px has built
 * up. This makes the speed look genuinely slow (~30 px/sec ≈ a slow
 * cinema crawl) without stalling.
 */
const SPEED_PX_PER_FRAME = 0.5;

export function PortPricingCarousel() {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const pauseUntilRef = useRef(0);
  const accumulatorRef = useRef(0);

  /* Mount setup + RAF auto-rotation + edge-jump in a single effect so
     the start-position scroll and the ticker share the same lifecycle.
     Hover-pause was dropped because iframe sandboxes (Vercel preview,
     CMS embeds, etc.) auto-fire mouseenter when focused and never fire
     mouseleave — pausedRef would stay true forever. Touchstart + wheel
     pause for 4s is enough to stop motion when the user actually
     interacts. */
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;

    // Scroll to start of middle set immediately + once more after a
     // frame for layout-after-image-load adjustment.
    const setStartPosition = () => {
      const middleFirst = el.querySelector<HTMLElement>(
        `[data-tri-index="${MIDDLE_SET_INDEX}"]`,
      );
      if (!middleFirst) return;
      const isDesktop = window.innerWidth >= 1024;
      const target = isDesktop
        ? middleFirst.offsetLeft -
          el.clientWidth / 2 +
          middleFirst.offsetWidth / 2
        : middleFirst.offsetLeft - 16;
      el.scrollLeft = Math.max(0, target);
    };
    setStartPosition();
    const initRaf = requestAnimationFrame(setStartPosition);

    const tick = () => {
      const now = performance.now();
      const w = el.scrollWidth / SETS;
      if (now > pauseUntilRef.current && w > 0) {
        accumulatorRef.current += SPEED_PX_PER_FRAME;
        if (accumulatorRef.current >= 1) {
          const whole = Math.floor(accumulatorRef.current);
          el.scrollLeft += whole;
          accumulatorRef.current -= whole;
        }
      }
      if (el.scrollLeft >= w * 2) {
        el.scrollLeft -= w;
      } else if (el.scrollLeft <= 0 && w > 0) {
        el.scrollLeft += w;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    const pauseTransient = () => {
      pauseUntilRef.current = performance.now() + 4000;
    };
    el.addEventListener("touchstart", pauseTransient, { passive: true });
    el.addEventListener("wheel", pauseTransient, { passive: true });
    el.addEventListener("pointerdown", pauseTransient);

    return () => {
      cancelAnimationFrame(initRaf);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      el.removeEventListener("touchstart", pauseTransient);
      el.removeEventListener("wheel", pauseTransient);
      el.removeEventListener("pointerdown", pauseTransient);
    };
  }, []);

  function scrollByCard(direction: 1 | -1) {
    const el = scrollerRef.current;
    if (!el) return;
    const card = el.querySelector<HTMLDivElement>("[data-port]");
    const step = card ? card.offsetWidth + 16 : el.clientWidth * 0.9;
    pauseUntilRef.current = performance.now() + 4000;
    el.scrollBy({ left: step * direction, behavior: "smooth" });
  }

  return (
    <div className="relative group/carousel">
      <div
        ref={scrollerRef}
        className="flex gap-3 md:gap-4 overflow-x-auto pb-3 -mx-4 md:-mx-5 px-4 md:px-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [scroll-snap-type:none]"
      >
        {TRIPLED_PORTS.map((port, i) => (
          <PortCard
            key={`${port.code}-${i}`}
            port={port}
            triIndex={i}
            isCloneSet={i < MIDDLE_SET_INDEX || i >= MIDDLE_SET_INDEX * 2}
          />
        ))}
      </div>

      {/* Desktop chevron buttons */}
      <button
        type="button"
        aria-label="เลื่อนซ้าย"
        onClick={() => scrollByCard(-1)}
        className={`hidden md:flex absolute left-[-18px] top-1/2 -translate-y-1/2 z-10 items-center justify-center w-11 h-11 rounded-full bg-white border border-border shadow-[0_8px_24px_rgba(15,23,42,0.12)] hover:border-primary-300 hover:text-primary-600 transition-all opacity-100`}
      >
        <ChevronLeft className="w-5 h-5" strokeWidth={2.6} />
      </button>
      <button
        type="button"
        aria-label="เลื่อนขวา"
        onClick={() => scrollByCard(1)}
        className={`hidden md:flex absolute right-[-18px] top-1/2 -translate-y-1/2 z-10 items-center justify-center w-11 h-11 rounded-full bg-white border border-border shadow-[0_8px_24px_rgba(15,23,42,0.12)] hover:border-primary-300 hover:text-primary-600 transition-all opacity-100`}
      >
        <ChevronRight className="w-5 h-5" strokeWidth={2.6} />
      </button>

      {/* Mobile pulsing chevrons (always visible since loop is infinite) */}
      <span
        aria-hidden
        className="pointer-events-none md:hidden absolute top-1/2 left-1 -translate-y-1/2 flex items-center justify-center w-9 h-9 rounded-full bg-primary-600 text-white shadow-[0_4px_12px_rgba(220,38,38,0.40)] ring-2 ring-white animate-pulse"
      >
        <ChevronLeft className="w-4 h-4" strokeWidth={3.2} />
      </span>
      <span
        aria-hidden
        className="pointer-events-none md:hidden absolute top-1/2 right-1 -translate-y-1/2 flex items-center justify-center w-9 h-9 rounded-full bg-primary-600 text-white shadow-[0_4px_12px_rgba(220,38,38,0.40)] ring-2 ring-white animate-pulse"
      >
        <ChevronRight className="w-4 h-4" strokeWidth={3.2} />
      </span>

      {/* Loop hint pill on the carousel header — communicates "rotating" */}
      <div className="hidden md:flex absolute -top-9 right-0 items-center gap-1.5 text-[11px] font-bold tracking-wide text-primary-600/80">
        <span className="relative flex w-1.5 h-1.5">
          <span className="absolute inline-flex w-full h-full rounded-full bg-primary-500 opacity-75 animate-ping" />
          <span className="relative inline-flex w-1.5 h-1.5 rounded-full bg-primary-600" />
        </span>
        เลื่อนหมุนต่อกันไม่จบ · เลือกท่าที่ใช้ได้เลย
      </div>
    </div>
  );
}

function PortCard({
  port,
  triIndex,
  isCloneSet,
}: {
  port: CustomsPort;
  triIndex: number;
  isCloneSet: boolean;
}) {
  const Icon = port.modeIcon;
  // Clones are aria-hidden so screen readers + crawlers see the canonical
  // 7 cards only; the middle set is the "real" one.
  return (
    <article
      data-port={port.code}
      data-tri-index={triIndex}
      aria-hidden={isCloneSet ? "true" : undefined}
      tabIndex={isCloneSet ? -1 : undefined}
      className="shrink-0 w-[85%] sm:w-[340px] lg:w-[360px] flex flex-col rounded-2xl md:rounded-3xl border border-border bg-white dark:bg-surface overflow-hidden shadow-[0_8px_22px_rgba(15,23,42,0.06)] hover:shadow-[0_22px_50px_rgba(179,0,0,0.14)] hover:border-primary-300 dark:hover:border-primary-800 transition-all duration-400"
    >
      <div className="relative h-32 md:h-36 overflow-hidden">
        <Image
          src={port.image}
          alt={port.imageAlt}
          fill
          sizes="(max-width: 640px) 85vw, 360px"
          className="object-cover transition-transform duration-500 group-hover:scale-[1.06]"
        />
        <div
          className={`absolute inset-0 bg-gradient-to-br ${port.accent} mix-blend-multiply opacity-25`}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/15 to-transparent" />
        <div className="absolute top-3 left-3">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/95 backdrop-blur-sm text-primary-700 text-[10px] md:text-[11px] font-black tracking-[0.10em] shadow-md">
            <Icon className="w-3.5 h-3.5" strokeWidth={2.6} />
            {port.modeBadge}
          </span>
        </div>
        <div className="absolute bottom-3 left-3 right-3">
          <h3 className="text-[18px] md:text-[20px] font-black text-white leading-tight tracking-tight drop-shadow-[0_2px_8px_rgba(0,0,0,0.5)]">
            {port.name}
          </h3>
          <p className="mt-0.5 text-[11px] md:text-[12px] text-white/90 font-medium drop-shadow">
            {port.sub}
          </p>
        </div>
      </div>

      <div className="flex-1 flex flex-col gap-3 p-4 md:p-5">
        <div className="rounded-xl bg-primary-50/60 dark:bg-primary-900/20 border border-primary-100 dark:border-primary-800 px-3.5 py-3">
          <div className="text-[10.5px] md:text-[11px] font-bold text-primary-700/80 dark:text-primary-300/80 tracking-[0.10em] uppercase leading-none">
            ค่าพิธีการศุลกากร · เริ่มต้น
          </div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-[28px] md:text-[32px] font-black text-primary-600 dark:text-primary-300 leading-none tracking-tight">
              {port.customsServiceFee}
            </span>
            <span className="text-[14px] md:text-[15px] font-bold text-primary-700 dark:text-primary-300">
              บาท
            </span>
            <span className="ml-auto text-[10.5px] md:text-[11px] text-muted font-medium">
              + ค่าใช้จ่ายอื่นตามจริง
            </span>
          </div>
        </div>

        <p className="text-[12.5px] md:text-[13px] leading-[1.55] text-foreground/85 font-medium">
          {port.shortDesc}
        </p>
      </div>

      <div className="border-t border-border bg-surface/60 dark:bg-background/60 px-4 md:px-5 py-3.5 md:py-4 space-y-2">
        <Link
          href="/register"
          onClick={() =>
            trackCtaClick("request_quote", "customs_port_pricing", {
              port: port.code,
              position: "card_primary",
            })
          }
          className="inline-flex w-full items-center justify-center gap-1.5 h-11 rounded-lg bg-primary-600 text-white font-black text-[13px] md:text-[13.5px] hover:bg-primary-700 transition-colors shadow-[0_4px_12px_rgba(220,38,38,0.25)]"
        >
          ขอใบเสนอราคา ฟรี
          <ArrowRight className="w-3.5 h-3.5" strokeWidth={2.6} />
        </Link>
        <Link
          href={`${PARENT_PATH}/${port.slug}`}
          onClick={() =>
            trackCtaClick("view_port_detail", "customs_port_pricing", {
              port: port.code,
              position: "card_secondary",
            })
          }
          className="inline-flex w-full items-center justify-center gap-1.5 h-10 rounded-lg border border-primary-200 bg-white text-primary-700 font-bold text-[12.5px] md:text-[13px] hover:bg-primary-50 hover:border-primary-300 transition-colors dark:bg-surface dark:border-primary-800 dark:text-primary-200"
        >
          <FileText className="w-3.5 h-3.5" strokeWidth={2.6} />
          ดูค่าใช้จ่ายเต็ม + รายละเอียด
        </Link>
      </div>
    </article>
  );
}
