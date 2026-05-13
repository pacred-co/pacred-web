"use server";

import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { sendNotification } from "@/lib/notifications";
import { contactMessageSchema, type ContactMessageInput } from "@/lib/validators/contact";

type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * Public contact form submission (P-6).
 * Available to anonymous and authenticated users. Stored in
 * `contact_messages`, with admin notifications fanned out to every
 * active ops/super admin so triage doesn't depend on dashboard polling.
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
  const fwdFor     = h.get("x-forwarded-for");
  const realIp     = h.get("x-real-ip");
  const ip         = (fwdFor?.split(",")[0] ?? realIp ?? "").trim() || null;

  // Attach profile_id if signed in (so the user can see their submissions)
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

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
      ip,
    })
    .select("id")
    .single<{ id: string }>();

  if (error || !inserted) {
    return { ok: false, error: error?.message ?? "insert_failed" };
  }

  // Fan-out notifications to ops + super admins (best-effort — don't
  // fail the user submit if notify breaks)
  try {
    const { data: targetAdmins } = await admin
      .from("admins")
      .select("profile_id")
      .in("role", ["ops", "super"])
      .eq("is_active", true);

    const seen = new Set<string>();
    for (const row of targetAdmins ?? []) {
      const pid = (row as { profile_id: string }).profile_id;
      if (!pid || seen.has(pid)) continue;
      seen.add(pid);
      // reference_type intentionally omitted — its CHECK constraint
      // doesn't include 'contact_message' yet; admins navigate via link_href
      await sendNotification(pid, {
        category:       "system",
        severity:       "info",
        title:          "ข้อความใหม่จากฟอร์มติดต่อ",
        body:           `${d.name} (${d.contact}): ${d.message.slice(0, 120)}${d.message.length > 120 ? "..." : ""}`,
        link_href:      "/admin/contact-messages",
      });
    }
  } catch {
    /* swallow — message is saved, admins will see it on next dashboard load */
  }

  return { ok: true };
}
