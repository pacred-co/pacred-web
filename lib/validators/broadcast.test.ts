/**
 * V-G3 — admin-broadcast validator unit tests.
 *
 * Covers the Zod contract for the admin broadcast workflow. A regression
 * lets a broadcast with no audience target / no body reach the send path:
 *
 *   1. BROADCAST_AUDIENCES / BROADCAST_STATUSES — enum sets + label maps
 *   2. createBroadcastSchema — title/body required, the specific_ids
 *      .refine (audience='specific_ids' demands a non-empty audience_ids)
 *   3. scheduleBroadcastSchema — ISO-timestamp scheduled_for
 *   4. sendBroadcastNowSchema — id-only uuid contract
 *   5. cancelBroadcastSchema — cancel reason ≥3 chars
 *
 * No DB / network / file IO. Runs in <50ms.
 */

import {
  BROADCAST_AUDIENCES,
  BROADCAST_AUDIENCE_LABEL,
  BROADCAST_STATUSES,
  BROADCAST_STATUS_LABEL,
  createBroadcastSchema,
  scheduleBroadcastSchema,
  sendBroadcastNowSchema,
  cancelBroadcastSchema,
} from "./broadcast";

let pass = 0;
let fail = 0;
function assert(label: string, cond: boolean): void {
  if (cond) { pass++; console.log("  ✓", label); }
  else      { fail++; console.error("  ✗", label); }
}
function assertThrows(label: string, fn: () => unknown): void {
  try {
    fn();
    fail++; console.error("  ✗", label, "(expected to throw, didn't)");
  } catch {
    pass++; console.log("  ✓", label);
  }
}

console.log("broadcast validators (V-G3)");

const UUID_A = "11111111-1111-4111-8111-111111111111";
const UUID_B = "22222222-2222-4222-9222-222222222222";

// ────────────────────────────────────────────────────────────
// (a) enum sets + label maps
// ────────────────────────────────────────────────────────────
console.log("  (a) enum sets + label maps");
{
  assert("4 audiences", BROADCAST_AUDIENCES.length === 4);
  assert("5 statuses", BROADCAST_STATUSES.length === 5);
  assert("audiences include specific_ids",
    (BROADCAST_AUDIENCES as readonly string[]).includes("specific_ids"));
  assert("every audience has a label",
    BROADCAST_AUDIENCES.every((a) => BROADCAST_AUDIENCE_LABEL[a]?.length > 0));
  assert("every status has a label",
    BROADCAST_STATUSES.every((s) => BROADCAST_STATUS_LABEL[s]?.length > 0));
}

// ────────────────────────────────────────────────────────────
// (b) createBroadcastSchema — happy paths
// ────────────────────────────────────────────────────────────
console.log("  (b) createBroadcastSchema — accepts valid input");
{
  // audience='all' needs no ids.
  const all = createBroadcastSchema.parse({
    title: "ประกาศหยุดสงกรานต์", body: "บริษัทหยุด 13-15 เม.ย.", audience: "all",
  });
  assert("audience=all parses", all.audience === "all");

  // juristic_only / personal_only also need no ids.
  const juristic = createBroadcastSchema.parse({
    title: "t", body: "b", audience: "juristic_only",
  });
  assert("audience=juristic_only parses", juristic.audience === "juristic_only");

  // specific_ids WITH a non-empty array → valid.
  const specific = createBroadcastSchema.parse({
    title: "t", body: "b", audience: "specific_ids", audience_ids: [UUID_A, UUID_B],
  });
  assert("audience=specific_ids with ids parses", specific.audience_ids?.length === 2);

  // optional link_href.
  const withLink = createBroadcastSchema.parse({
    title: "t", body: "b", audience: "all", link_href: "/promotions",
  });
  assert("link_href accepted", withLink.link_href === "/promotions");

  // Trims title + body.
  const trimmed = createBroadcastSchema.parse({
    title: "  หัวข้อ  ", body: "  เนื้อหา  ", audience: "all",
  });
  assert("title trimmed", trimmed.title === "หัวข้อ");
  assert("body trimmed", trimmed.body === "เนื้อหา");
}

// ────────────────────────────────────────────────────────────
// (c) createBroadcastSchema — rejections + the specific_ids refine
// ────────────────────────────────────────────────────────────
console.log("  (c) createBroadcastSchema — rejects bad input");
{
  assertThrows("rejects empty title",
    () => createBroadcastSchema.parse({ title: "", body: "b", audience: "all" }));
  assertThrows("rejects empty body",
    () => createBroadcastSchema.parse({ title: "t", body: "", audience: "all" }));
  assertThrows("rejects whitespace-only title",
    () => createBroadcastSchema.parse({ title: "   ", body: "b", audience: "all" }));
  assertThrows("rejects unknown audience",
    () => createBroadcastSchema.parse({ title: "t", body: "b", audience: "everyone" }));

  // The .refine — specific_ids audience but NO audience_ids → throws.
  assertThrows("specific_ids without audience_ids throws",
    () => createBroadcastSchema.parse({ title: "t", body: "b", audience: "specific_ids" }));
  // specific_ids audience but EMPTY audience_ids → throws.
  assertThrows("specific_ids with empty audience_ids throws",
    () => createBroadcastSchema.parse({
      title: "t", body: "b", audience: "specific_ids", audience_ids: [],
    }));
  // audience_ids must be uuids.
  assertThrows("rejects non-uuid in audience_ids",
    () => createBroadcastSchema.parse({
      title: "t", body: "b", audience: "specific_ids", audience_ids: ["not-a-uuid"],
    }));
}

// ────────────────────────────────────────────────────────────
// (d) scheduleBroadcastSchema — ISO timestamp
// ────────────────────────────────────────────────────────────
console.log("  (d) scheduleBroadcastSchema — ISO timestamp");
{
  const ok = scheduleBroadcastSchema.parse({
    id: UUID_A, scheduled_for: "2026-05-20T09:00:00Z",
  });
  assert("valid schedule parses", ok.scheduled_for === "2026-05-20T09:00:00Z");
  assertThrows("rejects date-only scheduled_for",
    () => scheduleBroadcastSchema.parse({ id: UUID_A, scheduled_for: "2026-05-20" }));
  assertThrows("rejects non-uuid id",
    () => scheduleBroadcastSchema.parse({ id: "x", scheduled_for: "2026-05-20T09:00:00Z" }));
}

// ────────────────────────────────────────────────────────────
// (e) sendBroadcastNowSchema + cancelBroadcastSchema
// ────────────────────────────────────────────────────────────
console.log("  (e) send-now + cancel schemas");
{
  assert("send-now accepts uuid", sendBroadcastNowSchema.parse({ id: UUID_A }).id === UUID_A);
  assertThrows("send-now rejects non-uuid", () => sendBroadcastNowSchema.parse({ id: "x" }));

  const cancel = cancelBroadcastSchema.parse({ id: UUID_A, cancelled_reason: "เปลี่ยนแผน" });
  assert("cancel parses", cancel.cancelled_reason === "เปลี่ยนแผน");
  assertThrows("cancel rejects 2-char reason",
    () => cancelBroadcastSchema.parse({ id: UUID_A, cancelled_reason: "ab" }));
  assertThrows("cancel rejects empty reason",
    () => cancelBroadcastSchema.parse({ id: UUID_A, cancelled_reason: "" }));
}

console.log(`\n${pass} pass, ${fail} fail`);
if (fail > 0) process.exit(1);
