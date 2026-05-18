"use client";

/**
 * BK-1 — Upgrade rail (side rail card #1).
 *
 * Per `docs/research/booking-flow-system-2026-05-18.md` §4.5: a checklist
 * of optional add-ons (insurance / door-to-door / fumigation / priority).
 * Ticking one pushes the rate_key into BookingOptionState.upgrades — the
 * QuotationPanel then renders a line for it (Trip.com upsell pattern,
 * §2.5).
 *
 * Available upgrades come from the per-service manifest
 * (`ServiceConfig.upgrades`). If the manifest is empty for this service,
 * the rail does not render.
 */

import { Plus, Check, Sparkles } from "lucide-react";
import type { BookingRate } from "@/types/booking";

interface UpgradeRailProps {
  /** rate_key list from `ServiceConfig.upgrades`. */
  availableKeys: string[];
  /** Rate rows (scope='upgrade') for label + amount. */
  rates: BookingRate[];
  /** Currently-selected rate_keys (a subset of availableKeys). */
  selected: string[];
  onChange: (next: string[]) => void;
}

function fmt(n: number) {
  return n.toLocaleString("th-TH");
}

export function UpgradeRail({ availableKeys, rates, selected, onChange }: UpgradeRailProps) {
  if (availableKeys.length === 0) return null;

  function toggle(key: string) {
    onChange(
      selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key],
    );
  }

  // Resolve label + amount per available key. Falls back to the key itself.
  const rows = availableKeys.map((key) => {
    const rate = rates.find((r) => r.active && r.scope === "upgrade" && r.rateKey === key);
    return {
      key,
      labelTh: rate?.labelTh ?? key,
      amount: rate?.unitAmount ?? 0,
    };
  });

  return (
    <section
      aria-label="อัปเกรดบริการ"
      className="rounded-2xl border border-border bg-white dark:bg-surface p-4 md:p-5"
    >
      <div className="flex items-center gap-2 text-[11px] md:text-[12px] font-black text-primary-700/80 dark:text-primary-300/80 tracking-[0.10em] uppercase leading-none">
        <Sparkles className="w-3.5 h-3.5" strokeWidth={2.6} />
        {/* i18n-key: booking.rail.upgrade.header */}
        อัปเกรดบริการ
      </div>
      <p className="mt-1.5 text-[11.5px] md:text-[12px] text-muted font-medium leading-snug">
        {/* i18n-key: booking.rail.upgrade.help */}
        เพิ่มบริการเสริม — เพิ่มรายการเข้าใบเสนอราคาประมาณการ
      </p>

      <ul className="mt-3 space-y-2">
        {rows.map((row) => {
          const isSelected = selected.includes(row.key);
          return (
            <li key={row.key}>
              <label
                className={[
                  "flex items-center gap-3 px-3 py-2.5 min-h-[44px] rounded-xl border cursor-pointer transition-colors",
                  isSelected
                    ? "border-primary-600 bg-primary-50/60 dark:bg-primary-900/20"
                    : "border-border bg-white dark:bg-surface hover:border-primary-300",
                ].join(" ")}
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={isSelected}
                  onChange={() => toggle(row.key)}
                />
                <span
                  aria-hidden
                  className={[
                    "inline-flex items-center justify-center w-5 h-5 rounded-md border-2 shrink-0",
                    isSelected ? "bg-primary-600 border-primary-600" : "border-border",
                  ].join(" ")}
                >
                  {isSelected ? (
                    <Check className="w-3 h-3 text-white" strokeWidth={3} />
                  ) : (
                    <Plus className="w-3 h-3 text-muted" strokeWidth={2.6} />
                  )}
                </span>
                <span className="flex-1 min-w-0 text-[12.5px] md:text-[13px] font-bold text-foreground truncate">
                  {row.labelTh}
                </span>
                <span className="text-[12px] md:text-[12.5px] font-black text-foreground tabular-nums whitespace-nowrap">
                  + ฿{fmt(Math.round(row.amount))}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
