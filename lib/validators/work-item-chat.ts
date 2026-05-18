/**
 * IC-1 — Zod schemas + helpers for the per-job internal chat thread.
 *
 * Pairs with:
 *   - migration 0086_work_item_messages.sql   (table + RLS + CHECK)
 *   - types/work-item-chat.ts                  (TS contract)
 *   - actions/admin/work-item-messages.ts      (the 6 Server Actions)
 *
 * Design: docs/research/internal-chat-system-2026-05-18.md §2.5 (action
 * surface), §3.2 (waiting_reason vocab — fixed 8 values), §3.3 (status-note
 * mechanic — never set a wait silently).
 *
 * The string literals here MUST match the migration's CHECK constraints
 * exactly (waiting_reason enum, body length bounds).
 */

import { z } from "zod";

// ────────────────────────────────────────────────────────────
// Shared field schemas
// ────────────────────────────────────────────────────────────

/** Message body — matches CHECK char_length(body) between 1 and 5000 in 0083. */
const bodySchema = z
  .string()
  .trim()
  .min(1, "body_required")
  .max(5000, "body_too_long");

/** Short body (for clearWaiting — the "unblocked" note). */
const shortBodySchema = z
  .string()
  .trim()
  .min(1, "body_required")
  .max(500, "body_too_long");

/** Optional explicit mention list. UUIDs only, deduped, capped at 20. */
const mentionedAdminIdsSchema = z
  .array(z.string().uuid("invalid_admin_id"))
  .max(20, "too_many_mentions")
  .optional();

/** A role string when sent from the UI — bounded for safety. */
const roleStringSchema = z
  .string()
  .trim()
  .min(1, "role_required")
  .max(32, "role_too_long");

// ────────────────────────────────────────────────────────────
// 1) postMessage — plain comment with @mention fan-out
// ────────────────────────────────────────────────────────────

export const postMessageSchema = z.object({
  workItemId:        z.string().uuid("invalid_work_item_id"),
  body:              bodySchema,
  mentionedAdminIds: mentionedAdminIdsSchema,
});
export type PostMessageInput = z.infer<typeof postMessageSchema>;

// ────────────────────────────────────────────────────────────
// 2) postStatusNote — the only way to set the waiting_for block (§3.3)
// ────────────────────────────────────────────────────────────

// Inline the waiting_reason vocab here as a `const` tuple so Zod can infer
// the literal union. MUST stay in lock-step with WAITING_REASONS in
// types/work-item-chat.ts (and the 0083 CHECK constraint). The test file
// asserts both lists are identical to guard against drift.
const WAITING_REASON_VOCAB = [
  "confirm",
  "disbursement",
  "billing",
  "follow_up",
  "document",
  "payment",
  "rate_fix",
  "external",
] as const;

export const postStatusNoteSchema = z.object({
  workItemId:        z.string().uuid("invalid_work_item_id"),
  body:              bodySchema,
  waitingReason:     z.enum(WAITING_REASON_VOCAB, { message: "invalid_waiting_reason" }),
  blockedRole:       roleStringSchema.optional(),
  blockedAdmin:      z.string().uuid("invalid_blocked_admin").optional(),
  mentionedAdminIds: mentionedAdminIdsSchema,
});
export type PostStatusNoteInput = z.infer<typeof postStatusNoteSchema>;

// ────────────────────────────────────────────────────────────
// 3) clearWaiting — the resolver side, role-gated in the action
// ────────────────────────────────────────────────────────────

export const clearWaitingSchema = z.object({
  workItemId: z.string().uuid("invalid_work_item_id"),
  body:       shortBodySchema,
});
export type ClearWaitingInput = z.infer<typeof clearWaitingSchema>;

// ────────────────────────────────────────────────────────────
// 4) softDeleteMessage — author-or-super
// ────────────────────────────────────────────────────────────

export const softDeleteMessageSchema = z.object({
  messageId: z.string().uuid("invalid_message_id"),
});
export type SoftDeleteMessageInput = z.infer<typeof softDeleteMessageSchema>;

// ────────────────────────────────────────────────────────────
// 5) markThreadSeen — drain the @me inbox for a job
// ────────────────────────────────────────────────────────────

export const markThreadSeenSchema = z.object({
  workItemId: z.string().uuid("invalid_work_item_id"),
});
export type MarkThreadSeenInput = z.infer<typeof markThreadSeenSchema>;

// ════════════════════════════════════════════════════════════
// parseMentionHandles — extract @handle tokens from a body string
// ════════════════════════════════════════════════════════════
//
// Permissive on the alphabet (so Thai/CJK display names work) but strict on
// shape: a handle is `@` immediately followed by 1-40 non-whitespace,
// non-punctuation chars from the union of:
//   - ASCII alphanumerics + `.` + `_` + `-`
//   - Thai (U+0E00-U+0E7F)
//   - CJK Unified Ideographs (U+4E00-U+9FFF)
//   - Hiragana / Katakana (U+3040-U+30FF)
//   - Hangul Syllables (U+AC00-U+D7AF)
//
// Returns DEDUPED handle strings WITHOUT the leading `@`. Order-preserving
// (first-seen wins) — the action resolver may rely on stable ordering.

const HANDLE_CLASS =
  "[A-Za-z0-9._\\-\\u0E00-\\u0E7F\\u4E00-\\u9FFF\\u3040-\\u30FF\\uAC00-\\uD7AF]";

const MENTION_REGEX = new RegExp(
  // (?<=^|\s|[(\[]) — start, whitespace, or open bracket so "foo@bar" in an
  // email doesn't fire. Email guard is fragile; we lean on the boundary.
  `(?:^|[\\s([])@(${HANDLE_CLASS}{1,40})`,
  "g",
);

/**
 * Find all @handle tokens in a body string. Deduplicated, capped at 40 chars
 * each, first-seen-wins order.
 *
 * Examples (handle = bare display token, no `@`):
 *   "hi @ภูม please check"               → ["ภูม"]
 *   "@dave @poom @dave again"           → ["dave", "poom"]
 *   "email me at me@pacred.co"          → []        (no boundary before @)
 *   "(@got) and @ก๊อต"                   → ["got", "ก๊อต"]
 */
export function parseMentionHandles(body: string): string[] {
  if (!body || typeof body !== "string") return [];
  const out: string[] = [];
  const seen = new Set<string>();
  MENTION_REGEX.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = MENTION_REGEX.exec(body)) !== null) {
    const raw = m[1] ?? "";
    if (!raw) continue;
    // Strip trailing punctuation a user may have appended ("@ภูม,").
    const handle = raw.replace(/[._\-]+$/u, "").slice(0, 40);
    if (!handle) continue;
    if (seen.has(handle)) continue;
    seen.add(handle);
    out.push(handle);
  }
  return out;
}
