"use client";

/**
 * BK-1 selector #5 — Document-handling mode.
 *
 * Single-choice radio per `docs/research/booking-flow-system-2026-05-18.md`
 * §4.3 row 5: one of none / tax_invoice / customs_declaration. Mutually
 * exclusive — a job has exactly one paperwork posture. Strong routing
 * signal for the back-office (a `customs_declaration` booking needs the
 * docs team + the customs desk; `none` does not — §6.3).
 */

import { useTranslations } from "next-intl";
import { FileCheck2 } from "lucide-react";
import type { BookingDocMode } from "@/types/booking";

interface DocModeOption {
  value: BookingDocMode;
  /** i18n-key: booking.selector.doc_mode.<value>.label */
  labelTh: string;
  /** i18n-key: booking.selector.doc_mode.<value>.help */
  helpTh: string;
}

const OPTIONS: DocModeOption[] = [
  {
    value: "none",
    labelTh: "ไม่รับเอกสาร",
    helpTh: "Pacred จัดการขนส่งอย่างเดียว — ไม่ออกใบกำกับ/ใบขนสินค้า",
  },
  {
    value: "tax_invoice",
    labelTh: "รับใบกำกับภาษี",
    helpTh: "ออกใบกำกับภาษีตามชื่อ-ที่อยู่ในระบบ (ภพ.20)",
  },
  {
    value: "customs_declaration",
    labelTh: "ออกใบขนสินค้า",
    helpTh: "Pacred ออกใบขนสินค้าให้ครบ — เหมาะกับงานเคลียร์ศุลกากร",
  },
];

interface DocModeSelectorProps {
  value: BookingDocMode;
  onChange: (next: BookingDocMode) => void;
}

export function DocModeSelector({ value, onChange }: DocModeSelectorProps) {
  const t = useTranslations("booking");
  return (
    <fieldset className="rounded-2xl border border-border bg-white dark:bg-surface p-4 md:p-5">
      <legend className="px-2 inline-flex items-center gap-2 text-[13px] md:text-[14px] font-black text-[#111827] dark:text-white">
        <FileCheck2 className="w-4 h-4 text-primary-600" strokeWidth={2.6} />
        {/* i18n-key: booking.selector.doc_mode.title */}
        {t("selectors.docMode.label")}
      </legend>
      <p className="mt-1 text-[12px] md:text-[12.5px] leading-[1.55] text-muted font-medium">
        {/* i18n-key: booking.selector.doc_mode.help */}
        เลือก 1 ตัวเลือก — เลือกได้เฉพาะแบบเดียว ต่อ 1 การจอง
      </p>

      <div className="mt-4 grid grid-cols-1 gap-2">
        {OPTIONS.map((opt) => {
          const selected = value === opt.value;
          return (
            <label
              key={opt.value}
              className={[
                "flex items-start gap-3 px-3 min-h-[48px] py-3 rounded-xl border cursor-pointer transition-colors",
                selected
                  ? "border-primary-600 bg-primary-50/60 dark:bg-primary-900/20"
                  : "border-border bg-white dark:bg-surface hover:border-primary-300",
              ].join(" ")}
            >
              <input
                type="radio"
                name="booking-doc-mode"
                value={opt.value}
                checked={selected}
                onChange={() => onChange(opt.value)}
                className="sr-only"
              />
              <span
                aria-hidden
                className={[
                  "mt-0.5 inline-flex items-center justify-center w-5 h-5 rounded-full border-2 shrink-0",
                  selected ? "border-primary-600" : "border-border",
                ].join(" ")}
              >
                {selected && <span className="w-2.5 h-2.5 rounded-full bg-primary-600" />}
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-[13px] md:text-[13.5px] font-bold text-foreground leading-snug">
                  {t(`selectors.docMode.options.${opt.value}`)}
                </span>
                <span className="mt-0.5 block text-[11.5px] md:text-[12px] text-muted font-medium leading-snug">
                  {opt.helpTh}
                </span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
