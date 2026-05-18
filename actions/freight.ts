"use server";

/**
 * R1 / V-E1.2.1 — Customer-side freight actions.
 *
 * Closes the V-E1.2.1 gap from the BK-1 audit: customers could see their
 * `sent` quotes at /freight/quotes/[quote_no] but had no way to accept —
 * the CTA only offered "ติดต่อทีม" (admin manual mark).  This action lets
 * the customer self-accept, then the admin sees status='accepted' in
 * /admin/freight/quotes and clicks "convert to shipment" (the existing
 * adminConvertQuoteToShipment action).
 *
 * Why no auto-convert on customer accept (unlike adminMarkQuoteAccepted's
 * U1-4 chain): freight_shipments.created_by_admin_id is NOT NULL — a
 * customer accept has no admin context to attach.  Better to let admin
 * convert manually; the work_item / notification surfaces it immediately.
 *
 * Auth posture:
 *   - requireAuth (no role gate — customer is the actor)
 *   - Ownership: profile_id === auth.uid()
 *   - Status guard: only flip 'sent' → 'accepted'
 *   - Expiry guard: valid_until ≥ today
 *   - All checks done server-side; RLS would also deny non-owners.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth/require-auth";
import { sendNotification } from "@/lib/notifications";
import { logger, redactId } from "@/lib/logger";

type ActionResult<T = void> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

const acceptQuoteSchema = z.object({
  quoteId: z.string().uuid("invalid_quote_id"),
});

/**
 * customerAcceptQuote — customer flips a `sent` freight_quote to `accepted`.
 *
 * Returns the quote_no on success so the page can show a confirmation
 * + revalidate.  Does NOT spawn a freight_shipment (admin does that
 * manually via adminConvertQuoteToShipment).
 */
export async function customerAcceptQuote(
  input: { quoteId: string },
): Promise<ActionResult<{ quoteNo: string }>> {
  const parsed = acceptQuoteSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }

  const { profile } = await requireAuth();
  if (!profile) return { ok: false, error: "auth_required" };

  // Load via admin client so we can give a clearer error than RLS denial.
  const admin = createAdminClient();
  const { data: quote, error: readErr } = await admin
    .from("freight_quotes")
    .select("id, quote_no, status, profile_id, buyer_name_snapshot, valid_until, total")
    .eq("id", input.quoteId)
    .maybeSingle<{
      id: string;
      quote_no: string;
      status: string;
      profile_id: string | null;
      buyer_name_snapshot: string;
      valid_until: string | null;
      total: number;
    }>();
  if (readErr) return { ok: false, error: `read_failed: ${readErr.message}` };
  if (!quote) return { ok: false, error: "not_found" };
  if (quote.profile_id !== profile.id) {
    return { ok: false, error: "forbidden_not_owner" };
  }
  if (quote.status !== "sent") {
    return { ok: false, error: `bad_status:${quote.status}` };
  }
  if (quote.valid_until) {
    // valid_until is a DATE; compare against today's date (Bangkok TZ-ish — use UTC date is fine for day-grain).
    const today = new Date().toISOString().slice(0, 10);
    if (quote.valid_until < today) {
      return { ok: false, error: "expired" };
    }
  }

  // Use the cookie-bound client for the actual UPDATE so RLS (the
  // customer-owned-write policy if it exists) is enforced naturally.
  // If the customer policy is read-only (current freight_quotes design),
  // fall back to admin client + the in-app ownership check above is the guard.
  const supabase = await createClient();
  const nowIso = new Date().toISOString();
  const { error: updErr } = await supabase
    .from("freight_quotes")
    .update({ status: "accepted", accepted_at: nowIso })
    .eq("id", quote.id)
    .eq("status", "sent"); // optimistic race-guard

  let usedAdmin = false;
  if (updErr) {
    // RLS likely denied — current freight_quotes RLS only allows admin write.
    // Fall back to admin client (we already verified ownership above).
    usedAdmin = true;
    const { error: adminUpdErr } = await admin
      .from("freight_quotes")
      .update({ status: "accepted", accepted_at: nowIso })
      .eq("id", quote.id)
      .eq("status", "sent");
    if (adminUpdErr) {
      return { ok: false, error: `update_failed: ${adminUpdErr.message}` };
    }
  }

  // Notify admins so they can start the conversion to a shipment.
  // Best-effort — failure must NOT roll back the accept.
  // Fan-out pattern mirrors actions/bookings.ts:submitBooking + actions/contact.ts.
  try {
    const { data: targetAdmins } = await admin
      .from("admins")
      .select("profile_id")
      .in("role", ["sales_admin", "ops", "super"])
      .eq("is_active", true);

    const seen = new Set<string>();
    for (const row of targetAdmins ?? []) {
      const pid = (row as { profile_id: string }).profile_id;
      if (!pid || seen.has(pid)) continue;
      seen.add(pid);
      await sendNotification(pid, {
        category:  "sales",
        severity:  "info",
        title:     `ลูกค้าตอบรับใบเสนอราคา ${quote.quote_no}`,
        body:      `${quote.buyer_name_snapshot} · ฿${Number(quote.total).toLocaleString("th-TH")} — รอแปลงเป็นงานขนส่ง`,
        link_href: `/admin/freight/quotes/${quote.id}`,
        // No `freight_quote` reference_type exists; omit (link_href deep-links)
      });
    }
  } catch (e) {
    logger.warn("freight", "admin notify on customer accept failed", {
      quoteId: redactId(quote.id),
      error: e instanceof Error ? e.message : String(e),
    });
  }

  logger.info("freight", "customer accepted quote", {
    profileId: redactId(profile.id),
    quoteId:   redactId(quote.id),
    quoteNo:   quote.quote_no,
    via:       usedAdmin ? "admin_client_after_rls_deny" : "cookie_client",
  });

  // Revalidate both customer + admin views.
  revalidatePath(`/freight/quotes/${quote.quote_no}`);
  revalidatePath("/freight/quotes");
  revalidatePath(`/admin/freight/quotes/${quote.id}`);
  revalidatePath("/admin/freight/quotes");

  return { ok: true, data: { quoteNo: quote.quote_no } };
}
