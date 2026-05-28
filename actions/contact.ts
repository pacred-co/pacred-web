"use server";

import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { sendNotification } from "@/lib/notifications";
import { notify } from "@/lib/notifications/templates";
import { contactMessageSchema, type ContactMessageInput } from "@/lib/validators/contact";
import { checkRateLimit, getClientIpFromHeaders } from "@/lib/rate-limit";
import { verifyHcaptcha } from "@/lib/hcaptcha";

type ActionResult =
  | { ok: true }
  | { ok: false; error: string; retryAfterSeconds?: number };

/**
 * Public contact form submission (P-6) + D-12-wire (rate limit) + D-13-wire (CAPTCHA).
 * Available to anonymous and authenticated users. Stored in
 * `contact_messages`, with admin notifications fanned out to every
 * active ops/super admin so triage doesn't depend on dashboard polling.
 *
 * Defenses applied:
 *   - rateLimit "contact" 5/h/IP (bypassed if Upstash unset → memory fallback)
 *   - hCaptcha invisible token verify (no-op in dev when secret unset)
 */
export async function submitContactMessage(
  input: ContactMessageInput,
): Promise<ActionResult> {
  const parsed = contactMessageSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  // Capture request meta (best-effort — none of these block insert)
  const h = await headers();
  const referer    = h.get("referer");
  const userAgent  = h.get("user-agent");
  const ip         = getClientIpFromHeaders(h);

  // Defense 1 — IP-based rate limit (anti-spam)
  const blocked = await checkRateLimit("contact", ip);
  if (blocked) return blocked;

  // Defense 2 — hCaptcha invisible (anti-bot)
  const captcha = await verifyHcaptcha(d.captchaToken, ip);
  if (!captcha.success) {
    return { ok: false, error: "captcha_failed" };
  }

  // Attach profile_id if signed in (so the user can see their submissions)
  const supabase = await createClient();
  const { data: { user }, error: dataErr } = await supabase.auth.getUser();
  if (dataErr) {
    console.error(`[supabase list] failed`, { code: dataErr.code, message: dataErr.message });
  }

  // Insert via admin client so RLS doesn't block anon submits
  const admin = createAdminClient();
  const { data: inserted, error } = await admin
    .from("contact_messages")
    .insert({
      profile_id: user?.id ?? null,
      name:       d.name,
      contact:    d.contact,
      subject:    d.subject ?? null,
      message:    d.message,
      source_url: referer,
      user_agent: userAgent,
      ip:         ip === "unknown" ? null : ip,
    })
    .select("id")
    .single<{ id: string }>();

  if (error || !inserted) {
    return { ok: false, error: error?.message ?? "insert_failed" };
  }

  // Fan-out notifications to ops + super admins (best-effort — don't
  // fail the user submit if notify breaks)
  try {
    const { data: targetAdmins, error: targetAdminsErr } = await admin
      .from("admins")
      .select("profile_id")
      .in("role", ["ops", "super"])
      .eq("is_active", true);
    if (targetAdminsErr) {
      console.error(`[admins list] failed`, { code: targetAdminsErr.code, message: targetAdminsErr.message });
    }

    const seen = new Set<string>();
    for (const row of targetAdmins ?? []) {
      const pid = (row as { profile_id: string }).profile_id;
      if (!pid || seen.has(pid)) continue;
      seen.add(pid);
      await sendNotification(pid, notify.contactMessageReceived({
        name:           d.name,
        contact:        d.contact,
        messagePreview: d.message,
        messageId:      inserted.id,
      }));
    }
  } catch {
    /* swallow — message is saved, admins will see it on next dashboard load */
  }

  return { ok: true };
}
