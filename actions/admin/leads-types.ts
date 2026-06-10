/**
 * Shared types for the /admin/leads acquisition call-queue (CEO §6).
 *
 * Kept OUT of `leads.ts` because that file is `"use server"` — a `"use server"`
 * module may only export async functions (no type/const exports), per
 * CLAUDE_TECHNICAL.md "Next.js 16 breaking changes". The page + the client
 * call-status component import these types from here.
 */

/** The 5 call-outcome states stored in `lead_call_log.status`. */
export const LEAD_CALL_STATUSES = [
  "called",
  "no_answer",
  "closed",
  "callback",
  "not_interested",
] as const;
export type LeadCallStatus = (typeof LEAD_CALL_STATUSES)[number];

/**
 * Which lead pool the queue shows.
 *   cold     → never-contacted leads with a phone.
 *   big-pcs  → top forwarder-order owners (full-base ranking · RPC 0173).
 *   all      → every customer with a phone.
 *   callback → นัดโทรกลับ due-queue: leads whose LATEST call outcome is
 *              'callback', oldest promise first (lead_call_log has no
 *              scheduled-date column, so "due" = age of the callback note).
 */
export type LeadSegment = "cold" | "big-pcs" | "all" | "callback";

/** One row in the call-queue table. */
export type LeadQueueRow = {
  /** PR member code (= tb_users.userID). */
  userid: string;
  /** Display name (userName + userLastName), or "—". */
  name: string;
  /** Phone to call (userTel). */
  tel: string;
  /** Assigned sales rep legacy id (tb_users.adminIDSale), or "". */
  rep: string;
  /** Assigned CS legacy id (tb_users.adminIDCS · migration 0141), or "". */
  cs: string;
  /** Registration date (tb_users.userRegistered) ISO/string, or null. */
  registered: string | null;
  /** Lifetime forwarder order count (big-PCS ranking signal); 0 if none. */
  orderCount: number;
  /** Latest call outcome from lead_call_log, or null = never called. */
  callStatus: LeadCallStatus | null;
  /** When the latest call was logged (ISO), or null. */
  lastCall: string | null;
};

/** Input filter for `getLeadQueue`. */
export type LeadQueueFilter = {
  segment: LeadSegment;
  /** Filter by current call-state; "all" = no filter. */
  status?: LeadCallStatus | "all";
  /** Free-text search over code / phone / name. */
  q?: string;
  /** 1-based page (200 rows/page). */
  page?: number;
  /**
   * When true, ignore pagination and return up to the export cap (10,000 —
   * EXPORT_CAP in leads.ts) in a single result — for the "export all filtered"
   * CSV. Same filters/joins as
   * the paged path, so the export can never drift from the on-screen view.
   */
  exportAll?: boolean;
};

/** Result of `getLeadQueue`. */
export type LeadQueueResult = {
  rows: LeadQueueRow[];
  page: number;
  hasMore: boolean;
};

/** Top-of-page counts. */
export type LeadStats = {
  /** tb_users.userActive='' with a phone — the cold-lead pool. */
  cold: number;
  /** lead_call_log rows logged today (any status). */
  calledToday: number;
  /** Leads whose latest call-state = 'closed'. */
  closed: number;
};

/** Input for `logLeadCall`. */
export type LogLeadCallInput = {
  userid: string;
  status: LeadCallStatus;
  note?: string;
  /**
   * When closing a deal (status='closed'): skip the auto sales→CS handoff
   * because this is a เคลียร์/แอร์ job ("ทะลุ cs ได้เลย" — CEO §5). Ignored for
   * every non-closed status.
   */
  bypassCs?: boolean;
};
