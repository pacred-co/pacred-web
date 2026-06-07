import Image from "next/image";
import { Check, Phone, MessageCircle, Sparkles, ArrowRight } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { TrackedExternalLink } from "@/components/analytics/tracked-link";

type Feature = { tag: string; leadKey: string; textKey: string };

const FEATURES: Feature[] = [
  {
    tag: "ALL CHANNELS",
    leadKey: "featAllChannelsLead",
    textKey: "featAllChannelsText",
  },
  {
    tag: "REGISTER",
    leadKey: "featRegisterLead",
    textKey: "featRegisterText",
  },
  {
    tag: "DOCUMENTS",
    leadKey: "featDocumentsLead",
    textKey: "featDocumentsText",
  },
  {
    tag: "PROBLEM SOLVED",
    leadKey: "featProblemLead",
    textKey: "featProblemText",
  },
  {
    tag: "PERMITS",
    leadKey: "featPermitsLead",
    textKey: "featPermitsText",
  },
  {
    tag: "EXPERTISE",
    leadKey: "featExpertiseLead",
    textKey: "featExpertiseText",
  },
  {
    tag: "LICENSED",
    leadKey: "featLicensedLead",
    textKey: "featLicensedText",
  },
  {
    tag: "100% SAFE",
    leadKey: "featSafeLead",
    textKey: "featSafeText",
  },
];

type Highlight = { labelKey: string; value?: string; valueKey?: string };

const HIGHLIGHTS: Highlight[] = [
  { labelKey: "highlightStartLabel", value: "2,800.-" },
  { labelKey: "highlightReplyLabel", valueKey: "highlightReplyValue" },
  { labelKey: "highlightReleaseLabel", valueKey: "highlightReleaseValue" },
];

async function ContactCard({ className = "" }: { className?: string }) {
  const t = await getTranslations("clearancePromo");
  return (
    <div className={`group relative h-full flex flex-col overflow-hidden rounded-2xl md:rounded-3xl border border-border bg-gradient-to-b from-white to-surface dark:from-surface dark:to-surface-alt shadow-[0_10px_30px_rgba(15,23,42,0.06)] hover:shadow-[0_24px_50px_-12px_rgba(179,0,0,0.20)] hover:border-primary-300 dark:hover:border-primary-800 hover:-translate-y-1 transition-all duration-400 ${className}`}>
      <Link
        href="/register"
        aria-label={t("cardRegisterAria")}
        className="absolute inset-0 z-10"
      />

      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-[0.06] dark:group-hover:opacity-[0.08] transition-opacity duration-500"
        style={{
          backgroundImage: "radial-gradient(circle at 1px 1px, #b30000 1px, transparent 0)",
          backgroundSize: "18px 18px",
        }}
      />

      <div
        aria-hidden
        className="pointer-events-none absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-primary-500 to-transparent opacity-0 group-hover:opacity-100 -translate-x-full group-hover:translate-x-0 transition-all duration-700 z-[5]"
      />

      <div className="pointer-events-none absolute -right-12 -top-12 w-44 h-44 rounded-full bg-gradient-to-br from-primary-100/60 to-primary-200/40 dark:from-primary-900/30 dark:to-primary-700/20 group-hover:from-primary-200/80 group-hover:to-primary-300/60 dark:group-hover:from-primary-900/50 group-hover:scale-110 transition-all duration-500 blur-2xl" />

      <div className="relative flex flex-1 flex-col p-4 md:p-6">
        <div className="inline-flex w-fit items-center gap-1.5 px-2.5 py-0.5 md:py-1 rounded-full bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-300 text-[10.5px] md:text-[11px] font-black tracking-wider group-hover:bg-primary-600 group-hover:text-white transition-colors duration-300">
          <Sparkles className="h-3 w-3 group-hover:animate-pulse" strokeWidth={2.8} />
          {t("freeConsult")}
        </div>

        <div className="relative flex flex-1 items-center justify-center my-2 md:my-3 min-h-0 overflow-hidden max-h-[220px] md:max-h-[240px] lg:max-h-none">
          <Image
            src="/images/custombou.png"
            alt={t("contactImageAlt")}
            width={520}
            height={620}
            unoptimized
            className="w-auto max-w-[200px] md:max-w-[230px] lg:max-w-full max-h-full h-full object-contain drop-shadow-[0_12px_22px_rgba(0,0,0,0.14)] transition-transform duration-500 ease-out group-hover:scale-110 group-hover:-rotate-2"
          />
          <div className="absolute top-2 right-2 w-4 h-4 rounded-full bg-gradient-to-br from-yellow-300 to-amber-400 border-2 border-white dark:border-surface shadow-[0_4px_10px_rgba(0,0,0,0.18)] scale-0 group-hover:scale-100 transition-transform duration-400" />
        </div>

        <div className="grid grid-cols-3 gap-1.5 text-center">
          {HIGHLIGHTS.map(({ labelKey, value, valueKey }, i) => (
            <div
              key={labelKey}
              style={{ transitionDelay: `${i * 60}ms` }}
              className="rounded-md md:rounded-lg bg-white/70 dark:bg-surface-alt/60 border border-border group-hover:border-primary-200 dark:group-hover:border-primary-900 group-hover:bg-white dark:group-hover:bg-surface group-hover:-translate-y-0.5 group-hover:shadow-[0_4px_10px_rgba(220,38,38,0.10)] py-1.5 md:py-2 transition-all duration-300"
            >
              <div className="text-[9px] md:text-[10px] font-bold tracking-wider text-muted uppercase">{t(labelKey)}</div>
              <div className="mt-0.5 text-[12px] md:text-[13.5px] font-black text-primary-600 leading-none">{valueKey ? t(valueKey) : value}</div>
            </div>
          ))}
        </div>

        <div className="relative z-20 mt-2.5 md:mt-3 flex flex-col gap-1.5 md:gap-2">
          <a
            href="tel:0661310253"
            className="inline-flex items-center justify-center gap-1.5 md:gap-2 h-10 md:h-10 rounded-lg md:rounded-xl bg-primary-600 text-white text-[13px] md:text-[13.5px] font-extrabold shadow-[0_8px_18px_rgba(220,38,38,0.25)] hover:bg-primary-700 hover:-translate-y-0.5 transition-all"
          >
            <Phone className="h-3.5 w-3.5 md:h-4 md:w-4" strokeWidth={2.6} />
            {t("callPhone")}
          </a>
          <TrackedExternalLink
            href="/line"
            cta="line_consult"
            surface="clearance_promo"
            className="inline-flex items-center justify-center gap-1.5 md:gap-2 h-10 md:h-10 rounded-lg md:rounded-xl border border-[#06C755] text-[#06C755] dark:text-[#06C755] text-[13px] md:text-[13.5px] font-extrabold bg-white dark:bg-transparent hover:bg-[#06C755] hover:text-white transition-all"
          >
            <MessageCircle className="h-3.5 w-3.5 md:h-4 md:w-4" strokeWidth={2.6} />
            {t("chatLineUrgent")}
          </TrackedExternalLink>
        </div>

        <div className="relative z-[2] mt-3 flex items-center justify-end gap-1 text-[11px] font-black text-primary-600 opacity-0 group-hover:opacity-100 translate-y-2 group-hover:translate-y-0 transition-all duration-300">
          <span>{t("clickCardToRegister")}</span>
          <ArrowRight className="w-3 h-3" strokeWidth={3} />
        </div>
      </div>
    </div>
  );
}

export async function ClearancePromo() {
  const t = await getTranslations("clearancePromo");
  return (
    <section className="py-4 md:py-8">
      <div className="mx-auto w-full max-w-[1280px] px-3 md:px-4 flex flex-col">

        {/* Contact card — TOP on mobile (right after booking), hidden on desktop */}
        <div className="lg:hidden mb-5">
          <ContactCard />
        </div>

        {/* Top accent line */}
        <div className="mb-2.5 md:mb-3 h-1 md:h-1.5 w-12 md:w-20 rounded-full bg-gradient-to-r from-primary-600 to-primary-700" />

        <h2 className="text-[19px] md:text-[40px] leading-[1.25] md:leading-[1.15] font-black tracking-[-0.03em] md:tracking-[-0.04em] text-primary-600">
          {t("heading")}
        </h2>
        <p className="mt-1.5 md:mt-3 text-[12px] md:text-[16px] font-bold text-muted leading-[1.45]">
          {t("ports")}
        </p>

        {/* Hero red banner */}
        <div className="relative mt-4 md:mt-7">
          <div className="absolute left-2.5 md:left-6 -top-2.5 md:-top-5 z-10 inline-block -rotate-2 rounded-lg md:rounded-xl bg-[#111827] px-2.5 md:px-4 py-0.5 md:py-1.5 text-[13px] md:text-[26px] font-black text-white shadow-[0_8px_20px_rgba(0,0,0,0.18)]">
            {t("stuckAtCustoms")}
          </div>

          <div
            className="pointer-events-none absolute right-3 md:right-5 -top-4 md:-top-7 z-10 rotate-[3deg] text-[26px] md:text-[58px] leading-none font-black text-white"
            style={{
              WebkitTextStroke: "2px #7f1d1d",
              textShadow: "0 8px 18px rgba(0,0,0,0.3)",
            }}
          >
            {t("oneHour")}
          </div>

          <div className="relative grid grid-cols-1 md:grid-cols-[200px_1fr] items-stretch overflow-hidden rounded-xl md:rounded-[20px] shadow-[0_15px_35px_rgba(220,38,38,0.2)] bg-gradient-to-br from-[#dc2626] via-[#b91c1c] to-[#991b1b]">

            <div className="relative flex items-center justify-center bg-black/15 backdrop-blur-sm py-3 md:py-0">
              <div className="relative z-[2] text-center text-white">
                <div className="text-[22px] md:text-[42px] font-black leading-none">Pacred</div>
                <div className="mt-0.5 md:mt-1 text-[9px] md:text-[14px] tracking-[0.18em] font-bold text-[#fca5a5]">SHIPPING</div>
              </div>
            </div>

            <div className="flex flex-col justify-center px-3.5 md:px-7 py-3 md:py-6 text-left">
              <p className="m-0 text-[13px] md:text-[22px] font-extrabold leading-snug text-white">
                {t("bannerHeadline")}
              </p>
              <p className="mt-1 md:mt-2 text-[11.5px] md:text-[14.5px] leading-[1.5] md:leading-[1.6] text-white/85">
                {t("bannerSub")}
              </p>
            </div>
          </div>
        </div>

        {/* Main split — checklist (full width mobile) + contact card (right on desktop) */}
        <div className="mt-5 md:mt-8 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-4 md:gap-6 lg:gap-8 items-stretch">

          {/* Left — checklist */}
          <div className="flex flex-col">
            <h3 className="text-[16px] md:text-[24px] font-black tracking-[-0.02em] text-[#111827] dark:text-white leading-snug">
              {t("checklistHeading")}
            </h3>
            <div className="mt-1.5 md:mt-2 w-fit rounded-md bg-surface dark:bg-surface-alt px-2.5 md:px-3 py-0.5 md:py-1 text-[11px] md:text-[13px] font-bold text-muted">
              {t("checklistPorts")}
            </div>

            <ul className="mt-3 md:mt-4 flex-1 grid grid-cols-1 md:grid-cols-2 md:grid-rows-4 auto-rows-fr gap-2 md:gap-3">
              {FEATURES.map((f, i) => {
                const num = String(i + 1).padStart(2, "0");
                return (
                  <li
                    key={f.tag}
                    className="group relative overflow-hidden flex items-start gap-2.5 md:gap-3.5 rounded-lg md:rounded-xl border border-primary-100 dark:border-primary-900/40 bg-gradient-to-br from-primary-50/60 via-white to-white dark:from-primary-900/20 dark:via-surface dark:to-surface px-3 md:px-4 py-2.5 md:py-3.5 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_8px_20px_rgba(220,38,38,0.10)] hover:border-primary-300"
                  >
                    <span
                      aria-hidden
                      className="absolute left-0 top-0 bottom-0 w-0.5 md:w-1 bg-gradient-to-b from-primary-500 to-primary-700 scale-y-0 origin-top group-hover:scale-y-100 transition-transform duration-400"
                    />

                    <span className="relative inline-flex h-6 w-6 md:h-8 md:w-8 shrink-0 items-center justify-center rounded-md md:rounded-lg bg-white dark:bg-surface-alt border border-primary-200 dark:border-primary-900/60 shadow-[0_4px_10px_rgba(220,38,38,0.10)] group-hover:bg-gradient-to-br group-hover:from-primary-500 group-hover:to-primary-700 group-hover:border-transparent transition-all duration-300">
                      <span className="text-[10px] md:text-[12px] font-black text-primary-600 tabular-nums group-hover:hidden">
                        {num}
                      </span>
                      <Check className="h-3 w-3 md:h-4 md:w-4 text-white hidden group-hover:block" strokeWidth={3.5} />
                    </span>

                    <div className="relative flex-1 min-w-0">
                      <h4 className="text-[13px] md:text-[16px] font-black tracking-[-0.01em] text-[#111827] dark:text-white leading-snug">
                        {t(f.leadKey)}
                      </h4>
                      <p className="mt-0.5 md:mt-1 text-[11.5px] md:text-[13.5px] leading-[1.45] md:leading-[1.6] text-[#4b5563] dark:text-white/75 font-medium">
                        {t(f.textKey)}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Right — contact card (desktop only here; mobile shows at top) */}
          <div className="hidden lg:block">
            <ContactCard />
          </div>
        </div>
      </div>
    </section>
  );
}
