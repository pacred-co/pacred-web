"use server";

/**
 * IC-1 · `work_item_messages` Server Actions — the per-job internal chat
 * thread surface for the cross-department work-board.
 *
 * Pairs with:
 *   - migration  0086_work_item_messages.sql       (table + RLS + CHECK)
 *   - validators lib/validators/work-item-chat.ts  (Zod + parseMentionHandles)
 *   - types      types/work-item-chat.ts           (TS contract)
 *
 * Design: docs/research/internal-chat-system-2026-05-18.md
 *   §2.5  — the 5 actions + a read helper
 *   §3.3  — the status-note mechanic: a wait is NEVER set silently
 *   §4.2  — notification triggers (mention · waiting-set · waiting-clear)
 *   §5.4  — anti-patterns (no global chat / no customer surface)
 *
 * Identity model (per ADR-0002):
 *   - `admins` is a satellite of `profiles` keyed by `profile_id`. So
 *     `author_admin_id`, `blocked_on_admin`, `mentioned_admin_id` are all
 *     `profiles.id` values that ALSO appear in `admins` with is_active=true.
 *   - Every action is gated `withAdmin([])` — any active admin (no role
 *     restriction); the inner ctx gives `adminId = profiles.id`.
 *
 * DB access: all writes go through `createAdminClient()` (service-role);
 * the RLS policies in 0083 are the floor, the in-app gate is the real check.
 *
 * Notification fan-out: rides the shipped `sendNotification()` pipeline
 * (lib/notifications/index.ts) — admins are profiles, so the existing
 * `notifications` table covers them with no schema change.
 *
 * All mutations log to `admin_audit_log` per ADR-0014.
 */

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendNotification } from "@/lib/notifications";
import { logger, redactId } from "@/lib/logger";
import {
  withAdmin,
  logAdminAction,
  type AdminActionResult,
} from "./common";
import {
  postMessageSchema,
  postStatusNoteSchema,
  clearWaitingSchema,
  softDeleteMessageSchema,
  markThreadSeenSchema,
  parseMentionHandles,
  type PostMessageInput,
  type PostStatusNoteInput,
  type ClearWaitingInput,
} from "@/lib/validators/work-item-chat";
import type {
  WaitingReason,
  WorkItemMessageKind,
  WorkItemMessageRow,
  WorkItemWaitingBlock,
} from "@/types/work-item-chat";

// ────────────────────────────────────────────────────────────
// Internal types — narrow shapes for service-role reads
// ────────────────────────────────────────────────────────────

interface WorkItemRow {
  id:               string;
  title:            string;
  assigned_role:    string | null;
  assigned_to:      string | null;
  blocked_on_role:  string | null;
  blocked_on_admin: string | null;
  waiting_reason:   string | null;
}

interface ProfileLite {
  id:           string;
  display_name: string | null;
  first_name:   string | null;
}

interface WorkItemMessageDBRow {
  id:                 string;
  work_item_id:       string;
  author_admin_id:    string | null;
  kind:               WorkItemMessageKind;
  body:               string;
  set_waiting_reason: WaitingReason | null;
  set_blocked_role:   string | null;
  created_at:         string;
}

// ────────────────────────────────────────────────────────────
// Small helpers
// ────────────────────────────────────────────────────────────

const BOARD_PATH = "/admin/board";
const INBOX_PATH = "/admin/inbox";

function revalidateThreadSurfaces(): void {
  // The board card decorations (waiting badge + unread count) and the
  // per-staffer inbox both read these tables — revalidate both.
  try {
    revalidatePath(BOARD_PATH);
    revalidatePath(INBOX_PATH);
  } catch {
    // revalidatePath outside a request scope throws — swallow (e.g. tests).
  }
}

/** Load the work_item we're posting on (existence + denormalised fields). */
async function loadWorkItem(
  admin: ReturnType<typeof createAdminClient>,
  workItemId: string,
): Promise<WorkItemRow | null> {
  const { data, error } = await admin
    .from("work_items")
    .select(
      "id, title, assigned_role, assigned_to, blocked_on_role, blocked_on_admin, waiting_reason",
    )
    .eq("id", workItemId)
    .maybeSingle<WorkItemRow>();
  if (error) {
    console.error(`[work_items list] failed`, { code: error.code, message: error.message });
  }
  return data ?? null;
}

/** Look up a few profiles by id for display-name rendering. */
async function loadProfiles(
  admin: ReturnType<typeof createAdminClient>,
  profileIds: string[],
): Promise<Map<string, ProfileLite>> {
  const out = new Map<string, ProfileLite>();
  if (profileIds.length === 0) return out;
  const unique = Array.from(new Set(profileIds));
  const { data, error } = await admin
    .from("profiles")
    .select("id, display_name, first_name")
    .in("id", unique)
    .returns<ProfileLite[]>();
  if (error) {
    console.error(`[profiles list] failed`, { code: error.code, message: error.message });
  }
  for (const row of data ?? []) out.set(row.id, row);
  return out;
}

/** Active admin profile ids for a role. Used for role-based fan-out. */
async function loadActiveAdminsInRole(
  admin: ReturnType<typeof createAdminClient>,
  role: string,
): Promise<string[]> {
  const { data, error } = await admin
    .from("admins")
    .select("profile_id")
    .eq("role", role)
    .eq("is_active", true)
    .returns<Array<{ profile_id: string }>>();
  if (error) {
    console.error(`[admins list] failed`, { code: error.code, message: error.message });
  }
  return (data ?? []).map((r) => r.profile_id).filter((s): s is string => !!s);
}

/** Caller's roles — used by clearWaiting + softDeleteMessage for super check. */
async function loadAdminRoles(
  admin: ReturnType<typeof createAdminClient>,
  adminId: string,
): Promise<string[]> {
  const { data, error } = await admin
    .from("admins")
    .select("role")
    .eq("profile_id", adminId)
    .eq("is_active", true)
    .returns<Array<{ role: string }>>();
  if (error) {
    console.error(`[admins list] failed`, { code: error.code, message: error.message });
  }
  return (data ?? []).map((r) => r.role);
}

/** Best-effort display name for a profile (fallback to "staff"). */
function profileDisplay(p: ProfileLite | undefined | null): string {
  if (!p) return "staff";
  return p.display_name?.trim() || p.first_name?.trim() || "staff";
}

/** Trim a body to a notification-friendly excerpt. */
function excerpt(body: string, max = 120): string {
  const stripped = body.replace(/\s+/g, " ").trim();
  return stripped.length <= max ? stripped : `${stripped.slice(0, max - 1)}…`;
}

/**
 * Resolve which profile_ids to @mention from the caller's input.
 *   - If `explicitIds` provided → use those (deduped, must be active admins).
 *   - Else parse @handles from body and look up profiles whose
 *     display_name or first_name (case-insensitive) matches, then filter to
 *     active admins.
 *
 * Returns a deduped list of profile_ids. Excludes the author.
 */
async function resolveMentions(
  admin: ReturnType<typeof createAdminClient>,
  authorId: string,
  body: string,
  explicitIds: string[] | undefined,
): Promise<string[]> {
  // 1) Explicit list path — when the caller passes ANY array (incl. []),
  //    that is the source of truth. An empty explicit array means "no
  //    mentions even if the body contains @handles" — the UI picker is
  //    the canonical input + a stray @-token in prose should not be
  //    silently auto-mentioned.
  if (Array.isArray(explicitIds)) {
    if (explicitIds.length === 0) return [];
    const unique = Array.from(new Set(explicitIds.filter((id) => id !== authorId)));
    if (unique.length === 0) return [];
    const { data, error } = await admin
      .from("admins")
      .select("profile_id")
      .in("profile_id", unique)
      .eq("is_active", true)
      .returns<Array<{ profile_id: string }>>();
    if (error) {
      console.error(`[admins list] failed`, { code: error.code, message: error.message });
    }
    return (data ?? []).map((r) => r.profile_id);
  }

  // 2) Parse @handles → look up profiles.
  const handles = parseMentionHandles(body);
  if (handles.length === 0) return [];

  // Build a case-insensitive OR filter — match display_name or first_name.
  // Supabase JS .or() takes a comma-separated list of `<col>.<op>.<val>` clauses.
  const handleList = handles.slice(0, 20);
  const orClauses: string[] = [];
  for (const h of handleList) {
    // Escape commas / parens that would break the .or() grammar.
    const safe = h.replace(/[(),"]/g, "");
    if (!safe) continue;
    orClauses.push(`display_name.ilike.${safe}`);
    orClauses.push(`first_name.ilike.${safe}`);
  }
  if (orClauses.length === 0) return [];

  const { data: matched, error: matchedErr } = await admin
    .from("profiles")
    .select("id")
    .or(orClauses.join(","))
    .returns<Array<{ id: string }>>();
  if (matchedErr) {
    console.error(`[profiles list] failed`, { code: matchedErr.code, message: matchedErr.message });
  }

  const profileIds = Array.from(
    new Set((matched ?? []).map((r) => r.id).filter((id) => id !== authorId)),
  );
  if (profileIds.length === 0) return [];

  // Filter to active admins.
  const { data: admins, error: adminsErr } = await admin
    .from("admins")
    .select("profile_id")
    .in("profile_id", profileIds)
    .eq("is_active", true)
    .returns<Array<{ profile_id: string }>>();
  if (adminsErr) {
    console.error(`[admins list] failed`, { code: adminsErr.code, message: adminsErr.message });
  }
  return (admins ?? []).map((r) => r.profile_id);
}

/**
 * Insert the @mention fan-out rows. Idempotent on conflict (PK is
 * (message_id, mentioned_admin_id)). Returns the count actually written.
 */
async function insertMentions(
  admin: ReturnType<typeof createAdminClient>,
  messageId: string,
  workItemId: string,
  recipientIds: string[],
): Promise<number> {
  if (recipientIds.length === 0) return 0;
  const rows = recipientIds.map((pid) => ({
    message_id:         messageId,
    mentioned_admin_id: pid,
    work_item_id:       workItemId,
  }));
  // Idempotent insert via upsert with ignoreDuplicates.
  const { error } = await admin
    .from("work_item_message_mentions")
    .upsert(rows, {
      onConflict:       "message_id,mentioned_admin_id",
      ignoreDuplicates: true,
    });
  if (error) {
    logger.warn("work_chat", "mention insert failed", {
      messageId: redactId(messageId),
      error:     error.message,
    });
    return 0;
  }
  return rows.length;
}

/**
 * Fire mention notifications best-effort + stamp `mentions.notified_at`.
 * Failures swallowed — the message itself is already persisted.
 */
async function fanOutMentionNotifications(
  admin: ReturnType<typeof createAdminClient>,
  args: {
    messageId:     string;
    workItemId:    string;
    workItemTitle: string;
    body:          string;
    authorName:    string;
    recipientIds:  string[];
  },
): Promise<void> {
  if (args.recipientIds.length === 0) return;
  const title = `@you on ${args.workItemTitle}`;
  const body  = `${args.authorName}: ${excerpt(args.body)}`;

  const seen = new Set<string>();
  for (const pid of args.recipientIds) {
    if (!pid || seen.has(pid)) continue;
    seen.add(pid);
    try {
      await sendNotification(pid, {
        category:       "work_chat",
        severity:       "info",
        title,
        body,
        link_href:      `/admin/board/${args.workItemId}`,
        reference_type: "work_item",
        reference_id:   args.workItemId,
      });
    } catch (e) {
      logger.warn("work_chat", "mention notify failed", {
        recipient: redactId(pid),
        error:     e instanceof Error ? e.message : "unknown",
      });
    }
  }

  // Best-effort stamp notified_at on each mention row we tried to send.
  try {
    await admin
      .from("work_item_message_mentions")
      .update({ notified_at: new Date().toISOString() })
      .eq("message_id", args.messageId)
      .in("mentioned_admin_id", args.recipientIds);
  } catch (e) {
    logger.warn("work_chat", "mention notified_at stamp failed", {
      messageId: redactId(args.messageId),
      error:     e instanceof Error ? e.message : "unknown",
    });
  }
}

// ════════════════════════════════════════════════════════════
// (1) postMessage — plain comment + @mention fan-out
// ════════════════════════════════════════════════════════════

export async function postMessage(
  input: PostMessageInput,
): Promise<AdminActionResult<{ messageId: string; mentionedCount: number }>> {
  const parsed = postMessageSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  return withAdmin([], async ({ adminId }) => {
    const admin = createAdminClient();

    const workItem = await loadWorkItem(admin, d.workItemId);
    if (!workItem) return { ok: false, error: "work_item_not_found" };

    // 1) Insert the comment row.
    const { data: inserted, error: insErr } = await admin
      .from("work_item_messages")
      .insert({
        work_item_id:    d.workItemId,
        author_admin_id: adminId,
        kind:            "comment",
        body:            d.body,
      })
      .select("id")
      .single<{ id: string }>();
    if (insErr || !inserted) {
      return { ok: false, error: insErr?.message ?? "post_failed" };
    }

    // 2) Resolve mentions + insert fan-out rows.
    const recipientIds = await resolveMentions(admin, adminId, d.body, d.mentionedAdminIds);
    const mentionedCount = await insertMentions(
      admin,
      inserted.id,
      d.workItemId,
      recipientIds,
    );

    // 3) Notify each mentioned staffer (best-effort).
    if (mentionedCount > 0) {
      const profiles = await loadProfiles(admin, [adminId]);
      await fanOutMentionNotifications(admin, {
        messageId:     inserted.id,
        workItemId:    d.workItemId,
        workItemTitle: workItem.title,
        body:          d.body,
        authorName:    profileDisplay(profiles.get(adminId)),
        recipientIds,
      });
    }

    await logAdminAction(adminId, "work_chat.post", "work_item", d.workItemId, {
      messageId:      inserted.id,
      mentionedCount,
    });

    revalidateThreadSurfaces();
    return { ok: true, data: { messageId: inserted.id, mentionedCount } };
  });
}

// ════════════════════════════════════════════════════════════
// (2) postStatusNote — sets the waiting_for block (§3.3)
// ════════════════════════════════════════════════════════════
//
// Logical transaction (Supabase JS has no Postgres transactions):
//   - INSERT a kind='status_note' message
//   - UPDATE work_items waiting_for block
//   - INSERT mention fan-out rows
// If the UPDATE fails after the INSERT succeeds we roll the message back
// via soft-delete — better than leaving an orphan status-note that claims
// a wait the work_item doesn't actually carry.

export async function postStatusNote(
  input: PostStatusNoteInput,
): Promise<AdminActionResult<{ messageId: string; waitingReason: WaitingReason }>> {
  const parsed = postStatusNoteSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;
  const waitingReason = d.waitingReason as WaitingReason;
  const blockedRole   = d.blockedRole  ?? null;
  const blockedAdmin  = d.blockedAdmin ?? null;

  return withAdmin([], async ({ adminId }) => {
    const admin = createAdminClient();

    const workItem = await loadWorkItem(admin, d.workItemId);
    if (!workItem) return { ok: false, error: "work_item_not_found" };

    // 1) Insert the status_note message. The 0083 CHECK
    //    `work_item_messages_status_note_has_waiting` requires that at
    //    least one of (set_waiting_reason, set_blocked_role) be NOT NULL.
    //    waitingReason is required by the schema so this is satisfied.
    const { data: inserted, error: insErr } = await admin
      .from("work_item_messages")
      .insert({
        work_item_id:       d.workItemId,
        author_admin_id:    adminId,
        kind:               "status_note",
        body:               d.body,
        set_waiting_reason: waitingReason,
        set_blocked_role:   blockedRole,
      })
      .select("id")
      .single<{ id: string }>();
    if (insErr || !inserted) {
      return { ok: false, error: insErr?.message ?? "post_failed" };
    }

    // 2) UPDATE the work_items waiting_for block.
    const { error: updErr } = await admin
      .from("work_items")
      .update({
        waiting_reason:   waitingReason,
        blocked_on_role:  blockedRole,
        blocked_on_admin: blockedAdmin,
      })
      .eq("id", d.workItemId);

    if (updErr) {
      // Roll back the message (soft-delete) — better than an orphan claim.
      try {
        await admin
          .from("work_item_messages")
          .update({ deleted_at: new Date().toISOString() })
          .eq("id", inserted.id);
      } catch (e) {
        logger.error("work_chat", "rollback soft-delete failed", e, {
          messageId: redactId(inserted.id),
        });
      }
      await logAdminAction(adminId, "work_chat.set_waiting_failed", "work_item", d.workItemId, {
        messageId: inserted.id,
        error:     updErr.message,
      });
      return { ok: false, error: updErr.message };
    }

    // 3) Mentions.
    const recipientIds = await resolveMentions(admin, adminId, d.body, d.mentionedAdminIds);
    const mentionedCount = await insertMentions(
      admin,
      inserted.id,
      d.workItemId,
      recipientIds,
    );

    const authorProfiles = await loadProfiles(admin, [adminId]);
    const authorName = profileDisplay(authorProfiles.get(adminId));

    if (mentionedCount > 0) {
      await fanOutMentionNotifications(admin, {
        messageId:     inserted.id,
        workItemId:    d.workItemId,
        workItemTitle: workItem.title,
        body:          d.body,
        authorName,
        recipientIds,
      });
    }

    // 4) Notify the blocked-on party (§4.2 trigger 2):
    //    - blockedAdmin set    → notify that one person
    //    - blockedRole only    → fan-out to every active admin in that role
    //    - neither set         → skip (just a waiting_reason categorisation)
    const waitTitle = `⚑ ${workItem.title} — waiting: ${waitingReason}`;
    const waitBody  = `${authorName}: ${excerpt(d.body)}`;
    const waitLink  = `/admin/board/${d.workItemId}`;

    const blockedSeen = new Set<string>();
    if (blockedAdmin) {
      blockedSeen.add(blockedAdmin);
      try {
        await sendNotification(blockedAdmin, {
          category:       "work_chat",
          severity:       "warning",
          title:          waitTitle,
          body:           waitBody,
          link_href:      waitLink,
          reference_type: "work_item",
          reference_id:   d.workItemId,
        });
      } catch (e) {
        logger.warn("work_chat", "waiting-set notify (admin) failed", {
          admin: redactId(blockedAdmin),
          error: e instanceof Error ? e.message : "unknown",
        });
      }
    } else if (blockedRole) {
      const roleAdmins = await loadActiveAdminsInRole(admin, blockedRole);
      for (const pid of roleAdmins) {
        if (!pid || pid === adminId || blockedSeen.has(pid)) continue;
        blockedSeen.add(pid);
        try {
          await sendNotification(pid, {
            category:       "work_chat",
            severity:       "warning",
            title:          waitTitle,
            body:           waitBody,
            link_href:      waitLink,
            reference_type: "work_item",
            reference_id:   d.workItemId,
          });
        } catch (e) {
          logger.warn("work_chat", "waiting-set notify (role) failed", {
            role:  blockedRole,
            admin: redactId(pid),
            error: e instanceof Error ? e.message : "unknown",
          });
        }
      }
    }

    await logAdminAction(adminId, "work_chat.set_waiting", "work_item", d.workItemId, {
      messageId:     inserted.id,
      waitingReason,
      blockedRole,
      blockedAdmin,
      mentionedCount,
      notifiedCount: blockedSeen.size,
    });

    revalidateThreadSurfaces();
    return { ok: true, data: { messageId: inserted.id, waitingReason } };
  });
}

// ════════════════════════════════════════════════════════════
// (3) clearWaiting — resolves the wait, role-gated (§3.3)
// ════════════════════════════════════════════════════════════
//
// Only the role currently NAMED in work_items.blocked_on_role may clear
// (because they own the resolution), OR a super-admin. The CHECK in 0083
// `work_item_messages_status_note_has_waiting` requires that the cleared
// status-note row carry at least one of (set_waiting_reason, set_blocked_role)
// — so we PRESERVE the historical set_blocked_role (the "who was blocking")
// and leave set_waiting_reason NULL to mark the clear.

export async function clearWaiting(
  input: ClearWaitingInput,
): Promise<AdminActionResult<{ messageId: string }>> {
  const parsed = clearWaitingSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  return withAdmin([], async ({ adminId }) => {
    const admin = createAdminClient();

    const workItem = await loadWorkItem(admin, d.workItemId);
    if (!workItem) return { ok: false, error: "work_item_not_found" };
    if (!workItem.waiting_reason) {
      return { ok: false, error: "not_blocked" };
    }

    // ACL: caller must be in the blocking role, OR super.
    const callerRoles = await loadAdminRoles(admin, adminId);
    const isSuper = callerRoles.includes("super");
    const blockingRole = workItem.blocked_on_role;
    if (!isSuper && (!blockingRole || !callerRoles.includes(blockingRole))) {
      return { ok: false, error: "forbidden:not_blocking_role" };
    }

    const previousReason      = workItem.waiting_reason;
    const previousBlockedRole = workItem.blocked_on_role;

    // 1) Insert the "unblock" status_note. Preserve set_blocked_role so
    //    the CHECK passes + the historical "who unblocked from where" is
    //    legible in the timeline; set_waiting_reason left NULL.
    const { data: inserted, error: insErr } = await admin
      .from("work_item_messages")
      .insert({
        work_item_id:       d.workItemId,
        author_admin_id:    adminId,
        kind:               "status_note",
        body:               d.body,
        set_waiting_reason: null,
        set_blocked_role:   previousBlockedRole ?? "external",   // never NULL — CHECK
      })
      .select("id")
      .single<{ id: string }>();
    if (insErr || !inserted) {
      return { ok: false, error: insErr?.message ?? "post_failed" };
    }

    // 2) Clear the work_items waiting_for block.
    const { error: updErr } = await admin
      .from("work_items")
      .update({
        waiting_reason:   null,
        blocked_on_role:  null,
        blocked_on_admin: null,
      })
      .eq("id", d.workItemId);

    if (updErr) {
      try {
        await admin
          .from("work_item_messages")
          .update({ deleted_at: new Date().toISOString() })
          .eq("id", inserted.id);
      } catch (e) {
        logger.error("work_chat", "rollback soft-delete failed", e, {
          messageId: redactId(inserted.id),
        });
      }
      return { ok: false, error: updErr.message };
    }

    // 3) Notify the work_item owner ("you may proceed") — best-effort.
    const authorProfiles = await loadProfiles(admin, [adminId]);
    const authorName = profileDisplay(authorProfiles.get(adminId));
    const title = `✅ ${workItem.title} — unblocked`;
    const body  = `${authorName}: ${excerpt(d.body)}`;
    const link  = `/admin/board/${d.workItemId}`;

    const notifiedSeen = new Set<string>();
    if (workItem.assigned_to) {
      notifiedSeen.add(workItem.assigned_to);
      try {
        await sendNotification(workItem.assigned_to, {
          category:       "work_chat",
          severity:       "success",
          title,
          body,
          link_href:      link,
          reference_type: "work_item",
          reference_id:   d.workItemId,
        });
      } catch (e) {
        logger.warn("work_chat", "clear-waiting notify (assignee) failed", {
          admin: redactId(workItem.assigned_to),
          error: e instanceof Error ? e.message : "unknown",
        });
      }
    } else if (workItem.assigned_role) {
      const roleAdmins = await loadActiveAdminsInRole(admin, workItem.assigned_role);
      for (const pid of roleAdmins) {
        if (!pid || pid === adminId || notifiedSeen.has(pid)) continue;
        notifiedSeen.add(pid);
        try {
          await sendNotification(pid, {
            category:       "work_chat",
            severity:       "success",
            title,
            body,
            link_href:      link,
            reference_type: "work_item",
            reference_id:   d.workItemId,
          });
        } catch (e) {
          logger.warn("work_chat", "clear-waiting notify (role) failed", {
            role:  workItem.assigned_role,
            admin: redactId(pid),
            error: e instanceof Error ? e.message : "unknown",
          });
        }
      }
    }

    await logAdminAction(adminId, "work_chat.clear_waiting", "work_item", d.workItemId, {
      messageId:           inserted.id,
      previousReason,
      previousBlockedRole,
      notifiedCount:       notifiedSeen.size,
    });

    revalidateThreadSurfaces();
    return { ok: true, data: { messageId: inserted.id } };
  });
}

// ════════════════════════════════════════════════════════════
// (4) softDeleteMessage — author-or-super
// ════════════════════════════════════════════════════════════

export async function softDeleteMessage(
  messageId: string,
): Promise<AdminActionResult<void>> {
  const parsed = softDeleteMessageSchema.safeParse({ messageId });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const { messageId: id } = parsed.data;

  return withAdmin([], async ({ adminId }) => {
    const admin = createAdminClient();

    const { data: row, error: rowErr } = await admin
      .from("work_item_messages")
      .select("id, author_admin_id, work_item_id, deleted_at")
      .eq("id", id)
      .maybeSingle<{
        id:              string;
        author_admin_id: string | null;
        work_item_id:    string;
        deleted_at:      string | null;
      }>();
    if (rowErr) {
      console.error(`[work_item_messages mutation lookup] failed`, { code: rowErr.code, message: rowErr.message });
      return { ok: false, error: `db_error:${rowErr.code ?? "unknown"}` };
    }
    if (!row) return { ok: false, error: "message_not_found" };
    if (row.deleted_at) return { ok: true };           // idempotent no-op

    const isAuthor = row.author_admin_id === adminId;
    let isSuper = false;
    if (!isAuthor) {
      const roles = await loadAdminRoles(admin, adminId);
      isSuper = roles.includes("super");
      if (!isSuper) return { ok: false, error: "forbidden:not_author" };
    }

    const { error: updErr } = await admin
      .from("work_item_messages")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id)
      .is("deleted_at", null);
    if (updErr) return { ok: false, error: updErr.message };

    await logAdminAction(adminId, "work_chat.delete_message", "work_item_message", id, {
      workItemId: row.work_item_id,
      asSuper:    !isAuthor && isSuper,
    });

    revalidateThreadSurfaces();
    return { ok: true };
  });
}

// ════════════════════════════════════════════════════════════
// (5) markThreadSeen — drain the @me inbox for a job
// ════════════════════════════════════════════════════════════

export async function markThreadSeen(
  workItemId: string,
): Promise<AdminActionResult<{ markedCount: number }>> {
  const parsed = markThreadSeenSchema.safeParse({ workItemId });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }

  return withAdmin([], async ({ adminId }) => {
    const admin = createAdminClient();

    const { data: updated, error: updErr } = await admin
      .from("work_item_message_mentions")
      .update({ seen_at: new Date().toISOString() })
      .eq("mentioned_admin_id", adminId)
      .eq("work_item_id", workItemId)
      .is("seen_at", null)
      .select("message_id");
    if (updErr) return { ok: false, error: updErr.message };

    const markedCount = Array.isArray(updated) ? updated.length : 0;
    // No audit-log row — this is a personal read-marker, fires on every panel open.

    revalidateThreadSurfaces();
    return { ok: true, data: { markedCount } };
  });
}

// ════════════════════════════════════════════════════════════
// (R) getWorkItemThread — read helper for the panel
// ════════════════════════════════════════════════════════════
//
// Returns the latest N (default 100) non-deleted messages for a work_item,
// each with author display + the mentioned profile-id list, plus the
// live waiting_for block on the work_item itself (for the panel header) and
// the viewer's profile_id + roles (so the UI can show "delete" + "unblock"
// affordances without a second round-trip).

/**
 * Read-shape Agent B's <WorkItemThread> component imports from this file.
 * Carries the timeline, the live waiting block, AND the viewer context that
 * lets the UI decide what controls to render (own-message delete, role-gated
 * unblock button).
 */
export interface GetWorkItemThreadData {
  waiting:         WorkItemWaitingBlock;
  messages:        WorkItemMessageRow[];
  viewerProfileId: string;
  viewerRoles:     string[];
}

export async function getWorkItemThread(
  workItemId: string,
  limit?: number,
): Promise<AdminActionResult<GetWorkItemThreadData>> {
  if (!workItemId || typeof workItemId !== "string") {
    return { ok: false, error: "invalid_work_item_id" };
  }
  const cap = Math.min(Math.max(limit ?? 100, 1), 500);

  return withAdmin([], async ({ adminId }) => {
    const admin = createAdminClient();

    const workItem = await loadWorkItem(admin, workItemId);
    if (!workItem) return { ok: false, error: "work_item_not_found" };

    // 1) Messages (latest N, in ascending order for the panel).
    const { data: rawMsgs, error: msgsErr } = await admin
      .from("work_item_messages")
      .select(
        "id, work_item_id, author_admin_id, kind, body, set_waiting_reason, set_blocked_role, created_at",
      )
      .eq("work_item_id", workItemId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(cap)
      .returns<WorkItemMessageDBRow[]>();
    if (msgsErr) return { ok: false, error: msgsErr.message };

    const msgs = (rawMsgs ?? []).slice().reverse();           // panel reads oldest→newest

    // 2) Author profiles (for display_name).
    const authorIds = Array.from(
      new Set(msgs.map((m) => m.author_admin_id).filter((id): id is string => !!id)),
    );
    const profiles = await loadProfiles(admin, authorIds);

    // 3) Mentions for these messages → group by message_id.
    const messageIds = msgs.map((m) => m.id);
    const mentionsByMsg = new Map<string, string[]>();
    if (messageIds.length > 0) {
      const { data: mentionRows, error: mentionRowsErr } = await admin
        .from("work_item_message_mentions")
        .select("message_id, mentioned_admin_id")
        .in("message_id", messageIds)
        .returns<Array<{ message_id: string; mentioned_admin_id: string }>>();
      if (mentionRowsErr) {
        console.error(`[work_item_message_mentions list] failed`, { code: mentionRowsErr.code, message: mentionRowsErr.message });
      }
      for (const row of mentionRows ?? []) {
        const list = mentionsByMsg.get(row.message_id) ?? [];
        list.push(row.mentioned_admin_id);
        mentionsByMsg.set(row.message_id, list);
      }
    }

    // 4) Blocked-on-admin display name (header) + viewer roles (UI gates).
    const blockedAdminProfiles = workItem.blocked_on_admin
      ? await loadProfiles(admin, [workItem.blocked_on_admin])
      : new Map<string, ProfileLite>();
    const viewerRoles = await loadAdminRoles(admin, adminId);

    const messages: WorkItemMessageRow[] = msgs.map((m) => ({
      id:                m.id,
      workItemId:        m.work_item_id,
      authorAdminId:     m.author_admin_id,
      authorDisplayName: m.author_admin_id ? profileDisplay(profiles.get(m.author_admin_id)) : null,
      kind:              m.kind,
      body:              m.body,
      setWaitingReason:  m.set_waiting_reason,
      setBlockedRole:    m.set_blocked_role,
      createdAt:         m.created_at,
      isOwnMessage:      m.author_admin_id === adminId,
      mentionedAdminIds: mentionsByMsg.get(m.id) ?? [],
    }));

    const waiting: WorkItemWaitingBlock = {
      waitingReason:  (workItem.waiting_reason as WaitingReason | null) ?? null,
      blockedOnRole:  workItem.blocked_on_role,
      blockedOnAdmin: workItem.blocked_on_admin,
      blockedOnAdminName: workItem.blocked_on_admin
        ? profileDisplay(blockedAdminProfiles.get(workItem.blocked_on_admin))
        : null,
    };

    return {
      ok: true,
      data: { waiting, messages, viewerProfileId: adminId, viewerRoles },
    };
  });
}
