import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ArrowRight } from "lucide-react";

type FeatureKey = "f1" | "f2" | "f3" | "f4" | "f5" | "f6";
type Feature = {
  key: FeatureKey;
  iconSrc: string;
};

const ICON_BASE = "/images/home/iconfloating";

const FEATURES: Feature[] = [
  { key: "f1", iconSrc: `${ICON_BASE}/pcs-shop.png` },
  { key: "f2", iconSrc: `${ICON_BASE}/people.png` },
  { key: "f3", iconSrc: `${ICON_BASE}/checklistred.png` },
  { key: "f4", iconSrc: `${ICON_BASE}/transfast.png` },
  { key: "f5", iconSrc: `${ICON_BASE}/pcs-wallet.png` },
  { key: "f6", iconSrc: `${ICON_BASE}/pcs-line-notify.png` },
];

export function WhyPacred() {
  const t = useTranslations("whyPacred");

  return (
    <section id="why-pacred" className="relative py-8 md:py-12">
      <div className="mx-auto w-full max-w-[1140px] px-[10px]">

        {/* ─── Header ─── */}
        <div className="mx-auto w-full max-w-[1120px]">
          <div className="flex items-center gap-2 mb-1.5 text-primary-600 text-[13px] font-black tracking-[0.08em] uppercase">
            <span className="w-2 h-2 rounded-full bg-primary-600 shrink-0" />
            {t("eyebrow")}
          </div>
          <h2 className="text-[26px] md:text-[38px] leading-[1.18] md:leading-[1.15] font-black tracking-[-0.04em] text-[#111827] dark:text-white">
            {t("titlePart1")}{" "}
            <span className="text-primary-600">{t("titleHighlight")}</span>
          </h2>
          <p className="mt-2 text-[13px] md:text-[15px] leading-[1.55] font-medium text-muted md:whitespace-nowrap md:overflow-hidden md:text-ellipsis">
            {t("subtitle")}
          </p>
        </div>

        {/* ─── Feature grid 6 cards (horizontal swipe on mobile) ─── */}
        <div className="mx-auto mt-6 md:mt-8 w-full max-w-[1120px] relative">
          <div className="flex overflow-x-auto gap-3 pb-2 -mx-[10px] px-[10px] snap-x snap-mandatory sm:mx-0 sm:px-0 sm:pb-0 sm:overflow-visible sm:grid sm:grid-cols-2 lg:grid-cols-3 md:gap-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {FEATURES.map((f, i) => {
              const num = String(i + 1).padStart(2, "0");
              const fTitle = t(`${f.key}Title`);
              const fSub = t(`${f.key}Sub`);
              const fDesc = t(`${f.key}Desc`);
              return (
                <Link
                  key={f.key}
                  href="/register"
                  aria-label={t("registerAria", { title: fTitle })}
                  className="group relative shrink-0 w-[78%] min-w-[260px] sm:w-auto sm:min-w-0 snap-start block bg-white dark:bg-surface rounded-2xl border border-border p-5 md:p-6 shadow-[0_4px_14px_rgba(15,23,42,0.05)] hover:shadow-[0_24px_50px_-12px_rgba(179,0,0,0.18)] hover:border-primary-300 dark:hover:border-primary-800 hover:-translate-y-1 transition-all duration-400 overflow-hidden cursor-pointer"
                >
                  {/* Decorative dot pattern — appears on hover */}
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-[0.05] dark:group-hover:opacity-[0.08] transition-opacity duration-500"
                    style={{
                      backgroundImage: "radial-gradient(circle at 1px 1px, #b30000 1px, transparent 0)",
                      backgroundSize: "16px 16px",
                    }}
                  />

                  {/* Top animated accent line */}
                  <div
                    aria-hidden
                    className="pointer-events-none absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-primary-500 to-transparent opacity-0 group-hover:opacity-100 -translate-x-full group-hover:translate-x-0 transition-all duration-700"
                  />

                  {/* Hover gradient blob */}
                  <div
                    aria-hidden
                    className="pointer-events-none absolute -top-16 -right-16 w-44 h-44 rounded-full bg-gradient-to-br from-primary-200/80 to-primary-400/40 dark:from-primary-900/40 dark:to-primary-700/20 blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                  />

                  {/* Number indicator */}
                  <div className="absolute top-4 right-4 md:top-5 md:right-5 flex items-center gap-1 text-muted/40 group-hover:text-primary-600/60 transition-colors duration-300">
                    <span className="text-[10px] font-bold tracking-[0.2em]">NO.</span>
                    <span className="text-[18px] md:text-[20px] font-black tabular-nums leading-none tracking-tight">{num}</span>
                  </div>

                  {/* Icon — grayscale offline → color on hover */}
                  <div className="relative w-14 h-14 md:w-16 md:h-16 mb-4 flex items-center justify-center rounded-xl md:rounded-2xl bg-gray-100/70 dark:bg-background border border-border group-hover:bg-primary-50 dark:group-hover:bg-primary-900/20 group-hover:border-primary-200 dark:group-hover:border-primary-900/60 transition-all duration-400">
                    <Image
                      src={f.iconSrc}
                      alt=""
                      width={64}
                      height={64}
                      className="relative w-[42px] h-[42px] md:w-[48px] md:h-[48px] object-contain grayscale opacity-50 saturate-0 transition-all duration-400 group-hover:grayscale-0 group-hover:opacity-100 group-hover:saturate-100 group-hover:scale-110 group-hover:-rotate-6"
                    />
                    {/* Accent dot */}
                    <div className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-gradient-to-br from-yellow-300 to-amber-400 border-2 border-white dark:border-surface shadow-[0_2px_6px_rgba(0,0,0,0.15)] scale-0 group-hover:scale-100 transition-transform duration-300" />
                  </div>

                  {/* Title */}
                  <h3 className="relative text-[15px] md:text-[17px] font-black text-[#111827] dark:text-white leading-tight tracking-tight mb-1 group-hover:text-primary-700 dark:group-hover:text-primary-300 transition-colors duration-300">
                    {fTitle}
                  </h3>

                  {/* Subtitle */}
                  <p className="relative text-[12px] md:text-[12.5px] font-bold text-muted group-hover:text-primary-600 leading-snug mb-2 transition-colors duration-300">
                    {fSub}
                  </p>

                  {/* Description */}
                  <p className="relative text-[12.5px] md:text-[13px] leading-[1.55] text-muted">
                    {fDesc}
                  </p>

                  {/* Bottom accent — Register CTA reveal on hover */}
                  <div className="relative mt-4 flex items-center justify-between gap-2">
                    <div className="h-[2px] flex-1 bg-border overflow-hidden rounded-full">
                      <div className="h-full w-0 group-hover:w-full bg-gradient-to-r from-primary-500 to-primary-700 transition-all duration-500 ease-out rounded-full" />
                    </div>
                    <div className="flex items-center gap-1 text-[11px] font-black text-primary-600 opacity-0 group-hover:opacity-100 translate-x-2 group-hover:translate-x-0 transition-all duration-300 whitespace-nowrap">
                      {t("registerCta")}
                      <ArrowRight className="w-3 h-3" strokeWidth={3} />
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
          {/* Swipe indicator — mobile only */}
          <div className="sm:hidden pointer-events-none absolute right-0 top-0 bottom-0 w-10 bg-gradient-to-l from-background via-background/85 to-transparent flex items-center justify-end pr-1">
            <svg className="w-4 h-4 text-primary-600 animate-pulse" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6"/></svg>
          </div>
        </div>

      </div>
    </section>
  );
}
