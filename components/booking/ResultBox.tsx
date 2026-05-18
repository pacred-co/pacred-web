import type { CalcResult, QuoteCarry } from "@/types/booking";
import { QuoteCTA } from "./QuoteCTA";
import { OpenBookingCTA } from "./OpenBookingCTA";

interface ResultBoxProps {
  result: CalcResult;
  /**
   * G-F-2 — when present, renders the "เปิดออเดอร์ราคานี้" CTA bridging this
   * priced quote into the protected order flow. Omitted for modes with no
   * self-serve order flow, leaving the existing phone/LINE escalation only.
   */
  quote?: QuoteCarry;
}

export function ResultBox({ result, quote }: ResultBoxProps) {
  const hasAmount = result.amount > 0;

  return (
    <div className="mt-6 rounded-xl border border-gray-200 overflow-hidden animate-[pfIn_0.2s_ease]">
      <div className="px-5 py-5 bg-gray-50 border-b border-gray-200">
        <div className="flex items-baseline gap-2 mb-1">
          {hasAmount && (
            <>
              <span className="text-[36px] font-black text-red-600 tracking-tight leading-none">
                {result.amount.toLocaleString('th-TH')}
              </span>
              <span className="text-base font-bold text-gray-800">{result.currency}</span>
            </>
          )}
        </div>
        <p className="text-[13px] font-semibold text-gray-500">{result.label}</p>
      </div>

      {(result.rows.length > 0 || result.note) && (
        <div className="px-5 py-5 bg-white">
          {result.rows.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
              {result.rows.map((row, i) => (
                <div key={i}>
                  <span className="block text-[12px] font-semibold text-gray-400 mb-1">{row.label}</span>
                  <strong className="block text-sm font-bold text-gray-800">{row.value}</strong>
                </div>
              ))}
            </div>
          )}
          {result.note && (
            <p className="text-[13px] text-gray-500 leading-relaxed border-t border-dashed border-gray-200 pt-4">
              {result.note}
            </p>
          )}
        </div>
      )}

      {/* G-F-2 + BK-1 — bridge the priced quote into either the fast self-
          serve order flow (`QuoteCTA` → /start-order, primary) or the
          considered booking flow (`OpenBookingCTA` → /book/[service],
          outline secondary). Only renders when there is a real number to
          act on (a 0-amount "special product, contact us" result keeps the
          phone/LINE path as the only escalation).

          `QuoteCTA` self-checks its mode set (sea/truck/air/sourcing only)
          and renders null otherwise; `OpenBookingCTA` works for every mode
          that maps to a bookable service (incl. customs / remit — exactly
          the modes that used to dead-end into the phone/LINE modal). */}
      {hasAmount && quote && (
        <div className="px-5 py-4 bg-white border-t border-gray-200 space-y-3">
          <QuoteCTA quote={quote} />
          <OpenBookingCTA quote={quote} />
        </div>
      )}
    </div>
  );
}
