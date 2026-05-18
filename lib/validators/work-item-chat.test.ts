/**
 * IC-1 — Zod schema + parseMentionHandles unit tests for the per-job
 * internal chat thread (0083_work_item_messages).
 *
 * Covers:
 *   (a) postMessageSchema  — body bounds, uuid guard, mention list bounds
 *   (b) postStatusNoteSchema  — waitingReason enum (8 values), optional
 *       blockedRole / blockedAdmin, body bounds
 *   (c) clearWaitingSchema  — short body bound
 *   (d) softDeleteMessageSchema  — uuid guard
 *   (e) markThreadSeenSchema  — uuid guard
 *   (f) parseMentionHandles  — boundary rules, dedup, Thai/CJK handles, cap
 *
 * No DB / network / file IO. Runs in <50ms.
 */

import {
  postMessageSchema,
  postStatusNoteSchema,
  clearWaitingSchema,
  softDeleteMessageSchema,
  markThreadSeenSchema,
  parseMentionHandles,
} from "./work-item-chat";
import { WAITING_REASONS } from "@/types/work-item-chat";

let pass = 0;
let fail = 0;
function assert(label: string, cond: boolean): void {
  if (cond) { pass++; console.log("  ✓", label); }
  else      { fail++; console.error("  ✗", label); }
}

console.log("work-item-chat validators (IC-1 / 0083 internal chat)");

// Valid RFC-4122 v4 UUIDs (Zod v4 .uuid() checks the version nibble).
const UUID_A = "11111111-1111-4111-8111-111111111111";
const UUID_B = "22222222-2222-4222-9222-222222222222";
const UUID_C = "33333333-3333-4333-a333-333333333333";

// ────────────────────────────────────────────────────────────
// (a) postMessageSchema
// ────────────────────────────────────────────────────────────
console.log("  (a) postMessageSchema");
{
  assert("happy path accepted",
    postMessageSchema.safeParse({ workItemId: UUID_A, body: "hello" }).success);

  assert("with mention list accepted",
    postMessageSchema.safeParse({
      workItemId: UUID_A, body: "ping", mentionedAdminIds: [UUID_B, UUID_C],
    }).success);

  assert("non-uuid workItemId rejected",
    !postMessageSchema.safeParse({ workItemId: "not-a-uuid", body: "x" }).success);

  assert("empty body rejected",
    !postMessageSchema.safeParse({ workItemId: UUID_A, body: "" }).success);

  assert("whitespace-only body rejected (trim then min)",
    !postMessageSchema.safeParse({ workItemId: UUID_A, body: "   " }).success);

  assert("body over 5000 rejected",
    !postMessageSchema.safeParse({ workItemId: UUID_A, body: "x".repeat(5001) }).success);

  assert("body at 5000 accepted",
    postMessageSchema.safeParse({ workItemId: UUID_A, body: "x".repeat(5000) }).success);

  assert("non-uuid in mention list rejected",
    !postMessageSchema.safeParse({
      workItemId: UUID_A, body: "x", mentionedAdminIds: ["bad"],
    }).success);

  assert("over-20 mention list rejected",
    !postMessageSchema.safeParse({
      workItemId: UUID_A, body: "x",
      mentionedAdminIds: Array.from({ length: 21 }, () => UUID_A),
    }).success);
}

// ────────────────────────────────────────────────────────────
// (b) postStatusNoteSchema
// ────────────────────────────────────────────────────────────
console.log("  (b) postStatusNoteSchema");
{
  assert("happy path — waitingReason only",
    postStatusNoteSchema.safeParse({
      workItemId: UUID_A, body: "manifest mismatch", waitingReason: "confirm",
    }).success);

  assert("with blockedRole accepted",
    postStatusNoteSchema.safeParse({
      workItemId: UUID_A, body: "x", waitingReason: "billing", blockedRole: "accounting",
    }).success);

  assert("with blockedAdmin accepted",
    postStatusNoteSchema.safeParse({
      workItemId: UUID_A, body: "x", waitingReason: "disbursement", blockedAdmin: UUID_B,
    }).success);

  assert("with all three blocker fields accepted",
    postStatusNoteSchema.safeParse({
      workItemId: UUID_A, body: "x", waitingReason: "document",
      blockedRole: "accounting", blockedAdmin: UUID_B,
    }).success);

  assert("unknown waiting reason rejected",
    !postStatusNoteSchema.safeParse({
      workItemId: UUID_A, body: "x", waitingReason: "unknown_reason",
    }).success);

  assert("all 8 WAITING_REASONS accepted (vocab in lock-step)",
    WAITING_REASONS.length === 8 &&
    WAITING_REASONS.every((r) =>
      postStatusNoteSchema.safeParse({
        workItemId: UUID_A, body: "x", waitingReason: r,
      }).success));

  assert("body over 5000 rejected",
    !postStatusNoteSchema.safeParse({
      workItemId: UUID_A, body: "x".repeat(5001), waitingReason: "confirm",
    }).success);

  assert("over-32-char blockedRole rejected",
    !postStatusNoteSchema.safeParse({
      workItemId: UUID_A, body: "x", waitingReason: "confirm",
      blockedRole: "x".repeat(33),
    }).success);

  assert("non-uuid blockedAdmin rejected",
    !postStatusNoteSchema.safeParse({
      workItemId: UUID_A, body: "x", waitingReason: "confirm", blockedAdmin: "nope",
    }).success);
}

// ────────────────────────────────────────────────────────────
// (c) clearWaitingSchema
// ────────────────────────────────────────────────────────────
console.log("  (c) clearWaitingSchema");
{
  assert("happy path accepted",
    clearWaitingSchema.safeParse({ workItemId: UUID_A, body: "unblocked" }).success);
  assert("empty body rejected",
    !clearWaitingSchema.safeParse({ workItemId: UUID_A, body: "" }).success);
  assert("body over 500 rejected",
    !clearWaitingSchema.safeParse({
      workItemId: UUID_A, body: "x".repeat(501),
    }).success);
  assert("body at 500 accepted",
    clearWaitingSchema.safeParse({
      workItemId: UUID_A, body: "x".repeat(500),
    }).success);
  assert("non-uuid workItemId rejected",
    !clearWaitingSchema.safeParse({ workItemId: "nope", body: "x" }).success);
}

// ────────────────────────────────────────────────────────────
// (d) softDeleteMessageSchema
// ────────────────────────────────────────────────────────────
console.log("  (d) softDeleteMessageSchema");
{
  assert("uuid accepted",
    softDeleteMessageSchema.safeParse({ messageId: UUID_A }).success);
  assert("non-uuid rejected",
    !softDeleteMessageSchema.safeParse({ messageId: "not-a-uuid" }).success);
}

// ────────────────────────────────────────────────────────────
// (e) markThreadSeenSchema
// ────────────────────────────────────────────────────────────
console.log("  (e) markThreadSeenSchema");
{
  assert("uuid accepted",
    markThreadSeenSchema.safeParse({ workItemId: UUID_A }).success);
  assert("non-uuid rejected",
    !markThreadSeenSchema.safeParse({ workItemId: "x" }).success);
}

// ────────────────────────────────────────────────────────────
// (f) parseMentionHandles
// ────────────────────────────────────────────────────────────
console.log("  (f) parseMentionHandles");
{
  assert("empty string → []",
    JSON.stringify(parseMentionHandles("")) === "[]");

  assert("no mentions → []",
    JSON.stringify(parseMentionHandles("plain text body")) === "[]");

  assert("single @ascii handle",
    JSON.stringify(parseMentionHandles("hi @dave")) === '["dave"]');

  assert("Thai handle picked up (@ภูม)",
    JSON.stringify(parseMentionHandles("hi @ภูม please")) === '["ภูม"]');

  assert("multiple distinct handles in order",
    JSON.stringify(parseMentionHandles("@dave then @poom and @got")) ===
      '["dave","poom","got"]');

  assert("duplicate handle deduped, first-seen wins",
    JSON.stringify(parseMentionHandles("@dave hi @dave again @dave")) ===
      '["dave"]');

  assert("email-style 'foo@bar' not treated as mention",
    JSON.stringify(parseMentionHandles("email me at me@pacred.co")) === "[]");

  assert("@ after open paren still fires",
    JSON.stringify(parseMentionHandles("ping (@got) please")) === '["got"]');

  assert("@ at start of string fires",
    JSON.stringify(parseMentionHandles("@dave please look")) === '["dave"]');

  assert("trailing punctuation stripped",
    JSON.stringify(parseMentionHandles("ping @dave, then @poom.")) ===
      '["dave","poom"]');

  assert("handle capped at 40 chars",
    parseMentionHandles(`@${"x".repeat(60)}`)[0]?.length === 40);

  assert("mixed Thai + ASCII handles",
    JSON.stringify(parseMentionHandles("@ก๊อต and @dave")) ===
      '["ก๊อต","dave"]');

  assert("CJK handle (@山田) picked up",
    JSON.stringify(parseMentionHandles("@山田 hello")) === '["山田"]');

  assert("@ followed by whitespace not a mention",
    JSON.stringify(parseMentionHandles("look here @ this thing")) === "[]");

  assert("@ followed by only punctuation not a mention",
    JSON.stringify(parseMentionHandles("@. or @-")) === "[]");
}

// ────────────────────────────────────────────────────────────
console.log(`\n  ${pass} pass · ${fail} fail`);
if (fail > 0) process.exit(1);
