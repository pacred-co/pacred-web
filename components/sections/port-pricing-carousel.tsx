"use client";

import { useRef } from "react";
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

export function PortPricingCarousel() {
  const scrollerRef = useRef<HTMLDivElement>(null);

  function scrollByCard(direction: 1 | -1) {
    const el = scrollerRef.current;
    if (!el) return;
    const card = el.querySelector<HTMLDivElement>("[data-port]");
    const step = card ? card.offsetWidth + 16 : el.clientWidth * 0.9;
    el.scrollBy({ left: step * direction, behavior: "smooth" });
  }

  return (
    <div className="relative group/carousel">
      <div
        ref={scrollerRef}
        className="flex gap-3 md:gap-4 overflow-x-auto pb-3 -mx-4 md:-mx-5 px-4 md:px-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [scroll-snap-type:none]"
      >
        {CUSTOMS_PORTS.map((port) => (
          <PortCard key={port.code} port={port} />
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

    </div>
  );
}

function PortCard({ port }: { port: CustomsPort }) {
  const Icon = port.modeIcon;
  return (
    <article
      data-port={port.code}
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
