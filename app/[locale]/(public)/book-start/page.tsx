import { redirect } from "@/i18n/navigation";
import { getLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getBookingDraftRoute } from "@/actions/bookings";

/**
 * BK-1.9 — the public → "จองเลย" auth gate bridge.
 *
 * The booking detail page (`/book/[service]/[route]`) persists the chosen
 * options as a `bookings` row at `status='draft'` (anon-insertable per
 * `0079_bookings` RLS), then routes the visitor here carrying the draft id.
 * This route is the only piece that needs to know the visitor's auth state:
 *
 *   - signed in  → straight into `/book/<service>/<route>/review?draft=<id>`
 *   - guest      → `/register?next=/book-start?draft=<id>`. After register
 *                  completes it honours `next` and BOUNCES BACK HERE; this
 *                  time `auth.getUser()` is non-null, so the second pass
 *                  redirects into the review step. The draft survives the
 *                  round-trip because the option selections live in the DB,
 *                  keyed by the opaque `<id>` ridden through the query
 *                  string.
 *
 * Kept public (no auth gate of its own) on purpose — exactly the
 * `/start-order` pattern (its sibling). A protected layout's `requireAuth()`
 * would bounce a guest to a bare `/login` and lose the carry.
 *
 * Design: docs/research/booking-flow-system-2026-05-18.md §5.2 + §5.4.
 */

export const dynamic = "force-dynamic";

function buildReviewPath(serviceSlug: string, routeSlug: string | null): string {
  // The review step lives under the service[/route] folder; when the draft
  // has no route_slug (services that don't carry one — e.g. yuan-transfer)
  // we use a stable `_` placeholder so the dynamic segment is satisfied.
  const route = routeSlug && routeSlug.length > 0 ? routeSlug : "_";
  return `/book/${serviceSlug}/${route}/review`;
}

export default async function BookStartPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const locale = await getLocale();

  const rawDraft = sp.draft;
  const draftId =
    typeof rawDraft === "string" && rawDraft.length > 0 ? rawDraft : null;

  // Missing / malformed `draft` — there is nothing to carry. Land them on
  // the booking hub rather than dead-end.
  // i18n-key: booking.bookStart.missingDraft
  if (!draftId) {
    redirect({ href: "/book", locale });
    return;
  }

  // Resolve the draft → which service/route review URL we'd land in.
  // Uses the admin client (the action wraps it) so an anon guest can
  // resolve their own draft pre-auth. Only the route info is returned;
  // no PII leaves the row at this stage (the draft has none yet).
  const draftRes = await getBookingDraftRoute(draftId);
  if (!draftRes.ok) {
    // Unknown / wiped draft → also bounce to the hub. (Could surface a
    // toast in a later iteration; the silent redirect keeps BK-1 honest.)
    redirect({ href: "/book", locale });
    return;
  }
  const draft = draftRes.data;

  // Draft already submitted — there is nothing to "carry" anymore. Route
  // straight to the customer's booking detail page (the protected portal).
  if (draft.status !== "draft") {
    if (draft.profile_id && draft.id) {
      // The protected page is keyed by booking_no, which isn't on
      // DraftRouteInfo. The safer place is the bookings list — it will
      // show the row at its current status.
      redirect({ href: "/bookings", locale });
      return;
    }
    redirect({ href: "/book", locale });
    return;
  }

  const reviewHref = `${buildReviewPath(draft.service_slug, draft.route_slug)}?draft=${encodeURIComponent(draftId)}`;

  // Resolve auth — the gate's only real branch.
  const supabase = await createClient();
  const { data: { user }, error: dataErr } = await supabase.auth.getUser();
  if (dataErr) {
    console.error(`[supabase list] failed`, { code: dataErr.code, message: dataErr.message });
  }

  if (user) {
    // Signed in → straight into the review step. The draft id rides the
    // query string; the review page re-hydrates from it.
    redirect({ href: reviewHref, locale });
  } else {
    // Guest → through register carrying the bridge URL so they bounce
    // BACK here, then this branch becomes the `user` branch on pass two.
    // Carrying the bridge URL (not the review URL directly) keeps the
    // gate logic in exactly one place — here.
    const bounce = `/book-start?draft=${encodeURIComponent(draftId)}`;
    redirect({
      href: { pathname: "/register", query: { next: bounce } },
      locale,
    });
  }
}
