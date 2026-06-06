import { redirect } from "@/i18n/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Footer } from "@/components/sections/footer";
import { getServiceConfig } from "@/lib/booking/service-config";
import { CONTACT, LINE_OA } from "@/components/seo/site";
import { ReviewForm } from "./review-form";
import type { QuoteLine } from "@/types/booking";

/**
 * BK-1.11 — the review step.
 *
 * Pacred's "one last look" screen (§2.7 / §5.3):
 *   1. Display the chosen options + the itemised estimate one last time.
 *   2. Edit the contact block (pre-filled from the profile).
 *   3. Press "ยืนยันการจอง" → `submitBooking()` → confirmation.
 *
 * Auth contract: reached either directly by an already-logged-in user
 * (skipped past `/book-start`) or by a guest-now-registered returning
 * from `/register` via the `next` carry. Either way the user is
 * authenticated by the time this server component runs — if not we
 * bounce back through the gate so the carry stays single-pathed.
 *
 * Design: docs/research/booking-flow-system-2026-05-18.md §5.3 + §5.4.
 */

export const dynamic = "force-dynamic";

interface BookingDraftRow {
  id: string;
  status: string;
  service_slug: string;
  route_slug: string | null;
  transport_mode: string | null;
  profile_id: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  contact_line: string | null;
  customer_note: string | null;
  estimate_total: number;
  estimate_breakdown: QuoteLine[] | null;
  pickup_address: string | null;
  dropoff_address: string | null;
  doc_mode: string;
}

interface BookingOptionRow {
  option_key: string;
  option_label: string;
  detail: string | null;
  quantity: number;
  line_amount: number;
}

interface ProfileRow {
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  line_id: string | null;
}

export default async function BookingReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ service: string; route: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { service: serviceParam, route: routeParam } = await params;
  const sp = await searchParams;
  const locale = await getLocale();
  const t = await getTranslations("booking");

  const draftId =
    typeof sp.draft === "string" && sp.draft.length > 0 ? sp.draft : null;

  // No draft → there is nothing to review. Fall back to the booking hub
  // so the customer can start fresh.
  // i18n-key: booking.review.missingDraft
  if (!draftId) {
    redirect({ href: "/book", locale });
    return;
  }

  // Require auth — if a guest somehow reached this URL directly, push
  // them through `/book-start` so the carry contract stays one-pathed.
  const supabase = await createClient();
  const { data: { user }, error: dataErr } = await supabase.auth.getUser();
  if (dataErr) {
    console.error(`[supabase list] failed`, { code: dataErr.code, message: dataErr.message });
  }
  if (!user) {
    redirect({
      href: {
        pathname: "/book-start",
        query: { draft: draftId },
      },
      locale,
    });
    return;
  }

  // Load the draft. Two pathways:
  //   - cookie-bound `bookings_customer_read` policy works once
  //     `profile_id = auth.uid()` — true the moment the customer has
  //     visited `/book-start` post-auth (book-start does not bind, but
  //     submit will). Pre-submit drafts have `profile_id = null`, so a
  //     plain cookie read returns nothing.
  //   - so for the review step we use the admin client to fetch the row,
  //     then assert the draft is either OURS (profile_id === auth.uid())
  //     OR still unclaimed (profile_id === null) — exactly the carry
  //     scenario.
  const admin = createAdminClient();
  const { data: draft, error: draftErr } = await admin
    .from("bookings")
    .select(
      "id, status, service_slug, route_slug, transport_mode, profile_id, " +
      "contact_name, contact_phone, contact_line, customer_note, " +
      "estimate_total, estimate_breakdown, pickup_address, dropoff_address, doc_mode",
    )
    .eq("id", draftId)
    .maybeSingle<BookingDraftRow>();
  if (draftErr) {
    console.error(`[bookings list] failed`, { code: draftErr.code, message: draftErr.message });
  }

  if (!draft) {
    redirect({ href: "/book", locale });
    return;
  }

  // Wrong owner — a different signed-in user, or a draft that already
  // got bound to someone else. Don't leak anything; route them out.
  if (draft.profile_id && draft.profile_id !== user.id) {
    redirect({ href: "/book", locale });
    return;
  }

  // Already submitted — there's no review left. Send the customer to
  // their bookings list (the per-booking link is keyed by booking_no
  // which isn't on draftRoute; the list is the safe landing).
  if (draft.status !== "draft") {
    redirect({ href: "/bookings", locale });
    return;
  }

  // Confirm the URL matches the draft (defence-in-depth — a customer
  // shouldn't be able to confuse the review by hand-editing the path).
  if (
    draft.service_slug !== serviceParam ||
    (draft.route_slug ?? "_") !== routeParam
  ) {
    const fixedRoute = draft.route_slug ?? "_";
    redirect({
      href: `/book/${draft.service_slug}/${fixedRoute}/review?draft=${encodeURIComponent(draftId)}`,
      locale,
    });
    return;
  }

  // Pull the picked options (line-items) for the read-only summary.
  const { data: options, error: optionsErr } = await admin
    .from("booking_options")
    .select("option_key, option_label, detail, quantity, line_amount")
    .eq("booking_id", draft.id)
    .order("position", { ascending: true });
  if (optionsErr) {
    console.error(`[booking_options list] failed`, { code: optionsErr.code, message: optionsErr.message });
  }

  // Pre-fill the contact-block from the profile (editable on submit).
  const { data: profile, error: profileErr } = await admin
    .from("profiles")
    .select("first_name, last_name, phone, line_id")
    .eq("id", user.id)
    .maybeSingle<ProfileRow>();
  if (profileErr) {
    console.error(`[profiles list] failed`, { code: profileErr.code, message: profileErr.message });
  }

  const initialContactName =
    draft.contact_name ??
    [profile?.first_name, profile?.last_name].filter(Boolean).join(" ").trim() ??
    "";
  const initialContactPhone = draft.contact_phone ?? profile?.phone ?? "";
  const initialContactLine = draft.contact_line ?? profile?.line_id ?? "";
  const initialNote = draft.customer_note ?? "";

  const cfg = getServiceConfig(draft.service_slug);
  const isTh = locale !== "en";
  const serviceTitle = cfg
    ? isTh ? cfg.titleTh : cfg.titleEn
    : draft.service_slug;
  const serviceSub = cfg ? (isTh ? cfg.subTh : cfg.subEn) : "";

  const breakdown: QuoteLine[] = Array.isArray(draft.estimate_breakdown)
    ? draft.estimate_breakdown
    : [];

  return (
    <>
      <main className="mx-auto w-full max-w-[920px] px-4 py-10">
        {/* i18n-key: booking.review.kicker */}
        <p className="text-xs font-semibold tracking-widest text-primary-600">
          {t("review.kicker")}
        </p>
        {/* i18n-key: booking.review.title */}
        <h1 className="mt-1 text-2xl font-bold text-foreground sm:text-3xl">
          {t("review.heading")}
        </h1>
        {/* i18n-key: booking.review.subtitle */}
        <p className="mt-1 text-sm text-muted">
          {t("review.subtitle")}
        </p>

        <div className="mt-6 grid gap-5 lg:grid-cols-[1fr_360px] lg:items-start">
          {/* ── LEFT: form + service summary ─────────────────────── */}
          <div className="space-y-5">
            <ServiceCard
              title={serviceTitle}
              sub={serviceSub}
              routeSlug={draft.route_slug}
              transportMode={draft.transport_mode}
              docMode={draft.doc_mode}
              pickup={draft.pickup_address}
              dropoff={draft.dropoff_address}
              t={t}
            />

            <OptionsSummaryCard options={options ?? []} t={t} />

            <ReviewForm
              bookingId={draft.id}
              serviceSlug={draft.service_slug}
              routeSlug={draft.route_slug}
              initialContactName={initialContactName}
              initialContactPhone={initialContactPhone}
              initialContactLine={initialContactLine}
              initialNote={initialNote}
            />
          </div>

          {/* ── RIGHT: estimate panel (sticky on desktop) ─────────── */}
          <aside className="lg:sticky lg:top-24">
            <EstimatePanel
              total={Number(draft.estimate_total ?? 0)}
              rows={breakdown}
              t={t}
            />

            <FallbackChannelsCard t={t} />
          </aside>
        </div>
      </main>
      <Footer />
    </>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Read-only summary cards (server-rendered)
// ──────────────────────────────────────────────────────────────────────

function ServiceCard({
  title,
  sub,
  routeSlug,
  transportMode,
  docMode,
  pickup,
  dropoff,
  t,
}: {
  title: string;
  sub: string;
  routeSlug: string | null;
  transportMode: string | null;
  docMode: string;
  pickup: string | null;
  dropoff: string | null;
  t: Awaited<ReturnType<typeof getTranslations<"booking">>>;
}) {
  // i18n-key: booking.review.docMode.{none|tax_invoice|customs_declaration}
  const DOC_LABEL: Record<string, string> = {
    none: t("review.docMode.none"),
    tax_invoice: t("review.docMode.tax_invoice"),
    customs_declaration: t("review.docMode.customs_declaration"),
  };

  return (
    <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm">
      <h2 className="text-base font-bold text-foreground">{title}</h2>
      {sub && <p className="mt-1 text-sm text-muted">{sub}</p>}

      <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 text-sm">
        {routeSlug && (
          <Row label={t("review.field.route")} value={routeSlug} mono />
        )}
        {transportMode && (
          <Row label={t("review.field.transportMode")} value={transportMode} />
        )}
        <Row label={t("review.field.docHandling")} value={DOC_LABEL[docMode] ?? docMode} />
        {pickup && <Row label={t("review.field.pickup")} value={pickup} />}
        {dropoff && <Row label={t("review.field.dropoff")} value={dropoff} />}
      </dl>
    </section>
  );
}

function OptionsSummaryCard({
  options,
  t,
}: {
  options: BookingOptionRow[];
  t: Awaited<ReturnType<typeof getTranslations<"booking">>>;
}) {
  if (options.length === 0) {
    return (
      <section className="rounded-2xl border border-dashed border-border p-5 text-sm text-muted">
        {/* i18n-key: booking.review.options.empty */}
        {t("review.options.empty")}
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm">
      {/* i18n-key: booking.review.options.title */}
      <h3 className="text-sm font-bold text-foreground">{t("review.options.title")}</h3>
      <ul className="mt-3 divide-y divide-border text-sm">
        {options.map((o) => (
          <li
            key={`${o.option_key}-${o.option_label}`}
            className="flex items-center justify-between gap-3 py-2.5"
          >
            <div className="min-w-0">
              <p className="font-medium text-foreground">{o.option_label}</p>
              {o.detail && (
                <p className="text-xs text-muted mt-0.5">{o.detail}</p>
              )}
            </div>
            <p className="shrink-0 text-sm font-semibold text-foreground tabular-nums">
              ฿{Number(o.line_amount).toLocaleString("th-TH")}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function EstimatePanel({
  total,
  rows,
  t,
}: {
  total: number;
  rows: QuoteLine[];
  t: Awaited<ReturnType<typeof getTranslations<"booking">>>;
}) {
  return (
    <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm">
      {/* i18n-key: booking.review.estimate.title */}
      <p className="text-xs font-semibold tracking-widest text-primary-600">
        {t("review.estimate.title")}
      </p>

      {rows.length > 0 && (
        <ul className="mt-3 divide-y divide-border text-sm">
          {rows.map((r) => (
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
      )}

      <div className="mt-3 border-t border-border pt-3 flex items-baseline justify-between">
        {/* i18n-key: booking.review.estimate.total */}
        <p className="text-sm font-semibold text-foreground">{t("review.estimate.total")}</p>
        <p className="text-xl font-bold text-primary-600 tabular-nums">
          ฿{Number(total).toLocaleString("th-TH")}
        </p>
      </div>

      {/* The estimate-honesty rule (§4.7) — must repeat here. */}
      {/* i18n-key: booking.review.estimate.disclaimer */}
      <p className="mt-2 text-[11px] leading-snug text-muted">
        {t("review.estimate.disclaimer")}
      </p>
    </section>
  );
}

function FallbackChannelsCard({
  t,
}: {
  t: Awaited<ReturnType<typeof getTranslations<"booking">>>;
}) {
  return (
    <section className="mt-4 rounded-2xl border border-border bg-white dark:bg-surface p-4">
      {/* i18n-key: booking.review.help.title */}
      <p className="text-xs font-semibold text-foreground">{t("review.help.title")}</p>
      <div className="mt-2 flex flex-col gap-1.5 text-xs">
        <a
          href={LINE_OA.addFriendUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary-600 hover:text-primary-700 hover:underline"
        >
          {t("review.help.line", { id: LINE_OA.premiumId })}
        </a>
        <a
          href={`tel:${CONTACT.phone}`}
          className="text-primary-600 hover:text-primary-700 hover:underline"
        >
          {t("review.help.phone", { phone: CONTACT.phoneDisplay })}
        </a>
      </div>
    </section>
  );
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
