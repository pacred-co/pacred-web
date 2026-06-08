/**
 * Shared types for the customer activity timeline (CRM depth · 2026-06-08).
 *
 * Kept OUT of `customer-activity.ts` because that file is `"use server"` — a
 * `"use server"` module may only export async functions (no type/const exports),
 * per CLAUDE_TECHNICAL.md "Next.js 16 breaking changes". The
 * <CustomerActivityTimeline> client component + the pages import these.
 */

/** One entry in the merged timeline (a call from lead_call_log OR a note). */
export type ActivityEntry = {
  /** Source of the entry. */
  kind: "call" | "note";
  /** Stable composite id ("call:<uuid>" | "note:<bigint>") for React keys. */
  id: string;
  /** When it happened (ISO), or null. */
  at: string | null;
  /** Rep who logged it (legacy admin code / profile uuid), or null. */
  by: string | null;
  /** For calls only — the call-outcome status (lead_call_log.status), else null. */
  callStatus: string | null;
  /** The note text / call note, or null. */
  body: string | null;
};
