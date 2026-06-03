// ADR-0025 cashback-at-checkout — pure helpers shared by the submit side
// (forwarder/shop/yuan checkout) and the admin approve/settle side.
//
// These MUST live outside a `"use server"` module: a Server-Action file may
// only export async functions, so sync helpers + types + the regex live here
// and are imported by `actions/admin/wallet-hs.ts` and the checkout actions.

/** `cbhrefid` prefix per pay surface — keeps the spend trail's idempotency
 *  anchor namespaced so a forwarder id and a shop hNo can never collide. */
export type CashbackRefKind = "forwarder" | "shop" | "yuan";

export function cashbackRefId(kind: CashbackRefKind, ref: string): string {
  return `${kind}:${ref}`;
}

// Carried-cashback marker on a wallet/credit-leg note. Format: a single
// `[CB:<amount>]` token (amount = plain decimal, 2dp). Missing ⇒ none applied.
const CASHBACK_NOTE_RE = /\[CB:(\d+(?:\.\d+)?)\]/;

/** Append the `[CB:<amount>]` carry tag to a note (submit side). */
export function appendCashbackNoteTag(note: string, applied: number): string {
  const amt = Math.round((Number(applied) || 0) * 100) / 100;
  if (amt <= 0) return note;
  const tag = `[CB:${amt}]`;
  return note ? `${note} ${tag}` : tag;
}

/** Parse the carried applied-cashback amount out of a note (0 if absent). */
export function parseCashbackNoteTag(note: string | null | undefined): number {
  const m = CASHBACK_NOTE_RE.exec(note ?? "");
  if (!m) return 0;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : 0;
}
