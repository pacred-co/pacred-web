"use client";

import { useState } from "react";
import { ChevronDown, HelpCircle } from "lucide-react";
import { useTranslations } from "next-intl";

const FAQS = [
  { id: "fees" },
  { id: "docsHsCode" },
  { id: "duration" },
  { id: "taxes" },
  { id: "formE" },
  { id: "penalty" },
  { id: "individual" },
  { id: "ports" },
];

export function ClearanceFAQ() {
  const t = useTranslations("clearanceFaq");
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section className="py-4 md:py-8">
      <div className="mx-auto w-full max-w-[920px] px-3 md:px-4">

        {/* Header */}
        <div className="mb-4 md:mb-7">
          <div className="flex items-center gap-1.5 mb-1 md:mb-1.5 text-primary-600 text-[10.5px] md:text-[13px] font-black tracking-[0.08em] uppercase">
            <HelpCircle className="h-3 w-3 md:h-3.5 md:w-3.5" strokeWidth={2.8} />
            CLEARANCE FAQ
          </div>
          <h2 className="text-[20px] md:text-[38px] leading-[1.25] md:leading-[1.15] font-black tracking-[-0.03em] md:tracking-[-0.04em] text-[#111827] dark:text-white">
            {t("headingBefore")}
            <span className="text-primary-600"> {t("headingHighlight")}</span>
          </h2>
          <p className="mt-1.5 md:mt-2 max-w-[820px] text-[12px] md:text-[15px] leading-[1.5] md:leading-[1.55] font-medium text-muted">
            {t("subheading")}
          </p>
        </div>

        {/* Accordion */}
        <div className="flex flex-col gap-2.5">
          {FAQS.map((f, i) => {
            const isOpen = open === i;
            return (
              <div
                key={i}
                className={`overflow-hidden rounded-xl md:rounded-2xl border transition-all ${
                  isOpen
                    ? "border-primary-300 dark:border-primary-800 bg-white dark:bg-surface shadow-[0_12px_28px_rgba(220,38,38,0.10)]"
                    : "border-border bg-white dark:bg-surface hover:border-primary-200 dark:hover:border-primary-900"
                }`}
              >
                <button
                  type="button"
                  suppressHydrationWarning
                  onClick={() => setOpen(isOpen ? null : i)}
                  className="w-full flex items-center justify-between gap-3 md:gap-4 px-3.5 md:px-5 py-3 md:py-4 text-left cursor-pointer"
                >
                  <div className="flex items-start gap-2.5 md:gap-3">
                    <span className={`mt-0.5 inline-flex h-6 w-6 md:h-7 md:w-7 shrink-0 items-center justify-center rounded-md md:rounded-lg text-[11px] md:text-[13px] font-black transition-colors ${
                      isOpen
                        ? "bg-primary-600 text-white"
                        : "bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-300"
                    }`}>
                      Q
                    </span>
                    <span className="text-[12.5px] md:text-[15.5px] font-extrabold text-[#111827] dark:text-white leading-[1.4]">
                      {t(`${f.id}Q`)}
                    </span>
                  </div>
                  <ChevronDown
                    className={`h-4 w-4 md:h-5 md:w-5 shrink-0 text-muted transition-transform duration-300 ${isOpen ? "rotate-180 text-primary-600" : ""}`}
                    strokeWidth={2.4}
                  />
                </button>
                <div
                  className={`grid transition-all duration-300 ease-out ${isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}
                >
                  <div className="overflow-hidden">
                    <div className="px-3.5 md:px-5 pb-4 md:pb-5 pt-0">
                      <div className="ml-8 md:ml-10 pl-2.5 md:pl-3 border-l-2 border-primary-200 dark:border-primary-900/60 text-[12.5px] md:text-[14.5px] leading-[1.6] md:leading-[1.7] text-[#4b5563] dark:text-white/80">
                        {t(`${f.id}A`)}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
