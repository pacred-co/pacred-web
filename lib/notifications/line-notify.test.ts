/**
 * Unit tests for lib/notifications/line-notify.ts (G5 — legacy port).
 *
 * Covers:
 *   · buildLineNotifyAuthorizeUrl — env-gated URL construction +
 *     CSRF state propagation + scope/response_type pinning.
 *   · pushToLineNotify — LINE_PUSH_BYPASS short-circuit logic so
 *     dev/CI never hits the (EOL'd) notify-api.line.me endpoint.
 *
 * Harness: plain tsx script, matches lib/notifications/templates.test.ts.
 * No vitest dep — tests are wired into pnpm test script manually.
 *
 * NOTE: tsx emits CJS for these test files (older Node target) so the
 * file uses an async main() IIFE instead of top-level await. Same
 * pattern as other dynamic-import tests in the repo.
 */

let pass = 0;
let fail = 0;
const failures: string[] = [];

function eq<T>(name: string, actual: T, expected: T): void {
  if (actual === expected) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    failures.push(`${name}\n      expected ${JSON.stringify(expected)}\n      got      ${JSON.stringify(actual)}`);
    console.log(`  ✗ ${name}`);
  }
}

function throws(name: string, fn: () => unknown, msgIncludes?: string): void {
  try {
    fn();
    fail++;
    failures.push(`${name} — expected to throw, did not`);
    console.log(`  ✗ ${name}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msgIncludes && !msg.includes(msgIncludes)) {
      fail++;
      failures.push(`${name} — threw but msg "${msg}" missing "${msgIncludes}"`);
      console.log(`  ✗ ${name}`);
    } else {
      pass++;
      console.log(`  ✓ ${name}`);
    }
  }
}

// ────────────────────────────────────────────────────────────────────
// Env setup — mark bypass on, set client id + callback so the URL
// builder has what it needs. Done BEFORE module import (env reads
// happen inside the helpers, not at import time, so order is fine
// either way — but keeping the order obvious in case that changes).
// ────────────────────────────────────────────────────────────────────
process.env.LINE_PUSH_BYPASS         = "true";
process.env.LINE_NOTIFY_CLIENT_ID    = "test_client_id_abc123";
process.env.LINE_NOTIFY_CLIENT_SECRET = "test_secret_xyz";
process.env.LINE_NOTIFY_CALLBACK_URL = "https://example.test/api/linenotify/callback";
// Required so createAdminClient() doesn't throw on the bypass-mode push.
process.env.NEXT_PUBLIC_SUPABASE_URL    ||= "https://test.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY   ||= "test_service_role_key";

async function main(): Promise<void> {
  const lineNotify = await import("./line-notify");
  const { buildLineNotifyAuthorizeUrl, pushToLineNotify } = lineNotify;

  // ══════════════════════════════════════════════════════════════════
  console.log("\nbuildLineNotifyAuthorizeUrl");
  // ══════════════════════════════════════════════════════════════════

  {
    const url = buildLineNotifyAuthorizeUrl("state_token_123");
    const parsed = new URL(url);
    eq("authorize URL origin",        parsed.origin, "https://notify-bot.line.me");
    eq("authorize URL pathname",      parsed.pathname, "/oauth/authorize");
    eq("authorize URL response_type", parsed.searchParams.get("response_type"), "code");
    eq("authorize URL client_id propagated", parsed.searchParams.get("client_id"), "test_client_id_abc123");
    eq("authorize URL redirect_uri propagated", parsed.searchParams.get("redirect_uri"), "https://example.test/api/linenotify/callback");
    eq("authorize URL scope is 'notify'", parsed.searchParams.get("scope"), "notify");
    eq("authorize URL state passed through", parsed.searchParams.get("state"), "state_token_123");
  }

  {
    // Empty state must throw — CSRF binding is required.
    throws("authorize URL throws on empty state", () => buildLineNotifyAuthorizeUrl(""), "state");
  }

  {
    // Missing client_id — temporarily unset, restore after.
    const saved = process.env.LINE_NOTIFY_CLIENT_ID;
    delete process.env.LINE_NOTIFY_CLIENT_ID;
    throws(
      "authorize URL throws when LINE_NOTIFY_CLIENT_ID unset",
      () => buildLineNotifyAuthorizeUrl("abc"),
      "LINE_NOTIFY_CLIENT_ID",
    );
    process.env.LINE_NOTIFY_CLIENT_ID = saved;
  }

  {
    // Missing callback URL — temporarily unset, restore after.
    const saved = process.env.LINE_NOTIFY_CALLBACK_URL;
    delete process.env.LINE_NOTIFY_CALLBACK_URL;
    throws(
      "authorize URL throws when LINE_NOTIFY_CALLBACK_URL unset",
      () => buildLineNotifyAuthorizeUrl("abc"),
      "LINE_NOTIFY_CALLBACK_URL",
    );
    process.env.LINE_NOTIFY_CALLBACK_URL = saved;
  }

  {
    // Special chars in state get URL-encoded by URLSearchParams.
    const url = buildLineNotifyAuthorizeUrl("state with space & symbol");
    const parsed = new URL(url);
    eq("authorize URL state decoded round-trips", parsed.searchParams.get("state"), "state with space & symbol");
  }

  // ══════════════════════════════════════════════════════════════════
  console.log("\npushToLineNotify — input validation + bypass");
  // ══════════════════════════════════════════════════════════════════

  {
    // Empty userId → early {ok:false, reason:'no_token'}, no network, no DB.
    const out = await pushToLineNotify("", "hello");
    eq("push returns ok:false on empty userId", out.ok, false);
    if (!out.ok) eq("…with reason='no_token'", out.reason, "no_token");
  }

  {
    // Empty message → early {ok:false, reason:'no_token'}.
    const out = await pushToLineNotify("user-1", "");
    eq("push returns ok:false on empty message", out.ok, false);
    if (!out.ok) eq("…with reason='no_token'", out.reason, "no_token");
  }

  // Bypass mode: pushToLineNotify short-circuits BEFORE any network or
  // DB call (matches lib/notifications/index.ts convention — dev never
  // hits real backends). We stub fetch as a tripwire: any call during
  // bypass mode is a regression that bypasses bypass.
  {
    const originalFetch = globalThis.fetch;
    const calledUrls: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      calledUrls.push(url);
      throw new Error(`fetch should NOT be called in bypass mode (url=${url})`);
    }) as typeof fetch;

    try {
      process.env.LINE_PUSH_BYPASS = "true";
      const out = await pushToLineNotify("any-user-id", "test message body");
      eq("push bypass=true → ok:true without any fetch", out.ok, true);
      if (out.ok) eq("…with status='bypass'", out.status, "bypass");
      eq("bypass made zero fetch calls", calledUrls.length, 0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  }

  // Negative-bypass path: when LINE_PUSH_BYPASS is explicitly "false"
  // the function tries the admin client (which then fails in this test
  // env — no real Supabase). The contract we DO want to pin here is
  // "bypass-off === fetch attempt happens". Skipped in this minimal
  // foundation test — admin-client stubbing is non-trivial in CJS+ESM
  // interop. The bypass-on contract above is the load-bearing one for
  // the dev/CI safety net.

  // ────────────────────────────────────────────────────────────────────
  console.log(`\n  ${pass} pass · ${fail} fail`);
  if (failures.length > 0) {
    console.error("\nFailures:");
    for (const f of failures) console.error(`  ✗ ${f}`);
    process.exit(1);
  }
}

void main().catch((err) => {
  console.error("[line-notify.test] unhandled:", err);
  process.exit(1);
});
