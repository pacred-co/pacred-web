import { redirect } from "@/i18n/navigation";
import { getLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";

/**
 * G-F-2 — the public → "กดซื้อ" bridge.
 *
 * The home `BookingCalculator` computes a real freight price; the priced
 * `ResultBox` links here carrying the quote. This route is the only piece
 * that needs to know the visitor's auth state:
 *   - signed in  → straight into the matching protected order flow with the
 *                  quote pre-filled (`/service-import/add` or
 *                  `/service-order/add`).
 *   - guest      → `/login?next=<that same order URL>`. After login the
 *                  login page honours `next` and lands them in the order
 *                  flow with the quote intact.
 *
 * Kept public (no auth gate) on purpose — a guest MUST be able to reach it
 * so we can capture the `next` redirect before the protected layout's
 * `requireAuth()` would bounce them to a bare `/login`.
 */

export const dynamic = "force-dynamic";

// Booking-calculator modes that map to a protected order flow. `sea` / `truck`
// / `air` are freight → `/service-import`; `sourcing` is China shop-order →
// `/service-order`. `customs` / `remit` have no self-serve order flow yet.
const IMPORT_MODES = new Set(["sea", "truck", "air"]);

function buildOrderUrl(sp: Record<string, string | string[] | undefined>): string | null {
  const mode = typeof sp.mode === "string" ? sp.mode : "";

  // Carry only the calculator fields the order forms can consume. Numeric
  // values are passed through as-is; the destination form re-validates.
  const carry = new URLSearchParams();
  carry.set("from", "booking");
  for (const key of ["weight", "volume", "price", "term", "size", "sub", "transport"]) {
    const v = sp[key];
    if (typeof v === "string" && v !== "") carry.set(key, v);
  }

  if (IMPORT_MODES.has(mode)) {
    carry.set("mode", mode);
    return `/service-import/add?${carry.toString()}`;
  }
  if (mode === "sourcing") {
    return `/service-order/add?${carry.toString()}`;
  }
  return null;
}

export default async function StartOrderPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const locale = await getLocale();

  const orderUrl = buildOrderUrl(sp);
  // Unknown / unsupported mode → fall back to the service catalogue rather
  // than dead-end.
  if (!orderUrl) {
    redirect({ href: "/services", locale });
    return;
  }

  const supabase = await createClient();
  const { data: { user }, error: dataErr } = await supabase.auth.getUser();
  if (dataErr) {
    console.error(`[supabase list] failed`, { code: dataErr.code, message: dataErr.message });
  }

  if (user) {
    // Signed in → straight into the order flow with the quote pre-filled.
    redirect({ href: orderUrl, locale });
  } else {
    // Guest → through login carrying the order URL so they return here.
    redirect({ href: { pathname: "/login", query: { next: orderUrl } }, locale });
  }
}
