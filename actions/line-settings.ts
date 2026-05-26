"use server";

/**
 * LINE account linking — task L (the LINE Notify replacement, 2026-05-26).
 *
 * Customer flow:
 *   1. Customer signed in to Pacred clicks "เชื่อมต่อ LINE" on /line-settings.
 *   2. Browser navigates to the LIFF URL (https://liff.line.me/<LIFF_ID>).
 *   3. LINE returns to /liff/link — the client there calls liff.getProfile(),
 *      gets { userId, displayName }, and POSTs both here via linkLineAccount.
 *   4. We persist userId on profiles.line_user_id + line_linked_at = now().
 *   5. From then on `lib/notifications/sendNotification()` can push the user
 *      via the Messaging API (which already implements pushMessage).
 *
 * Why this lives in its own actions file (not actions/profile.ts):
 *   • The previous LINE-link helpers were tangled with the rest of the
 *     profile-CRUD action surface. Task L (2026-05-26) makes the customer
 *     LINE link a first-class flow, so the actions move to their own
 *     module + carry the new (lineUserId, displayName) signature.
 *   • Compat shims live in actions/profile.ts so dormant callers still
 *     compile until they're updated.
 *
 * Schema (migration 0003_profiles_extended.sql):
 *   profiles.line_user_id     text     — LINE Messaging API push target
 *   profiles.line_linked_at   timestamptz
 *   profiles_line_user_id_idx unique partial WHERE line_user_id IS NOT NULL
 *
 * The unique partial index is the source of truth for "one LINE → one Pacred"
 * — we pre-check it explicitly so the error is friendly, and re-defend on
 * the post-update 23505 (race-safe).
 *
 * Token / secret hygiene:
 *   • `LINE_CHANNEL_ACCESS_TOKEN` is only read inside sendNotification → the
 *     welcome push uses sendNotification (no direct fetch from here).
 *   • `LINE_LOGIN_CLIENT_SECRET` is never touched on this surface — LIFF
 *     OAuth happens client-side via @line/liff, which never sees the secret.
 *   • Logs redact the LINE userId (via lib/logger redactId).
 */

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendNotification } from "@/lib/notifications";
import { assertNotImpersonating } from "@/lib/auth/impersonation";
import { checkRateLimit, getClientIpFromHeaders } from "@/lib/rate-limit";
import { logger, redactId } from "@/lib/logger";

type ActionResult<T = void> =
  | { ok: true; data?: T }
  | { ok: false; error: string; retryAfterSeconds?: number };

/**
 * LINE userIds are exactly "U" + 32 lowercase hex chars (33 total). The
 * Messaging API guarantees this — anything else is either a spoofed client
 * or a wrong field; reject early so we never persist garbage.
 */
const LINE_USER_ID_RE = /^U[0-9a-f]{32}$/;

/**
 * Link the signed-in Pacred profile to a LINE userId obtained from the
 * LIFF SDK.
 *
 * - lineUserId   — `profile.userId` from `liff.getProfile()`. Validated.
 * - displayName  — `profile.displayName` from `liff.getProfile()`. Used to
 *                  personalise the welcome push; never stored (avoid PII
 *                  duplication — the LINE OA already knows the user's name).
 *
 * Returns:
 *   { ok: true }                                           — wrote profile + best-effort welcome push
 *   { ok: false, error: "not_signed_in" }                  — no Pacred session
 *   { ok: false, error: "invalid_line_user_id" }           — bad format
 *   { ok: false, error: "already_linked_other_account" }   — taken by another Pacred profile
 *   { ok: false, error: "rate_limit", retryAfterSeconds }  — too many attempts
 *   { ok: false, error: "impersonation" | "<db-error>" }   — caller misuse / db failure
 */
export async function linkLineAccount(
  lineUserId: string,
  displayName: string = "",
): Promise<ActionResult> {
  // G-4 — impersonation is read-only; refuse customer-facing mutations.
  const impErr = await assertNotImpersonating();
  if (impErr) return impErr;

  // Format-check the LINE userId FIRST — cheaper than a DB roundtrip.
  if (typeof lineUserId !== "string" || !LINE_USER_ID_RE.test(lineUserId)) {
    return { ok: false, error: "invalid_line_user_id" };
  }

  // IP-based rate-limit — link attempts are cheap on our side but the
  // LIFF flow upstream is sensitive to retry storms (a stuck client could
  // hammer this in a tight loop). generic bucket = 30/min/IP, plenty
  // above any human-clicker rate.
  const ip = getClientIpFromHeaders(await headers());
  const blocked = await checkRateLimit("generic", `line-link:${ip}`);
  if (blocked) return blocked;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not_signed_in" };

  // Defensive pre-check — the unique partial index would 23505 anyway,
  // but the lookup gives us a friendlier error string so the UI can show
  // "ติดต่อแอดมิน" rather than a raw Postgres code.
  const { data: existing } = await supabase
    .from("profiles")
    .select("id")
    .eq("line_user_id", lineUserId)
    .maybeSingle<{ id: string }>();

  if (existing && existing.id !== user.id) {
    return { ok: false, error: "already_linked_other_account" };
  }

  // Use the user-context client (not admin) — RLS will only let the user
  // update their OWN profile row, which is exactly the safety property
  // we want. No bypass needed here.
  const { error } = await supabase
    .from("profiles")
    .update({
      line_user_id:   lineUserId,
      line_linked_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  if (error) {
    // Race-safe — if a second customer linked the same LINE userId
    // between the lookup above and the UPDATE here, the unique partial
    // index will raise 23505. Map it to the friendly error.
    if (error.code === "23505") {
      return { ok: false, error: "already_linked_other_account" };
    }
    logger.error("line-settings", "link update failed", error, {
      profileId:  redactId(user.id),
      lineUserId: redactId(lineUserId),
    });
    return { ok: false, error: error.message };
  }

  // Best-effort welcome push — proves the integration to the customer
  // immediately. Skipped automatically when LINE_PUSH_BYPASS=true (dev /
  // staging) by sendNotification itself, so no env-check needed here.
  // Never blocks the success return — a transient push failure must not
  // make the customer think the link itself failed.
  try {
    await sendNotification(user.id, {
      category: "system",
      severity: "success",
      title:    "เชื่อมต่อ LINE สำเร็จ",
      body:     displayName
        ? `สวัสดี ${displayName} — Pacred จะส่งการแจ้งเตือนสถานะออเดอร์ / การนำเข้า / กระเป๋าเงินมาที่นี่`
        : "Pacred จะส่งการแจ้งเตือนสถานะออเดอร์ / การนำเข้า / กระเป๋าเงินมาที่นี่",
      link_href: "/dashboard",
    });
  } catch (e) {
    // Welcome push is informational — swallow + log; the link succeeded.
    logger.warn("line-settings", "welcome push failed (link still ok)", {
      err: String(e),
      profileId: redactId(user.id),
    });
  }

  // Revalidate the settings page so the next render reflects "connected".
  revalidatePath("/line-settings");
  revalidatePath("/profile");
  return { ok: true };
}

/**
 * Unlink the LINE account from the signed-in Pacred profile.
 *
 * - Nulls `line_user_id` + `line_linked_at`. We do NOT revoke at LINE —
 *   the customer remains friends with the Pacred OA (so they can re-link
 *   anytime by reopening /liff/link); they simply stop receiving pushes
 *   from us until they re-link.
 * - Idempotent — running it again is a no-op.
 *
 * Returns:
 *   { ok: true }
 *   { ok: false, error: "not_signed_in" | "impersonation" | "<db-error>" }
 *   { ok: false, error: "rate_limit", retryAfterSeconds }
 */
export async function disconnectLineAccount(): Promise<ActionResult> {
  // G-4 — impersonation is read-only; refuse customer-facing mutations.
  const impErr = await assertNotImpersonating();
  if (impErr) return impErr;

  // IP-based rate-limit — disconnect spam is low-risk (worst case = stale-
  // state churn) but the generic bucket caps a runaway client at 30/min.
  const ip = getClientIpFromHeaders(await headers());
  const blocked = await checkRateLimit("generic", `line-disconnect:${ip}`);
  if (blocked) return blocked;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not_signed_in" };

  const { error } = await supabase
    .from("profiles")
    .update({ line_user_id: null, line_linked_at: null })
    .eq("id", user.id);

  if (error) {
    logger.error("line-settings", "disconnect update failed", error, {
      profileId: redactId(user.id),
    });
    return { ok: false, error: error.message };
  }

  revalidatePath("/line-settings");
  revalidatePath("/profile");
  return { ok: true };
}
