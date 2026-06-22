import { FileText, Calculator, Workflow, PackageCheck, ArrowRight } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

const STEPS = [
  {
    num: "01",
    icon: FileText,
    titleKey: "step1Title",
    textKey: "step1Text",
  },
  {
    num: "02",
    icon: Calculator,
    titleKey: "step2Title",
    textKey: "step2Text",
  },
  {
    num: "03",
    icon: Workflow,
    titleKey: "step3Title",
    textKey: "step3Text",
  },
  {
    num: "04",
    icon: PackageCheck,
    titleKey: "step4Title",
    textKey: "step4Text",
  },
];

export async function ClearanceProcess() {
  const t = await getTranslations("clearanceProcess");
  return (
    <section className="py-4 md:py-8">
      <div className="mx-auto w-full max-w-[1240px] px-3 md:px-4">

        {/* Header */}
        <div className="mb-4 md:mb-7">
          <div className="flex items-center gap-1.5 mb-1 md:mb-1.5 text-primary-600 text-[10.5px] md:text-[13px] font-black tracking-[0.08em] uppercase">
            <span className="w-1.5 h-1.5 md:w-2 md:h-2 rounded-full bg-primary-600 shrink-0" />
            HOW IT WORKS
          </div>
          <h2 className="text-[20px] md:text-[38px] leading-[1.25] md:leading-[1.15] font-black tracking-[-0.03em] md:tracking-[-0.04em] text-[#111827] dark:text-white">
            {t("headingBefore")}
            <span className="text-primary-600"> {t("headingHighlight")}</span>
          </h2>
          <p className="mt-1.5 md:mt-2 max-w-[760px] text-[12px] md:text-[15px] leading-[1.5] md:leading-[1.55] font-medium text-muted">
            {t("subheading")}
          </p>
        </div>

        {/* 4 steps */}
        <div className="relative grid grid-cols-2 lg:grid-cols-4 gap-2.5 md:gap-5">
          {STEPS.map(({ num, icon: Icon, titleKey, textKey }, i) => (
            <div key={num} className="relative">
              <Link
                href="/register"
                aria-label={`${t("registerNow")} · ${t(titleKey)}`}
                className="group relative h-full flex flex-col bg-white dark:bg-surface border border-border rounded-xl md:rounded-2xl p-3 md:p-6 shadow-[0_4px_16px_rgba(15,23,42,0.04)] hover:shadow-[0_24px_50px_-12px_rgba(179,0,0,0.18)] hover:border-primary-300 dark:hover:border-primary-800 hover:-translate-y-1 transition-all duration-400 overflow-hidden cursor-pointer"
              >
                {/* Dot pattern overlay */}
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-[0.05] dark:group-hover:opacity-[0.08] transition-opacity duration-500"
                  style={{
                    backgroundImage: "radial-gradient(circle at 1px 1px, #b30000 1px, transparent 0)",
                    backgroundSize: "16px 16px",
                  }}
                />

                {/* Top accent line */}
                <div
                  aria-hidden
                  className="pointer-events-none absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-primary-500 to-transparent opacity-0 group-hover:opacity-100 -translate-x-full group-hover:translate-x-0 transition-all duration-700"
                />

                {/* Hover gradient blob */}
                <div
                  aria-hidden
                  className="pointer-events-none absolute -top-14 -right-14 w-44 h-44 rounded-full bg-gradient-to-br from-primary-200/80 to-primary-400/40 dark:from-primary-900/40 dark:to-primary-700/20 blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                />

                {/* Big number watermark */}
                <div className="pointer-events-none absolute top-1.5 right-2.5 md:top-3 md:right-4 text-[30px] md:text-[56px] leading-none font-black text-primary-600/10 dark:text-primary-300/10 group-hover:text-primary-600/25 select-none tracking-[-0.05em] transition-colors duration-400">
                  {num}
                </div>

                {/* Icon */}
                <div className="relative inline-flex h-9 w-9 md:h-12 md:w-12 items-center justify-center rounded-lg md:rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 text-white shadow-[0_8px_18px_rgba(220,38,38,0.28)] mb-2.5 md:mb-4 group-hover:scale-110 group-hover:-rotate-6 transition-transform duration-400">
                  <Icon className="h-4 w-4 md:h-6 md:w-6" strokeWidth={2.4} />
                  {/* Yellow accent dot */}
                  <div className="absolute -top-1 -right-1 w-3 h-3 md:w-3.5 md:h-3.5 rounded-full bg-gradient-to-br from-yellow-300 to-amber-400 border-2 border-white dark:border-surface shadow-[0_2px_6px_rgba(0,0,0,0.15)] scale-0 group-hover:scale-100 transition-transform duration-300" />
                </div>

                <div className="relative text-[11px] md:text-[12px] font-black tracking-[0.12em] text-primary-600 mb-0.5 md:mb-1">
                  STEP {num}
                </div>
                <h3 className="relative text-[12.5px] md:text-[16px] font-extrabold text-[#111827] dark:text-white leading-[1.3] md:leading-[1.35] mb-1 md:mb-2 group-hover:text-primary-700 dark:group-hover:text-primary-300 transition-colors duration-300">
                  {t(titleKey)}
                </h3>
                <p className="relative text-[11px] md:text-[13px] leading-[1.45] md:leading-[1.55] text-muted">
                  {t(textKey)}
                </p>

                {/* Bottom: progress + "สมัครเลย →" */}
                <div className="relative mt-auto pt-2.5 md:pt-4 flex items-center justify-between gap-2">
                  <div className="h-[2px] flex-1 bg-border overflow-hidden rounded-full">
                    <div className="h-full w-0 group-hover:w-full bg-gradient-to-r from-primary-500 to-primary-700 transition-all duration-500 ease-out rounded-full" />
                  </div>
                  <div className="flex items-center gap-1 text-[11px] font-black text-primary-600 opacity-0 group-hover:opacity-100 translate-x-2 group-hover:translate-x-0 transition-all duration-300 whitespace-nowrap">
                    {t("registerNow")}
                    <ArrowRight className="w-3 h-3" strokeWidth={3} />
                  </div>
                </div>
              </Link>

              {/* Connector arrow (desktop only, between cards) */}
              {i < STEPS.length - 1 && (
                <div className="hidden lg:flex absolute top-1/2 -right-3 -translate-y-1/2 z-10 h-7 w-7 items-center justify-center rounded-full bg-white dark:bg-surface border border-border shadow-md">
                  <ArrowRight className="h-3.5 w-3.5 text-primary-600" strokeWidth={3} />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
