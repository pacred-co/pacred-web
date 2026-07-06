"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Check } from "lucide-react";

// ───────────── Country (data — labels resolved via i18n) ─────────────
type Country = {
  code: string;
  nameKey: string;
  flag: string;
  active?: boolean;
  locked?: boolean;
  soon?: boolean;
};

export const COUNTRIES: Country[] = [
  { code: "cn", nameKey: "countryCn", flag: "🇨🇳", active: true, locked: true },
  { code: "jp", nameKey: "countryJp", flag: "🇯🇵", soon: true },
  { code: "kr", nameKey: "countryKr", flag: "🇰🇷", soon: true },
  { code: "vn", nameKey: "countryVn", flag: "🇻🇳", soon: true },
  { code: "us", nameKey: "countryUs", flag: "🇺🇸", soon: true },
];

// ── Country chip selector (shared: standalone home block + PricingSection freight header) ──
// จีน = active · ที่เหลือ = "เร็วๆนี้" (disabled). Same component everywhere so they
// always look + behave identically (ปอน). Resolves its own labels via useTranslations
// so callers don't thread `t` through.
export function CountryChips({
  country,
  onSelect,
}: {
  country: string;
  onSelect: (code: string) => void;
}) {
  const t = useTranslations("pricing");
  return (
    <div className="flex overflow-x-auto gap-2 pb-1 -mx-[10px] px-[10px] md:mx-0 md:px-0 md:pb-0 md:flex-wrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [&>*]:shrink-0">
      {COUNTRIES.map((c) => {
        const selected = country === c.code && c.active;
        const disabled = c.soon || !c.active;
        return (
          <button
            key={c.code}
            type="button"
            disabled={disabled}
            onClick={() => !disabled && onSelect(c.code)}
            suppressHydrationWarning
            className={[
              "inline-flex items-center gap-2 h-[42px] pl-3 pr-4 rounded-full border text-[13.5px] font-semibold transition-all duration-200 focus:outline-none whitespace-nowrap",
              selected
                ? "bg-primary-600 border-primary-600 text-white shadow-[0_4px_14px_rgba(179,0,0,0.35)]"
                : disabled
                  ? "bg-surface dark:bg-surface border-border/60 text-muted opacity-55 cursor-not-allowed"
                  : "bg-white dark:bg-surface border-border hover:border-primary-400 hover:bg-primary-50 dark:hover:bg-primary-950/30 text-[#111827] dark:text-foreground cursor-pointer",
            ].join(" ")}
          >
            <span className="text-[18px] leading-none">{c.flag}</span>
            <span>{t(c.nameKey)}</span>
            {c.soon && (
              <span className="ml-0.5 text-[11px] font-bold px-1.5 py-0.5 rounded-full bg-black/8 dark:bg-white/10 text-muted leading-none">
                เร็วๆนี้
              </span>
            )}
            {selected && (
              <Check className="w-[14px] h-[14px] ml-0.5 shrink-0" strokeWidth={2.5} />
            )}
          </button>
        );
      })}
    </div>
  );
}

// ── Standalone country picker section — sits ABOVE the ProductCategories (สั่งซื้อ) block ──
// (ปอน 2026-07-06: "เอาสลับประเทศเลื่อนขึ้นไปไว้ข้างบนสั่งซื้อ") — lifted out of
// PricingSection so the origin-country picker leads the browse/order flow.
export function CountrySwitcher() {
  const t = useTranslations("pricing");
  const [country, setCountry] = useState<string>("cn");
  return (
    <section className="pt-2 md:pt-5 pb-0.5 md:pb-1">
      <div className="mx-auto w-full max-w-[1140px] px-[10px]">
        <div className="mx-auto w-full max-w-[1120px]">
          <div className="text-[12px] font-bold text-muted uppercase tracking-[0.12em] mb-2">
            {t("originCountry")}
          </div>
          <CountryChips country={country} onSelect={setCountry} />
        </div>
      </div>
    </section>
  );
}
