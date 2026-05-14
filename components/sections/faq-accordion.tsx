"use client";

import { useState } from "react";
import { ChevronDown, HelpCircle } from "lucide-react";

export type FaqGroup = {
  id: string;
  label: string;
  items: { q: string; a: string }[];
};

export function FaqAccordion({ groups }: { groups: FaqGroup[] }) {
  const [openKey, setOpenKey] = useState<string | null>(`${groups[0]?.id}-0`);

  return (
    <div className="flex flex-col gap-8 md:gap-12">
      {groups.map((group) => (
        <section key={group.id} aria-labelledby={`faq-${group.id}`}>
          <div className="mb-3 md:mb-4 flex items-center gap-2">
            <span className="inline-flex h-7 w-7 md:h-8 md:w-8 items-center justify-center rounded-lg bg-primary-50 text-primary-600 dark:bg-primary-900/30">
              <HelpCircle className="h-4 w-4 md:h-4.5 md:w-4.5" strokeWidth={2.5} />
            </span>
            <h2
              id={`faq-${group.id}`}
              className="text-[16px] md:text-[22px] font-black tracking-[-0.02em] text-[#111827] dark:text-white"
            >
              {group.label}
            </h2>
          </div>

          <div className="flex flex-col gap-2.5">
            {group.items.map((item, i) => {
              const key = `${group.id}-${i}`;
              const isOpen = openKey === key;
              return (
                <div
                  key={key}
                  className={`overflow-hidden rounded-xl md:rounded-2xl border transition-all ${
                    isOpen
                      ? "border-primary-300 dark:border-primary-800 bg-white dark:bg-surface shadow-[0_10px_24px_rgba(220,38,38,0.08)]"
                      : "border-border bg-white dark:bg-surface hover:border-primary-200 dark:hover:border-primary-900"
                  }`}
                >
                  <button
                    type="button"
                    suppressHydrationWarning
                    onClick={() => setOpenKey(isOpen ? null : key)}
                    aria-expanded={isOpen}
                    className="w-full flex items-center justify-between gap-3 md:gap-4 px-3.5 md:px-5 py-3 md:py-4 text-left cursor-pointer"
                  >
                    <span className="text-[13px] md:text-[15px] font-black leading-snug text-[#111827] dark:text-white">
                      {item.q}
                    </span>
                    <span
                      className={`shrink-0 inline-flex h-7 w-7 items-center justify-center rounded-full border transition-all ${
                        isOpen
                          ? "border-primary-300 bg-primary-50 text-primary-600 rotate-180 dark:border-primary-700 dark:bg-primary-900/40 dark:text-primary-300"
                          : "border-border bg-white text-muted dark:bg-background"
                      }`}
                    >
                      <ChevronDown className="h-3.5 w-3.5" strokeWidth={2.6} />
                    </span>
                  </button>
                  <div
                    className={`grid transition-all duration-300 ${
                      isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                    }`}
                  >
                    <div className="overflow-hidden">
                      <div className="px-3.5 md:px-5 pb-3.5 md:pb-4 text-[12.5px] md:text-[14px] leading-[1.65] text-muted font-medium">
                        {item.a}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
