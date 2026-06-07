import { redirect, Link } from "@/i18n/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { CheckCircle2, MessageCircle, Phone } from "lucide-react";
import { Footer } from "@/components/sections/footer";
import { createAdminClient } from "@/lib/supabase/admin";
import { getServiceConfig } from "@/lib/booking/service-config";
import { CONTACT, LINE_OA } from "@/components/seo/site";
import type { QuoteLine } from "@/types/booking";

/**
 * BK-1.11 — booking confirmation.
 *
 * Public + dynamic. The customer lands here right after `submitBooking()`
 * returns, with `?no=<BKYYMMDD-NNNN>`. We show a green success card with
 * the reference + the chosen options + the (frozen) estimate + the honest
 * next step ("ทีมขายจะติดต่อกลับ"), and we link to the customer-portal
 * `/bookings` list so the customer never dead-ends.
 *
 * The estimate-honesty rule (§4.7) repeats here — the price is presented
 * as an estimate; the rep confirms the real number.
 *
 * Design: docs/research/booking-flow-system-2026-05-18.md §5.3.
 */

export const dynamic = "force-dynamic";

interface BookingRow {
  id: string;
  booking_no: string;
  status: string;
  service_slug: string;
  route_slug: string | null;
  transport_mode: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  estimate_total: number;
  estimate_breakdown: QuoteLine[] | null;
  doc_mode: string;
  pickup_address: string | null;
  dropoff_address: string | null;
  submitted_at: string | null;
}

interface BookingOptionRow {
  option_key: string;
  option_label: string;
  detail: string | null;
  quantity: number;
  line_amount: number;
}

export default async function BookingConfirmationPage({
  params,
  searchParams,
}: {
  params: Promise<{ service: string; route: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { service: serviceParam } = await params;
  const sp = await searchParams;
  const locale = await getLocale();
  const t = await getTranslations("booking");

  const bookingNo =
    typeof sp.no === "string" && sp.no.length > 0 ? sp.no : null;
  if (!bookingNo) {
    redirect({ href: "/book", locale });
    return;
  }

  // Use the admin client — the confirmation surface is reached by URL,
  // and we already trust the BKYYMMDD-NNNN as a recently-issued reference.
  // We restrict the SELECT to the columns we display + never echo any
  // editable PII (just contact_name first-name for the greeting).
  const admin = createAdminClient();
  const { data: booking, error: bookingErr } = await admin
    .from("bookings")
    .select(
      "id, booking_no, status, service_slug, route_slug, transport_mode, " +
      "contact_name, contact_phone, estimate_total, estimate_breakdown, " +
      "doc_mode, pickup_address, dropoff_address, submitted_at",
    )
    .eq("booking_no", bookingNo)
    .maybeSingle<BookingRow>();
  if (bookingErr) {
    console.error(`[bookings list] failed`, { code: bookingErr.code, message: bookingErr.message });
  }

  if (!booking) {
    redirect({ href: "/book", locale });
    return;
  }

  // A still-draft booking should not have reached the confirmation page;
  // bounce back through the gate.
  if (booking.status === "draft") {
    redirect({
      href: { pathname: "/book-start", query: { draft: booking.id } },
      locale,
    });
    return;
  }

  // Defence-in-depth — keep the URL consistent with the booking.
  if (booking.service_slug !== serviceParam) {
    redirect({
      href: `/book/${booking.service_slug}/${booking.route_slug ?? "_"}/confirmation?no=${encodeURIComponent(booking.booking_no)}`,
      locale,
    });
    return;
  }

  const { data: options, error: optionsErr } = await admin
    .from("booking_options")
    .select("option_key, option_label, detail, quantity, line_amount")
    .eq("booking_id", booking.id)
    .order("position", { ascending: true });
  if (optionsErr) {
    console.error(`[booking_options list] failed`, { code: optionsErr.code, message: optionsErr.message });
  }

  const cfg = getServiceConfig(booking.service_slug);
  const isTh = locale !== "en";
  const serviceTitle = cfg
    ? isTh ? cfg.titleTh : cfg.titleEn
    : booking.service_slug;

  const greetingName = (booking.contact_name ?? "").split(" ")[0] ?? "";

  const breakdown: QuoteLine[] = Array.isArray(booking.estimate_breakdown)
    ? booking.estimate_breakdown
    : [];

  return (
    <>
      <main className="mx-auto w-full max-w-[760px] px-4 py-12">
        {/* ── Success hero ────────────────────────────────────── */}
        <section className="rounded-3xl border-2 border-green-200 bg-green-50/50 dark:border-green-900/50 dark:bg-green-950/20 p-6 text-center sm:p-8">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/40">
            <CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-400" />
          </div>
          {/* i18n-key: booking.confirmation.title */}
          <h1 className="mt-4 text-2xl font-bold text-foreground sm:text-3xl">
            {greetingName
              ? t("confirmation.titleWithName", { name: greetingName })
              : t("confirmation.titlePlain")}
          </h1>
          {/* i18n-key: booking.confirmation.subtitle */}
          <p className="mt-2 text-sm text-muted">
            {t("confirmation.subtitle")}
          </p>

          <div className="mt-5 inline-block rounded-2xl border border-border bg-white dark:bg-surface px-5 py-3 text-left shadow-sm">
            {/* i18n-key: booking.confirmation.referenceLabel */}
            <p className="text-[11px] uppercase tracking-widest text-muted">
              {t("confirmation.referenceLabel")}
            </p>
            <p className="mt-0.5 text-xl font-bold tracking-wide text-primary-600 font-mono">
              {booking.booking_no}
            </p>
          </div>
        </section>

        {/* ── Booking summary (read-only) ──────────────────────── */}
        <section className="mt-5 rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm">
          <h2 className="text-base font-bold text-foreground">{serviceTitle}</h2>
          <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
            {booking.route_slug && (
              <Row label={t("confirmation.field.route")} value={booking.route_slug} mono />
            )}
            {booking.transport_mode && (
              <Row label={t("confirmation.field.transportMode")} value={booking.transport_mode} />
            )}
            <Row label={t("confirmation.field.docHandling")} value={docModeLabel(booking.doc_mode, t)} />
            {booking.contact_phone && (
              <Row label={t("confirmation.field.contactPhone")} value={booking.contact_phone} mono />
            )}
            {booking.pickup_address && (
              <Row label={t("confirmation.field.pickup")} value={booking.pickup_address} />
            )}
            {booking.dropoff_address && (
              <Row label={t("confirmation.field.dropoff")} value={booking.dropoff_address} />
            )}
            {booking.submitted_at && (
              <Row
                label={t("confirmation.field.bookedDate")}
                value={new Date(booking.submitted_at).toLocaleString("th-TH", {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              />
            )}
          </dl>
        </section>

        {/* ── Estimate breakdown (frozen snapshot) ──────────────── */}
        <section className="mt-5 rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm">
          {/* i18n-key: booking.confirmation.estimate.title */}
          <p className="text-xs font-semibold tracking-widest text-primary-600">
            {t("confirmation.estimate.title")}
          </p>

          {breakdown.length > 0 ? (
            <ul className="mt-3 divide-y divide-border text-sm">
              {breakdown.map((r) => (
                <li
                  key={r.key}
                  className="flex items-start justify-between gap-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">{r.label}</p>
                    {r.detail && (
                      <p className="text-xs text-muted mt-0.5">{r.detail}</p>
                    )}
                  </div>
                  <p className="shrink-0 text-sm tabular-nums">
                    ฿{Number(r.amount).toLocaleString("th-TH")}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            (options ?? []).length > 0 && (
              <ul className="mt-3 divide-y divide-border text-sm">
                {((options ?? []) as unknown as BookingOptionRow[]).map((o) => (
                  <li
                    key={`${o.option_key}-${o.option_label}`}
                    className="flex items-center justify-between gap-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-foreground">
                        {o.option_label}
                      </p>
                      {o.detail && (
                        <p className="text-xs text-muted mt-0.5">{o.detail}</p>
                      )}
                    </div>
                    <p className="shrink-0 text-sm tabular-nums">
                      ฿{Number(o.line_amount).toLocaleString("th-TH")}
                    </p>
                  </li>
                ))}
              </ul>
            )
          )}

          <div className="mt-3 border-t border-border pt-3 flex items-baseline justify-between">
            <p className="text-sm font-semibold text-foreground">{t("confirmation.estimate.total")}</p>
            <p className="text-xl font-bold text-primary-600 tabular-nums">
              ฿{Number(booking.estimate_total ?? 0).toLocaleString("th-TH")}
            </p>
          </div>

          {/* i18n-key: booking.confirmation.estimate.disclaimer */}
          <p className="mt-2 text-[11px] leading-snug text-muted">
            {t("confirmation.estimate.disclaimer")}
          </p>
        </section>

        {/* ── Contact + next steps ──────────────────────────────── */}
        <section className="mt-5 rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm">
          {/* i18n-key: booking.confirmation.contact.title */}
          <h3 className="text-sm font-bold text-foreground">
            {t("confirmation.contact.title")}
          </h3>
          <p className="mt-1 text-xs text-muted">
            {t("confirmation.contact.subtitle")}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <a
              href={LINE_OA.addFriendUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-2xl bg-[#06C755] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#05b54c]"
            >
              <MessageCircle className="h-4 w-4" />
              {t("confirmation.contact.line", { id: LINE_OA.premiumId })}
            </a>
            <a
              href={`tel:${CONTACT.phone}`}
              className="flex items-center gap-2 rounded-2xl border-[1.5px] border-border bg-white dark:bg-surface px-4 py-2.5 text-sm font-semibold text-foreground transition hover:border-primary-300 hover:text-primary-600"
            >
              <Phone className="h-4 w-4" />
              {t("confirmation.contact.phone", { phone: CONTACT.phoneDisplay })}
            </a>
          </div>
        </section>

        {/* ── Next-action: don't dead-end ───────────────────────── */}
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <Link
            href="/bookings"
            className="text-sm font-semibold text-primary-600 hover:text-primary-700 hover:underline"
          >
            {t("confirmation.viewAllMine")}
          </Link>
          <Link
            href="/"
            className="text-sm text-muted hover:text-foreground"
          >
            {t("confirmation.backHome")}
          </Link>
        </div>
      </main>
      <Footer />
    </>
  );
}

function docModeLabel(
  mode: string,
  t: Awaited<ReturnType<typeof getTranslations<"booking">>>,
): string {
  // i18n-key: booking.confirmation.docMode.{none|tax_invoice|customs_declaration}
  switch (mode) {
    case "tax_invoice":
      return t("confirmation.docMode.tax_invoice");
    case "customs_declaration":
      return t("confirmation.docMode.customs_declaration");
    default:
      return t("confirmation.docMode.none");
  }
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd
        className={`mt-0.5 text-sm font-medium text-foreground ${mono ? "font-mono" : ""}`}
      >
        {value}
      </dd>
    </div>
  );
}
