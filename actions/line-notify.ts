"use server";

/**
 * LINE Notify per-user OAuth server actions (G5 — legacy PCS port).
 *
 * ⚠️ LINE Notify is EOL April 2025. These actions exist to preserve the
 *    legacy "Connect LINE Notify" button workflow for migrated PCS
 *    customers during the transition window. Long-term: replaced by the
 *    LINE Messaging API per-user push (lib/notifications/index.ts).
 *
 * Three actions:
 *
 *   getLineOAuthAuthorizeUrl()
 *     Returns the authorize URL the connect-button should redirect to.
 *     Generates + persists a CSRF state token in a short-lived cookie
 *     so the callback handler can verify the round-trip.
 *
 *   disconnectLineNotify()
 *     Calls the LINE Notify revoke endpoint, then clears the token +
 *     metadata from `profiles`. Idempotent — safe to call when no token
 *     is set.
 *
 *   updateLineNotifyChannels(channels)
 *     Patches `profiles.line_notify_channels` jsonb with the per-event
 *     subscription map (e.g. `{order_created:true, shipment_arrived:false}`).
 *
 * All three require an authenticated session (lib/auth/get-user.ts).
 * RLS on `profiles` ensures the owner-scoped client can only write the
 * caller's own row.
 *
 * STILL TODO (later sprints):
 *   · UI: connect-button + disconnect-button + channel toggle on /profile
 *   · Dispatcher cron at /api/cron/dispatch-line-notify (channel-aware)
 *   · Token encryption (pgsodium / KMS wrap before write)
 */

import { cookies, headers } from "next/headers";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/get-user";
import {
  buildLineNotifyAuthorizeUrl,
  revokeLineNotifyToken,
} from "@/lib/notifications/line-notify";
import { logger, redactId } from "@/lib/logger";
import { checkRateLimit, getClientIpFromHeaders } from "@/lib/rate-limit";

type ActionResult<T = void> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

// Cookie used to bind the OAuth state token to the user's session. Short
// TTL (10 minutes) — the OAuth round-trip should complete in seconds; a
// stale cookie just forces the user to click connect again.
const STATE_COOKIE = "ln_oauth_state";
const STATE_TTL_S  = 600;

// ────────────────────────────────────────────────────────────────────
// 1. AUTHORIZE URL
// ────────────────────────────────────────────────────────────────────
/**
 * Build the LINE Notify OAuth authorize URL + set a CSRF state cookie.
 *
 * UI flow:
 *   1. Click "Connect LINE Notify"
 *   2. Server action returns { ok:true, data:{ url } }
 *   3. Client window.location = url  (redirects to LINE Notify)
 *   4. User approves → LINE redirects to LINE_NOTIFY_CALLBACK_URL with
 *      ?code=...&state=...
 *   5. /api/linenotify/callback validates state cookie, calls
 *      exchangeLineNotifyCode, persists token, redirects back to /profile
 */
export async function getLineOAuthAuthorizeUrl(): Promise<
  ActionResult<{ url: string }>
> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "not_signed_in" };

  // IP-based rate-limit — minting state cookies is cheap but unlimited
  // calls would let a stuck client spawn unbounded cookie writes. generic
  // bucket = 30/min/IP, which is far above any human-clicker rate.
  const ip = getClientIpFromHeaders(await headers());
  const blocked = await checkRateLimit("generic", `ln-authorize:${ip}`);
  if (blocked) return { ok: false, error: "rate_limit" };

  let url: string;
  try {
    const state = randomBytes(24).toString("hex");
    url = buildLineNotifyAuthorizeUrl(state);

    // Persist the state token so the callback can verify it. httpOnly +
    // sameSite=lax so it survives the LINE → us redirect.
    const jar = await cookies();
    jar.set(STATE_COOKIE, state, {
      httpOnly: true,
      secure:   process.env.NODE_ENV === "production",
      sameSite: "lax",
      path:     "/",
      maxAge:   STATE_TTL_S,
    });
  } catch (err) {
    // buildLineNotifyAuthorizeUrl throws on missing env — surface as
    // disabled rather than crashing the action.
    logger.error("line-notify", "authorize url build failed", err, {
      userId: redactId(user.id),
    });
    return { ok: false, error: "line_notify_unavailable" };
  }

  return { ok: true, data: { url } };
}

// ────────────────────────────────────────────────────────────────────
// 2. DISCONNECT
// ────────────────────────────────────────────────────────────────────
/**
 * Revoke the user's LINE Notify token + clear DB columns.
 *
 * Idempotent: if no token is set, returns ok without doing anything.
 * The DB clear runs even when the LINE Notify revoke API errors — a
 * stale upstream token is preferable to a stale local pointer.
 */
export async function disconnectLineNotify(): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "not_signed_in" };

  // IP-based rate-limit — disconnect spam isn't a critical attack vector
  // (worst case = stale token churn) but the LINE Notify revoke endpoint
  // is upstream + rate-limited itself; cap us at the generic 30/min bucket
  // so a runaway client can't hammer it.
  const ip = getClientIpFromHeaders(await headers());
  const blocked = await checkRateLimit("generic", `ln-disconnect:${ip}`);
  if (blocked) return { ok: false, error: "rate_limit" };

  const supabase = await createClient();

  // Read the current token via the owner-scoped client. RLS on profiles
  // ensures we can only read our own row, so no admin client needed.
  const { data: profile, error: readErr } = await supabase
    .from("profiles")
    .select("line_notify_token")
    .eq("id", user.id)
    .maybeSingle<{ line_notify_token: string | null }>();

  if (readErr) {
    logger.error("line-notify", "disconnect read failed", readErr, {
      userId: redactId(user.id),
    });
    return { ok: false, error: "read_failed" };
  }

  const token = profile?.line_notify_token ?? null;
  if (token) {
    // Best-effort upstream revoke — failure does not abort the local clear.
    await revokeLineNotifyToken(token);
  }

  const { error: updErr } = await supabase
    .from("profiles")
    .update({
      line_notify_token:        null,
      line_notify_connected_at: null,
      // line_notify_channels kept as-is so re-connecting restores prefs.
    })
    .eq("id", user.id);

  if (updErr) {
    logger.error("line-notify", "disconnect update failed", updErr, {
      userId: redactId(user.id),
    });
    return { ok: false, error: "update_failed" };
  }

  return { ok: true };
}

// ────────────────────────────────────────────────────────────────────
// 3. UPDATE CHANNELS
// ────────────────────────────────────────────────────────────────────
// Zod schema kept liberal on the keys (any event name allowed) — the
// canonical list lives in the dispatcher (later sprint) and we don't
// want a server-action redeploy every time a new event slot is added.
// Values MUST be boolean to keep the jsonb shape predictable.
const channelsSchema = z.record(z.string().min(1).max(64), z.boolean());
export type LineNotifyChannelsInput = z.infer<typeof channelsSchema>;

export async function updateLineNotifyChannels(
  channels: LineNotifyChannelsInput,
): Promise<ActionResult> {
  const parsed = channelsSchema.safeParse(channels);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_channels" };
  }

  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "not_signed_in" };

  // IP-based rate-limit — channel toggles are cheap on our end but rapid-
  // fire saves from a stuck client should be bounded so they can't OOM
  // upstream. generic bucket = 30/min/IP.
  const ip = getClientIpFromHeaders(await headers());
  const blocked = await checkRateLimit("generic", `ln-channels:${ip}`);
  if (blocked) return { ok: false, error: "rate_limit" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ line_notify_channels: parsed.data })
    .eq("id", user.id);

  if (error) {
    logger.error("line-notify", "channels update failed", error, {
      userId: redactId(user.id),
    });
    return { ok: false, error: "update_failed" };
  }

  return { ok: true };
}
