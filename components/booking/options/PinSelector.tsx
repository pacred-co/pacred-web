"use client";

/**
 * BK-1 selector #3 — Pin pickup + drop-off.
 *
 * Per `docs/research/booking-flow-system-2026-05-18.md` §4.3 row 3 — BK-1
 * keeps it deliberately simple: two address textareas + a "ปักพิกัด GPS"
 * stub that calls `navigator.geolocation` when available (best-effort).
 * BK-2 swaps the static map placeholder for a real map-picker (the spec
 * notes "Distance between pins can add ค่าระยะทาง — BK-2"). BK-1 records
 * the pins and shows them; no distance pricing yet.
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import { MapPin, Crosshair, Loader2 } from "lucide-react";
import type { BookingOptionState } from "@/types/booking";

type PinShape = BookingOptionState["pickup"];

interface PinSelectorProps {
  pickup: PinShape;
  dropoff: PinShape;
  onChange: (next: { pickup: PinShape; dropoff: PinShape }) => void;
}

function emptyPin(): PinShape {
  return { lat: null, lng: null, address: "" };
}

export function PinSelector({ pickup, dropoff, onChange }: PinSelectorProps) {
  const t = useTranslations("booking");
  const [busyKey, setBusyKey] = useState<"pickup" | "dropoff" | null>(null);

  function patch(key: "pickup" | "dropoff", patchValues: Partial<PinShape>) {
    const next = {
      pickup: key === "pickup" ? { ...pickup, ...patchValues } : pickup,
      dropoff: key === "dropoff" ? { ...dropoff, ...patchValues } : dropoff,
    };
    onChange(next);
  }

  async function pickGps(key: "pickup" | "dropoff") {
    if (typeof window === "undefined" || !("geolocation" in navigator)) {
      // Silent fallback — no provider configured / browser blocked. BK-2
      // will surface a friendlier error path with the real map picker.
      return;
    }
    setBusyKey(key);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        patch(key, {
          lat: Number(pos.coords.latitude.toFixed(6)),
          lng: Number(pos.coords.longitude.toFixed(6)),
        });
        setBusyKey(null);
      },
      () => setBusyKey(null),
      { enableHighAccuracy: false, timeout: 7000, maximumAge: 60_000 },
    );
  }

  return (
    <fieldset className="rounded-2xl border border-border bg-white dark:bg-surface p-4 md:p-5">
      <legend className="px-2 inline-flex items-center gap-2 text-[13px] md:text-[14px] font-black text-[#111827] dark:text-white">
        <MapPin className="w-4 h-4 text-primary-600" strokeWidth={2.6} />
        {/* i18n-key: booking.selector.pin.title */}
        {t("selectors.pin.label")}
      </legend>
      <p className="mt-1 text-[12px] md:text-[12.5px] leading-[1.55] text-muted font-medium">
        {/* i18n-key: booking.selector.pin.help */}
        ระบุที่อยู่คร่าวๆ หรือกดปักพิกัด GPS — BK-1 บันทึกพิกัดไว้สำหรับทีมขาย
      </p>

      <div className="mt-4 grid grid-cols-1 gap-4">
        {(["pickup", "dropoff"] as const).map((key) => {
          const pin = key === "pickup" ? pickup : dropoff;
          const labelTh = key === "pickup" ? t("selectors.pin.pickupLabel") : t("selectors.pin.dropoffLabel");
          const placeholder =
            key === "pickup"
              ? "เช่น คลังที่ Suvarnabhumi · 123 ถนน..."
              : "เช่น โกดังลูกค้า · 456 ถนน...";
          const isBusy = busyKey === key;
          const hasPin = pin.lat != null && pin.lng != null;
          return (
            <div key={key} className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <label
                  htmlFor={`pin-${key}`}
                  className="text-[12.5px] md:text-[13px] font-bold text-foreground"
                >
                  {labelTh}
                </label>
                <button
                  type="button"
                  onClick={() => pickGps(key)}
                  disabled={isBusy}
                  className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-border bg-white dark:bg-surface text-foreground hover:border-primary-300 hover:text-primary-600 disabled:opacity-50 transition-colors text-[12px] font-bold"
                >
                  {isBusy ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={2.6} />
                  ) : (
                    <Crosshair className="w-3.5 h-3.5" strokeWidth={2.6} />
                  )}
                  {/* i18n-key: booking.selector.pin.gpsBtn */}
                  ปักพิกัด GPS
                </button>
              </div>
              <textarea
                id={`pin-${key}`}
                rows={2}
                value={pin.address}
                onChange={(e) => patch(key, { address: e.target.value })}
                placeholder={placeholder}
                className="w-full rounded-xl border border-border bg-white dark:bg-surface px-3 py-2.5 text-[14px] md:text-[15px] text-foreground placeholder:text-muted focus:outline-none focus:border-primary-500 transition-colors resize-y min-h-[64px]"
              />
              {hasPin && (
                <p className="text-[11.5px] md:text-[12px] text-muted font-medium tabular-nums">
                  {/* i18n-key: booking.selector.pin.coords */}
                  พิกัด GPS: {pin.lat?.toFixed(6)}, {pin.lng?.toFixed(6)}
                </p>
              )}
            </div>
          );
        })}

        {/* Static map placeholder — BK-2 will replace with a real picker. */}
        <div
          aria-hidden
          className="relative h-32 md:h-40 rounded-xl border border-dashed border-border bg-surface/40 dark:bg-background/30 flex items-center justify-center"
        >
          <div className="text-center px-4">
            <MapPin className="w-5 h-5 text-muted mx-auto mb-1.5" strokeWidth={2.2} />
            <p className="text-[11.5px] md:text-[12px] text-muted font-medium leading-snug">
              แผนที่ปักหมุดเต็มรูปแบบ — เปิดใช้ใน BK-2
            </p>
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={() => onChange({ pickup: emptyPin(), dropoff: emptyPin() })}
        className="mt-3 text-[11.5px] md:text-[12px] font-bold text-muted hover:text-primary-600 transition-colors"
      >
        {/* i18n-key: booking.selector.pin.clear */}
        ล้างพิกัดทั้งสองจุด
      </button>
    </fieldset>
  );
}
