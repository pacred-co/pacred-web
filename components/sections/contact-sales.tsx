"use client";

import Image from "next/image";
import { Phone, Sparkles, Headset, Award, MessageCircle } from "lucide-react";
import { trackCtaClick } from "@/lib/analytics";

const LINE_URL = "/line";

type SalesPerson = {
  name: string;
  role: string;
  tagline: string;
  phone: string;
  image: string;
  useContain?: boolean;
  badge: string;
  badgeIcon: typeof Award;
  alt: string;
};

const SALES: SalesPerson[] = [
  {
    name: "วิน",
    role: "Freight Specialist",
    tagline: "นำเข้าทุก Port ทุก Term ปิดดีลให้จบในที่เดียว",
    phone: "066-125-3007",
    image: "/images/Character_Icon/win.png",
    badge: "FCL / LCL Expert",
    badgeIcon: Award,
    alt: "เซลล์วิน Pacred ผู้เชี่ยวชาญ Freight",
  },
  {
    name: "แนท",
    role: "Cargo Specialist",
    tagline: "นำเข้าสั่งซื้อจีน ทุกแพลตฟอร์ม ครบจบในที่เดียว",
    phone: "02-421-3325",
    image: "/images/pacred-logo-red.png",
    useContain: true,
    badge: "China Cargo Expert",
    badgeIcon: Sparkles,
    alt: "เซลล์แนท Pacred ผู้เชี่ยวชาญ Cargo จีน",
  },
  {
    name: "พลอย",
    role: "Customs Specialist",
    tagline: "เคลียร์สินค้าติดด่าน เร็ว ปลอดภัย การันตีจบ",
    phone: "066-090-1217",
    image: "/images/Character_Icon/ploy.png",
    badge: "Customs Clearance",
    badgeIcon: Headset,
    alt: "เซลล์พลอย Pacred ผู้เชี่ยวชาญด่านศุลกากร",
  },
];

interface ContactSalesProps {
  /** Sales person name to feature in the middle slot (defaults to "แนท") */
  featuredName?: string;
  /** Hide the bottom assurance strip (ตอบไว · ปรึกษาฟรี · 14+ ปี) */
  hideAssuranceStrip?: boolean;
}

export function ContactSales({ featuredName = "แนท", hideAssuranceStrip = false }: ContactSalesProps = {}) {
  // Reorder so the requested person lands at index 1 (the "featured" middle card)
  const featuredIdx = SALES.findIndex((s) => s.name === featuredName);
  const orderedSales: SalesPerson[] =
    featuredIdx < 0 || featuredIdx === 1
      ? SALES
      : (() => {
          const featured = SALES[featuredIdx];
          const rest = SALES.filter((s) => s.name !== featuredName);
          return [rest[0], featured, rest[1]];
        })();

  return (
    <section id="contact-sales" className="relative py-5 md:py-14 overflow-hidden">
      {/* Decorative background */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-0"
        style={{
          backgroundImage:
            "radial-gradient(60% 50% at 20% 10%, rgba(179,0,0,0.06), transparent 60%), radial-gradient(50% 40% at 90% 100%, rgba(179,0,0,0.05), transparent 60%)",
        }}
      />

      <div className="relative mx-auto w-full max-w-[1140px] px-[10px]">
        {/* Heading */}
        <div className="mx-auto w-full max-w-[1120px]">
          <div className="flex items-center gap-1.5 md:gap-2 mb-1 md:mb-1.5 text-primary-600 text-[10.5px] md:text-[13px] font-black tracking-[0.08em] uppercase">
            <span className="w-1.5 h-1.5 md:w-2 md:h-2 rounded-full bg-primary-600 shrink-0" />
            CONTACT OUR SALES TEAM
          </div>
          <h2 className="text-[20px] md:text-[38px] leading-[1.2] md:leading-[1.15] font-black tracking-[-0.03em] md:tracking-[-0.04em] text-[#111827] dark:text-white">
            ทักทีมเซลล์{" "}
            <span className="text-primary-600">Pacred</span> ได้เลย
          </h2>
          <p className="mt-2 text-[12px] md:text-[15px] leading-[1.5] md:leading-[1.55] font-medium text-muted max-w-[680px]">
            เลือกผู้เชี่ยวชาญตามบริการที่คุณต้องการ — ตอบเร็วทุกช่องทาง ตลอด 24 ชม.
          </p>
        </div>

        {/* 3 sales cards — horizontal swipe on mobile, 3-col grid on desktop */}
        <div className="mt-4 md:mt-10 flex md:grid md:grid-cols-3 gap-3 md:gap-5 overflow-x-auto md:overflow-visible scroll-smooth snap-x snap-mandatory pb-2 md:pb-0 -mx-[10px] md:mx-0 px-[10px] md:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {orderedSales.map((s, i) => {
            const BadgeIcon = s.badgeIcon;
            const featured = i === 1;
            // Mobile flex order — featured card first, others follow desktop order
            const mobileOrder = featured ? "order-1" : i === 0 ? "order-2" : "order-3";
            return (
              <div
                key={s.name}
                className={[
                  "group relative rounded-2xl md:rounded-3xl overflow-hidden border transition-all duration-400 hover:-translate-y-1",
                  "shrink-0 w-[82%] max-w-[300px] snap-start md:w-auto md:max-w-none md:shrink",
                  `${mobileOrder} md:order-none`,
                  featured
                    ? "bg-gradient-to-br from-primary-600 via-primary-700 to-primary-800 text-white border-primary-700 shadow-[0_18px_40px_rgba(179,0,0,0.30)] hover:shadow-[0_28px_60px_rgba(179,0,0,0.42)]"
                    : "bg-white dark:bg-surface text-[#111827] dark:text-white border-border shadow-[0_8px_20px_rgba(15,23,42,0.06)] hover:shadow-[0_18px_42px_rgba(179,0,0,0.14)] hover:border-primary-300 dark:hover:border-primary-800",
                ].join(" ")}
              >
                {/* Decorative dots pattern (featured) */}
                {featured && (
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-0 opacity-[0.08]"
                    style={{
                      backgroundImage:
                        "radial-gradient(circle at 1px 1px, white 1px, transparent 0)",
                      backgroundSize: "16px 16px",
                    }}
                  />
                )}

                {/* Top accent strip */}
                <div
                  className={
                    featured
                      ? "h-1.5 bg-gradient-to-r from-yellow-300 via-amber-400 to-yellow-300"
                      : "h-1 bg-gradient-to-r from-primary-400 via-primary-600 to-primary-400"
                  }
                />

                <div className="relative p-4 md:p-5">
                  {/* Header — avatar + name */}
                  <div className="flex items-center gap-3">
                    <div
                      className={[
                        "relative w-[64px] h-[64px] md:w-[72px] md:h-[72px] rounded-full overflow-hidden shrink-0 border-[3px] shadow-[0_6px_14px_rgba(0,0,0,0.18)]",
                        featured ? "border-white/85 bg-white" : "border-white bg-white",
                      ].join(" ")}
                    >
                      <Image
                        src={s.image}
                        alt={s.alt}
                        fill
                        sizes="72px"
                        className={s.useContain ? "object-contain p-2" : "object-cover"}
                      />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <h3
                          className={[
                            "text-[19px] md:text-[22px] font-black leading-none tracking-tight",
                            featured ? "text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.2)]" : "",
                          ].join(" ")}
                        >
                          {s.name}
                        </h3>
                        <span
                          className={[
                            "inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[8.5px] md:text-[9px] font-black tracking-[0.08em]",
                            featured
                              ? "bg-yellow-300/20 text-yellow-200"
                              : "bg-primary-50 text-primary-600 dark:bg-primary-900/30 dark:text-primary-300",
                          ].join(" ")}
                        >
                          ONLINE
                        </span>
                      </div>
                      <div
                        className={[
                          "mt-0.5 inline-flex items-center gap-1 text-[10.5px] md:text-[11.5px] font-black uppercase tracking-[0.08em]",
                          featured ? "text-yellow-200" : "text-primary-600",
                        ].join(" ")}
                      >
                        <BadgeIcon className="w-3 h-3" strokeWidth={2.6} />
                        {s.role}
                      </div>
                    </div>
                  </div>

                  {/* Tagline */}
                  <p
                    className={[
                      "mt-3 md:mt-3.5 text-[12.5px] md:text-[13.5px] leading-[1.55] font-medium line-clamp-2",
                      featured ? "text-white/90" : "text-muted",
                    ].join(" ")}
                  >
                    {s.tagline}
                  </p>

                  {/* Specialty badge */}
                  <div
                    className={[
                      "mt-3 inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10.5px] md:text-[11px] font-black",
                      featured
                        ? "bg-white/15 text-white border border-white/15"
                        : "bg-primary-50 text-primary-600 dark:bg-primary-900/30 dark:text-primary-300 border border-primary-100 dark:border-primary-900/40",
                    ].join(" ")}
                  >
                    <Sparkles className="w-3 h-3" strokeWidth={2.5} />
                    {s.badge}
                  </div>

                  {/* Action buttons */}
                  <div className="mt-4 md:mt-5 grid grid-cols-2 gap-2">
                    <a
                      href={`tel:${s.phone.replace(/-/g, "")}`}
                      onClick={() => trackCtaClick("sales_phone", `home_sales_${s.name}`, { rep: s.name, role: s.role })}
                      className={[
                        "inline-flex items-center justify-center gap-1.5 h-10 rounded-xl text-[12px] md:text-[12.5px] font-black border transition-all duration-300",
                        featured
                          ? "bg-white/12 text-white border-white/25 hover:bg-white/20 hover:border-white/45"
                          : "bg-white dark:bg-background text-[#111827] dark:text-white border-border hover:border-primary-400 hover:text-primary-700",
                      ].join(" ")}
                    >
                      <Phone className="w-3.5 h-3.5" strokeWidth={2.6} />
                      {s.phone}
                    </a>
                    <a
                      href={LINE_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => trackCtaClick("sales_line", `home_sales_${s.name}`, { rep: s.name, role: s.role })}
                      className={[
                        "relative inline-flex items-center justify-center gap-1.5 h-10 rounded-xl text-[12px] md:text-[12.5px] font-black transition-all duration-300 overflow-hidden",
                        featured
                          ? "bg-white text-primary-700 hover:bg-yellow-50 shadow-[0_8px_18px_rgba(255,255,255,0.18)]"
                          : "bg-[#06C755] text-white hover:bg-[#05a548] shadow-[0_8px_18px_rgba(6,199,85,0.30)]",
                      ].join(" ")}
                    >
                      <MessageCircle className="w-3.5 h-3.5" strokeWidth={2.6} fill="currentColor" />
                      ทักไลน์
                    </a>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Bottom assurance strip */}
        {!hideAssuranceStrip && (
        <div className="mt-6 md:mt-8 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[11.5px] md:text-[12.5px] font-bold text-muted">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            ตอบไว ภายใน 5 นาที
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
            ปรึกษาฟรี ไม่มีค่าใช้จ่าย
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
            ทีมมืออาชีพ 14+ ปี
          </span>
        </div>
        )}
      </div>
    </section>
  );
}
