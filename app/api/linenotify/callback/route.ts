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
 *      on the caller's profiles row → redirect to /profile?ln=connected
 *
 * Legacy reference:
 *   pcsc/public_html/member/api/linenotify/callback/index.php
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
// Where the user lands after the round-trip — UI surfaces a toast based on
// the `ln=` query string (later sprint). Defined here so both success +
// failure paths share the same destination.
const RETURN_PATH  = "/profile";

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
    logger.info("line-notify", "callback received error param", { error: errorParam });
    return NextResponse.redirect(
      new URL(`${RETURN_PATH}?ln=${encodeURIComponent(errorParam)}`, url.origin),
    );
  }

  // ── 2. missing required params ──
  if (!code || !state) {
    return NextResponse.redirect(new URL(`${RETURN_PATH}?ln=missing_params`, url.origin));
  }

  // ── 3. CSRF state check ──
  if (!expectedState || expectedState !== state) {
    logger.warn("line-notify", "state mismatch — possible CSRF or stale cookie", {
      hadCookie: Boolean(expectedState),
      match:     expectedState === state,
    });
    return NextResponse.redirect(new URL(`${RETURN_PATH}?ln=invalid_state`, url.origin));
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
    return NextResponse.redirect(
      new URL(`${RETURN_PATH}?ln=${encodeURIComponent(exchange.error)}`, url.origin),
    );
  }

  // ── 6. persist token on the user's profile ──
  // TODO (hardening): encrypt access_token via pgsodium / KMS wrapper
  // before writing. Tracked in the G5 follow-up task — for now stored as
  // plain text per the migration comment on profiles.line_notify_token.
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
    return NextResponse.redirect(new URL(`${RETURN_PATH}?ln=persist_failed`, url.origin));
  }

  // ── 7. success ──
  logger.info("line-notify", "user connected", { userId: redactId(user.id) });
  return NextResponse.redirect(new URL(`${RETURN_PATH}?ln=connected`, url.origin));
}
