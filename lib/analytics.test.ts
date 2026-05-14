// Unit tests for lib/analytics.ts — client-side analytics wrappers.
// Mocks `window.dataLayer` + `window.clarity` so we can verify the
// helpers shape events correctly without a browser.
//
// Wrapped in async IIFE because tsx defaults to CJS output (no top-level
// await) and we need to dynamic-import analytics AFTER mocks are installed.

type DLEntry = Record<string, unknown>;
const dataLayerSink: DLEntry[] = [];
type ClarityCall = [string, ...unknown[]];
const claritySink: ClarityCall[] = [];

// `lib/analytics.ts` reads `typeof window` and `window.dataLayer` / `.clarity`.
// Mock both before dynamic-importing the module so the env is in place.
(globalThis as unknown as { window: unknown }).window = {
  dataLayer: dataLayerSink,
  clarity: (...args: ClarityCall) => claritySink.push(args),
};

process.env.NEXT_PUBLIC_GTM_ID = "GTM-TEST";

void (async () => {
const a = await import("./analytics");

// ── Test plumbing ────────────────────────────────────────────────
let pass = 0;
let fail = 0;
const failures: string[] = [];

function reset(): void {
  dataLayerSink.length = 0;
  claritySink.length = 0;
}

function eq<T>(name: string, actual: T, expected: T): void {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    failures.push(`${name}\n      expected ${JSON.stringify(expected)}\n      got      ${JSON.stringify(actual)}`);
    console.log(`  ✗ ${name}`);
  }
}

function truthy(name: string, cond: boolean, detail = ""): void {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

// ── (a) track — generic ─────────────────────────────────────────
console.log("\n(a) track — generic");
reset();
a.track("foo_event", { bar: 1, baz: "x" });
eq("pushes one entry to dataLayer", dataLayerSink.length, 1);
eq("event name + params merged", dataLayerSink[0], { event: "foo_event", bar: 1, baz: "x" });

reset();
a.track("just_event");
eq("works with no params", dataLayerSink, [{ event: "just_event" }]);

// ── (b) trackSignUp / trackLogin / trackGenerateLead ────────────
console.log("\n(b) sign_up / login / generate_lead");
reset();
a.trackSignUp("personal", "PR00123");
eq("sign_up with member_code", dataLayerSink, [
  { event: "sign_up", method: "personal", member_code: "PR00123" },
]);

reset();
a.trackSignUp("oauth_google");
eq("sign_up without member_code omits the key", dataLayerSink, [
  { event: "sign_up", method: "oauth_google" },
]);

reset();
a.trackLogin("phone");
eq("login phone", dataLayerSink, [{ event: "login", method: "phone" }]);

reset();
a.trackGenerateLead("contact_form");
eq("generate_lead with source", dataLayerSink, [
  { event: "generate_lead", source: "contact_form" },
]);

// ── (c) trackPlaceOrder ─────────────────────────────────────────
console.log("\n(c) place_order");
reset();
a.trackPlaceOrder("service_import", 12345.5);
eq("place_order with value + currency", dataLayerSink, [
  { event: "place_order", order_type: "service_import", value: 12345.5, currency: "THB" },
]);

reset();
a.trackPlaceOrder("service_order");
eq("place_order without value omits value/currency", dataLayerSink, [
  { event: "place_order", order_type: "service_order" },
]);

// ── (d) trackWalletDeposit ──────────────────────────────────────
console.log("\n(d) wallet_deposit");
reset();
a.trackWalletDeposit(5000);
eq("wallet_deposit with THB amount", dataLayerSink, [
  { event: "wallet_deposit", value: 5000, currency: "THB" },
]);

// ── (e) trackCtaClick ───────────────────────────────────────────
console.log("\n(e) cta_click");
reset();
a.trackCtaClick("booking_calculate", "home_booking", { mode: "lcl" });
eq("cta_click with extra", dataLayerSink, [
  { event: "cta_click", label: "booking_calculate", location: "home_booking", mode: "lcl" },
]);

reset();
a.trackCtaClick("banner_line", "home_purchase_banner");
eq("cta_click without extra", dataLayerSink, [
  { event: "cta_click", label: "banner_line", location: "home_purchase_banner" },
]);

// ── (f) clarityTag / clarityEvent / clarityIdentify ─────────────
console.log("\n(f) clarity helpers");
reset();
a.clarityTag("plan", "juristic");
eq("clarityTag calls window.clarity('set', key, value)", claritySink, [
  ["set", "plan", "juristic"],
]);

reset();
a.clarityEvent("cart_abandoned");
eq("clarityEvent calls window.clarity('event', name)", claritySink, [
  ["event", "cart_abandoned"],
]);

reset();
a.clarityIdentify("uuid-profile-123");
eq("clarityIdentify calls window.clarity('identify', profileId)", claritySink, [
  ["identify", "uuid-profile-123"],
]);

// ── (g) trackExperimentExposure ─────────────────────────────────
console.log("\n(g) experiment_exposure");
reset();
a.trackExperimentExposure("home_hero_cta", "variant_a");
eq("experiment_exposure dataLayer entry", dataLayerSink, [
  { event: "experiment_exposure", experiment_id: "home_hero_cta", variant: "variant_a" },
]);
eq("experiment_exposure also tags Clarity", claritySink, [
  ["set", "exp_home_hero_cta", "variant_a"],
]);

// ── (h) clarity helpers tolerate missing window.clarity ─────────
console.log("\n(h) defensive — window.clarity undefined");
const win = (globalThis as unknown as { window: { clarity?: unknown } }).window;
const savedClarity = win.clarity;
win.clarity = undefined;
reset();
let threwOnTag = false;
let threwOnEvent = false;
try {
  a.clarityTag("k", "v");
} catch {
  threwOnTag = true;
}
try {
  a.clarityEvent("e");
} catch {
  threwOnEvent = true;
}
truthy("clarityTag no-op when window.clarity missing", !threwOnTag);
truthy("clarityEvent no-op when window.clarity missing", !threwOnEvent);
eq("no entries written when clarity undefined", claritySink.length, 0);
win.clarity = savedClarity;

// ── summary ─────────────────────────────────────────────────────
console.log(`\n${pass} pass, ${fail} fail`);
if (fail > 0) {
  console.log("\nFailures:");
  for (const f of failures) console.log(`  ${f}`);
  process.exit(1);
}
})();
