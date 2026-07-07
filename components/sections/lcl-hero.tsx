import Image from "next/image";
import { getTranslations } from "next-intl/server";

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
 * LCL hero — page headline.
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
