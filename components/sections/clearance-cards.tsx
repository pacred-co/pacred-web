"use client";

import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { LINE_OA } from "@/components/seo/site";

const LINE_URL = LINE_OA.addFriendUrl;
const ICON_SRC = "/images/hero-section/icon-draf/customclearance.png";

type Card = {
  id: string;
  image: string;
  altKey: string;
  tagKeys: string[];
  titleKey: string;
  priceKey: string;
  noteKey: string;
  link: string;
};

const CARDS: Card[] = [
  {
    id: "suvarnabhumi",
    image: "/images/cardclearance/suwanboys.png",
    altKey:   "altSuvarnabhumi",
    tagKeys:  ["tagLcl", "tagAir", "tagCustoms"],
    titleKey: "titleSuvarnabhumi",
    priceKey: "price2800",
    noteKey:  "noteSuvarnabhumi",
    link:  LINE_URL,
  },
  {
    id: "laem-chabang",
    image: "/images/cardclearance/laemport.png",
    altKey:   "altLaemChabang",
    tagKeys:  ["tagFcl", "tagCif", "tagSea"],
    titleKey: "titleLaemChabang",
    priceKey: "price3500",
    noteKey:  "noteLaemChabang",
    link:  LINE_URL,
  },
  {
    id: "khlong-toei",
    image: "/images/cardclearance/klongtoey.png",
    altKey:   "altKhlongToei",
    tagKeys:  ["tagFcl", "tagCif", "tagSea"],
    titleKey: "titleKhlongToei",
    priceKey: "price3500",
    noteKey:  "noteKhlongToei",
    link:  LINE_URL,
  },
  {
    id: "don-mueang",
    image: "/images/cardclearance/donmueng.png",
    altKey:   "altDonMueang",
    tagKeys:  ["tagLcl", "tagAir", "tagCustoms"],
    titleKey: "titleDonMueang",
    priceKey: "price2800",
    noteKey:  "noteDonMueang",
    link:  LINE_URL,
  },
  {
    id: "lak-si-post",
    image: "/images/cardclearance/praisaneelaksee.png",
    altKey:   "altLakSiPost",
    tagKeys:  ["tagLcl", "tagAir", "tagCustoms"],
    titleKey: "titleLakSiPost",
    priceKey: "price3500",
    noteKey:  "noteLakSiPost",
    link:  LINE_URL,
  },
  {
    id: "mukdahan",
    image: "/images/cardclearance/mukdahanport.png",
    altKey:   "altMukdahan",
    tagKeys:  ["tagFcl", "tagCif", "tagTruck"],
    titleKey: "titleMukdahan",
    priceKey: "price3500",
    noteKey:  "noteMukdahan",
    link:  LINE_URL,
  },
];

export function ClearanceCards() {
  const t = useTranslations("clearanceCards");
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const dragRef = useRef({ isDown: false, startX: 0, scrollLeft: 0 });

  const updateButtons = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    if (max <= 5) {
      setCanPrev(false);
      setCanNext(false);
      return;
    }
    setCanPrev(el.scrollLeft > 5);
    setCanNext(el.scrollLeft < max - 5);
  }, []);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    updateButtons();
    const t1 = window.setTimeout(updateButtons, 80);
    const t2 = window.setTimeout(updateButtons, 500);

    el.addEventListener("scroll", updateButtons, { passive: true });
    window.addEventListener("resize", updateButtons);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      el.removeEventListener("scroll", updateButtons);
      window.removeEventListener("resize", updateButtons);
    };
  }, [updateButtons]);

  const scrollAmount = () => {
    const el = scrollerRef.current;
    const card = el?.querySelector<HTMLAnchorElement>("[data-card]");
    return card ? card.offsetWidth + 16 : 300;
  };

  const goPrev = () => scrollerRef.current?.scrollBy({ left: -scrollAmount(), behavior: "smooth" });
  const goNext = () => scrollerRef.current?.scrollBy({ left:  scrollAmount(), behavior: "smooth" });

  // Drag-to-scroll (desktop only)
  const onMouseDown = (e: MouseEvent<HTMLDivElement>) => {
    if (window.innerWidth <= 767) return;
    const el = scrollerRef.current;
    if (!el) return;
    dragRef.current.isDown = true;
    dragRef.current.startX = e.pageX - el.offsetLeft;
    dragRef.current.scrollLeft = el.scrollLeft;
    setIsDragging(true);
  };
  const onMouseLeave = () => {
    dragRef.current.isDown = false;
    setIsDragging(false);
  };
  const onMouseUp = () => {
    dragRef.current.isDown = false;
    setIsDragging(false);
  };
  const onMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    if (!dragRef.current.isDown) return;
    const el = scrollerRef.current;
    if (!el) return;
    e.preventDefault();
    const x = e.pageX - el.offsetLeft;
    const walk = (x - dragRef.current.startX) * 1.2;
    el.scrollLeft = dragRef.current.scrollLeft - walk;
  };

  // 3D tilt per card (desktop only)
  const onCardEnter = (e: MouseEvent<HTMLAnchorElement>) => {
    e.currentTarget.classList.add("is-hovering");
  };
  const onCardLeave = (e: MouseEvent<HTMLAnchorElement>) => {
    e.currentTarget.classList.remove("is-hovering");
    e.currentTarget.style.transform = "";
  };
  const onCardMove = (e: MouseEvent<HTMLAnchorElement>) => {
    if (window.innerWidth <= 767) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const rotateY = ((x / rect.width)  - 0.5) *  4;
    const rotateX = ((y / rect.height) - 0.5) * -4;
    e.currentTarget.style.transform = `translateY(-6px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
  };

  return (
    <section className="pt-6 md:pt-[34px] pb-9 md:pb-[52px]">
      <div className="mx-auto w-full max-w-[1280px] px-[10px] md:px-5">

        {/* Heading */}
        <div className="relative pl-[13px] md:pl-[18px] mb-3.5 md:mb-5">
          {/* Red gradient bar */}
          <span
            aria-hidden
            className="absolute left-0 top-[3px] md:top-[4px] w-1 md:w-[5px] h-9 md:h-[42px] rounded-full"
            style={{
              background: "linear-gradient(180deg,#ff3b3b,#b8002e)",
              boxShadow: "0 8px 16px rgba(220,38,38,0.22)",
            }}
          />
          <h2 className="m-0 mb-1.5 md:mb-2 text-[22px] md:text-[clamp(28px,3vw,40px)] leading-[1.22] md:leading-[1.18] font-black tracking-[-0.04em] text-[#111827] dark:text-foreground">
            {t("sectionTitle")}
          </h2>
          <p className="m-0 text-[12.5px] md:text-[15px] leading-[1.45] md:leading-[1.55] font-bold text-[#6b7280] md:text-[#4b5563] md:whitespace-nowrap md:overflow-hidden md:text-ellipsis line-clamp-2 md:line-clamp-none">
            {t("sectionDesc")}
          </p>
        </div>

        {/* Slider */}
        <div className="relative">
          {/* Prev button */}
          <button
            type="button"
            aria-label={t("scrollLeft")}
            onClick={goPrev}
            suppressHydrationWarning
            className={[
              "hidden md:flex absolute left-[-16px] top-1/2 -translate-y-1/2 w-[46px] h-[46px] rounded-full bg-white text-[#111827] items-center justify-center cursor-pointer z-10 shadow-[0_10px_24px_rgba(0,0,0,0.16)] transition-all duration-200 hover:bg-[#e11d2e] hover:text-white hover:scale-105",
              canPrev ? "opacity-100 visible" : "opacity-0 invisible pointer-events-none",
            ].join(" ")}
          >
            <ChevronLeft className="w-[22px] h-[22px]" strokeWidth={2.4} />
          </button>

          {/* Grid / scroller */}
          <div
            ref={scrollerRef}
            onMouseDown={onMouseDown}
            onMouseLeave={onMouseLeave}
            onMouseUp={onMouseUp}
            onMouseMove={onMouseMove}
            className={[
              // Horizontal scroller on both mobile + desktop
              "flex gap-2.5 md:gap-4 overflow-x-auto overflow-y-visible scroll-smooth pt-2 md:pt-2.5 pb-3 md:pb-5 px-0.5",
              "[scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden",
              isDragging ? "md:cursor-grabbing md:select-none" : "md:cursor-grab",
            ].join(" ")}
          >
            {CARDS.map((card) => (
              <a
                key={card.id}
                data-card
                href={card.link}
                target="_blank"
                rel="noopener noreferrer"
                onMouseEnter={onCardEnter}
                onMouseLeave={onCardLeave}
                onMouseMove={onCardMove}
                className="group relative block min-w-[240px] max-w-[240px] flex-[0_0_240px] md:min-w-[285px] md:max-w-[285px] md:flex-[0_0_285px] bg-white text-inherit no-underline rounded-2xl md:rounded-3xl overflow-hidden border border-[rgba(229,231,235,0.95)] shadow-[0_6px_16px_rgba(15,23,42,0.08)] md:shadow-[0_10px_28px_rgba(15,23,42,0.08)] transition-all duration-300 hover:shadow-[0_18px_42px_rgba(15,23,42,0.15)] hover:border-[rgba(220,38,38,0.28)] will-change-transform"
              >
                {/* Image */}
                <div className="relative w-full aspect-[1.18/1] md:aspect-[16/9] overflow-hidden bg-[#f3f4f6]">
                  <Image
                    src={card.image}
                    alt={t(card.altKey)}
                    fill
                    sizes="(max-width: 767px) 50vw, 285px"
                    className="object-cover transition-transform duration-[550ms] ease-out group-hover:scale-[1.055]"
                  />
                  {/* Bottom gradient overlay */}
                  <div
                    aria-hidden
                    className="absolute inset-0 z-[1] pointer-events-none"
                    style={{ background: "linear-gradient(180deg,rgba(0,0,0,0) 42%,rgba(0,0,0,0.55) 100%)" }}
                  />

                  {/* Icon badge */}
                  <div
                    className="absolute left-2 top-2 md:left-3 md:top-3 w-[42px] h-[42px] md:w-[58px] md:h-[58px] rounded-full border-2 md:border-4 border-white flex items-center justify-center z-[4] overflow-hidden p-1.5 md:p-2 transition-all duration-[350ms]
                      group-hover:scale-[1.08] md:group-hover:scale-[1.13]
                      md:group-hover:rotate-[-6deg]
                      group-[.is-hovering]:md:animate-[clr-icon-float_1.35s_ease-in-out_infinite]"
                    style={{
                      background: "linear-gradient(135deg,#ff3030,#b8002e)",
                      boxShadow: "0 10px 22px rgba(185,28,28,0.36)",
                    }}
                  >
                    {/* Shimmer */}
                    <span
                      aria-hidden
                      className="pointer-events-none absolute -inset-[40%] z-[1] -translate-x-[120%] rotate-[18deg] transition-transform duration-[650ms] ease-out group-hover:translate-x-[120%]"
                      style={{
                        background: "linear-gradient(120deg,transparent 35%,rgba(255,255,255,0.46) 50%,transparent 65%)",
                      }}
                    />
                    <Image
                      src={ICON_SRC}
                      alt={`${t(card.titleKey)} icon`}
                      width={42}
                      height={42}
                      className="relative z-[2] w-full h-full object-contain transition-transform duration-[350ms] group-hover:scale-[1.08]"
                      style={{ filter: "brightness(0) invert(1)" }}
                    />
                  </div>

                  {/* Tags */}
                  <div className="absolute left-1.5 md:left-2.5 right-1.5 md:right-2.5 bottom-1.5 md:bottom-2.5 flex gap-1 md:gap-1.5 flex-nowrap overflow-hidden z-[3]">
                    {card.tagKeys.map((tagKey) => (
                      <span
                        key={tagKey}
                        className="flex-none px-1.5 py-1 md:px-2 md:py-[7px] rounded-full bg-white/95 text-[#b91c1c] border border-white/80 text-[8.5px] md:text-[11px] leading-none font-black shadow-[0_4px_12px_rgba(0,0,0,0.08)]"
                      >
                        {t(tagKey)}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Info */}
                <div className="p-[9px] pb-2.5 md:p-[15px] md:pb-4">
                  <h3 className="m-0 mb-1.5 md:mb-2 text-[12.5px] md:text-[17px] leading-[1.2] font-black tracking-[-0.03em] text-[#111827] whitespace-nowrap overflow-hidden text-ellipsis transition-colors duration-200 group-hover:text-[#dc2626]">
                    {t(card.titleKey)}
                  </h3>
                  <p className="m-0 mb-1 md:mb-2 text-[13px] md:text-[18px] leading-[1.1] font-black text-[#dc2626] whitespace-nowrap overflow-hidden text-ellipsis">
                    {t(card.priceKey)}
                  </p>
                  <p className="m-0 text-[10.5px] md:text-[13px] leading-[1.28] md:leading-[1.35] font-bold text-[#4b5563] line-clamp-2">
                    {t(card.noteKey)}
                  </p>
                </div>
              </a>
            ))}
          </div>

          {/* Next button */}
          <button
            type="button"
            aria-label={t("scrollRight")}
            onClick={goNext}
            suppressHydrationWarning
            className={[
              "hidden md:flex absolute right-[-16px] top-1/2 -translate-y-1/2 w-[46px] h-[46px] rounded-full bg-white text-[#111827] items-center justify-center cursor-pointer z-10 shadow-[0_10px_24px_rgba(0,0,0,0.16)] transition-all duration-200 hover:bg-[#e11d2e] hover:text-white hover:scale-105",
              canNext ? "opacity-100 visible" : "opacity-0 invisible pointer-events-none",
            ].join(" ")}
          >
            <ChevronRight className="w-[22px] h-[22px]" strokeWidth={2.4} />
          </button>
        </div>

      </div>
    </section>
  );
}
