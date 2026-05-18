"use client";

/**
 * BK-1 — Booking detail page orchestrator (client).
 *
 * Mounted by the server pages `/book/[service]` + `/book/[service]/[route]`
 * (`docs/research/booking-flow-system-2026-05-18.md` §3.2). Holds the
 * `BookingOptionState` (useState), composes the 2-col layout, mounts the
 * applicable selectors per `serviceConfig.selectors`, the quotation panel
 * + side rails on the right (sticky on lg), and the mobile bottom bar.
 *
 * The "จองเลย" handler in the QuotationPanel calls `createDraftBooking()`
 * then `router.push('/book-start?draft=<id>')` — the existing auth-gate
 * bridge pattern (mirrors `/start-order`, §5.2).
 */

import { useState } from "react";
import { CheckCircle2, ListChecks, Map, Phone } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import type {
  BookingOptionState,
  BookingRate,
  BookingTractorClass,
  QuoteCarry,
  CreateBookingDraftInput,
} from "@/types/booking";
import type { ServiceConfig } from "@/lib/booking/service-config";
import { createDraftBooking } from "@/actions/bookings";

import { LaborSelector } from "@/components/booking/options/LaborSelector";
import { TractorSelector } from "@/components/booking/options/TractorSelector";
import { PinSelector } from "@/components/booking/options/PinSelector";
import { DocAttachSelector } from "@/components/booking/options/DocAttachSelector";
import { DocModeSelector } from "@/components/booking/options/DocModeSelector";
import { QuotationPanel } from "@/components/booking/QuotationPanel";
import { UpgradeRail } from "@/components/booking/UpgradeRail";
import { RelatedTagsRail } from "@/components/booking/RelatedTagsRail";
import { MobileQuoteBar } from "@/components/booking/MobileQuoteBar";

interface BookingDetailPageProps {
  serviceConfig: ServiceConfig;
  /** The :route segment, or null for `/book/[service]` (no route yet). */
  routeSlug: string | null;
  /** booking_rates rows the page fetched server-side. */
  rates: BookingRate[];
  /** Calculator carry from the query string. May be empty. */
  initialCarry: Partial<QuoteCarry>;
  /** Base service charge (THB) — derived from initialCarry on the server. */
  baseAmount: number;
  /** TH label for the base row (e.g. "ค่าพิธีการศุลกากร"). */
  baseLabel: string;
  /** Submit-channel hint persisted on the booking row. */
  sourceChannel?: string;
  sourceUrl?: string;
}

function freshState(): BookingOptionState {
  return {
    labor: 0,
    laborHeavyLift: false,
    tractor: "none" as BookingTractorClass,
    pickup: { lat: null, lng: null, address: "" },
    dropoff: { lat: null, lng: null, address: "" },
    docMode: "none",
    attachedDocumentIds: [],
    upgrades: [],
  };
}

export function BookingDetailPage({
  serviceConfig,
  routeSlug,
  rates,
  initialCarry,
  baseAmount,
  baseLabel,
  sourceChannel,
  sourceUrl,
}: BookingDetailPageProps) {
  const router = useRouter();
  const [options, setOptions] = useState<BookingOptionState>(freshState());
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Resolve which selectors render for this service (manifest).
  const showsLabor = serviceConfig.selectors.includes("labor");
  const showsTractor = serviceConfig.selectors.includes("tractor");
  const showsPin = serviceConfig.selectors.includes("pin");
  const showsDocAttach = serviceConfig.selectors.includes("doc_attach");
  const showsDocMode = serviceConfig.selectors.includes("doc_mode");

  async function handleSubmit() {
    setErrorMessage(null);

    const input: CreateBookingDraftInput = {
      serviceSlug: serviceConfig.slug,
      routeSlug: routeSlug ?? undefined,
      transportMode: initialCarry.mode ?? serviceConfig.defaultTransportMode ?? null,
      options,
      baseAmount,
      baseLabel,
      sourceChannel,
      sourceUrl,
    };

    const res = await createDraftBooking(input);
    if (!res.ok) {
      setErrorMessage(
        res.error === "not_implemented"
          ? "ระบบจองยังเปิดให้ใช้บางส่วน — โปรดติดต่อทีมขายผ่านไลน์ในระหว่างนี้"
          : `เกิดข้อผิดพลาด: ${res.error}`,
      );
      return;
    }
    router.push(
      `/book-start?draft=${res.data.id}` as Parameters<typeof router.push>[0],
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6 lg:gap-10 items-start">
      {/* ═══ LEFT — main content column ═══ */}
      <div className="min-w-0 order-1">
        {/* Service title + sub */}
        <div className="mb-4 md:mb-6">
          <div className="inline-flex items-center gap-2 mb-2 text-primary-600 text-[11.5px] md:text-[13px] font-black tracking-[0.10em] uppercase">
            <CheckCircle2 className="w-3.5 h-3.5" strokeWidth={2.6} />
            จองออนไลน์ · BOOKING
          </div>
          <h1 className="text-[24px] md:text-[40px] leading-[1.15] font-black tracking-[-0.025em] text-[#111827] dark:text-white">
            {serviceConfig.titleTh}
          </h1>
          <h2 className="mt-2 md:mt-3 text-[13px] md:text-[16px] leading-[1.6] font-medium text-muted">
            {serviceConfig.subTh}
          </h2>
          {routeSlug && (
            <p className="mt-2 text-[12.5px] md:text-[14px] text-muted">
              <span className="font-bold text-foreground">เส้นทาง:</span>{" "}
              <span className="text-primary-600 font-bold">{routeSlug}</span>
            </p>
          )}
          {baseAmount > 0 && (
            <p className="mt-3 text-[13px] md:text-[15px] text-foreground">
              <span className="text-muted">ราคาประมาณการ — เริ่มต้น</span>{" "}
              <span className="text-[20px] md:text-[24px] font-black text-primary-600 tabular-nums">
                ฿{baseAmount.toLocaleString("th-TH")}
              </span>
            </p>
          )}
        </div>

        {/* The 5 option selectors — what the customer chooses. */}
        <section aria-label="ตัวเลือกการจอง" className="space-y-4 md:space-y-5">
          <div className="inline-flex items-center gap-2 text-primary-600 text-[11.5px] md:text-[13px] font-black tracking-[0.10em] uppercase">
            <ListChecks className="w-3.5 h-3.5" strokeWidth={2.6} />
            เลือกตัวเลือก · OPTIONS
          </div>

          {showsLabor && (
            <LaborSelector
              count={options.labor}
              heavyLift={options.laborHeavyLift}
              onChange={({ count, heavyLift }) =>
                setOptions((o) => ({ ...o, labor: count, laborHeavyLift: heavyLift }))
              }
            />
          )}

          {showsTractor && (
            <TractorSelector
              value={options.tractor}
              onChange={(tractor) => setOptions((o) => ({ ...o, tractor }))}
            />
          )}

          {showsPin && (
            <PinSelector
              pickup={options.pickup}
              dropoff={options.dropoff}
              onChange={({ pickup, dropoff }) =>
                setOptions((o) => ({ ...o, pickup, dropoff }))
              }
            />
          )}

          {showsDocAttach && (
            <DocAttachSelector
              documentIds={options.attachedDocumentIds}
              onChange={(attachedDocumentIds) =>
                setOptions((o) => ({ ...o, attachedDocumentIds }))
              }
            />
          )}

          {showsDocMode && (
            <DocModeSelector
              value={options.docMode}
              onChange={(docMode) => setOptions((o) => ({ ...o, docMode }))}
            />
          )}
        </section>

        {/* What's included */}
        <section className="mt-6 md:mt-8 rounded-2xl border border-border bg-white dark:bg-surface p-4 md:p-5">
          <div className="text-[10.5px] md:text-[11px] font-bold text-muted tracking-[0.10em] uppercase mb-2.5">
            บริการนี้รวม
          </div>
          <ul className="space-y-2">
            {serviceConfig.includesTh.map((item) => (
              <li
                key={item}
                className="flex items-start gap-2 text-[12.5px] md:text-[13.5px] leading-[1.6] text-foreground/85"
              >
                <CheckCircle2
                  className="w-4 h-4 text-primary-600 mt-0.5 shrink-0"
                  strokeWidth={2.6}
                />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* How it works — 3 steps */}
        <section className="mt-5 rounded-2xl border border-border bg-white dark:bg-surface p-4 md:p-5">
          <div className="text-[10.5px] md:text-[11px] font-bold text-muted tracking-[0.10em] uppercase mb-3 flex items-center gap-2">
            <Map className="w-3.5 h-3.5" strokeWidth={2.6} />
            ขั้นตอนการจอง
          </div>
          <ol className="space-y-3">
            {serviceConfig.howItWorksTh.map((step, idx) => (
              <li key={idx} className="flex items-start gap-3">
                <span className="inline-flex items-center justify-center shrink-0 w-7 h-7 rounded-full bg-primary-600 text-white text-[12px] font-black">
                  {idx + 1}
                </span>
                <span className="text-[12.5px] md:text-[13.5px] leading-[1.6] text-foreground/90 font-medium pt-0.5">
                  {step}
                </span>
              </li>
            ))}
          </ol>
          <p className="mt-3 text-[11.5px] md:text-[12px] text-muted leading-snug flex items-center gap-1.5">
            <Phone className="w-3.5 h-3.5" strokeWidth={2.4} />
            * ทีมขายติดต่อกลับเพื่อยืนยันราคาจริงหลังตรวจสินค้า
          </p>
        </section>
      </div>

      {/* ═══ RIGHT — quote panel + side rails (sticky on lg) ═══ */}
      <aside className="order-2 lg:sticky lg:top-24 self-start space-y-3 md:space-y-4">
        <QuotationPanel
          serviceConfig={serviceConfig}
          options={options}
          baseAmount={baseAmount}
          baseLabel={baseLabel}
          rates={rates}
          onSubmit={handleSubmit}
          errorMessage={errorMessage}
        />
        <UpgradeRail
          availableKeys={serviceConfig.upgrades}
          rates={rates}
          selected={options.upgrades}
          onChange={(upgrades) => setOptions((o) => ({ ...o, upgrades }))}
        />
        <RelatedTagsRail tags={serviceConfig.relatedTags} />
      </aside>

      {/* Mobile bottom bar — only renders on <lg */}
      <MobileQuoteBar
        serviceConfig={serviceConfig}
        options={options}
        baseAmount={baseAmount}
        baseLabel={baseLabel}
        rates={rates}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
