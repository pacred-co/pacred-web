"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Phone, User, MessageSquare } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { submitBooking } from "@/actions/bookings";
import { BookingDocUploader } from "@/components/booking/BookingDocUploader";

/**
 * BK-1.11 — the review-step contact block + "ยืนยันการจอง" submit.
 *
 * Client component held by `review/page.tsx`. The page hands us the
 * pre-filled contact values (from the profile or a prior draft edit);
 * we collect any edits + the free-text note and post `submitBooking`.
 *
 * On success → redirect to the public confirmation page keyed by the
 * BKYYMMDD-NNNN reference the action returns. The confirmation page is
 * intentionally public + dynamic — see `../confirmation/page.tsx`.
 */

interface Props {
  bookingId: string;
  serviceSlug: string;
  routeSlug: string | null;
  initialContactName: string;
  initialContactPhone: string;
  initialContactLine: string;
  initialNote: string;
}

// i18n-key: booking.review.errors.{key}
// Known server error codes that have a dedicated translated label.
const KNOWN_ERR_CODES = [
  "invalid_input",
  "not_signed_in",
  "not_found",
  "not_implemented",
] as const;

const INPUT_BASE =
  "w-full rounded-2xl border-[1.5px] border-border bg-white dark:bg-surface px-5 py-[15px] text-[15px] text-foreground placeholder:text-muted transition focus:border-primary-500 focus:outline-none focus:ring-4 focus:ring-primary-500/10";

export function ReviewForm({
  bookingId,
  serviceSlug,
  routeSlug,
  initialContactName,
  initialContactPhone,
  initialContactLine,
  initialNote,
}: Props) {
  const t = useTranslations("booking");
  const router = useRouter();
  const [name, setName] = useState(initialContactName);
  const [phone, setPhone] = useState(initialContactPhone);
  const [line, setLine] = useState(initialContactLine);
  const [note, setNote] = useState(initialNote);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name.trim() || !phone.trim()) {
      // i18n-key: booking.review.errors.missing_contact
      setError(t("review.errors.missing_contact"));
      return;
    }

    startTransition(async () => {
      const res = await submitBooking({
        bookingId,
        contactName: name.trim(),
        contactPhone: phone.trim(),
        contactLine: line.trim() || undefined,
        customerNote: note.trim() || undefined,
      });

      if (!res.ok) {
        setError(
          (KNOWN_ERR_CODES as readonly string[]).includes(res.error)
            ? t(`review.errors.${res.error}`)
            : res.error,
        );
        return;
      }

      const route = routeSlug && routeSlug.length > 0 ? routeSlug : "_";
      const target = `/book/${serviceSlug}/${route}/confirmation?no=${encodeURIComponent(res.data.bookingNo)}`;
      router.push(target);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {/* BK-1.5 (G1) — attach documents BEFORE submit (uploads are
          decoupled from submit; each upload is its own server action
          → file is linked to the booking the moment it's chosen). */}
      <BookingDocUploader bookingId={bookingId} />

      <form
        onSubmit={handleSubmit}
        className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm space-y-4"
      >
      <div>
        {/* i18n-key: booking.review.contact.title */}
        <h3 className="text-sm font-bold text-foreground">{t("review.contact.title")}</h3>
        {/* i18n-key: booking.review.contact.subtitle */}
        <p className="mt-1 text-xs text-muted">
          {t("review.contact.subtitle")}
        </p>
      </div>

      <Field
        label={t("review.contact.nameLabel")}
        icon={<User className="h-4 w-4" />}
        required
      >
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("review.contact.namePlaceholder")}
          className={`${INPUT_BASE} pl-11`}
          autoComplete="name"
        />
      </Field>

      <Field
        label={t("review.contact.phoneLabel")}
        icon={<Phone className="h-4 w-4" />}
        required
      >
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder={t("review.contact.phonePlaceholder")}
          className={`${INPUT_BASE} pl-11`}
          autoComplete="tel"
        />
      </Field>

      <Field
        label={t("review.contact.lineLabel")}
        icon={<MessageSquare className="h-4 w-4" />}
      >
        <input
          type="text"
          value={line}
          onChange={(e) => setLine(e.target.value)}
          placeholder="@your-line-id"
          className={`${INPUT_BASE} pl-11`}
        />
      </Field>

      <div>
        <label className="mb-1.5 block text-[12.5px] font-semibold text-foreground">
          {/* i18n-key: booking.review.contact.note */}
          {t("review.contact.note")}
        </label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={4}
          placeholder={t("review.contact.notePlaceholder")}
          className={`${INPUT_BASE} resize-none`}
        />
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 dark:bg-red-900/20 px-3 py-2 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary-600 px-4 py-[15px] text-[15px] font-semibold text-white shadow-[0_8px_20px_rgba(179,0,0,0.25)] transition hover:-translate-y-0.5 hover:bg-primary-700 hover:shadow-[0_12px_25px_rgba(179,0,0,0.35)] disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-70"
      >
        {pending && <Loader2 className="h-4 w-4 animate-spin" />}
        {/* i18n-key: booking.review.submit */}
        {t("review.submit")}
      </button>

      {/* i18n-key: booking.review.fineprint */}
      <p className="text-center text-[11px] leading-snug text-muted">
        {t("review.fineprint")}
      </p>
      </form>
    </div>
  );
}

function Field({
  label,
  icon,
  required,
  children,
}: {
  label: string;
  icon?: React.ReactNode;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-[12.5px] font-semibold text-foreground">
        {label}
        {required && <span className="ml-1 text-primary-600">*</span>}
      </label>
      <div className="relative">
        {icon && (
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted">
            {icon}
          </span>
        )}
        {children}
      </div>
    </div>
  );
}
