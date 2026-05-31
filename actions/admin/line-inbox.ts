"use server";

/**
 * Admin LINE inbox / CRM — read-only server actions.
 *
 * Reads the LINE OA customer + message data that ปอน's Cloudflare Worker
 * captures into Supabase. The two source tables are owned by the Worker
 * (we never write them):
 *   - `Podeng_customers_line`  — one row per follower / contact
 *   - `Podeng_line_messages`   — every inbound/outbound message
 *
 * All reads go through `createAdminClient()` (service-role) because the
 * Podeng_* tables are not exposed to the anon/customer RLS surface, and
 * the page is admin-gated anyway (`requireAdmin()` below + the (admin)
 * layout guard).
 *
 * §0c (AGENTS.md): every Supabase query destructures `{ data, error }`
 * (or `{ count, error }`); never a bare `const { data } = ...`. On error we
 * `console.error` with context and `throw` so Next renders a real error
 * boundary instead of silently showing an empty inbox.
 *
 * Types live in `lib/admin/line-inbox-types.ts` — a "use server" file may
 * only export async functions.
 */

import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  LineCustomer,
  LineCustomerThread,
  LineInboxStats,
  LineMessage,
} from "@/lib/admin/line-inbox-types";

const CUSTOMERS_TABLE = "Podeng_customers_line";
const MESSAGES_TABLE = "Podeng_line_messages";

/**
 * The customer list for the inbox — most-recently-active first.
 * `last_message_at` nulls sort last (a contact who followed but never
 * messaged still appears, at the bottom).
 */
export async function getLineInboxCustomers(): Promise<LineCustomer[]> {
  await requireAdmin();
  const admin = createAdminClient();

  const { data, error } = await admin
    .from(CUSTOMERS_TABLE)
    .select(
      "id, line_user_id, display_name, picture_url, first_seen_at, first_follow_at, " +
        "first_message_at, last_message_at, last_inbound_message_at, last_outbound_message_at, " +
        "last_message_text, total_messages, total_inbound_messages, total_outbound_messages, " +
        "status, raw_profile, created_at, updated_at",
    )
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(200);

  if (error) {
    console.error("[line-inbox customers] failed", {
      code: error.code,
      message: error.message,
    });
    throw new Error("Failed to load LINE inbox customers");
  }

  // The Podeng_* tables are not in the generated Supabase types, so PostgREST
  // infers a generic shape — cast through `unknown` to our hand-written type.
  return (data ?? []) as unknown as LineCustomer[];
}

/**
 * One customer's row + their full message thread (oldest → newest), for the
 * `?c=<customerLineId>` detail panel.
 */
export async function getLineCustomerThread(
  customerLineId: string,
): Promise<LineCustomerThread> {
  await requireAdmin();
  const admin = createAdminClient();

  const { data: customer, error: customerErr } = await admin
    .from(CUSTOMERS_TABLE)
    .select(
      "id, line_user_id, display_name, picture_url, first_seen_at, first_follow_at, " +
        "first_message_at, last_message_at, last_inbound_message_at, last_outbound_message_at, " +
        "last_message_text, total_messages, total_inbound_messages, total_outbound_messages, " +
        "status, raw_profile, created_at, updated_at",
    )
    .eq("id", customerLineId)
    .maybeSingle();

  if (customerErr) {
    console.error("[line-inbox thread:customer] failed", {
      customerLineId,
      code: customerErr.code,
      message: customerErr.message,
    });
    throw new Error("Failed to load LINE customer");
  }

  const { data: messages, error: messagesErr } = await admin
    .from(MESSAGES_TABLE)
    .select(
      "id, customer_line_id, line_user_id, line_message_id, direction, sender_type, " +
        "source_type, group_id, group_name, message_type, message_text, file_url, " +
        "media_url, send_status, sent_at, created_at",
    )
    .eq("customer_line_id", customerLineId)
    .order("sent_at", { ascending: true, nullsFirst: true })
    .limit(500);

  if (messagesErr) {
    console.error("[line-inbox thread:messages] failed", {
      customerLineId,
      code: messagesErr.code,
      message: messagesErr.message,
    });
    throw new Error("Failed to load LINE message thread");
  }

  // Podeng_* tables are untyped in the generated Supabase types — cast through
  // `unknown` to our hand-written shapes.
  return {
    customer: (customer ?? null) as unknown as LineCustomer | null,
    messages: (messages ?? []) as unknown as LineMessage[],
  };
}

/**
 * Aggregate counters for the dashboard stat cards. Uses `head: true` +
 * `count: "exact"` so we never pull rows just to count them.
 *
 * `distinctGroups` = number of group-sourced messages (rows where
 * `source_type = 'group'`). LINE doesn't give us a clean distinct-group
 * count without a GROUP BY (PostgREST can't express that in one head query),
 * so we approximate with the count of group messages — a useful "how much
 * traffic is from groups vs 1:1" signal. (Honest caveat: this is message
 * count, not distinct group count.)
 */
export async function getLineInboxStats(): Promise<LineInboxStats> {
  await requireAdmin();
  const admin = createAdminClient();

  const [customers, messages, inbound, outbound, groups] = await Promise.all([
    admin.from(CUSTOMERS_TABLE).select("id", { count: "exact", head: true }),
    admin.from(MESSAGES_TABLE).select("id", { count: "exact", head: true }),
    admin
      .from(MESSAGES_TABLE)
      .select("id", { count: "exact", head: true })
      .eq("direction", "inbound"),
    admin
      .from(MESSAGES_TABLE)
      .select("id", { count: "exact", head: true })
      .eq("direction", "outbound"),
    admin
      .from(MESSAGES_TABLE)
      .select("id", { count: "exact", head: true })
      .eq("source_type", "group"),
  ]);

  for (const [label, res] of [
    ["customers", customers],
    ["messages", messages],
    ["inbound", inbound],
    ["outbound", outbound],
    ["groups", groups],
  ] as const) {
    if (res.error) {
      console.error(`[line-inbox stats:${label}] failed`, {
        code: res.error.code,
        message: res.error.message,
      });
      throw new Error("Failed to load LINE inbox stats");
    }
  }

  return {
    totalCustomers: customers.count ?? 0,
    totalMessages: messages.count ?? 0,
    inboundMessages: inbound.count ?? 0,
    outboundMessages: outbound.count ?? 0,
    distinctGroups: groups.count ?? 0,
  };
}
