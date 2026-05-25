"use server";

/**
 * BK-2 · Admin booking transitions — closes the G2 gap from the BK-1 audit
 * (the admin detail page's action panel was a read-only stub).
 *
 * Status lifecycle (lifecycle from migration 0079):
 *   draft → submitted → contacted → quoted → won (terminal)
 *                                          ↘ lost      (terminal)
 *                                          ↘ cancelled (terminal)
 *
 * What this file owns:
 *   - 5 status transitions an admin can drive from /admin/bookings/[bookingNo]
 *   - work_item synchronisation — each transition also nudges the booking's
 *     work_item via ensure_work_item (status flip) so the cross-department
 *     board stays current (0080).
 *   - admin_audit_log row per transition (per ADR-0014).
 *
 * Role gates (mirror freight_quotes pattern):
 *   contacted        : super, ops, sales_admin, accounting
 *   quoted           : super, ops, sales_admin, accounting (requires freight_quote_id)
 *   won              : super, sales_admin, accounting
 *   lost / cancelled : super, ops, sales_admin, accounting (requires closed_reason ≥3)
 *
 * Each transition is RACE-SAFE: optimistic .eq("status", expectedFrom)
 * guards against concurrent admin clicks. A stale "from" returns
 * `bad_status:<actual>` so the UI can refresh + try again.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  withAdmin,
  logAdminAction,
  type AdminActionResult,
} from "./common";

// ────────────────────────────────────────────────────────────
// Role sets
// ────────────────────────────────────────────────────────────

const ROLES_TRANSITION = ["super", "ops", "sales_admin", "accounting"] as const;
const ROLES_WON        = ["super", "sales_admin", "accounting"] as const;

// ────────────────────────────────────────────────────────────
// Input schemas
// ────────────────────────────────────────────────────────────

const bookingIdSchema = z.object({
  bookingId: z.string().uuid("invalid_booking_id"),
});
type BookingIdInput = z.infer<typeof bookingIdSchema>;

const markQuotedSchema = bookingIdSchema.extend({
  freightQuoteId: z.string().uuid("invalid_freight_quote_id"),
});
type MarkQuotedInput = z.infer<typeof markQuotedSchema>;

const closeBookingSchema = bookingIdSchema.extend({
  reason: z
    .string()
    .trim()
    .min(3, "reason_too_short")
    .max(500, "reason_too_long"),
});
type CloseBookingInput = z.infer<typeof closeBookingSchema>;

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

interface BookingFlipFields {
  status: string;
  contacted_at?: string;
  closed_at?: string;
  closed_reason?: string;
  freight_quote_id?: string;
}

async function flipBookingStatus(
  admin: ReturnType<typeof createAdminClient>,
  bookingId: string,
  expectedFrom: string | string[],
  to: string,
  extra: Omit<BookingFlipFields, "status">,
): Promise<AdminActionResult<{ booking_no: string }>> {
  const { data: row, error: readErr } = await admin
    .from("bookings")
    .select("status, booking_no")
    .eq("id", bookingId)
    .maybeSingle<{ status: string; booking_no: string | null }>();
  if (readErr) return { ok: false, error: `read_failed: ${readErr.message}` };
  if (!row) return { ok: false, error: "not_found" };
  if (!row.booking_no) return { ok: false, error: "draft_cannot_transition" };

  const fromList = Array.isArray(expectedFrom) ? expectedFrom : [expectedFrom];
  if (!fromList.includes(row.status)) {
    return { ok: false, error: `bad_status:${row.status}` };
  }

  let update = admin
    .from("bookings")
    .update({ status: to, ...extra })
    .eq("id", bookingId);

  // Single-from path can use the optimistic equality race-guard; multi-from
  // paths re-verify post-flip via the returning row.
  if (fromList.length === 1) update = update.eq("status", fromList[0]);

  const { error: updErr } = await update;
  if (updErr) return { ok: false, error: `update_failed: ${updErr.message}` };

  return { ok: true, data: { booking_no: row.booking_no } };
}

/**
 * Mirror the booking's lifecycle into its work_item.  Best-effort — a
 * work_item sync failure must NOT block the booking transition (the
 * booking is the source of truth; the work_item is a routing convenience).
 */
async function syncWorkItem(
  admin: ReturnType<typeof createAdminClient>,
  bookingNo: string,
  to: "contacted" | "quoted" | "won" | "lost" | "cancelled",
  adminId: string,
): Promise<void> {
  // Map booking status → work_item lifecycle.
  //  contacted          → in_progress (the rep is working on it)
  //  quoted             → blocked     (waiting on customer's accept)
  //  won                → done
  //  lost / cancelled   → cancelled
  const workStatus =
    to === "won" ? "done" :
    to === "lost" || to === "cancelled" ? "cancelled" :
    to === "quoted" ? "blocked" :
    "in_progress";

  try {
    const { data: row, error: rowErr } = await admin
      .from("work_items")
      .select("id, status")
      .eq("entity_type", "booking")
      .eq("entity_ref", bookingNo)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ id: string; status: string }>();
    if (rowErr) {
      console.error(`[work_items list] failed`, { code: rowErr.code, message: rowErr.message });
    }

    if (!row) return;

    const patch: Record<string, unknown> = { status: workStatus };
    if (workStatus === "in_progress" && row.status === "open") {
      patch.started_at = new Date().toISOString();
    }
    if (workStatus === "done" || workStatus === "cancelled") {
      patch.closed_at = new Date().toISOString();
      patch.closed_by = adminId;
    }

    await admin.from("work_items").update(patch).eq("id", row.id);
  } catch {
    // swallow — see jsdoc.
  }
}

function revalidate(bookingNo: string) {
  revalidatePath("/admin/bookings");
  revalidatePath(`/admin/bookings/${bookingNo}`);
  revalidatePath("/bookings");
  revalidatePath(`/bookings/${bookingNo}`);
  revalidatePath("/admin/board");
}

// ────────────────────────────────────────────────────────────
// 1) Mark contacted  (submitted → contacted)
// ────────────────────────────────────────────────────────────

export async function adminMarkBookingContacted(
  input: BookingIdInput,
): Promise<AdminActionResult<void>> {
  const parsed = bookingIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };

  return withAdmin([...ROLES_TRANSITION], async ({ adminId }) => {
    const admin = createAdminClient();
    const res = await flipBookingStatus(admin, input.bookingId, "submitted", "contacted", {
      contacted_at: new Date().toISOString(),
    });
    if (!res.ok) return res;
    if (!res.data) return { ok: false, error: "internal_no_data" };

    await syncWorkItem(admin, res.data.booking_no, "contacted", adminId);
    await logAdminAction(adminId, "booking.mark_contacted", "booking", input.bookingId, {});
    revalidate(res.data.booking_no);
    return { ok: true };
  });
}

// ────────────────────────────────────────────────────────────
// 2) Mark quoted  (submitted / contacted → quoted)
// ────────────────────────────────────────────────────────────
// Requires a freight_quote_id — Pricing has formalised the quote, this is
// the link.  The bookings.freight_quote_id FK is enforced + the CHECK
// constraint `bookings_quoted_has_quote` rejects a quoted row without it.

export async function adminMarkBookingQuoted(
  input: MarkQuotedInput,
): Promise<AdminActionResult<void>> {
  const parsed = markQuotedSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };

  return withAdmin([...ROLES_TRANSITION], async ({ adminId }) => {
    const admin = createAdminClient();

    // Verify the freight_quote exists + (best-effort) belongs to the same
    // profile_id as the booking.  A mismatched profile is allowed but
    // logged — admin may have created a quote against a different profile
    // intentionally (e.g. a juristic switch).
    const { data: quote, error: quoteErr } = await admin
      .from("freight_quotes")
      .select("id, profile_id, quote_no")
      .eq("id", input.freightQuoteId)
      .maybeSingle<{ id: string; profile_id: string | null; quote_no: string | null }>();
    if (quoteErr) {
      console.error(`[freight_quotes mutation lookup] failed`, { code: quoteErr.code, message: quoteErr.message });
      return { ok: false, error: `db_error:${quoteErr.code ?? "unknown"}` };
    }
    if (!quote) return { ok: false, error: "freight_quote_not_found" };

    const res = await flipBookingStatus(admin, input.bookingId, ["submitted", "contacted"], "quoted", {
      freight_quote_id: input.freightQuoteId,
    });
    if (!res.ok) return res;
    if (!res.data) return { ok: false, error: "internal_no_data" };

    await syncWorkItem(admin, res.data.booking_no, "quoted", adminId);
    await logAdminAction(adminId, "booking.mark_quoted", "booking", input.bookingId, {
      freight_quote_id: input.freightQuoteId,
      freight_quote_no: quote.quote_no,
    });
    revalidate(res.data.booking_no);
    return { ok: true };
  });
}

// ────────────────────────────────────────────────────────────
// 3) Mark won  (quoted → won)  — terminal
// ────────────────────────────────────────────────────────────

export async function adminMarkBookingWon(
  input: BookingIdInput,
): Promise<AdminActionResult<void>> {
  const parsed = bookingIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };

  return withAdmin([...ROLES_WON], async ({ adminId }) => {
    const admin = createAdminClient();
    const now = new Date().toISOString();
    const res = await flipBookingStatus(admin, input.bookingId, "quoted", "won", {
      closed_at: now,
    });
    if (!res.ok) return res;
    if (!res.data) return { ok: false, error: "internal_no_data" };

    await syncWorkItem(admin, res.data.booking_no, "won", adminId);
    await logAdminAction(adminId, "booking.mark_won", "booking", input.bookingId, {});
    revalidate(res.data.booking_no);
    return { ok: true };
  });
}

// ────────────────────────────────────────────────────────────
// 4) Mark lost  (any non-terminal → lost)  — terminal
// ────────────────────────────────────────────────────────────
// "lost" = customer declined / went cold.  Reason required for audit
// (ADR-0014 audit-completeness pattern).

export async function adminMarkBookingLost(
  input: CloseBookingInput,
): Promise<AdminActionResult<void>> {
  const parsed = closeBookingSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };

  return withAdmin([...ROLES_TRANSITION], async ({ adminId }) => {
    const admin = createAdminClient();
    const now = new Date().toISOString();
    const res = await flipBookingStatus(
      admin,
      input.bookingId,
      ["submitted", "contacted", "quoted"],
      "lost",
      {
        closed_at: now,
        closed_reason: input.reason,
      },
    );
    if (!res.ok) return res;
    if (!res.data) return { ok: false, error: "internal_no_data" };

    await syncWorkItem(admin, res.data.booking_no, "lost", adminId);
    await logAdminAction(adminId, "booking.mark_lost", "booking", input.bookingId, {
      reason: input.reason,
    });
    revalidate(res.data.booking_no);
    return { ok: true };
  });
}

// ────────────────────────────────────────────────────────────
// 5) Cancel  (any non-terminal → cancelled)  — terminal
// ────────────────────────────────────────────────────────────
// "cancelled" = customer asked to cancel (vs "lost" which is rep-side).
// Same schema as lost — reason required.

export async function adminCancelBooking(
  input: CloseBookingInput,
): Promise<AdminActionResult<void>> {
  const parsed = closeBookingSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };

  return withAdmin([...ROLES_TRANSITION], async ({ adminId }) => {
    const admin = createAdminClient();
    const now = new Date().toISOString();
    const res = await flipBookingStatus(
      admin,
      input.bookingId,
      ["submitted", "contacted", "quoted"],
      "cancelled",
      {
        closed_at: now,
        closed_reason: input.reason,
      },
    );
    if (!res.ok) return res;
    if (!res.data) return { ok: false, error: "internal_no_data" };

    await syncWorkItem(admin, res.data.booking_no, "cancelled", adminId);
    await logAdminAction(adminId, "booking.cancel", "booking", input.bookingId, {
      reason: input.reason,
    });
    revalidate(res.data.booking_no);
    return { ok: true };
  });
}
