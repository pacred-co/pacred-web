"use client";

import { useState } from "react";
import { Link } from "@/i18n/navigation";

export type TagGroup = {
  title: string;
  items: string[];
};

export function RelatedTagsTabs({ groups }: { groups: TagGroup[] }) {
  const [activeIdx, setActiveIdx] = useState(0);
  const active = groups[activeIdx];

  return (
    <div>
      {/* Tabs — pill buttons, always one swipable row (mobile + desktop)
          per ปอน 2026-05-18. Each button stays whitespace-nowrap so labels
          never wrap. */}
      <div className="flex flex-nowrap gap-2 md:gap-2.5 overflow-x-auto -mx-4 md:mx-0 px-4 md:px-0 pb-2 md:pb-1 snap-x snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {groups.map((g, i) => {
          const isActive = i === activeIdx;
          return (
            <button
              key={g.title}
              type="button"
              onClick={() => setActiveIdx(i)}
              // Browser form-filler extensions (e.g. Microsoft Edge / Bing
              // Wallet) inject `fdprocessedid` onto <button> elements after
              // SSR but before hydration → React logs a hydration mismatch.
              // The attribute is harmless, so just silence the warning.
              suppressHydrationWarning
              className={
                "shrink-0 snap-start inline-flex items-center px-3 md:px-4 h-8 md:h-10 rounded-lg text-[12.5px] md:text-[14px] font-bold tracking-tight whitespace-nowrap transition-all duration-200 " +
                (isActive
                  ? "bg-primary-600 text-white shadow-[0_4px_12px_rgba(179,0,0,0.30)] hover:bg-primary-700"
                  : "bg-primary-50/70 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300 border border-primary-100 dark:border-primary-900/40 hover:bg-primary-100 dark:hover:bg-primary-900/30 hover:border-primary-300")
              }
            >
              {g.title}
            </button>
          );
        })}
      </div>

      {/* Content panel — white card with multi-column link grid */}
      <div className="mt-4 md:mt-5 rounded-2xl border border-primary-100 dark:border-border bg-white dark:bg-surface p-5 md:p-7 shadow-[0_6px_18px_rgba(15,23,42,0.05)]">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-4 md:gap-x-6 gap-y-3 md:gap-y-3.5">
          {active.items.map((item) => (
            <Link
              key={item}
              href="/knowledge"
              className="text-[13px] md:text-[15px] font-medium text-foreground/85 hover:text-primary-600 hover:underline underline-offset-4 decoration-2 transition-colors"
            >
              {item}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
