"use client";

/**
 * BK-1 selector #2 — Tractor / truck head.
 *
 * Single-choice radio per `docs/research/booking-flow-system-2026-05-18.md`
 * §4.3 row 2 — none · หัวลาก 4 ล้อ · 6 ล้อ · 10 ล้อ · เทรลเลอร์. The chosen
 * class adds a `ค่าหัวลาก · <class>` row at that class's `booking_rates`
 * unit_amount (BK-1 reads the rate table).
 */

import { Truck } from "lucide-react";
import type { BookingTractorClass } from "@/types/booking";

interface TractorOption {
  value: BookingTractorClass;
  /** i18n-key: booking.selector.tractor.<value> */
  labelTh: string;
}

const OPTIONS: TractorOption[] = [
  { value: "none", labelTh: "ไม่ต้องใช้" },
  { value: "truck_4w", labelTh: "หัวลาก 4 ล้อ" },
  { value: "truck_6w", labelTh: "หัวลาก 6 ล้อ" },
  { value: "truck_10w", labelTh: "หัวลาก 10 ล้อ" },
  { value: "trailer", labelTh: "เทรลเลอร์" },
];

interface TractorSelectorProps {
  value: BookingTractorClass;
  onChange: (next: BookingTractorClass) => void;
}

export function TractorSelector({ value, onChange }: TractorSelectorProps) {
  return (
    <fieldset className="rounded-2xl border border-border bg-white dark:bg-surface p-4 md:p-5">
      <legend className="px-2 inline-flex items-center gap-2 text-[13px] md:text-[14px] font-black text-[#111827] dark:text-white">
        <Truck className="w-4 h-4 text-primary-600" strokeWidth={2.6} />
        {/* i18n-key: booking.selector.tractor.title */}
        หัวลาก / รถบรรทุก
      </legend>
      <p className="mt-1 text-[12px] md:text-[12.5px] leading-[1.55] text-muted font-medium">
        {/* i18n-key: booking.selector.tractor.help */}
        เลือกประเภทรถลากตู้หรือรถขนของ — ทีมจะใช้ตามที่เลือก
      </p>

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
        {OPTIONS.map((opt) => {
          const selected = value === opt.value;
          return (
            <label
              key={opt.value}
              className={[
                "flex items-center gap-2.5 px-3 min-h-[44px] py-2 rounded-xl border cursor-pointer transition-colors",
                selected
                  ? "border-primary-600 bg-primary-50/60 dark:bg-primary-900/20"
                  : "border-border bg-white dark:bg-surface hover:border-primary-300",
              ].join(" ")}
            >
              <input
                type="radio"
                name="booking-tractor"
                value={opt.value}
                checked={selected}
                onChange={() => onChange(opt.value)}
                className="sr-only"
              />
              <span
                aria-hidden
                className={[
                  "inline-flex items-center justify-center w-5 h-5 rounded-full border-2 shrink-0",
                  selected
                    ? "border-primary-600"
                    : "border-border",
                ].join(" ")}
              >
                {selected && <span className="w-2.5 h-2.5 rounded-full bg-primary-600" />}
              </span>
              <span className="text-[13px] md:text-[13.5px] font-bold text-foreground">
                {opt.labelTh}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
