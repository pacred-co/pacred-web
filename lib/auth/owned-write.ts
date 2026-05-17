/**
 * W-1 / S-2 — un-skippable ownership guard for the
 * `createAdminClient()` customer-action pattern.
 *
 * ── The problem (gap-schema-security.md S-2) ────────────────
 * 11 customer-facing action files use `createAdminClient()` (RLS
 * FULLY bypassed) for some writes — e.g. `payServiceOrderFromWallet`
 * inserts a `wallet_transactions` debit, `requestTaxInvoice` inserts
 * a `tax_invoices` row. The code is careful *today* (it verifies
 * ownership with the RLS-scoped `createClient()` first), but the
 * safety is 100% convention: the admin client will happily write a
 * row for ANY `profile_id`. One future edit that trusts an id from
 * the input — or forgets the ownership SELECT — turns a normal
 * customer action into a cross-account write (pay another user's
 * order from your wallet; issue a tax invoice under someone else's).
 *
 * ── This module ─────────────────────────────────────────────
 * Two helpers that make the ownership check STRUCTURAL, not
 * convention. Both throw `OwnershipError` on a mismatch — a thrown
 * error fails the Server Action loudly instead of silently writing
 * a cross-customer row.
 *
 *   assertOwnedProfileId(verifiedUserId, payload)
 *     — for an INSERT whose row IS owned by the caller: pass the
 *       authenticated user id + the row payload; it asserts
 *       payload.profile_id === verifiedUserId and returns the
 *       payload typed as carrying the correct owner. Use this right
 *       before `admin.from(...).insert(payload)`.
 *
 *   assertOwnsRecord(verifiedUserId, record)
 *     — for a write GUARDED by a parent record's ownership (e.g.
 *       "this forwarder belongs to me"): pass the authenticated user
 *       id + the parent row (already fetched, ideally via the
 *       RLS-scoped client); it asserts record.profile_id ===
 *       verifiedUserId and returns the record.
 *
 * ── Why a helper and not just RLS ───────────────────────────
 * Where the customer's own RLS policy *can* express the write, the
 * durable fix is to fix the RLS policy (S-2 Fix-C-a). But several
 * writes genuinely need RLS bypass — e.g. a `wallet_transactions`
 * insert with `kind='yuan_payment'`, which the self-serve INSERT
 * policy (0007 `wallet_tx_insert_self_serve`) deliberately forbids.
 * For those, this helper is the un-skippable check (S-2 Fix-C-b):
 * the ownership assertion sits *in the type/value flow*, so a future
 * edit cannot drop it without the payload failing to type-check or
 * the call site obviously losing a line.
 *
 * Server-only — these guards protect server-side admin-client writes.
 */

import "server-only";

/** Thrown when a write's owner does not match the verified caller. */
export class OwnershipError extends Error {
  constructor(
    /** Stable code for callers that branch on it. */
    public readonly code: "ownership_mismatch" = "ownership_mismatch",
    message = "ownership_mismatch",
  ) {
    super(message);
    this.name = "OwnershipError";
  }
}

/**
 * Assert an INSERT payload is owned by the verified caller.
 *
 * Use immediately before an admin-client insert of a row that the
 * customer themselves owns:
 *
 *   const { data: { user } } = await supabase.auth.getUser();
 *   if (!user) return { ok: false, error: "not_signed_in" };
 *   // ...verify the parent order/forwarder ownership via createClient()...
 *   const row = assertOwnedProfileId(user.id, {
 *     profile_id: user.id,            // <- guarded here
 *     bucket: "main", amount: -total, kind: "order_payment", ...
 *   });
 *   await admin.from("wallet_transactions").insert(row);
 *
 * If a future edit changes `profile_id` to an untrusted input value
 * (`profile_id: input.someId`), this throws `OwnershipError` instead
 * of letting the admin client write a cross-customer row.
 *
 * @throws {OwnershipError} if `payload.profile_id !== verifiedUserId`.
 */
export function assertOwnedProfileId<T extends { profile_id: string }>(
  verifiedUserId: string,
  payload: T,
): T {
  if (!verifiedUserId) {
    throw new OwnershipError("ownership_mismatch", "ownership_mismatch: empty verified user id");
  }
  if (payload.profile_id !== verifiedUserId) {
    throw new OwnershipError(
      "ownership_mismatch",
      `ownership_mismatch: payload.profile_id=${payload.profile_id} != verified=${verifiedUserId}`,
    );
  }
  return payload;
}

/**
 * Assert a parent record is owned by the verified caller, then return
 * it. Use when an admin-client write is *guarded by* the ownership of
 * a record the caller fetched (ideally via the RLS-scoped client, so
 * a non-owner gets `null` and never reaches here):
 *
 *   const { data: forwarder } = await supabase
 *     .from("forwarders").select("id, profile_id, status, total_price")
 *     .eq("f_no", fNo).maybeSingle();
 *   if (!forwarder) return { ok: false, error: "not_found" };
 *   const owned = assertOwnsRecord(user.id, forwarder);
 *   // ...now safe to admin-client write keyed on `owned`...
 *
 * The RLS-scoped fetch already enforces ownership; this is the
 * defence-in-depth assertion that survives a future switch to an
 * un-scoped (admin-client) fetch.
 *
 * @throws {OwnershipError} if `record.profile_id !== verifiedUserId`.
 */
export function assertOwnsRecord<T extends { profile_id: string }>(
  verifiedUserId: string,
  record: T,
): T {
  if (!verifiedUserId) {
    throw new OwnershipError("ownership_mismatch", "ownership_mismatch: empty verified user id");
  }
  if (record.profile_id !== verifiedUserId) {
    throw new OwnershipError(
      "ownership_mismatch",
      `ownership_mismatch: record.profile_id=${record.profile_id} != verified=${verifiedUserId}`,
    );
  }
  return record;
}
