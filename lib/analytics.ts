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

/** Customer signed out — fired before the form-post navigation. */
export function trackSignOut(): void {
  track("logout");
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

/**
 * Customer submitted a wallet deposit (slip uploaded, awaiting admin approve).
 * Fires at customer-session-time so GTM/GA4 sees the conversion under the
 * acquisition-attributed user — admin approval happens later in admin's
 * session and would mis-attribute. The pending → approved transition is
 * operational, not attribution-relevant.
 */
export function trackWalletDeposit(valueTHB: number): void {
  track("wallet_deposit", { value: valueTHB, currency: "THB" });
}

/** Customer submitted a wallet withdraw request (admin approve still pending). */
export function trackWalletWithdrawRequest(valueTHB: number): void {
  track("wallet_withdraw_request", { value: valueTHB, currency: "THB" });
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

// ─── Google Ads conversions ──────────────────────────────────────────────
// The gtag runtime is loaded from `components/analytics/google-ads-script.tsx`
// (the `AW-17941254120` account). These helpers wrap `gtag('event','conversion')`
// for the conversion IDs the owner registers in Google Ads. Hardcoded labels
// per the owner directive (tracking IDs are embedded in code).

/**
 * Registered conversion send_to IDs — `<account>/<label>`. Add an entry
 * each time the owner sets up a new conversion in Google Ads.
 */
export const GOOGLE_ADS_CONVERSIONS = {
  /** Purchase / "การซื้อ" — fires on the order-confirmation page once
   *  payment succeeds (owner-provided 2026-05-21). */
  purchase: "AW-17941254120/9c-FCOq1h68cEOifh-tC",
} as const;

export type GoogleAdsConversionParams = {
  /** transaction_id — must be unique per real conversion (e.g. the order
   *  ID), else Google Ads dedupes repeat fires. Omit/leave empty when the
   *  event isn't tied to a specific transaction. */
  transactionId?: string;
  /** Monetary value of the conversion (defaults currency to THB). */
  value?: number;
  /** Currency code, e.g. "THB" / "USD" — only used when `value` is set. */
  currency?: string;
  /** Whether this customer is new (true/false), for the new-customer
   *  conversion segment. Compute dynamically; don't hardcode. */
  newCustomer?: boolean;
  /** Fires after gtag has sent the conversion — used by the click-then-
   *  navigate pattern (see `reportConversionAndNavigate` below). */
  eventCallback?: () => void;
};

/**
 * Fire a Google Ads conversion. Pass one of `GOOGLE_ADS_CONVERSIONS.*`.
 *
 * Page-load pattern (e.g. on the order-confirmation page) — fire once
 * the order is committed, inside a `useEffect`:
 *
 *   useEffect(() => {
 *     trackGoogleAdsConversion(GOOGLE_ADS_CONVERSIONS.purchase, {
 *       transactionId: order.id,
 *       value:         order.total,
 *       newCustomer:   isFirstOrder,
 *     });
 *   }, [order.id]);
 */
export function trackGoogleAdsConversion(
  sendTo: string,
  params: GoogleAdsConversionParams = {},
): void {
  if (!isClient()) return;
  const w = window as Window & { gtag?: (...args: unknown[]) => void };
  if (typeof w.gtag !== "function") {
    // gtag loader not present (env w/o the GoogleAdsScript). Dev-loud, prod-silent.
    if (process.env.NODE_ENV !== "production") {
      console.log("[ads] gtag not loaded — would have sent:", sendTo, params);
    }
    return;
  }

  const payload: Record<string, unknown> = {
    send_to:        sendTo,
    transaction_id: params.transactionId ?? "",
  };
  if (params.value !== undefined) {
    payload.value    = params.value;
    payload.currency = params.currency ?? "THB";
  }
  if (params.newCustomer !== undefined) payload.new_customer  = params.newCustomer;
  if (params.eventCallback)             payload.event_callback = params.eventCallback;

  w.gtag("event", "conversion", payload);
}

/**
 * Click-then-navigate pattern — fires the conversion, then navigates to
 * `url` once gtag's callback runs (Google's recommended sequence so the
 * conversion is captured before the page unloads). Mirrors the legacy
 * `gtag_report_conversion(url)` snippet Google's docs hand out for
 * "ส่ง" / Submit buttons. Returns `false` so callers can use it as
 *  `onClick={() => reportConversionAndNavigate(url)}` and the parent
 *  click handler's default action is consistent.
 *
 *   <button onClick={(e) => { e.preventDefault();
 *     reportConversionAndNavigate("/thank-you"); }}>
 *     ส่ง
 *   </button>
 *
 * Defaults to the `purchase` conversion; pass another `GOOGLE_ADS_CONVERSIONS.*`
 * when registering more conversions.
 */
export function reportConversionAndNavigate(
  url?: string,
  sendTo: string = GOOGLE_ADS_CONVERSIONS.purchase,
): boolean {
  trackGoogleAdsConversion(sendTo, {
    eventCallback: () => {
      if (typeof url !== "undefined" && isClient()) {
        window.location.href = url;
      }
    },
  });
  return false;
}
