/**
 * Notification sender — single entry point used by any action that
 * needs to notify a user.
 *
 *   await sendNotification(profileId, { category, title, body, ... });
 *
 * What it does:
 *   1. INSERT into public.notifications (always — append-only log)
 *   2. Try to dispatch via LINE Messaging API → mark delivered_line_at
 *      Falls back to email if LINE not linked or push fails.
 *   3. In dev (LINE_PUSH_BYPASS=true), step 2 is skipped and we just
 *      console.log so you can see what would have been sent.
 *
 * The actual LINE Messaging API + email backends are intentionally
 * left as stubs — they'll be wired when channel access tokens land.
 * The shape of this function and the DB schema are stable so callers
 * don't need to change later.
 */

import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger, redactId } from "@/lib/logger";
import type { NotifyPayload } from "./types";

const LINE_BYPASS = process.env.LINE_PUSH_BYPASS !== "false";  // default true (safe)

export async function sendNotification(
  profileId: string,
  payload: NotifyPayload,
): Promise<{ id: string; deliveredLine: boolean; deliveredEmail: boolean }> {
  const admin = createAdminClient();

  // Step 1 — append the event log row
  const { data: row, error } = await admin
    .from("notifications")
    .insert({
      profile_id:     profileId,
      category:       payload.category,
      severity:       payload.severity ?? "info",
      title:          payload.title,
      body:           payload.body,
      link_href:      payload.link_href ?? null,
      reference_type: payload.reference_type ?? null,
      reference_id:   payload.reference_id ?? null,
    })
    .select("id")
    .single<{ id: string }>();

  if (error || !row) {
    // Don't crash the caller — log and return a dummy
    logger.error("notifications", "insert failed", error, { profileId: redactId(profileId) });
    return { id: "", deliveredLine: false, deliveredEmail: false };
  }

  if (LINE_BYPASS) {
    // Dev / staging path — log redacted profile id + category/title only (no body)
    logger.info("notifications", "bypass — would send", {
      profileId: redactId(profileId),
      category:  payload.category,
      title:     payload.title,
    });
    return { id: row.id, deliveredLine: false, deliveredEmail: false };
  }

  // Step 2 — look up the user's channel prefs + LINE userId
  const { data: profile } = await admin
    .from("profiles")
    .select("email, line_user_id, notify_channels")
    .eq("id", profileId)
    .maybeSingle<{
      email: string | null;
      line_user_id: string | null;
      notify_channels: { line?: boolean; email?: boolean } | null;
    }>();

  let deliveredLine  = false;
  let deliveredEmail = false;

  const wantsLine  = profile?.notify_channels?.line  !== false;
  const wantsEmail = profile?.notify_channels?.email !== false;

  // Try LINE first
  if (wantsLine && profile?.line_user_id) {
    deliveredLine = await sendLinePush(profile.line_user_id, payload);
    if (deliveredLine) {
      await admin.from("notifications").update({ delivered_line_at: new Date().toISOString() }).eq("id", row.id);
    }
  }

  // Email fallback (also send if LINE failed)
  if (wantsEmail && profile?.email && !deliveredLine) {
    deliveredEmail = await sendEmail(profile.email, payload);
    if (deliveredEmail) {
      await admin.from("notifications").update({ delivered_email_at: new Date().toISOString() }).eq("id", row.id);
    }
  }

  return { id: row.id, deliveredLine, deliveredEmail };
}

// ────────────────────────────────────────────────────────────
// LINE Messaging API push — implementation (env-gated).
//   ✅ Wired 2026-05-18 — keys from ก๊อต (channel 2009931373, Pacred Shipping OA).
//   Activates when LINE_PUSH_BYPASS=false AND LINE_CHANNEL_ACCESS_TOKEN set
//   AND profiles.line_user_id populated (via /liff/link flow).
// ────────────────────────────────────────────────────────────
async function sendLinePush(lineUserId: string, payload: NotifyPayload): Promise<boolean> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) {
    logger.warn("notifications", "LINE_CHANNEL_ACCESS_TOKEN not set — skipping push");
    return false;
  }
  try {
    const res = await fetch("https://api.line.me/v2/bot/message/push", {
      method:  "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization:  `Bearer ${token}`,
      },
      body: JSON.stringify({
        to: lineUserId,
        messages: [
          {
            type: "text",
            text: `[${payload.title}]\n${payload.body}${payload.link_href ? `\n\n${siteUrl(payload.link_href)}` : ""}`,
          },
        ],
      }),
    });
    return res.ok;
  } catch (e) {
    logger.error("notifications", "LINE push failed", e, { lineUserId: redactId(lineUserId) });
    return false;
  }
}

// ────────────────────────────────────────────────────────────
// Email fallback — implementation (env-gated).
//   Activates when RESEND_API_KEY + RESEND_FROM set.  Still waiting
//   for keys from ก๊อต as of 2026-05-18 — code path is correct,
//   sendEmail() short-circuits to false silently when no key.
// ────────────────────────────────────────────────────────────
async function sendEmail(toEmail: string, payload: NotifyPayload): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    logger.warn("notifications", "RESEND_API_KEY not set — skipping email");
    return false;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method:  "POST",
      headers: {
        Authorization:  `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM ?? "Pacred <noreply@pacred.co>",
        to:   [toEmail],
        subject: payload.title,
        text:    `${payload.body}\n\n${payload.link_href ? siteUrl(payload.link_href) : ""}`,
      }),
    });
    return res.ok;
  } catch (e) {
    logger.error("notifications", "email send failed", e);
    return false;
  }
}

function siteUrl(relative: string): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "https://pacred.co";
  return relative.startsWith("http") ? relative : `${base}${relative}`;
}
