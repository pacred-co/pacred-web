"use client";

import { useEffect, useState } from "react";
import { Link } from "@/i18n/navigation";

/**
 * Revenue stat card that AUTO-ROTATES between a MONTH face and a TODAY face
 * every 5s (owner 2026-07-07). Pure presentation — reuses the EXACT chrome of
 * the dashboard's server-side `RevenueCard` (app/[locale]/(admin)/admin/page.tsx),
 * only the number + label cross-fade. Same values (month/today already computed
 * server-side), no query, no data change.
 */
function formatTHB(n: number): string {
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function RevenueCarouselCard({
  tone, icon, monthLabel, monthValue, todayLabel, todayValue, href,
}: {
  tone: "info" | "danger" | "primary" | "success";
  icon: React.ReactNode;
  monthLabel: string;
  monthValue: number;
  todayLabel: string;
  todayValue: number;
  href?: string;
}) {
  const tones = {
    info:    { text: "text-cyan-600",    bar: "from-cyan-400 to-cyan-600" },
    danger:  { text: "text-red-600",     bar: "from-red-400 to-red-600" },
    primary: { text: "text-primary-600", bar: "from-primary-400 to-primary-600" },
    success: { text: "text-emerald-600", bar: "from-emerald-400 to-green-600" },
  }[tone];

  const [face, setFace] = useState<0 | 1>(0);
  useEffect(() => {
    const id = setInterval(() => setFace((f) => (f === 0 ? 1 : 0)), 5000);
    return () => clearInterval(id);
  }, []);

  const value = face === 0 ? monthValue : todayValue;
  const label = face === 0 ? monthLabel : todayLabel;

  const inner = (
    <>
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1 transition-opacity duration-500">
            <p className={`font-bold leading-none ${tones.text} text-2xl sm:text-3xl font-mono`}>
              ฿{formatTHB(value)}
            </p>
            <p className="mt-2 text-sm font-semibold text-foreground line-clamp-2">{label}</p>
          </div>
          <div className={`shrink-0 ${tones.text} w-9 h-9 [&>svg]:w-9 [&>svg]:h-9 opacity-80`}>{icon}</div>
        </div>
      </div>
      <div className="h-1.5 w-full bg-surface-alt">
        <div className={`h-full w-full bg-gradient-to-r ${tones.bar}`} />
      </div>
    </>
  );

  const className =
    "group block rounded-2xl border border-border bg-white dark:bg-surface shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all overflow-hidden";

  return href ? (
    <Link href={href} className={className}>
      {inner}
    </Link>
  ) : (
    <div className={className}>{inner}</div>
  );
}
