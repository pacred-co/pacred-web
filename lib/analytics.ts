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
