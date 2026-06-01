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

/** Which lead pool the queue shows. */
export type LeadSegment = "cold" | "big-pcs" | "all";

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
};
