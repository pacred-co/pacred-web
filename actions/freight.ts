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
    const { data: targetAdmins, error: targetAdminsErr } = await admin
      .from("admins")
      .select("profile_id")
      .in("role", ["sales_admin", "ops", "super"])
      .eq("is_active", true);
    if (targetAdminsErr) {
      console.error(`[admins list] failed`, { code: targetAdminsErr.code, message: targetAdminsErr.message });
    }

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

// ────────────────────────────────────────────────────────────
// markReceiptPrinted — port of the render-time statusPrint UPDATE
// ────────────────────────────────────────────────────────────
//
// Faithful 1:1 port of the legacy
//   member/printReceiptF.php L58
//   member/invoiceF.php L58
// which both ran the same UPDATE at render time:
//   UPDATE `tb_receipt` SET `statusPrint`='1',
//                           `adminIDprint`='ลูกค้า',
//                           `rDatePrint`=NOW()
//   WHERE rID='$rID';
//
// A Next.js Server Component render must stay a pure read (runbook §9.4),
// so the mutation was deferred via the `TODO(server-action)` in both
// page.tsx files. This action ports it — same columns, same `'ลูกค้า'`
// literal, same NOW() semantics. No audit log added beyond what legacy
// did (= nothing, faithful-port rule).
//
// Ownership: legacy gated by cookie `pcs_userID`; Pacred gates by
// `tb_receipt.userid === profile.member_code` (the same "PR<n>" the
// page already enforces). Receipts not owned by the caller are silently
// skipped (the legacy was also tolerant — the link was only ever shown
// to its owner, and the UPDATE would just no-op via the WHERE rID).
//
// Multi-rID support: both legacy pages call this once per rID in their
// loop over `explode(",", $_GET['id'])`. The new action accepts an
// array so the caller can mark the whole comma-joined set in one call.
const markReceiptPrintedSchema = z.object({
  rIds: z.array(z.string().min(1).max(20)).min(1).max(50),
});

export async function markReceiptPrinted(
  input: { rIds: string[] },
): Promise<ActionResult<{ updated: number }>> {
  const parsed = markReceiptPrintedSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }

  const { profile } = await requireAuth();
  if (!profile) return { ok: false, error: "auth_required" };
  const userID = profile.member_code ?? "";
  if (!userID) return { ok: false, error: "no_member_code" };

  const admin = createAdminClient();

  // Ownership filter — legacy relied on the link only being shown to its
  // owner; Pacred enforces it server-side (same gate as the print pages).
  // Build the rid list bounded to receipts this customer actually owns.
  const { data: owned, error: readErr } = await admin
    .from("tb_receipt")
    .select("rid")
    .in("rid", parsed.data.rIds)
    .eq("userid", userID);
  if (readErr) return { ok: false, error: `read_failed: ${readErr.message}` };
  const ownedRids = (owned ?? []).map((r) => (r as { rid: string }).rid);
  if (ownedRids.length === 0) {
    // Nothing to mark — not an error; matches the legacy no-op WHERE.
    return { ok: true, data: { updated: 0 } };
  }

  // Faithful: statusprint='1', adminidprint='ลูกค้า', rdateprint=NOW().
  // The legacy `NOW()` was MySQL local time; Pacred uses Postgres'
  // server-local timestamp via the JS-side `new Date()` formatted to the
  // same `YYYY-MM-DD HH:MM:SS` shape the rest of the tb_* writers use
  // (see actions/wallet.ts:submitLegacyWalletDeposit L427).
  const datetimeNow = new Date().toISOString().replace("T", " ").slice(0, 19);

  const { error: updErr } = await admin
    .from("tb_receipt")
    .update({
      statusprint:  "1",
      adminidprint: "ลูกค้า",
      rdateprint:   datetimeNow,
    })
    .in("rid", ownedRids);
  if (updErr) return { ok: false, error: `update_failed: ${updErr.message}` };

  // Revalidate both surfaces that read statusprint (the receipt-history
  // list shows a "printed" badge from this column).
  revalidatePath("/freight/receipts/history");

  return { ok: true, data: { updated: ownedRids.length } };
}
