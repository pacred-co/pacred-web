/**
 * Shared types for customer tags (CRM depth · 2026-06-08).
 *
 * Kept OUT of `customer-tags.ts` because that file is `"use server"` — a
 * `"use server"` module may only export async functions (no type/const exports),
 * per CLAUDE_TECHNICAL.md "Next.js 16 breaking changes". The <TagChips> client
 * component + the pages import these from here.
 */

/** One row of `customer_tag` (migration 0154). */
export type CustomerTag = {
  id: number;
  /** Customer PR member code (= tb_users.userID). */
  userid: string;
  /** The tag label. */
  tag: string;
  /** Rep who added it (legacy admin code / profile uuid), or null. */
  created_by: string | null;
  /** When it was added (ISO). */
  created_at: string;
};

/**
 * Starter vocabulary shown as one-click chips in the tag editor. Free-text is
 * still allowed — these are just the common ones (incl. the AXELRA-vs-PCS
 * lead-source markers the gap analysis flagged).
 */
export const STARTER_TAGS = ["AXELRA", "big-PCS", "VIP", "เคลียร์", "แอร์"] as const;
