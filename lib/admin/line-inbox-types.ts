/**
 * Shared types for the admin LINE inbox / CRM dashboard.
 *
 * Kept in a plain (non-"use server") module because a `"use server"` file
 * (`actions/admin/line-inbox.ts`) may only export async functions — exporting
 * a `type` or `const` from it is a Next 16 build error
 * (see CLAUDE_TECHNICAL.md "use server rejects non-async exports").
 *
 * Source tables are created + populated by ปอน's Cloudflare Worker:
 *   - `Podeng_customers_line`  — one row per LINE OA follower / contact
 *   - `Podeng_line_messages`   — every inbound/outbound message
 *
 * Casing landmine (AGENTS.md): these are NOT the camelCase tb_users family —
 * the Podeng_* tables use lowercase column names. The shapes below mirror the
 * exact columns ปอน's Worker writes.
 */

/** One row of `Podeng_customers_line`. */
export type LineCustomer = {
  id: string;
  line_user_id: string | null;
  display_name: string | null;
  picture_url: string | null;
  first_seen_at: string | null;
  first_follow_at: string | null;
  first_message_at: string | null;
  last_message_at: string | null;
  last_inbound_message_at: string | null;
  last_outbound_message_at: string | null;
  last_message_text: string | null;
  total_messages: number | null;
  total_inbound_messages: number | null;
  total_outbound_messages: number | null;
  status: string | null;
  raw_profile: unknown;
  created_at: string | null;
  updated_at: string | null;
};

/** One row of `Podeng_line_messages`. */
export type LineMessage = {
  id: string;
  customer_line_id: string | null;
  line_user_id: string | null;
  line_message_id: string | null;
  direction: "inbound" | "outbound" | string | null;
  sender_type: string | null;
  source_type: string | null;
  group_id: string | null;
  group_name: string | null;
  message_type: string | null;
  message_text: string | null;
  file_url: string | null;
  media_url: string | null;
  send_status: string | null;
  sent_at: string | null;
  created_at: string | null;
};

/** Aggregate counters for the dashboard stat cards. */
export type LineInboxStats = {
  totalCustomers: number;
  totalMessages: number;
  inboundMessages: number;
  outboundMessages: number;
  distinctGroups: number;
};

/** A customer row + their full message thread (for the `?c=<id>` panel). */
export type LineCustomerThread = {
  customer: LineCustomer | null;
  messages: LineMessage[];
};
