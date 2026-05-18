/**
 * IC-1 — types for the per-job internal chat thread.
 *
 * Design: docs/research/internal-chat-system-2026-05-18.md §2 + §3.
 */

/** Message kind (matches work_item_messages.kind CHECK). */
export type WorkItemMessageKind = "comment" | "system" | "status_note";

/**
 * waiting_reason vocabulary (matches work_items.waiting_reason CHECK).
 * Per design §3.2 — 8 values + null.  Free-text "why" defeats the at-a-glance
 * scan + per-reason filter; nuance goes in the status_note message body.
 */
export type WaitingReason =
  | "confirm"        // รอเฟิม / รออนุมัติ
  | "disbursement"   // รอเบิกจ่าย
  | "billing"        // รอวางบิล / รอออกใบแจ้งหนี้
  | "follow_up"      // รอตามลูกค้า / ตามคู่ค้า
  | "document"       // รอเอกสาร (WHT cert / Form E / D/O / slip)
  | "payment"        // รอลูกค้าชำระ
  | "rate_fix"       // รอแก้เรท / แก้ราคา
  | "external";      // รอหน่วยงานภายนอก (customs / carrier)

/** TH labels — render-ready for badge / picker UI. */
export const WAITING_REASON_LABEL_TH: Record<WaitingReason, string> = {
  confirm:      "รอเฟิม / อนุมัติ",
  disbursement: "รอเบิกจ่าย",
  billing:      "รอวางบิล",
  follow_up:    "รอตามลูกค้า/คู่ค้า",
  document:     "รอเอกสาร",
  payment:      "รอลูกค้าชำระ",
  rate_fix:     "รอแก้เรท/ราคา",
  external:     "รอหน่วยงานภายนอก",
};

/** EN labels. */
export const WAITING_REASON_LABEL_EN: Record<WaitingReason, string> = {
  confirm:      "Waiting on confirmation",
  disbursement: "Waiting on disbursement",
  billing:      "Waiting on billing",
  follow_up:    "Waiting on follow-up",
  document:     "Waiting on document",
  payment:      "Waiting on customer payment",
  rate_fix:     "Waiting on rate fix",
  external:     "Waiting on external party",
};

/** Tailwind badge classes per reason — for the board + thread header. */
export const WAITING_REASON_BADGE: Record<WaitingReason, string> = {
  confirm:      "bg-amber-50 text-amber-800 border-amber-200",
  disbursement: "bg-purple-50 text-purple-800 border-purple-200",
  billing:      "bg-indigo-50 text-indigo-800 border-indigo-200",
  follow_up:    "bg-blue-50 text-blue-800 border-blue-200",
  document:     "bg-orange-50 text-orange-800 border-orange-200",
  payment:      "bg-pink-50 text-pink-800 border-pink-200",
  rate_fix:     "bg-red-50 text-red-800 border-red-200",
  external:     "bg-zinc-100 text-zinc-700 border-zinc-300",
};

/** All vocab values as a const-tuple — for Zod enum + iteration. */
export const WAITING_REASONS: readonly WaitingReason[] = [
  "confirm",
  "disbursement",
  "billing",
  "follow_up",
  "document",
  "payment",
  "rate_fix",
  "external",
] as const;

/**
 * A single message as rendered in the thread panel.  Mirrors the
 * work_item_messages row + author display name pulled from profiles.
 */
export interface WorkItemMessageRow {
  id:                 string;
  workItemId:         string;
  authorAdminId:      string | null;        // null for kind='system'
  authorDisplayName:  string | null;        // joined from profiles (for header avatar)
  kind:               WorkItemMessageKind;
  body:               string;
  setWaitingReason:   WaitingReason | null; // mirrors at write time
  setBlockedRole:     string | null;
  createdAt:          string;
  /** True when caller is the message author (UI: show "delete" affordance). */
  isOwnMessage:       boolean;
  /** Profiles.id list of staff @mentioned in this message (for UI rendering). */
  mentionedAdminIds:  string[];
}

/**
 * A @mention row as rendered in the per-staffer "@me" inbox.
 */
export interface MentionInboxRow {
  messageId:     string;
  workItemId:    string;
  /** Snippet of the message body (first ~120 chars, plain). */
  bodyExcerpt:   string;
  authorName:    string | null;
  workItemTitle: string;     // joined from work_items
  workItemEntity: string;    // entity_type + entity_ref
  createdAt:     string;
  /** Set when staffer opens the thread (via markThreadSeen). */
  seenAt:        string | null;
}

/** Live waiting-for block on a work_item (for the thread header + board badge). */
export interface WorkItemWaitingBlock {
  waitingReason:  WaitingReason | null;
  blockedOnRole:  string | null;
  blockedOnAdmin: string | null;     // profile_id
  /** Joined display name when blockedOnAdmin is set. */
  blockedOnAdminName: string | null;
}

/** Input for postMessage server action. */
export interface PostMessageInput {
  workItemId: string;
  body:       string;
  /** Optional explicit list of profile_ids to @mention.  When provided,
   *  the action skips body parsing and inserts these directly.  When omitted,
   *  the action parses `@handle` tokens from body. */
  mentionedAdminIds?: string[];
}

/** Input for postStatusNote server action (sets the waiting_for block). */
export interface PostStatusNoteInput {
  workItemId:     string;
  body:           string;
  waitingReason:  WaitingReason;
  blockedRole?:   string;
  blockedAdmin?:  string;        // profile_id
  mentionedAdminIds?: string[];
}

/** Input for clearWaiting server action. */
export interface ClearWaitingInput {
  workItemId: string;
  body:       string;            // "unblocked" note — required for the audit trail
}
