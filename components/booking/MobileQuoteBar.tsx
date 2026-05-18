"use client";

/**
 * BK-1 — Mobile bottom-sticky quote bar.
 *
 * Per `docs/research/booking-flow-system-2026-05-18.md` §4.6: at <lg
 * the sticky desktop side-panel does not work — instead a fixed
 * bottom-sheet bar shows the running total + "จองเลย" button. Tap on
 * the total expands a <details>-style sheet with the full itemised
 * breakdown. Mobile analogue of §2.8 reason #1 — the price + the
 * action stay reachable with the thumb while the customer scrolls.
 */

import { useState } from "react";
import { ArrowRight, ChevronUp, Loader2, Receipt } from "lucide-react";
import type {
  BookingOptionState,
  BookingRate,
} from "@/types/booking";
import type { ServiceConfig } from "@/lib/booking/service-config";
import { buildBreakdown } from "./QuotationPanel";

interface MobileQuoteBarProps {
  serviceConfig: ServiceConfig;
  options: BookingOptionState;
  baseAmount: number;
  baseLabel: string;
  rates: BookingRate[];
  onSubmit: () => Promise<void>;
}

function fmt(n: number) {
  return n.toLocaleString("th-TH");
}

export function MobileQuoteBar({
  serviceConfig,
  options,
  baseAmount,
  baseLabel,
  rates,
  onSubmit,
}: MobileQuoteBarProps) {
  const [expanded, setExpanded] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const breakdown = buildBreakdown(
    serviceConfig,
    options,
    baseAmount,
    baseLabel,
    rates,
  );

  async function handleSubmit() {
    if (submitting) return;
    setSubmitting(true);
    try {
      await onSubmit();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      {/* Spacer — bumps page content above the fixed bar so nothing's hidden. */}
      <div aria-hidden className="lg:hidden h-20" />

      {/* Fixed bottom bar */}
      <div
        className="lg:hidden fixed inset-x-0 bottom-0 z-40 bg-white dark:bg-surface border-t border-border shadow-[0_-8px_24px_rgba(15,23,42,0.10)]"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {expanded && (
          <div className="max-h-[60vh] overflow-y-auto px-4 pt-4 pb-3 border-b border-border">
            <div className="flex items-center gap-2 text-[11px] font-black text-primary-700/80 dark:text-primary-300/80 tracking-[0.10em] uppercase leading-none">
              <Receipt className="w-3.5 h-3.5" strokeWidth={2.6} />
              ราคาประมาณการ
            </div>
            <ul className="mt-3 space-y-2">
              {breakdown.rows.map((row) => (
                <li
                  key={row.key}
                  className="flex items-baseline justify-between gap-3 text-[13px] leading-snug"
                >
                  <div className="flex-1 min-w-0">
                    <span className="block font-bold text-foreground truncate">
                      {row.label}
                    </span>
                    {row.detail && (
                      <span className="block text-[11.5px] text-muted font-medium truncate">
                        {row.detail}
                      </span>
                    )}
                  </div>
                  <span className="font-black text-foreground tabular-nums whitespace-nowrap">
                    ฿{fmt(row.amount)}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[11px] text-muted leading-[1.5]">
              * ราคาเริ่มต้น — ทีมขายยืนยันราคาจริงหลังตรวจสินค้า
            </p>
          </div>
        )}

        <div className="px-4 py-3 flex items-center gap-3">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            aria-label="ดูรายละเอียดราคา"
            className="flex-1 min-w-0 text-left"
          >
            <span className="block text-[10.5px] font-bold text-muted tracking-[0.10em] uppercase">
              {/* i18n-key: booking.mobile.totalLabel */}
              รวมประมาณการ
            </span>
            <span className="mt-0.5 flex items-baseline gap-1.5">
              <span className="text-[20px] font-black text-primary-600 dark:text-primary-300 tabular-nums leading-none">
                ฿{fmt(breakdown.total)}
              </span>
              <ChevronUp
                aria-hidden
                className={`w-3.5 h-3.5 text-muted transition-transform ${expanded ? "rotate-180" : ""}`}
                strokeWidth={2.6}
              />
            </span>
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            data-cta="booking-submit-mobile"
            className="inline-flex items-center justify-center gap-1.5 h-12 px-5 rounded-xl bg-primary-600 text-white font-black text-[14px] hover:bg-primary-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors shadow-[0_6px_18px_rgba(220,38,38,0.30)]"
          >
            {submitting ? (
              <Loader2 className="w-4 h-4 animate-spin" strokeWidth={2.6} />
            ) : (
              <>
                {/* i18n-key: booking.cta.bookNow */}
                จองเลย
                <ArrowRight className="w-3.5 h-3.5" strokeWidth={2.6} />
              </>
            )}
          </button>
        </div>
      </div>
    </>
  );
}
