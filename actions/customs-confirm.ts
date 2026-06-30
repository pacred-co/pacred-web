"use server";

// ════════════════════════════════════════════════════════════════════
// ใบขนพ่วง (#17) — the CUSTOMER-confirm server action (PUBLIC by token).
//
// The customer reaches /customs-confirm/[token] from a LINE link (they may not
// have a portal login · owner-confirmed). They review the draft documents +
// amount, then เฟิมยอด (confirm) or ขอแก้ไข (reject). Only after a 'confirmed'
// status may accounting collect (see actions/admin/cargo-declarations.ts
// adminCollectConfirmedCustomsDraft).
//
// SECURITY: NO auth gate — the action is reachable by anyone holding the token.
// It resolves the declaration ONLY by the unguessable v4-UUID confirm_token
// (122-bit random · partial-unique-indexed · mig 0236). It never accepts an id,
// never exposes another customer's data, and refuses any token that isn't in a
// pending ('sent') state. Money-safe: the customer action ONLY flips
// customer_confirm_status — it never moves money, never collects, never touches
// the declaration totals.
// ════════════════════════════════════════════════════════════════════

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";

export type ConfirmResult =
  | { ok: true }
  | { ok: false; error: string };

const tokenSchema = z.string().uuid();

/** Customer CONFIRMS the draft total ('sent' → 'confirmed'). Token-gated, idempotent. */
export async function customerConfirmCustomsDraft(rawToken: string): Promise<ConfirmResult> {
  const parsed = tokenSchema.safeParse(rawToken);
  if (!parsed.success) return { ok: false, error: "invalid_token" };
  const token = parsed.data;

  const admin = createAdminClient();

  // Resolve by token only. A row that is already 'confirmed' → idempotent OK.
  const { data: decl, error } = await admin
    .from("customs_declarations")
    .select("id, customer_confirm_status")
    .eq("confirm_token", token)
    .maybeSingle<{ id: string; customer_confirm_status: string | null }>();
  if (error) {
    console.error("[customs-confirm confirm lookup]", { code: error.code, message: error.message });
    return { ok: false, error: "db_error" };
  }
  if (!decl) return { ok: false, error: "not_found" };
  if (decl.customer_confirm_status === "confirmed") {
    revalidatePath(`/customs-confirm/${token}`);
    return { ok: true };                                   // already confirmed — idempotent
  }
  if (decl.customer_confirm_status !== "sent") {
    // 'none' (not sent) / 'rejected' → can't confirm from here.
    return { ok: false, error: "not_pending" };
  }

  // Atomic flip — guard on 'sent' so a concurrent reject can't be clobbered.
  const { data: claimed, error: updErr } = await admin
    .from("customs_declarations")
    .update({ customer_confirm_status: "confirmed", customer_confirmed_at: new Date().toISOString() })
    .eq("confirm_token", token)
    .eq("customer_confirm_status", "sent")
    .select("id")
    .maybeSingle<{ id: string }>();
  if (updErr) {
    console.error("[customs-confirm confirm update]", { code: updErr.code, message: updErr.message });
    return { ok: false, error: "confirm_failed" };
  }
  if (!claimed) return { ok: false, error: "not_pending" };

  revalidatePath(`/customs-confirm/${token}`);
  return { ok: true };
}

/** Customer REJECTS / asks to revise the draft ('sent' → 'rejected'). Token-gated. */
export async function customerRejectCustomsDraft(rawToken: string): Promise<ConfirmResult> {
  const parsed = tokenSchema.safeParse(rawToken);
  if (!parsed.success) return { ok: false, error: "invalid_token" };
  const token = parsed.data;

  const admin = createAdminClient();

  const { data: decl, error } = await admin
    .from("customs_declarations")
    .select("id, customer_confirm_status")
    .eq("confirm_token", token)
    .maybeSingle<{ id: string; customer_confirm_status: string | null }>();
  if (error) {
    console.error("[customs-confirm reject lookup]", { code: error.code, message: error.message });
    return { ok: false, error: "db_error" };
  }
  if (!decl) return { ok: false, error: "not_found" };
  // Can't reject a confirmed draft (the customer already agreed). Only 'sent'.
  if (decl.customer_confirm_status === "confirmed") return { ok: false, error: "already_confirmed" };
  if (decl.customer_confirm_status !== "sent") return { ok: false, error: "not_pending" };

  // Atomic flip — guard on 'sent' + verify a row matched so a concurrent
  // confirm/resend can't make this a silent false-success (mirror confirm path).
  const { data: claimed, error: updErr } = await admin
    .from("customs_declarations")
    .update({ customer_confirm_status: "rejected" })
    .eq("confirm_token", token)
    .eq("customer_confirm_status", "sent")
    .select("id")
    .maybeSingle<{ id: string }>();
  if (updErr) {
    console.error("[customs-confirm reject update]", { code: updErr.code, message: updErr.message });
    return { ok: false, error: "reject_failed" };
  }
  if (!claimed) return { ok: false, error: "not_pending" };

  revalidatePath(`/customs-confirm/${token}`);
  return { ok: true };
}
