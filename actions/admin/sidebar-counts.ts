"use server";

/**
 * D1 Phase B — sidebar live-count badges.
 *
 * Legacy PCS computes a set of `count*` variables once in `header.php` /
 * the menu file head, then `badgeMenu($n)` renders a red pill on nearly
 * every queue item — staff navigate *by the badges*
 * (`docs/research/d1-fidelity-admin.md` §1.4, the #1 daily-workflow gap).
 *
 * This action reproduces that: ONE batched fan-out of `head:true` count
 * queries (the same cheap pattern the `/admin` dashboard already uses),
 * resolved server-side and passed into `<AdminSidebar>`. Keyed by
 * `BadgeKey` from `lib/admin/sidebar-menu.ts`.
 *
 * All queries go through the service-role admin client — counts must be
 * total (not RLS-scoped to the admin's own rows). Read-only; no mutation,
 * no audit row. Best-effort: a failed sub-query yields 0, never throws —
 * a missing badge must not break admin chrome.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import type { BadgeCounts } from "@/lib/admin/sidebar-menu";
import { logger } from "@/lib/logger";

/**
 * Computes the live-count badge set for the admin sidebar.
 * Call from the (admin) layout (Server Component) — the result is passed
 * to `<AdminSidebar counts={...}>`.
 */
export async function getSidebarCounts(): Promise<BadgeCounts> {
  // Gate: any active admin (the layout already called requireAdmin, but
  // this keeps the action self-guarding if called elsewhere).
  await requireAdmin();

  const admin = createAdminClient();
  const n = (v: { count: number | null } | { count?: number | null }) =>
    ("count" in v ? v.count : null) ?? 0;

  try {
    const [
      walletTopup,
      walletWithdraw,
      shopPending,
      shopAwaitPay,
      shopOrdered,
      shopNote,
      forwarderArrived,
      forwarderDelivery,
      forwarderCredit,
      forwarderNote,
      forwarderWhError,
      driverItems,
      yuanPending,
      salesPayout,
      interpreterPayout,
      corporatePending,
      customerPending,
      contactMessages,
      refundsPending,
      bookingsPending,
      incidents,
      cntUnpaid,
    ] = await Promise.all([
      // ── Wallet ────────────────────────────────────────────────
      admin.from("wallet_transactions").select("id", { count: "exact", head: true })
        .eq("kind", "deposit").eq("status", "pending"),
      admin.from("wallet_transactions").select("id", { count: "exact", head: true })
        .eq("kind", "withdraw").eq("status", "pending"),
      // ── ฝากสั่งสินค้า (shop orders) ─────────────────────────────
      admin.from("service_orders").select("id", { count: "exact", head: true })
        .eq("status", "pending"),
      admin.from("service_orders").select("id", { count: "exact", head: true })
        .eq("status", "awaiting_payment"),
      admin.from("service_orders").select("id", { count: "exact", head: true })
        .eq("status", "ordered"),
      // หมายเหตุฝากสั่ง — legacy countNoteShop: tb_header_order
      // WHERE hNote <> '' AND hStatus NOT IN (5,6). Pacred analogue:
      // service_orders.note_admin (= legacy hNote per 0011 line 172),
      // skipped for completed/cancelled (= legacy hStatus 5/6).
      // PostgREST: `not.is.null` + `neq.''` chain — both are needed
      // because the legacy column is NOT NULL with empty-string default,
      // and the Pacred port is NULLABLE with NULL = "no note set".
      admin.from("service_orders").select("id", { count: "exact", head: true })
        .not("note_admin", "is", null)
        .neq("note_admin", "")
        .not("status", "in", "(completed,cancelled)"),
      // ── ฝากนำเข้า (forwarders) ──────────────────────────────────
      // Legacy badgeMenu on ฝากนำเข้า ~ countForwarder6 area
      // (ถึงไทย / รอชำระ). Pacred: arrived_thailand.
      admin.from("forwarders").select("id", { count: "exact", head: true })
        .eq("status", "arrived_thailand"),
      admin.from("forwarders").select("id", { count: "exact", head: true })
        .eq("status", "out_for_delivery"),
      admin.from("forwarders").select("id", { count: "exact", head: true })
        .eq("status", "pending_payment").eq("credit_used", true),
      // หมายเหตุนำเข้า — legacy countNote: tb_forwarder WHERE
      // fNote <> '' AND fStatus <> 7. Pacred: forwarders.note_admin
      // (= legacy fNote per 0010 line 140), skipped for delivered
      // (= legacy fStatus 7). The note-queue is a daily-flow workspace
      // staff actively work — docs/research/wave-1-fidelity/
      // audit-b4-admin-sidebar.md §4.
      admin.from("forwarders").select("id", { count: "exact", head: true })
        .not("note_admin", "is", null)
        .neq("note_admin", "")
        .neq("status", "delivered"),
      // ประวัติเข้าโกดังไทย error queue — legacy countErrorF4:
      // tb_forwarder_import2 scan rows whose `fid` (the matched parcel
      // FK) is NULL — i.e. a barcode was scanned at the TH warehouse
      // but couldn't be paired to a known forwarder row. Staff fix
      // these from /admin/forwarders/warehouse-history (legacy
      // forwarder-import-warehouse.php).
      //
      // NOTE — this is the ONLY query in this batch hitting a legacy
      // tb_* table directly (the rebuilt schema has no equivalent
      // table; see docs/research/sidebar-fidelity-audit/01-broken-links
      // §"/admin/forwarders/warehouse-history"). The wider migration
      // to all-tb_* queries is tracked as the B-0 swap in
      // docs/research/wave-1-fidelity/audit-b4-admin-sidebar.md §7.
      admin.from("tb_forwarder_import2").select("id", { count: "exact", head: true })
        .is("fid", null),
      // มอบงานคนขับ — forwarders ready to assign (out_for_delivery is
      // the closest Pacred analogue of legacy status_driver_item).
      admin.from("forwarders").select("id", { count: "exact", head: true })
        .eq("status", "out_for_delivery"),
      // ── ฝากโอน/ชำระ (yuan) ──────────────────────────────────────
      admin.from("yuan_payments").select("id", { count: "exact", head: true })
        .in("status", ["pending", "processing"]),
      // ── เบิกเงิน (payouts) ──────────────────────────────────────
      admin.from("sales_payouts").select("id", { count: "exact", head: true })
        .eq("status", "pending"),
      // โบนัสล่ามจีน — interpreter commission payouts pending.
      admin.from("commissions").select("id", { count: "exact", head: true })
        .eq("status", "pending"),
      // ── ลูกค้า ──────────────────────────────────────────────────
      // สมาชิกนิติบุคคล รอตรวจ — legacy countComp (corporateStatus=1).
      admin.from("profiles").select("id", { count: "exact", head: true })
        .eq("account_type", "juristic").eq("status", "incomplete"),
      // ลูกค้ารอ approve — accounts not yet activated.
      admin.from("profiles").select("id", { count: "exact", head: true })
        .eq("status", "incomplete"),
      // ── ข้อความติดต่อ (lead funnel) ─────────────────────────────
      admin.from("contact_messages").select("id", { count: "exact", head: true })
        .eq("status", "new"),
      // ── คืนเงิน ─────────────────────────────────────────────────
      admin.from("refund_requests").select("id", { count: "exact", head: true })
        .eq("status", "pending"),
      // ── การจอง (bookings — BK-1) ────────────────────────────────
      admin.from("bookings").select("id", { count: "exact", head: true })
        .in("status", ["submitted", "contacted"]),
      // ── Incident triage (IO-1) ──────────────────────────────────
      admin.from("platform_incidents").select("id", { count: "exact", head: true })
        .in("status", ["open", "acknowledged"]),
      // ── ค่าตู้รออนุมัติ (tb_cnt — B-6 shipped) ─────────────────────
      // cntstatus = '1' = รอจ่ายเงิน (legacy varchar(1)). Wave-1 audit
      // (docs/research/wave-1-fidelity/audit-b6-container-payments.md)
      // flagged this badge was hardcoded to 0 — lifted post-audit so
      // the legacy 'cnt-hs ⑤' unpaid count actually lights.
      admin.from("tb_cnt").select("id", { count: "exact", head: true })
        .eq("cntstatus", "1"),
    ]);

    const wt = n(walletTopup);
    const ww = n(walletWithdraw);
    // B-6 ledger shipped (Wave 1) — query the live tb_cnt table for the
    // legacy "ค่าตู้รออนุมัติ" badge instead of the prior hardcoded 0.
    const cnt = n(cntUnpaid);
    const shopPayout = n(salesPayout); // legacy เบิกค่าสินค้า — folds into sales_payouts
    const sp = n(salesPayout);
    const ip = n(interpreterPayout);

    return {
      walletTopup:       wt,
      walletWithdraw:    ww,
      walletAll:         wt + ww,
      shopPending:       n(shopPending),
      shopAwaitPay:      n(shopAwaitPay),
      shopOrdered:       n(shopOrdered),
      shopNote:          n(shopNote),
      forwarderArrived:  n(forwarderArrived),
      forwarderDelivery: n(forwarderDelivery),
      forwarderCredit:   n(forwarderCredit),
      forwarderNote:     n(forwarderNote),
      forwarderWhError:  n(forwarderWhError),
      driverItems:       n(driverItems),
      yuanPending:       n(yuanPending),
      cntDrawMoney:      cnt,
      shopPayout,
      salesPayout:       sp,
      interpreterPayout: ip,
      withdrawalAll:     cnt + shopPayout + sp + ip,
      customerPending:   n(customerPending),
      corporatePending:  n(corporatePending),
      contactMessages:   n(contactMessages),
      refundsPending:    n(refundsPending),
      bookingsPending:   n(bookingsPending),
      incidents:         n(incidents),
    };
  } catch (e) {
    // Never let a count failure break the admin sidebar — degrade to
    // no badges (the menu still renders + navigates fine).
    logger.error("admin", "sidebar count batch failed", e);
    return {};
  }
}
