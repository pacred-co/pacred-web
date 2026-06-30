import "server-only";

/**
 * Freight WORKSPACE queue counts (G1 freight lane · owner W3 "role and
 * workspaces ต้องเริ่มทำได้แล้ว · เริ่ม scale").
 *
 * The cargo workspace (lib/admin/workspace.ts) reads its counts from the
 * sidebar BadgeCounts SOT (actions/admin/sidebar-counts.ts) — but that SOT
 * has NO freight queue keys, so the freight_* positions fell through to the
 * cargo oversight DEFAULT and landed on cargo work that isn't theirs.
 *
 * This module is the freight equivalent of that count SOT: a READ-ONLY
 * fan-out of `head:true` COUNT queries over the freight spine
 * (freight_quote RFQ leads · freight_quotes quotations · freight_shipments),
 * mapping each of the 8 freight-role queues to its journey-status slice. The
 * journey-status SOTs are the migration CHECK lists, faithfully:
 *   - freight_quote.status   (0134): new · contacted · quoted · won · lost · spam
 *   - freight_quotes.status  (0048): draft · pending_approval · approved · sent ·
 *                                    accepted · rejected · expired
 *   - freight_shipments.status (0050): draft · confirmed · in_progress · cleared ·
 *                                      delivered · cancelled
 *
 * ── Read-only · money-safe ────────────────────────────────────────────────
 *  - ONLY `count: "exact", head: true` SELECTs. No insert/update/delete, no
 *    money mutation, no audit row, no customer comms. A failed sub-query
 *    yields 0 (never throws) — a missing freight badge must not break the
 *    workspace landing (mirrors getSidebarCounts' degrade-to-0 contract).
 *  - `import "server-only"` (NOT `"use server"`) so this plain module may
 *    export the async reader AND re-export the pure key contract. The pure
 *    type + key list live in the plain `freight-queue-keys.ts` (no server-only)
 *    so client-safe modules (lib/admin/workspace.ts) + the tsx unit harness can
 *    import them WITHOUT pulling this server-only DB reader (BUILD-TRAP: a
 *    `"use server"` file can only export async functions; consts live in a
 *    plain module — here the keys module).
 */

import { createAdminClient } from "@/lib/supabase/admin";
import {
  type FreightQueueKey,
  type FreightQueueCounts,
  ALL_FREIGHT_QUEUE_KEYS,
} from "./freight-queue-keys";

// Re-export the pure contract so existing call-sites can keep importing it from
// this module (the keys live in freight-queue-keys.ts — the plain module).
export { ALL_FREIGHT_QUEUE_KEYS };
export type { FreightQueueKey, FreightQueueCounts };

/**
 * Read-only freight workspace counts. ONE batched fan-out of count queries —
 * the freight equivalent of getSidebarCounts. Best-effort: any failure
 * degrades to {} (all queues → 0) so the workspace landing never breaks.
 *
 * Caller (the workspace page) gates admin itself; this helper does not
 * re-auth (it is a pure read over total counts via the service-role client,
 * same as computeSidebarCounts — the counts are platform totals, not
 * RLS-scoped to one admin).
 */
export async function getFreightQueueCounts(): Promise<FreightQueueCounts> {
  const admin = createAdminClient();
  const n = (v: { count: number | null } | { count?: number | null }) =>
    ("count" in v ? v.count : null) ?? 0;

  try {
    const [
      leads,
      quoteToPrice,
      quoteToSend,
      quoteSent,
      shipPrep,
      shipInTransit,
      shipCleared,
      shipDelivered,
    ] = await Promise.all([
      // ── RFQ leads (freight_quote · singular) — untriaged inbox ──────────
      // new + contacted = not yet quoted/won/lost (the sales triage queue).
      admin.from("freight_quote").select("id", { count: "exact", head: true })
        .in("status", ["new", "contacted"]),

      // ── Quotations (freight_quotes · plural) ────────────────────────────
      // PRICING/approval queue — draft (being costed) + pending_approval.
      admin.from("freight_quotes").select("id", { count: "exact", head: true })
        .in("status", ["draft", "pending_approval"]),
      // SALES "approved → ส่งใบเสนอราคา" queue.
      admin.from("freight_quotes").select("id", { count: "exact", head: true })
        .eq("status", "approved"),
      // "sent → awaiting customer decision" (SALES/CS follow-up).
      admin.from("freight_quotes").select("id", { count: "exact", head: true })
        .eq("status", "sent"),

      // ── Shipments (freight_shipments) ───────────────────────────────────
      // DOC "เตรียมเอกสาร / ใบขน" — confirmed (logistics locked, docs pending).
      admin.from("freight_shipments").select("id", { count: "exact", head: true })
        .eq("status", "confirmed"),
      // OPERATION / clearance "กำลังขนส่ง / พิธีการ" — in_progress.
      admin.from("freight_shipments").select("id", { count: "exact", head: true })
        .eq("status", "in_progress"),
      // "ผ่านศุลกากร รอส่งมอบ" — cleared (ready to deliver).
      admin.from("freight_shipments").select("id", { count: "exact", head: true })
        .eq("status", "cleared"),
      // ACC "รอวางบิล / ปิดงาน" — delivered (the auto-draft-invoice point).
      admin.from("freight_shipments").select("id", { count: "exact", head: true })
        .eq("status", "delivered"),
    ]);

    return {
      freightLeads:         n(leads),
      freightQuoteToPrice:  n(quoteToPrice),
      freightQuoteToSend:   n(quoteToSend),
      freightQuoteSent:     n(quoteSent),
      freightShipPrep:      n(shipPrep),
      freightShipInTransit: n(shipInTransit),
      freightShipCleared:   n(shipCleared),
      freightShipDelivered: n(shipDelivered),
    };
  } catch {
    // Never let a count failure break the freight workspace landing —
    // degrade to no counts (the queue cards still render + deep-link).
    return {};
  }
}
