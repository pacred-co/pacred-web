"use client";

/**
 * BK-1 selector #1 — Labor.
 *
 * Stepper 0..4 workers + a "ยกของหนัก" (heavy-lift) toggle. Per
 * `docs/research/booking-flow-system-2026-05-18.md` §4.3 row 1: each
 * worker adds a `ค่าแรงงาน ×N` row to the quotation panel at the labor
 * rate; the heavy-lift toggle is a future-priced flag (no BK-1 price
 * effect — recorded so the rep can plan the job).
 */

import { useTranslations } from "next-intl";
import { Minus, Plus, Users } from "lucide-react";

const MAX = 4;
const MIN = 0;

interface LaborSelectorProps {
  count: number;
  heavyLift: boolean;
  onChange: (next: { count: number; heavyLift: boolean }) => void;
}

export function LaborSelector({ count, heavyLift, onChange }: LaborSelectorProps) {
  const t = useTranslations("booking");
  const safe = Math.max(MIN, Math.min(MAX, count));

  function step(delta: number) {
    onChange({ count: Math.max(MIN, Math.min(MAX, safe + delta)), heavyLift });
  }

  return (
    <fieldset className="rounded-2xl border border-border bg-white dark:bg-surface p-4 md:p-5">
      <legend className="px-2 inline-flex items-center gap-2 text-[13px] md:text-[14px] font-black text-[#111827] dark:text-white">
        <Users className="w-4 h-4 text-primary-600" strokeWidth={2.6} />
        {/* i18n-key: booking.selector.labor.title */}
        {t("selectors.labor.label")}
      </legend>
      <p className="mt-1 text-[12px] md:text-[12.5px] leading-[1.55] text-muted font-medium">
        {/* i18n-key: booking.selector.labor.help */}
        จำนวนคนงานช่วยขน/ยก ที่ปลายทาง
      </p>

      <div className="mt-4 flex items-center justify-between gap-3">
        <span className="text-[12.5px] md:text-[13px] font-bold text-foreground">
          {/* i18n-key: booking.selector.labor.workers */}
          {t("selectors.labor.stepperLabel")}
        </span>
        <div className="inline-flex items-center gap-3">
          <button
            type="button"
            onClick={() => step(-1)}
            disabled={safe <= MIN}
            aria-label="ลดจำนวนคน"
            className="inline-flex items-center justify-center w-11 h-11 rounded-xl border border-border bg-white dark:bg-surface text-foreground hover:border-primary-300 hover:text-primary-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Minus className="w-4 h-4" strokeWidth={2.6} />
          </button>
          <span
            className="min-w-[36px] text-center text-[18px] md:text-[20px] font-black text-foreground tabular-nums"
            aria-live="polite"
          >
            {safe}
          </span>
          <button
            type="button"
            onClick={() => step(+1)}
            disabled={safe >= MAX}
            aria-label="เพิ่มจำนวนคน"
            className="inline-flex items-center justify-center w-11 h-11 rounded-xl border border-border bg-white dark:bg-surface text-foreground hover:border-primary-300 hover:text-primary-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Plus className="w-4 h-4" strokeWidth={2.6} />
          </button>
        </div>
      </div>

      <label className="mt-4 flex items-center justify-between gap-3 cursor-pointer">
        <span className="text-[12.5px] md:text-[13px] font-bold text-foreground">
          {/* i18n-key: booking.selector.labor.heavyLift */}
          ยกของหนัก (เกิน 25 กก./ชิ้น)
        </span>
        <span
          className={[
            "relative inline-flex items-center w-11 h-6 rounded-full transition-colors",
            heavyLift ? "bg-primary-600" : "bg-border",
          ].join(" ")}
        >
          <input
            type="checkbox"
            className="sr-only"
            checked={heavyLift}
            onChange={(e) => onChange({ count: safe, heavyLift: e.target.checked })}
          />
          <span
            aria-hidden
            className={[
              "absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform",
              heavyLift ? "translate-x-5" : "translate-x-0",
            ].join(" ")}
          />
        </span>
      </label>
    </fieldset>
  );
}
