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
      forwarderArrived,
      forwarderDelivery,
      forwarderCredit,
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
      // ── ฝากนำเข้า (forwarders) ──────────────────────────────────
      // Legacy badgeMenu on ฝากนำเข้า ~ countForwarder6 area
      // (ถึงไทย / รอชำระ). Pacred: arrived_thailand.
      admin.from("forwarders").select("id", { count: "exact", head: true })
        .eq("status", "arrived_thailand"),
      admin.from("forwarders").select("id", { count: "exact", head: true })
        .eq("status", "out_for_delivery"),
      admin.from("forwarders").select("id", { count: "exact", head: true })
        .eq("status", "pending_payment").eq("credit_used", true),
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
    ]);

    const wt = n(walletTopup);
    const ww = n(walletWithdraw);
    const cnt = 0; // tb_cnt container-payment ledger not yet ported (Phase B §6)
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
      shopNote:          0, // หมายเหตุฝากสั่ง — note queue not yet ported (Phase B §5)
      forwarderArrived:  n(forwarderArrived),
      forwarderDelivery: n(forwarderDelivery),
      forwarderCredit:   n(forwarderCredit),
      forwarderNote:     0, // หมายเหตุนำเข้า — note queue not yet ported (Phase B §4)
      forwarderWhError:  0, // ประวัติเข้าโกดังไทย error queue not yet ported
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
