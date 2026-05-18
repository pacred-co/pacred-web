"use client";

/**
 * BK-1 — Quotation panel · the live itemised "ราคาประมาณการ" receipt.
 *
 * THE REACTIVE HEART of the booking detail page per
 * `docs/research/booking-flow-system-2026-05-18.md` §4.4 — every option
 * change recomputes the `QuoteBreakdown` via `useMemo`, no "คำนวณ"
 * button. The base service row reuses the calculator-derived amount
 * (passed in via props from the page server component); option rows are
 * looked up from `booking_rates` (props.rates).
 *
 * Honesty rule (§4.7): the panel header reads "ราคาประมาณการ", the
 * footer carries the "ทีมขายยืนยันราคาจริงหลังตรวจสินค้า" disclaimer —
 * a Pacred booking quote is never final at this surface.
 */

import { useMemo, useState } from "react";
import { ArrowRight, Loader2, MessageCircle, Receipt } from "lucide-react";
import type {
  BookingOptionState,
  BookingRate,
  QuoteBreakdown,
  QuoteLine,
} from "@/types/booking";
import type { ServiceConfig } from "@/lib/booking/service-config";
import { LINE_OA } from "@/components/seo/site";

interface QuotationPanelProps {
  serviceConfig: ServiceConfig;
  options: BookingOptionState;
  baseAmount: number;
  baseLabel: string;
  rates: BookingRate[];
  /** Async submit handler — parent calls createDraftBooking + navigates. */
  onSubmit: () => Promise<void>;
  /** Optional toast/error to surface inline (parent owns transient state). */
  errorMessage?: string | null;
  /** Hide chrome (the wrapping border) — used inside the mobile bottom-sheet. */
  bare?: boolean;
}

// ───────────────────────────────────────────────────────────────────────
// Pure compute — builds the receipt from option state + rate table.
// Exported so the mobile bottom-bar can compute the same total without
// re-mounting the whole panel.
// ───────────────────────────────────────────────────────────────────────

const TRACTOR_RATE_KEYS: Record<string, string> = {
  truck_4w: "tractor_4w",
  truck_6w: "tractor_6w",
  truck_10w: "tractor_10w",
  trailer: "tractor_trailer",
};

const DOC_RATE_KEYS: Record<string, string> = {
  tax_invoice: "doc_tax_invoice",
  customs_declaration: "doc_customs_declaration",
};

function findRate(
  rates: BookingRate[],
  scope: BookingRate["scope"],
  rateKey: string,
  serviceSlug: string,
): BookingRate | null {
  // Prefer the service-specific row; fall back to the catch-all (serviceSlug=null).
  const specific = rates.find(
    (r) => r.active && r.scope === scope && r.rateKey === rateKey && r.serviceSlug === serviceSlug,
  );
  if (specific) return specific;
  return (
    rates.find(
      (r) => r.active && r.scope === scope && r.rateKey === rateKey && r.serviceSlug === null,
    ) ?? null
  );
}

export function buildBreakdown(
  serviceConfig: ServiceConfig,
  options: BookingOptionState,
  baseAmount: number,
  baseLabel: string,
  rates: BookingRate[],
): QuoteBreakdown {
  const rows: QuoteLine[] = [];

  // ── Row 1 — the base service charge (always present). ──
  rows.push({
    key: "base",
    label: baseLabel,
    detail: serviceConfig.titleTh,
    amount: Math.max(0, Math.round(baseAmount)),
  });

  // ── Labor — N workers × rate. ──
  if (options.labor > 0) {
    const rate = findRate(rates, "labor", "worker", serviceConfig.slug);
    const unit = rate?.unitAmount ?? 0;
    rows.push({
      key: "labor",
      // i18n-key: booking.quote.line.labor
      label: "ค่าแรงงาน",
      detail: `×${options.labor} คน${options.laborHeavyLift ? " · ยกหนัก" : ""}`,
      quantity: options.labor,
      unitAmount: unit,
      amount: Math.round(options.labor * unit),
    });
  }

  // ── Tractor — one row per chosen class. ──
  if (options.tractor !== "none") {
    const rateKey = TRACTOR_RATE_KEYS[options.tractor];
    const rate = rateKey ? findRate(rates, "tractor", rateKey, serviceConfig.slug) : null;
    rows.push({
      key: `tractor_${options.tractor}`,
      // i18n-key: booking.quote.line.tractor
      label: "ค่าหัวลาก",
      detail: rate?.labelTh ?? options.tractor,
      amount: Math.round(rate?.unitAmount ?? 0),
    });
  }

  // ── Document handling — one row per non-`none` posture. ──
  if (options.docMode !== "none") {
    const rateKey = DOC_RATE_KEYS[options.docMode];
    const rate = rateKey ? findRate(rates, "doc", rateKey, serviceConfig.slug) : null;
    rows.push({
      key: `doc_${options.docMode}`,
      // i18n-key: booking.quote.line.doc
      label: rate?.labelTh ?? (options.docMode === "tax_invoice" ? "ค่าออกใบกำกับภาษี" : "ค่าออกใบขนสินค้า"),
      amount: Math.round(rate?.unitAmount ?? 0),
    });
  }

  // ── Upgrade-plan add-ons (from side rail) — one row per ticked upgrade. ──
  for (const upKey of options.upgrades) {
    const rate = findRate(rates, "upgrade", upKey, serviceConfig.slug);
    rows.push({
      key: `upgrade_${upKey}`,
      // i18n-key: booking.quote.line.upgrade
      label: rate?.labelTh ?? upKey,
      detail: "บริการเสริม",
      amount: Math.round(rate?.unitAmount ?? 0),
    });
  }

  const total = rows.reduce((sum, row) => sum + row.amount, 0);

  return {
    rows,
    total,
    isEstimate: true,
    currency: "THB",
  };
}

function fmt(n: number) {
  return n.toLocaleString("th-TH");
}

// ───────────────────────────────────────────────────────────────────────
// Panel
// ───────────────────────────────────────────────────────────────────────

export function QuotationPanel({
  serviceConfig,
  options,
  baseAmount,
  baseLabel,
  rates,
  onSubmit,
  errorMessage,
  bare = false,
}: QuotationPanelProps) {
  const [submitting, setSubmitting] = useState(false);

  const breakdown = useMemo(
    () => buildBreakdown(serviceConfig, options, baseAmount, baseLabel, rates),
    [serviceConfig, options, baseAmount, baseLabel, rates],
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

  const containerCls = bare
    ? "p-1"
    : "rounded-2xl md:rounded-3xl border border-primary-100 dark:border-primary-900/50 bg-white dark:bg-surface p-4 md:p-5 shadow-[0_12px_30px_rgba(15,23,42,0.08)]";

  return (
    <div className={containerCls}>
      {/* Header — the honesty headline (§4.7). */}
      <div className="flex items-center gap-2 text-[11px] md:text-[12px] font-black text-primary-700/80 dark:text-primary-300/80 tracking-[0.10em] uppercase leading-none">
        <Receipt className="w-3.5 h-3.5" strokeWidth={2.6} />
        {/* i18n-key: booking.estimate.header */}
        ราคาประมาณการ
      </div>

      {/* Itemised rows — base + each active option. */}
      <ul className="mt-3 md:mt-4 space-y-2.5">
        {breakdown.rows.map((row) => (
          <li
            key={row.key}
            className="flex items-baseline justify-between gap-3 text-[13px] md:text-[13.5px] leading-snug"
          >
            <div className="flex-1 min-w-0">
              <span className="block font-bold text-foreground truncate">{row.label}</span>
              {row.detail && (
                <span className="block text-[11.5px] md:text-[12px] text-muted font-medium truncate">
                  {row.detail}
                </span>
              )}
            </div>
            <span className="font-black text-foreground tabular-nums whitespace-nowrap">
              {/* i18n-key: booking.quote.amount */}฿{fmt(row.amount)}
            </span>
          </li>
        ))}
      </ul>

      {/* Total — bold. */}
      <div className="mt-4 pt-4 border-t border-dashed border-border flex items-baseline justify-between gap-3">
        <span className="text-[13px] md:text-[14px] font-black text-foreground">
          {/* i18n-key: booking.estimate.total */}
          รวมประมาณการ
        </span>
        <span className="text-[24px] md:text-[28px] font-black text-primary-600 dark:text-primary-300 tabular-nums leading-none">
          ฿{fmt(breakdown.total)}
        </span>
      </div>

      {/* Disclaimer — the estimate-honesty footer (§4.7). */}
      <p className="mt-2 text-[11px] md:text-[11.5px] text-muted leading-[1.5]">
        {/* i18n-key: booking.estimate.disclaimer */}
        * ราคาเริ่มต้น — ทีมขายยืนยันราคาจริงหลังตรวจสินค้า
      </p>

      {/* Error inline */}
      {errorMessage && (
        <div className="mt-3 rounded-lg border border-primary-200 bg-primary-50 dark:bg-primary-900/20 dark:border-primary-800 px-3 py-2 text-[12px] font-medium text-primary-700 dark:text-primary-300">
          {errorMessage}
        </div>
      )}

      {/* Actions */}
      <div className="mt-4 grid grid-cols-1 gap-2">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          data-cta="booking-submit"
          className="inline-flex w-full items-center justify-center gap-2 h-12 rounded-xl bg-primary-600 text-white font-black text-[14px] md:text-[15px] hover:bg-primary-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors shadow-[0_6px_18px_rgba(220,38,38,0.30)]"
        >
          {submitting ? (
            <Loader2 className="w-4 h-4 animate-spin" strokeWidth={2.6} />
          ) : (
            <>
              {/* i18n-key: booking.cta.bookNow */}
              จองเลย
              <ArrowRight className="w-4 h-4" strokeWidth={2.6} />
            </>
          )}
        </button>
        <a
          href={LINE_OA.shortUrl}
          target="_blank"
          rel="noopener noreferrer"
          data-cta="booking-line"
          className="inline-flex items-center justify-center gap-1.5 h-11 rounded-xl border border-border bg-white text-foreground font-bold text-[12.5px] md:text-[13px] hover:border-primary-300 hover:text-primary-600 transition-colors dark:bg-surface"
        >
          <MessageCircle className="w-3.5 h-3.5" strokeWidth={2.6} />
          {/* i18n-key: booking.cta.consultLine */}
          ปรึกษาทีม / ทักไลน์
        </a>
      </div>
    </div>
  );
}
