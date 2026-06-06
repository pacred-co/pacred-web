"use client";

/**
 * BK-1 selector #4 — Attach documents (preview list).
 *
 * Per `docs/research/booking-flow-system-2026-05-18.md` §4.3 row 4 + §5.4
 * (the auth gate carries the draft).  BK-1.5 (G1) wires REAL uploads to
 * the `member-docs` private bucket — but uploads happen at the REVIEW step
 * (after the customer has logged in via the /book-start auth gate), not on
 * this public detail page.  Anon uploads with re-key-on-submit was an
 * option §6.2 mentions but BK-1.5 chose the simpler "auth-required upload
 * at review" path.
 *
 * This selector therefore shows the customer a **preview list of the
 * accepted document kinds** + a notice that the actual file picker appears
 * after "จองเลย".  The on-page state stays empty (BookingOptionState.
 * attachedDocumentIds: []) — the documents are linked to the booking via
 * actions/bookings.ts:uploadBookingDocument once the review form mounts.
 */

import { useTranslations } from "next-intl";
import { Paperclip, FileText, Info } from "lucide-react";

interface DocSlot {
  /** Stable key — matches a `booking_*` doc_type in migration 0084.
   *  Also the i18n key suffix: docAttachSelector.slot_<key>_{label,hint}. */
  key: string;
}

const SLOTS: DocSlot[] = [
  { key: "booking_invoice" },
  { key: "booking_packing_list" },
  { key: "booking_certificate" },
  { key: "booking_vat_paw20" },
  { key: "booking_national_id" },
  { key: "booking_passport" },
];

interface DocAttachSelectorProps {
  // Kept for compatibility with the orchestrator's BookingOptionState shape —
  // BK-1.5 leaves this empty on the public page; the review step owns the
  // actual upload + linkage.
  documentIds: string[];
  onChange: (next: string[]) => void;
}

// Props destructured to empty so eslint no-unused-vars is satisfied without
// dropping the typed contract — the orchestrator still passes documentIds/
// onChange (BK-1 design) but the selector ignores them in BK-1.5.
export function DocAttachSelector({}: DocAttachSelectorProps) {
  const t = useTranslations("docAttachSelector");
  return (
    <fieldset className="rounded-2xl border border-border bg-white dark:bg-surface p-4 md:p-5">
      <legend className="px-2 inline-flex items-center gap-2 text-[13px] md:text-[14px] font-black text-[#111827] dark:text-white">
        <Paperclip className="w-4 h-4 text-primary-600" strokeWidth={2.6} />
        {t("title")}
      </legend>
      <p className="mt-1 text-[12px] md:text-[12.5px] leading-[1.55] text-muted font-medium">
        {t("help")}
      </p>

      <ul className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
        {SLOTS.map((slot) => (
          <li
            key={slot.key}
            className="flex items-start gap-2.5 rounded-xl border border-border bg-surface-alt/40 dark:bg-surface-alt/20 px-3 py-2 min-h-[44px]"
          >
            <FileText className="w-4 h-4 shrink-0 text-muted mt-0.5" strokeWidth={2.4} />
            <div className="flex-1 min-w-0">
              <p className="text-[12.5px] md:text-[13px] font-bold text-foreground leading-tight">
                {t(`slot_${slot.key}_label`)}
              </p>
              <p className="text-[11px] md:text-[11.5px] text-muted font-medium leading-tight mt-0.5">
                {t(`slot_${slot.key}_hint`)}
              </p>
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-3 flex items-start gap-2 rounded-lg border border-primary-200 bg-primary-50/50 dark:bg-primary-950/20 px-3 py-2 text-[11.5px] md:text-[12px] text-primary-800 dark:text-primary-200">
        <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" strokeWidth={2.6} />
        <p className="leading-snug">
          {t("reviewNotice")}
        </p>
      </div>
    </fieldset>
  );
}
