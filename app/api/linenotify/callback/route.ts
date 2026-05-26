/**
 * LINE Notify OAuth callback handler (G5 — legacy PCS port).
 *
 * ⚠️ TRANSITION: LINE Notify EOL'd April 2025. Route exists to keep
 *    legacy connect-button workflow alive for migrated PCS customers.
 *    See actions/line-notify.ts for the surrounding flow.
 *
 * Flow:
 *   1. User clicks "Connect LINE Notify" → server action returns authorize URL
 *      + sets a `ln_oauth_state` cookie binding the CSRF state to the session
 *   2. User approves on notify-bot.line.me → LINE redirects here with:
 *        ?code=<authorization_code>&state=<csrf>
 *      OR (denied):
 *        ?error=access_denied
 *   3. We validate state cookie → exchange code for token → persist token
 *      on the caller's profiles row → redirect to
 *      /line-notify-settings?status=connected
 *
 * Legacy reference:
 *   pcsc/public_html/member/api/linenotify/callback/index.php
 *      (redirects to line-notify/succeed/ on success, line-notify/error/
 *      on failure — Gap #3 ports the equivalent flash-on-redirect to
 *      ?status= query params consumed by the settings page).
 *
 * Note: this route does NOT live under app/[locale] — LINE Notify's
 * registered callback URL is locale-free (and we don't want the redirect
 * to bounce through next-intl's locale negotiator). The post-success
 * redirect target IS locale-aware (relative path → next-intl picks up
 * the locale cookie).
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { exchangeLineNotifyCode } from "@/lib/notifications/line-notify";
import { logger, redactId } from "@/lib/logger";

const STATE_COOKIE = "ln_oauth_state";
// Where the user lands after the round-trip — the settings page reads
// ?status=connected|error and ?reason=<key> to render a flash banner.
// Path is locale-free; next-intl middleware (proxy.ts) injects the locale.
const RETURN_PATH  = "/line-notify-settings";

function redirectBack(
  origin: string,
  status: "connected" | "error",
  reason?: string,
): NextResponse {
  const back = new URL(RETURN_PATH, origin);
  back.searchParams.set("status", status);
  if (reason) back.searchParams.set("reason", reason);
  return NextResponse.redirect(back);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code  = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const errorParam = url.searchParams.get("error");

  const jar = await cookies();
  const expectedState = jar.get(STATE_COOKIE)?.value ?? null;
  // Consume the state cookie regardless of outcome so a stale value can't
  // be reused for replay.
  jar.delete(STATE_COOKIE);

  // ── 1. user-denied or LINE-side error ──
  if (errorParam) {
    logger.info("line-notify", "callback received error param", {
      error: errorParam.slice(0, 64),
    });
    // `access_denied` is the OAuth-standard "user clicked cancel" code —
    // surface a friendlier `denied` reason so the UI can say
    // "คุณยกเลิกการเชื่อมต่อ" instead of a generic error.
    return redirectBack(url.origin, "error", errorParam === "access_denied" ? "denied" : "line_error");
  }

  // ── 2. missing required params ──
  if (!code || !state) {
    return redirectBack(url.origin, "error", "missing_params");
  }

  // ── 3. CSRF state check ──
  if (!expectedState || expectedState !== state) {
    logger.warn("line-notify", "state mismatch — possible CSRF or stale cookie", {
      hadCookie: Boolean(expectedState),
      match:     expectedState === state,
    });
    return redirectBack(url.origin, "error", "state_mismatch");
  }

  // ── 4. session check — must be signed-in to bind the token ──
  // Using the owner-scoped client so the subsequent UPDATE is RLS-checked.
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    // Likely the session expired during the OAuth round-trip. Bounce to
    // login with a hint to re-try after sign-in.
    return NextResponse.redirect(new URL("/login?error=ln_session_lost", url.origin));
  }

  // ── 5. exchange code → access token ──
  const exchange = await exchangeLineNotifyCode(code);
  if (!exchange.ok) {
    logger.error("line-notify", "callback exchange failed", undefined, {
      reason: exchange.error,
      userId: redactId(user.id),
    });
    return redirectBack(url.origin, "error", exchange.error);
  }

  // ── 6. persist token on the user's profile ──
  // TODO (hardening): encrypt access_token via pgsodium / KMS wrapper
  // before writing. Tracked in the G5 follow-up task — for now stored as
  // plain text per the migration comment on profiles.line_notify_token.
  // line_notify_channels NOT touched — preserve any existing subscription
  // map so re-connecting after a revoke restores the user's prefs.
  const nowIso = new Date().toISOString();
  const { error: updErr } = await supabase
    .from("profiles")
    .update({
      line_notify_token:        exchange.accessToken,
      line_notify_connected_at: nowIso,
    })
    .eq("id", user.id);

  if (updErr) {
    logger.error("line-notify", "callback persist failed", updErr, {
      userId: redactId(user.id),
    });
    return redirectBack(url.origin, "error", "persist_failed");
  }

  // ── 7. success ──
  logger.info("line-notify", "user connected", { userId: redactId(user.id) });
  return redirectBack(url.origin, "connected");
}
