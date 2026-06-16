"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Phone, MessageCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { trackCtaClick } from "@/lib/analytics";
import { TrackedExternalLink } from "@/components/analytics/tracked-link";
import { getPublicSalesRoster } from "@/actions/sales-roster";

const LINE_URL = "/line";

type SalesPerson = {
  id: string;
  name: string;
  roleKey: string;
  taglineKey: string;
  phone: string;
  image: string;
  useContain?: boolean;
  altKey: string;
};

// Curated cards — the nice art + marketing copy per known rep. The DISPLAYED
// set is the LIVE flagged roster (fetched on mount); a flagged rep keeps its
// curated card when matched, else gets a default card. So adding a rep (toggle
// adminStatusSale) shows them here automatically — owner 2026-06-15.
const CURATED_SALES: SalesPerson[] = [
  { id: "may",  name: "เมย์", roleKey: "roleSales",     taglineKey: "taglineMay",  phone: "066-125-3006", image: "/images/Character_Icon/may.png",   altKey: "altMay"  },
  { id: "nat",  name: "แนท",  roleKey: "roleSales",     taglineKey: "taglineNat",  phone: "066-131-0253", image: "/images/pacred-logo-red.png", useContain: true, altKey: "altNat" },
  { id: "pee",  name: "พี",   roleKey: "roleSales",     taglineKey: "taglinePee",  phone: "061-779-9299", image: "/images/Character_Icon/pee01.png", altKey: "altPee" },
  { id: "toey", name: "เตย",  roleKey: "roleSales",     taglineKey: "taglineToey", phone: "099-253-1415", image: "/images/Character_Icon/Toey01.png", altKey: "altToey" },
  { id: "win",  name: "วิน",  roleKey: "roleLogistics", taglineKey: "taglineWin",  phone: "062-603-0456", image: "/images/Character_Icon/win01.png",  altKey: "altWin" },
  // CS พลอย card removed from the on-site display (ปอน 2026-06-08 — "เอา cs ploy
  // ออกจากหน้าเซลล์"). The i18n keys (taglinePloy/altPloy/roleCs) + the central
  // CONTACT.phoneCs / sidebar CS fallback stay; only the rendered card is gone.
];

// Tracks the card nearest the viewport centre while the MOBILE carousel scrolls,
// so the centred card can get a slight zoom. No-op on md+ (it's a static grid).
function useActiveCard(initialIdx: number) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [activeIdx, setActiveIdx] = useState(initialIdx);
  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    const isMobile = () => !window.matchMedia("(min-width: 768px)").matches;
    const update = () => {
      if (!isMobile()) return;
      const centre = scroller.scrollLeft + scroller.clientWidth / 2;
      const cards = Array.from(scroller.children) as HTMLElement[];
      let idx = 0;
      let best = Infinity;
      cards.forEach((c, i) => {
        const cc = c.offsetLeft + c.clientWidth / 2;
        const d = Math.abs(cc - centre);
        if (d < best) { best = d; idx = i; }
      });
      setActiveIdx(idx);
    };
    requestAnimationFrame(update);
    scroller.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      scroller.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);
  return { scrollRef, activeIdx };
}

interface ContactSalesProps {
  /** Hide the bottom assurance strip (ตอบไว · ปรึกษาฟรี · 14+ ปี) */
  hideAssuranceStrip?: boolean;
  /** Tighter vertical padding — for pages with many sections. */
  compact?: boolean;
}

export function ContactSales({ hideAssuranceStrip = false, compact = false }: ContactSalesProps = {}) {
  const t = useTranslations("contactSales");
  const { scrollRef, activeIdx } = useActiveCard(0);

  // Live roster (owner 2026-06-15: "ลูกค้าด้วย … ผูกกันออโต้") — the displayed
  // team = the REAL flagged sales reps. Start from the curated cards (SSR/SEO +
  // instant paint), then on mount swap to the live flagged set: each flagged rep
  // keeps its curated card when one matches (art + copy), else a default card.
  // Read failure / empty roster → keep the curated list (never empty).
  const [displaySales, setDisplaySales] = useState<SalesPerson[]>(CURATED_SALES);
  useEffect(() => {
    let alive = true;
    getPublicSalesRoster()
      .then((reps) => {
        if (!alive || reps.length === 0) return;
        const list: SalesPerson[] = reps.map((r) => {
          const shortId = r.adminID.replace(/^admin_/, "");
          const curated = CURATED_SALES.find((c) => c.name === r.name || c.id === shortId);
          if (curated) return curated;
          return {
            id: r.adminID,
            name: r.name,
            roleKey: "roleSales",
            taglineKey: "taglineGeneric",
            phone: r.phone,
            image: r.photo ?? "/images/pacred-logo-red.png",
            useContain: !r.photo,
            altKey: "altGeneric",
          };
        });
        setDisplaySales(list);
      })
      .catch(() => { /* keep the curated fallback — never break the page */ });
    return () => { alive = false; };
  }, []);

  return (
    <section id="contact-sales" className={`relative ${compact ? "py-2 md:py-4" : "py-5 md:py-14"}`}>
      <div className="relative mx-auto w-full max-w-[1140px] px-[10px]">
        {/* Heading */}
        <div className="mx-auto w-full max-w-[1120px]">
          <div className="flex items-center gap-1.5 md:gap-2 mb-1 md:mb-1.5 text-primary-600 text-[10.5px] md:text-[13px] font-black tracking-[0.08em] uppercase">
            <span className="w-1.5 h-1.5 md:w-2 md:h-2 rounded-full bg-primary-600 shrink-0" />
            CONTACT OUR TEAM
          </div>
          <h2 className="text-[20px] md:text-[38px] leading-[1.2] md:leading-[1.15] font-black tracking-[-0.03em] md:tracking-[-0.04em] text-[#111827] dark:text-white">
            {t("headingBefore")}{" "}
            <span className="text-primary-600">Pacred</span> {t("headingAfter")}
          </h2>
          <p className="mt-2 text-[12px] md:text-[15px] leading-[1.5] md:leading-[1.55] font-medium text-muted max-w-[680px]">
            {t("subheading")}
          </p>
        </div>

        {/* Team cards — mobile = swipe carousel (centred card zooms slightly),
            md+ = static 3-up grid. No red active state. */}
        <div
          ref={scrollRef}
          className="mt-4 md:mt-10 flex gap-3 overflow-x-auto snap-x snap-mandatory pb-2 -mx-[10px] px-[10px] items-stretch [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:grid md:grid-cols-3 md:gap-5 md:overflow-visible md:mx-0 md:px-0 md:pb-0 md:snap-none"
        >
          {displaySales.map((s, i) => (
            <div
              key={s.id}
              className={[
                "shrink-0 w-[82%] max-w-[300px] snap-center md:w-auto md:max-w-none rounded-2xl md:rounded-3xl border border-border bg-white dark:bg-surface shadow-[0_8px_20px_rgba(15,23,42,0.06)] transition-all duration-300 md:hover:scale-[1.03] md:hover:z-10 md:hover:shadow-[0_16px_36px_rgba(15,23,42,0.13)]",
                i === activeIdx ? "max-md:scale-[1.03] max-md:z-10" : "",
              ].join(" ")}
            >
              <div className="p-3.5 md:p-5">
                {/* Header — avatar + name + ONLINE + role */}
                <div className="flex items-center gap-3">
                  <div className="relative w-[54px] h-[54px] md:w-[68px] md:h-[68px] rounded-full overflow-hidden shrink-0 border-[3px] border-white bg-white shadow-[0_6px_14px_rgba(0,0,0,0.18)]">
                    <Image
                      src={s.image}
                      alt={t(s.altKey)}
                      fill
                      sizes="72px"
                      loading="eager"
                      className={s.useContain ? "object-contain p-2" : "object-cover"}
                    />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <h3 className="text-[17px] md:text-[21px] font-black leading-none tracking-tight text-[#111827] dark:text-white">
                        {s.name}
                      </h3>
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded-full border border-primary-200 dark:border-primary-800 text-primary-600 dark:text-primary-300 text-[8.5px] md:text-[9px] font-black tracking-[0.08em]">
                        ONLINE
                      </span>
                    </div>
                    <div className="mt-1 text-[10px] md:text-[11.5px] font-black uppercase tracking-[0.08em] text-primary-600">
                      {t(s.roleKey)}
                    </div>
                  </div>
                </div>

                {/* Tagline */}
                <p className="mt-2.5 md:mt-3.5 text-[12px] md:text-[13.5px] leading-[1.5] md:leading-[1.55] font-medium text-muted line-clamp-2 min-h-[18px] md:min-h-[21px]">
                  {t(s.taglineKey)}
                </p>

                {/* Divider + action buttons */}
                <div className="mt-3 md:mt-5 pt-3 md:pt-4 border-t border-border grid grid-cols-2 gap-2">
                  <a
                    href={`tel:${s.phone.replace(/-/g, "")}`}
                    onClick={() => trackCtaClick("sales_phone", `home_sales_${s.name}`, { rep: s.name, role: s.roleKey })}
                    className="inline-flex items-center justify-center gap-1.5 h-11 rounded-xl text-[11.5px] md:text-[12.5px] font-black border bg-white dark:bg-background text-[#111827] dark:text-white border-border hover:border-primary-400 hover:text-primary-700 transition-all duration-300"
                  >
                    <Phone className="w-3.5 h-3.5" strokeWidth={2.6} />
                    {s.phone}
                  </a>
                  <TrackedExternalLink
                    href={LINE_URL}
                    cta="line_consult"
                    surface="contact_sales"
                    ctaProps={{ rep: s.name, role: s.roleKey }}
                    className="inline-flex items-center justify-center gap-1.5 h-11 rounded-xl text-[11.5px] md:text-[12.5px] font-black bg-[#06C755] text-white hover:bg-[#05a548] shadow-[0_8px_18px_rgba(6,199,85,0.30)] transition-all duration-300"
                  >
                    <MessageCircle className="w-3.5 h-3.5" strokeWidth={2.6} fill="currentColor" />
                    {t("chatLine")}
                  </TrackedExternalLink>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Bottom assurance strip */}
        {!hideAssuranceStrip && (
          <div className="mt-6 md:mt-8 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[11.5px] md:text-[12.5px] font-bold text-muted">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              {t("assuranceFast")}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
              {t("assuranceFree")}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
              {t("assuranceExpert")}
            </span>
          </div>
        )}
      </div>
    </section>
  );
}
