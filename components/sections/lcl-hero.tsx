import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { TrackedExternalLink } from "@/components/analytics/tracked-link";

const LINE_URL = "/line";

// LCL service scope — bullet list shown in the primary-tinted card.
// Each is a brand PNG icon (rendered as-is); the benefit line is keyed by index.
const SCOPE: { icon: string }[] = [
  { icon: "/images/hero-section/icon-draf/transfast.png" },
  { icon: "/images/hero-section/icon-draf/customclearance.png" },
  { icon: "/images/hero-section/icon-draf/checklistred.png" },
  { icon: "/images/hero-section/icon-draf/transfast.png" },
  { icon: "/images/hero-section/icon-draf/billingicon.png" },
  { icon: "/images/hero-section/icon-draf/people.png" },
];

/**
 * LCL hero — page headline + the tappable red LINE scope-banner.
 * The bullet-list card (LclScopeBullets) is rendered inside LclWhyPacred
 * lower on the page per owner 2026-06-05. LCL copy hardcoded.
 */
export async function LclHero() {
  const t = await getTranslations("lclHero");
  return (
    <section className="relative pt-1 md:pt-2 pb-1 md:pb-2">
      <div className="relative mx-auto w-full max-w-[1140px] px-4 md:px-5">
        <h1 className="text-[20px] md:text-[clamp(18px,2.2vw,28px)] md:whitespace-nowrap leading-[1.25] md:leading-[1.2] font-black tracking-[-0.025em] text-[#111827] dark:text-white">
          {t.rich("h1", {
            highlight: (chunks) => <span className="text-primary-600">{chunks}</span>,
            sep: (chunks) => <span className="text-muted font-bold">{chunks}</span>,
            brand: (chunks) => <span className="text-primary-600 whitespace-nowrap">{chunks}</span>,
          })}
        </h1>

        {/* ─── Service scope banner — tappable LINE link, headline only ─── */}
        <div
          className="group relative mt-3 md:mt-4 overflow-hidden rounded-2xl text-white shadow-[0_12px_32px_rgba(179,0,0,0.30)] transition-all duration-300 hover:shadow-[0_18px_44px_rgba(179,0,0,0.45)] hover:-translate-y-0.5"
          style={{ background: "linear-gradient(135deg, #d60000 0%, #b30000 45%, #8c0000 100%)" }}
        >
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-40 mix-blend-overlay"
            style={{ background: "radial-gradient(circle at 25% 50%, rgba(253,224,71,0.25) 0%, transparent 55%)" }}
          />
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-[0.08]"
            style={{
              backgroundImage: "radial-gradient(circle, white 1px, transparent 1px)",
              backgroundSize: "16px 16px",
            }}
          />

          {/* LINE click overlay — covers entire banner */}
          <TrackedExternalLink
            href={LINE_URL}
            cta="line_consult"
            surface="lcl_scope_banner"
            aria-label={t("bannerAria")}
            className="absolute inset-0 z-10"
          >
            <span className="sr-only">{t("bannerSrOnly")}</span>
          </TrackedExternalLink>

          <div className="relative pointer-events-none px-4 md:px-6 py-4 md:py-5">
            <h3 className="text-[18px] sm:text-[22px] md:text-[30px] font-black text-white tracking-tight leading-snug md:whitespace-nowrap [text-shadow:0_2px_6px_rgba(0,0,0,0.4)]">
              <span className="inline">
                {t("bannerTitlePrefix")}{" "}
                <span className="text-yellow-300 text-[22px] sm:text-[26px] md:text-[36px] [text-shadow:0_2px_8px_rgba(0,0,0,0.55)]">
                  {t("bannerTitleHighlight")}
                </span>
              </span>
              {/* Mobile: break here so รถ/เรือ prices sit together on line 2 */}
              <br aria-hidden className="md:hidden" />{" "}
              <span className="inline-block whitespace-nowrap align-middle">
                {t("bannerModeCar")}{" "}
                <span className="text-yellow-300 [text-shadow:0_2px_8px_rgba(0,0,0,0.55)]">฿4,900</span>{" "}
                {t("bannerModeSea")}{" "}
                <span className="text-yellow-300 [text-shadow:0_2px_8px_rgba(0,0,0,0.55)]">฿2,900</span>{" "}
                {/* Transport icons — inline so they flow with the title text */}
                <span className="inline-flex items-center gap-0.5 align-middle">
                  <Image src="/images/iconwhite/ship.png" alt="" width={28} height={28} aria-hidden className="w-5 h-5 md:w-7 md:h-7 object-contain" />
                  <Image src="/images/iconwhite/box.png"  alt="" width={28} height={28} aria-hidden className="w-5 h-5 md:w-7 md:h-7 object-contain" />
                </span>
              </span>
            </h3>
            {/* Desktop-only subtitle — origin warehouses + ports */}
            <p className="hidden md:block mt-2 text-[13px] font-medium text-white/70 leading-snug tracking-tight whitespace-nowrap">
              {t("bannerSubtitle")}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * Primary-tinted bullet-list card (LCL service highlights). Embedded in
 * LclWhyPacred (owner 2026-06-05) — just the card, no section wrapper.
 */
export async function LclScopeBullets() {
  const t = await getTranslations("lclHero");
  return (
    <div className="rounded-2xl md:rounded-3xl border border-primary-200 dark:border-primary-800/60 bg-gradient-to-br from-primary-50/60 via-white to-primary-50/30 dark:from-primary-900/15 dark:via-surface dark:to-primary-900/10 p-4 md:p-6 shadow-[0_8px_22px_rgba(179,0,0,0.06)]">
      <ul className="flex flex-col gap-y-3 md:gap-y-3.5 text-[14px] md:text-[16px] leading-[1.55] text-foreground/95">
        {SCOPE.map((item, idx) => (
          <li key={idx} className="flex items-start gap-3">
            <Image src={item.icon} alt="" width={32} height={32} aria-hidden className="w-6 h-6 md:w-8 md:h-8 shrink-0 mt-0.5 object-contain" />
            <span>{t(`scope${idx}`)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
