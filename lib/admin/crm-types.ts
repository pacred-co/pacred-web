/**
 * Shared types for the CRM core (omni-inbox + customer-360 + sales-rep routing).
 *
 * Kept OUT of `actions/admin/crm.ts` because that file is `"use server"` — a
 * `"use server"` module may only export async functions (no type/const exports),
 * per CLAUDE_TECHNICAL.md "Next.js 16 breaking changes". The CRM page + its
 * client components import these from here.
 *
 * ── Data sources (casing landmine — AGENTS.md) ──
 *   tb_users      — camelCase: userID · userName · userTel · userCompany ·
 *                   userLineID · userFacebook · adminIDSale · userActive.
 *   tb_wallet     — lowercase: userid · wallettotal.
 *   tb_forwarder  — lowercase: userid (order owner).
 *   Podeng_*      — lowercase (ปอน's Cloudflare Worker LINE tables).
 *   lead_call_log — lowercase: userid · status · called_at (migration 0133).
 *   admins / admin_contact_extras — Pacred admin model (rep list + names).
 *
 * Facebook: there is NO Podeng_fb_* / messenger table in the DB at build time
 * (only OAuth social-login references exist) → the FB channel is rendered as a
 * "waiting for webhook (ปอน lane)" placeholder. See `CRM_CHANNELS`.
 */

import type { LineCustomer, LineMessage } from "@/lib/admin/line-inbox-types";

// ── Inbox channels ─────────────────────────────────────────────────────────
/** The conversation channels the CRM omni-inbox can show. */
export type CrmChannel = "line" | "facebook";

/** Channel metadata for the inbox tab strip. `live=false` → placeholder tab. */
export type CrmChannelMeta = {
  key: CrmChannel;
  /** Thai label for the tab. */
  label: string;
  /** Whether the channel has real data wired (false = "รอ webhook" placeholder). */
  live: boolean;
  /** Short note shown on the placeholder tab. */
  note?: string;
};

/**
 * The channel registry. LINE is live (reads ปอน's Podeng_* tables via the
 * existing line-inbox action). Facebook is a STUB — no FB message table exists
 * in the DB yet; ปอน owns the Messenger webhook. We render the tab + an
 * "waiting" placeholder rather than fabricate data.
 */
export const CRM_CHANNELS: CrmChannelMeta[] = [
  { key: "line", label: "LINE", live: true },
  {
    key: "facebook",
    label: "Facebook",
    live: false,
    note: "ช่องทาง Facebook / Messenger — รอ webhook (ปอน lane). ยังไม่มีตารางข้อความ FB ในระบบ",
  },
];

// ── Customer-360 mini-panel ──────────────────────────────────────────────────
/**
 * The read-only "customer 360" snapshot shown beside a selected conversation.
 * Every field is best-effort: a LINE contact may not be linked to any tb_users
 * customer (no shared key), in which case `linked` is false and the tb_*
 * fields are null.
 */
export type Customer360 = {
  /** True when we resolved the LINE contact to a tb_users row. */
  linked: boolean;
  /** How the link was made (for transparency in the UI). */
  matchedBy: "userLineID" | "display_name" | "manual" | null;

  /** tb_users.userID (PR member code), or null when unlinked. */
  userid: string | null;
  /** Display name from tb_users (userName + userLastName), or null. */
  name: string | null;
  /** tb_users.userTel. */
  tel: string | null;
  /** tb_users.userCompany flag is '1' for a company account. */
  isCompany: boolean;
  /** tb_users.adminIDSale — the owning rep's legacy_admin_id, or null. */
  repLegacyId: string | null;
  /** Resolved rep display name (from admins/admin_contact_extras), or null. */
  repName: string | null;

  /** Lifetime tb_forwarder order count for this userid. */
  orderCount: number;
  /** tb_wallet.wallettotal (THB), or null when no wallet row. */
  walletBalance: number | null;
  /** Latest lead_call_log status for this userid, or null = never called. */
  leadStatus: string | null;
  /** When the latest call was logged (ISO), or null. */
  lastCallAt: string | null;
  /** tb_users.userActive — ''=cold lead, '1'=activated; null when unlinked. */
  userActive: string | null;
};

// ── Sales-rep routing ────────────────────────────────────────────────────────
/** One assignable sales rep (for the rep-routing dropdown + filter). */
export type CrmRep = {
  /** profiles.id (uuid) — internal key. */
  profileId: string;
  /** admin_contact_extras.legacy_admin_id — the value tb_users.adminIDSale stores. */
  legacyId: string;
  /** Display name (admin_contact_extras.display_name ?? profiles name). */
  name: string;
  /** Pacred role (sales / sales_admin / super). */
  role: string;
  /** Count of customers currently owned (tb_users.adminIDSale = legacyId). */
  ownedCount: number;
};

/** Result of `getCrmReps` — the rep list + a gate note when empty. */
export type CrmRepsResult = {
  reps: CrmRep[];
  /**
   * Set when the rep list is empty/thin because the 13-admin recreate
   * (ADR-0022) hasn't happened — surfaced to the UI so the operator knows
   * routing is gated on data, not broken.
   */
  gateNote: string | null;
};

// ── Lead funnel ──────────────────────────────────────────────────────────────
/**
 * The acquisition funnel counts. Sourced from what we actually have:
 *   - new leads  → tb_users.userActive='' with a phone (the cold pool).
 *   - contacted  → distinct userids with ANY lead_call_log row.
 *   - quoted     → freight_quote rows (the RFQ funnel) — best-effort proxy.
 *   - won        → distinct userids whose latest lead_call_log status='closed'.
 * Each stage is independent (NOT a strict subset) — documented in the UI.
 */
export type CrmFunnel = {
  newLeads: number;
  contacted: number;
  quoted: number;
  won: number;
};

// ── Omni-inbox conversation row ──────────────────────────────────────────────
/**
 * One LINE conversation in the omni-inbox list, enriched with the best-effort
 * link to a tb_users customer + that customer's owning rep. Built on top of
 * the LINE data (Podeng_customers_line) — we never write it.
 */
export type CrmConversation = {
  /** Podeng_customers_line.id — the conversation key (used in ?c=). */
  id: string;
  /** LINE display name. */
  displayName: string | null;
  /** LINE avatar URL. */
  pictureUrl: string | null;
  /** Last message preview text. */
  lastMessageText: string | null;
  /** Last message timestamp (ISO). */
  lastMessageAt: string | null;
  /** Total message count. */
  totalMessages: number | null;
  /** Follow/block status from LINE. */
  status: string | null;
  /** Linked tb_users.userID, or null when unmatched. */
  linkedUserid: string | null;
  /** Owning rep's legacy_admin_id (when linked), or null. */
  repLegacyId: string | null;
  /** Owning rep's display name (when resolvable), or null. */
  repName: string | null;
};

/** Result of `getCrmConversations`. */
export type CrmConversationsResult = {
  conversations: CrmConversation[];
  /** Total LINE contacts scanned (before any rep filter). */
  totalScanned: number;
};

// Re-export the LINE shapes so CRM consumers import from one place.
export type { LineCustomer, LineMessage };
