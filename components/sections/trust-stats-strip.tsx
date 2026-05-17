import { useTranslations } from "next-intl";
import { ShieldCheck, Users, FileCheck2 } from "lucide-react";

/**
 * Compact 3-chip trust strip for landing hero sections.
 *
 * Drops below the H2 / above the hero LINE banner on service landing
 * pages. Mirrors the home-page <StatsBar> message without the booking-
 * calculator weight. Reads from `trustStrip.*` i18n namespace.
 */
export function TrustStatsStrip({ className }: { className?: string }) {
  const t = useTranslations("trustStrip");
  const items = [
    { icon: ShieldCheck, label: t("years") },
    { icon: Users,       label: t("customers") },
    { icon: FileCheck2,  label: t("formE") },
  ];
  return (
    <ul
      className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11.5px] md:text-[13px] font-bold text-[#111827] dark:text-white/90 ${className ?? ""}`}
      aria-label={t("ariaLabel")}
    >
      {items.map((it, i) => (
        <li key={it.label} className="flex items-center gap-1.5">
          {i > 0 && <span aria-hidden className="w-1 h-1 rounded-full bg-primary-600/70" />}
          <it.icon className="w-3.5 h-3.5 text-primary-600" strokeWidth={2.6} />
          <span>{it.label}</span>
        </li>
      ))}
    </ul>
  );
}
