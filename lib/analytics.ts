// Client-safe analytics — pushes typed events to GTM dataLayer.
//
// Behaviour:
// - Server-side call: no-op (no window).
// - Client + NEXT_PUBLIC_GTM_ID set: pushes to window.dataLayer for GTM to consume.
// - Client + NEXT_PUBLIC_GTM_ID unset + dev: console.log so wiring is verifiable
//   without an account; prod = silent (no console noise for end users).
//
// Pairs with `components/analytics/gtm-script.tsx` which injects the container
// loader when NEXT_PUBLIC_GTM_ID is set.

type DataLayerEntry = Record<string, unknown>;
type EventPayload = DataLayerEntry & { event: string };

declare global {
  interface Window {
    dataLayer?: DataLayerEntry[];
    clarity?: (action: string, ...args: unknown[]) => void;
  }
}

function isClient(): boolean {
  return typeof window !== "undefined";
}

function isGtmActive(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_GTM_ID);
}

/**
 * Push a custom event onto GTM's dataLayer.
 * Use the typed helpers below in app code; reach for `track()` only for
 * one-offs that don't justify a helper yet.
 */
export function track(event: string, params: DataLayerEntry = {}): void {
  if (!isClient()) return;

  const payload: EventPayload = { event, ...params };

  if (!isGtmActive()) {
    if (process.env.NODE_ENV === "development") {
      console.log("[analytics:no-gtm]", payload);
    }
    return;
  }

  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push(payload);
}

// ── GA4-recommended event helpers ────────────────────────────────
// Names follow GA4 recommended events
// (https://developers.google.com/analytics/devguides/collection/ga4/reference/events)
// so they map cleanly inside GTM without rename mappings.

export type SignUpMethod = "personal" | "juristic" | "oauth_google" | "oauth_facebook";
export type LoginMethod = "phone" | "email" | "member_code" | "oauth_google" | "oauth_facebook";
export type OrderType = "service_order" | "service_import" | "service_payment";

/** Customer completed registration (personal, juristic step-3 final, or first OAuth profile create). */
export function trackSignUp(method: SignUpMethod, memberCode?: string): void {
  track("sign_up", {
    method,
    ...(memberCode ? { member_code: memberCode } : {}),
  });
}

/** Customer signed in. */
export function trackLogin(method: LoginMethod): void {
  track("login", { method });
}

/** Lead/contact form submitted — e.g., /contact, sales-rep cards. */
export function trackGenerateLead(source: string): void {
  track("generate_lead", { source });
}

/** Customer placed an order (cargo / forwarder / yuan-payment). */
export function trackPlaceOrder(orderType: OrderType, valueTHB?: number): void {
  track("place_order", {
    order_type: orderType,
    ...(valueTHB !== undefined ? { value: valueTHB, currency: "THB" } : {}),
  });
}

/** Wallet deposit confirmed (admin approved the slip). */
export function trackWalletDeposit(valueTHB: number): void {
  track("wallet_deposit", { value: valueTHB, currency: "THB" });
}

/**
 * Generic CTA click — for buttons / links where a richer event helper
 * doesn't yet exist. Use `label` for the action (e.g., "booking_calculate",
 * "sales_phone") and `location` for the page section (e.g., "home_hero",
 * "home_sales_win"). Keep both as stable snake_case keys so GA4
 * segmentation works without renames.
 */
export function trackCtaClick(
  label: string,
  location: string,
  extra: DataLayerEntry = {},
): void {
  track("cta_click", { label, location, ...extra });
}

// ── Microsoft Clarity helpers (L-23) ─────────────────────────────
// Clarity is loaded by `components/analytics/clarity-script.tsx`. These
// helpers are no-op on server + safe to call before the tag finishes
// loading (window.clarity is the queue function itself).

/**
 * Tag the current Clarity session with a custom key/value. Useful for
 * filtering recordings later — e.g., `clarityTag("plan", "juristic")` lets
 * you watch only juristic-customer sessions in the Clarity dashboard.
 */
export function clarityTag(key: string, value: string): void {
  if (typeof window === "undefined") return;
  window.clarity?.("set", key, value);
}

/**
 * Fire a custom Clarity event — shows up as a marker in the session
 * timeline. Use sparingly for high-signal moments only (e.g., signup-success,
 * cart-abandoned). For funnel analysis, prefer GA4 events via `track()`.
 */
export function clarityEvent(name: string): void {
  if (typeof window === "undefined") return;
  window.clarity?.("event", name);
}

/**
 * Identify the signed-in customer so Clarity recordings can be tied back
 * to a specific user. Pass `profileId` (uuid) — never PII. Call once
 * after successful sign-in if the customer has consented to recording.
 */
export function clarityIdentify(profileId: string): void {
  if (typeof window === "undefined") return;
  window.clarity?.("identify", profileId);
}

// ── A/B experiment exposure (L-24) ───────────────────────────────
// Fire once per (experiment, variant) pair per page-view so GA4 can
// segment downstream conversions by variant. Pairs with `lib/experiments.ts`.

/**
 * Tell GTM/GA4 that a visitor saw a specific experiment variant. Call
 * this when the component implementing the variant actually renders —
 * not on every getVariant() invocation — so exposure counts match
 * actual impressions.
 */
export function trackExperimentExposure(
  experimentKey: string,
  variant: string,
): void {
  track("experiment_exposure", {
    experiment_id: experimentKey,
    variant,
  });
  // Also tag the Clarity session so recordings filter by variant
  clarityTag(`exp_${experimentKey}`, variant);
}
