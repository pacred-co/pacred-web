"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Phone, MessageCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { trackCtaClick } from "@/lib/analytics";
import { TrackedExternalLink } from "@/components/analytics/tracked-link";
import { getPublicSalesRoster } from "@/actions/sales-roster";

const LINE_URL = "/line";
const FALLBACK_IMAGE = "/images/pacred-logo-red.png";

/**
 * next/image only accepts a leading-slash path or an absolute http(s) URL.
 * Legacy `tb_admin.adminPicture` can hold a bare filename ("user.jpg") with no
 * leading slash — that makes next/image throw "Failed to construct 'URL'" and
 * crash the whole ContactSales section (→ the home page error boundary).
 * Coerce anything next/image can't load to the brand-logo fallback.
 */
function safeImageSrc(src: string | null | undefined): string {
  if (src && (src.startsWith("/") || src.startsWith("http://") || src.startsWith("https://"))) {
    return src;
  }
  return FALLBACK_IMAGE;
}

/**
 * Fisher-Yates shuffle (copy) → first N. Owner 2026-06-23: "สุ่ม 3 การ์ด ตลอด".
 * Uses Math.random → CLIENT-ONLY (call inside an effect, never during SSR/initial
 * render) or the server/client first paint diverge → hydration mismatch.
 */
function pickRandom<T>(list: T[], n: number): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, n);
}

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
  // เตย removed from the sales team (ปอน 2026-06-25 · owner-confirmed "ไม่มีเตย เอาออก").
  // Real removal = the DB flag (tb_admin.admin_toey.adminStatusSale='0' via
  // /admin/admins/sales-team); dropping the curated entry keeps the empty-roster
  // fallback from resurrecting a departed rep. i18n keys taglineToey/altToey stay.
  { id: "win",  name: "วิน",  roleKey: "roleLogistics", taglineKey: "taglineWin",  phone: "062-603-0456", image: "/images/Character_Icon/win01.png",  altKey: "altWin" },
  // CS พลอย card removed from the on-site display (ปอน 2026-06-08 — "เอา cs ploy
  // ออกจากหน้าเซลล์"). The i18n keys (taglinePloy/altPloy/roleCs) + the central
  // CONTACT.phoneCs / sidebar CS fallback stay; only the rendered card is gone.
];

interface ContactSalesProps {
  /** Hide the bottom assurance strip (ตอบไว · ปรึกษาฟรี · 14+ ปี) */
  hideAssuranceStrip?: boolean;
  /** Tighter vertical padding — for pages with many sections. */
  compact?: boolean;
}

export function ContactSales({ hideAssuranceStrip = false, compact = false }: ContactSalesProps = {}) {
  const t = useTranslations("contactSales");

  // Live roster (owner 2026-06-15 "ผูกกันออโต้" · 2026-06-23 "ต่อกับ user จริง · คน
  // โดนปิดใช้งานหายไปเลย · สุ่ม 3 การ์ดตลอด"). Initial state = a DETERMINISTIC 3 (no
  // Math.random during the SSR/first paint → no hydration mismatch); the random
  // pick happens post-mount in the effect. SEO crawlers still see 3 real cards.
  const [displaySales, setDisplaySales] = useState<SalesPerson[]>(() => CURATED_SALES.slice(0, 3));
  useEffect(() => {
    let alive = true;
    getPublicSalesRoster()
      .then((reps) => {
        if (!alive) return;
        // Display = the LIVE active sales pool. getActiveSalesReps already filters
        // adminStatusA='1', so a deactivated rep is gone here automatically — no
        // stale curated card shows. Each live rep keeps its curated art/copy when
        // matched, else a default card. Empty/failed read → the curated marketing
        // list (never blank).
        const source: SalesPerson[] =
          reps.length > 0
            ? reps.map((r) => {
                const shortId = r.adminID.replace(/^admin_/, "");
                const curated = CURATED_SALES.find((c) => c.name === r.name || c.id === shortId);
                if (curated) return curated;
                const photo = safeImageSrc(r.photo);
                return {
                  id: r.adminID,
                  name: r.name,
                  roleKey: "roleSales",
                  taglineKey: "taglineGeneric",
                  phone: r.phone,
                  image: photo,
                  useContain: photo === FALLBACK_IMAGE,
                  altKey: "altGeneric",
                };
              })
            : CURATED_SALES;
        // Always a RANDOM 3, re-rolled every page load (this effect runs each mount).
        setDisplaySales(pickRandom(source, 3));
      })
      .catch(() => { if (alive) setDisplaySales(pickRandom(CURATED_SALES, 3)); });
    return () => { alive = false; };
  }, []);

  return (
    <section id="contact-sales" className={`relative ${compact ? "py-2 md:py-4" : "py-2.5 md:py-14"}`}>
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

        {/* Team cards — always a RANDOM 3 (owner 2026-06-23 "สุ่ม 3 การ์ด ตลอด"), one
            row: 3-up static grid on desktop (never wraps now); on mobile ONE
            horizontal row showing 2 at a time, swipe for the 3rd (ปอน 2026-06-21).
            Internals scale down on mobile so the narrow 2-up card never clips the
            phone pill (verified 360 + 320px). */}
        <div className="mt-4 md:mt-10 flex gap-3 overflow-x-auto snap-x snap-mandatory pb-2 -mx-[10px] px-[10px] items-stretch [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:grid md:grid-cols-3 md:gap-5 md:overflow-visible md:mx-0 md:px-0 md:pb-0 md:snap-none">
          {displaySales.map((s) => (
            <div
              key={s.id}
              className="shrink-0 w-[46%] max-w-[300px] snap-start md:w-auto md:max-w-none rounded-2xl md:rounded-3xl border border-border bg-white dark:bg-surface shadow-[0_8px_20px_rgba(15,23,42,0.06)] transition-all duration-300 md:hover:scale-[1.03] md:hover:z-10 md:hover:shadow-[0_16px_36px_rgba(15,23,42,0.13)]"
            >
              {/* LINE-OA-style card (ปอน 2026-06-20): vertical + centred — big
                  circular avatar → name → role → red phone pill → tagline →
                  ติดต่อ (LINE). Same on desktop + mobile. */}
              <div className="flex h-full flex-col items-center p-3 md:p-6 text-center">
                {/* Big circular avatar */}
                <div className="relative w-[84px] h-[84px] md:w-[124px] md:h-[124px] rounded-full overflow-hidden shrink-0 border-4 border-white bg-white shadow-[0_10px_24px_rgba(179,0,0,0.20)] ring-2 ring-primary-200 dark:ring-primary-900/40">
                  <Image
                    src={safeImageSrc(s.image)}
                    alt={t(s.altKey)}
                    fill
                    sizes="130px"
                    loading="eager"
                    className={s.useContain ? "object-contain p-3" : "object-cover"}
                  />
                </div>

                {/* Name + ONLINE */}
                <div className="mt-2.5 md:mt-3 flex items-center justify-center gap-1 md:gap-1.5">
                  <h3 className="text-[16px] md:text-[23px] font-black leading-none tracking-tight text-[#111827] dark:text-white">
                    {s.name}
                  </h3>
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border border-green-300 dark:border-green-700 text-green-600 dark:text-green-400 text-[8px] md:text-[8.5px] font-black tracking-[0.08em]">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                    ONLINE
                  </span>
                </div>

                {/* Role */}
                <div className="mt-1 text-[11px] md:text-[11px] font-black uppercase tracking-[0.08em] md:tracking-[0.10em] text-primary-600">
                  {t(s.roleKey)}
                </div>

                {/* Phone — red pill */}
                <a
                  href={`tel:${s.phone.replace(/-/g, "")}`}
                  onClick={() => trackCtaClick("sales_phone", `home_sales_${s.name}`, { rep: s.name, role: s.roleKey })}
                  className="mt-2 inline-flex items-center justify-center gap-1 md:gap-1.5 rounded-full bg-primary-600 px-2.5 py-1.5 md:px-4 text-[11.5px] md:text-[14px] font-black tracking-tight text-white shadow-[0_6px_16px_rgba(179,0,0,0.28)] hover:bg-primary-700 transition-colors"
                >
                  <Phone className="w-3 h-3 md:w-3.5 md:h-3.5 shrink-0" strokeWidth={2.8} />
                  {s.phone}
                </a>

                {/* Tagline */}
                <p className="mt-2 md:mt-2.5 text-[11px] md:text-[13px] leading-[1.45] md:leading-[1.5] font-medium text-muted line-clamp-2 min-h-[32px] md:min-h-[36px]">
                  {t(s.taglineKey)}
                </p>

                {/* ติดต่อ — LINE chat (full-width, pinned to the card bottom) */}
                <TrackedExternalLink
                  href={LINE_URL}
                  cta="line_consult"
                  surface="contact_sales"
                  ctaProps={{ rep: s.name, role: s.roleKey }}
                  className="mt-auto pt-2.5 md:pt-3 w-full"
                >
                  <span className="inline-flex w-full items-center justify-center gap-1.5 h-10 md:h-11 rounded-xl text-[12px] md:text-[13.5px] font-black bg-[#06C755] text-white hover:bg-[#05a548] shadow-[0_8px_18px_rgba(6,199,85,0.30)] transition-all duration-300">
                    <MessageCircle className="w-4 h-4 shrink-0" strokeWidth={2.6} fill="currentColor" />
                    {t("chatLine")}
                  </span>
                </TrackedExternalLink>
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
