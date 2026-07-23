/**
 * /admin/wallet — Wave 15 P0-1 (2026-05-24)
 *
 * **Paradigm fix per `docs/audit/fidelity-gap-2026-05-24.md` §1.**
 * Legacy `pcs-admin/wallet.php` defaults to a PER-CUSTOMER BALANCE
 * SUMMARY (row-per-user from `tb_wallet` ORDER BY walletTotal DESC).
 * Pacred had been defaulting to a TRANSACTIONS LIST from `tb_wallet_hs`
 * (legacy's `?page=deposit` / `?page=withdraw` / `?page=history` merged).
 * Operators looking up "PR3963 มียอดเท่าไร?" had to scroll the tx list.
 *
 * This file is now a thin dispatcher:
 *   - `?view=balance` (DEFAULT) → `<WalletBalanceView>` — legacy parity
 *   - `?view=tx`                → `<WalletTransactionsView>` — preserves
 *     the Wave 7.2 / Wave 13.1 tx-list (status/kind/q searchparams +
 *     bulk-approve bar + slip-resolver). 100% behaviour-preserved.
 *
 * Wave 8 backlog still applies inside the tx view (slip-time editor +
 * admin-initiated topup + พายแทนลูกค้า).
 *
 * History (kept for context):
 *   - Wave 7.2 (2026-05-21): rewrote tx list from `wallet_transactions`
 *     (rebuilt · empty on prod) → `tb_wallet_hs` (104,591 rows).
 *   - Wave 8 (2026-05-22): bulk-approve bar + manual topup form.
 *   - Wave 13.1 (2026-05-21): signed-URL slip preview via legacy-resolver.
 *   - Wave 15 P0-1 (2026-05-24): made balance-summary the DEFAULT view;
 *     tx-list moved behind `?view=tx`.
 */

import { Link } from "@/i18n/navigation";
import { redirect } from "next/navigation";
import { hasRole, requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageTopMenubar, type MenubarItem } from "@/components/admin/page-top-menubar";
import { PageHeader } from "@/components/admin/page-header";
import { buildDefaultLandingRedirect } from "@/lib/admin/default-queue-filter";
import { parsePage } from "@/lib/admin/paginate";
import { WalletBalanceView } from "./balance-view";
import { WalletTransactionsView } from "./transactions-view";

export const dynamic = "force-dynamic";

// ─────────────────────────────────────────────────────────────────────
// Page top-menubar. The "หน้าหลัก" landing is now the balance view;
// "ประวัติรายการ" jumps to the tx view (legacy ?page=deposit/withdraw/
// history equivalent). Filter shortcuts under `กรองรายการ` deep-link
// into the tx view with `view=tx` so the URL stays self-describing.
// ─────────────────────────────────────────────────────────────────────
const WALLET_MENUBAR: MenubarItem[] = [
  { label: "หน้าหลัก", href: "/admin/wallet" },
  { label: "ประวัติรายการ", href: "/admin/wallet?view=tx" },
  // P1-26 (ADR-0018 · 2026-05-30): dedicated customer-withdraw approval queue
  // (type='3' status='1') — the clear ≤3-click entry point per AGENTS.md §0d.
  { label: "รายการถอนเงิน", href: "/admin/wallet/withdrawals" },
  {
    label: "กรองรายการ",
    children: [
      { label: "ทั้งหมด",    href: "/admin/wallet?view=tx" },
      { label: "รอชำระเงิน", href: "/admin/wallet?view=tx&kind=topup&status=1" },
      { label: "รอถอน",      href: "/admin/wallet/withdrawals" },
      { label: "อนุมัติแล้ว", href: "/admin/wallet?view=tx&status=2" },
    ],
  },
  {
    label: "จัดการ",
    children: [
      { label: "จ่ายแทนลูกค้า",       href: "/admin/wallet/pay-user" },
      { label: "ประวัติทั้งหมด",      href: "/admin/wallet/history" },
      { label: "เพิ่ม Topup ด้วยมือ", href: "/admin/wallet/add" },
      // Wave 7.3 (2026-05-22): wired refunds orphan per ภูม decision in
      // page-inventory-2026-05-21-night.md §🔴 DEAD. Refunds is a Pacred-
      // only feature (no legacy equivalent) but conceptually lives under
      // wallet management — money flowing back to the customer wallet.
      { label: "คืนเงินลูกค้า",        href: "/admin/refunds" },
    ],
  },
];

type SP = { view?: string; kind?: string; status?: string; q?: string; sort?: string; dir?: string; page?: string };

export default async function AdminWalletPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  // W-1 (gap-admin H-1): page-level role gate. Both views read every
  // customer's wallet PII via createAdminClient (RLS-bypass) — money
  // page → accounting + ops (super implicit). Driver/warehouse refused.
  const { roles } = await requireAdmin(["ops", "accounting"]);
  const canSettle = hasRole(roles, "accounting");

  const sp = await searchParams;

  // G6 — default queue filter per role. accounting lands directly on
  // the pending-topup queue (?view=tx&status=1) so the slip-review
  // backlog is visible on open. ops/super stay on balance view default.
  const defaultRedirect = buildDefaultLandingRedirect(
    "/admin/wallet",
    roles,
    sp as Record<string, unknown>,
  );
  if (defaultRedirect) redirect(defaultRedirect);

  const view: "balance" | "tx" = sp.view === "tx" ? "tx" : "balance";

  // Cheap header counts — kept for the tx-tab badge AND to surface the
  // pending-approval queue from the balance view (operators still need
  // to know "1,470 slips waiting" at a glance even when looking at
  // balances). All 4 queries use count:exact + head:true so no rows ship.
  // Left LIVE (not cached) on purpose: this "รอตรวจ" badge sits on the screen
  // staff actively approve from, so it must drop the instant a slip is
  // approved — caching it would lag ≤60 s and read as a bug. The 50k-row
  // SUM (the real waste) is the part that's cached, via getWalletSystemTotals.
  const admin = createAdminClient();
  const [
    { count: pendingTopupCount },
    { count: pendingWithdrawCount },
    { count: totalPending },
    { count: customerCount },
  ] = await Promise.all([
    admin.from("tb_wallet_hs").select("id", { count: "exact", head: true }).in("type", ["1", "2", "8"]).eq("status", "1"),
    // ADR-0018 P1-25: customer withdraw pending = type='3' (was wrongly '7').
    admin.from("tb_wallet_hs").select("id", { count: "exact", head: true }).eq("type", "3").eq("status", "1"),
    // 1 การจ่าย = 1 รายการ (owner 2026-07-22): a combined payment's type-4
    // allocation children (reforder2 → their type-1 header) settle WITH the
    // header — counting them inflates the "รอตรวจรวม" badge by N per payment.
    admin.from("tb_wallet_hs").select("id", { count: "exact", head: true }).eq("status", "1").or("type.neq.4,reforder2.is.null"),
    admin.from("tb_wallet").select("userid", { count: "exact", head: true }),
  ]);

  const balanceHref = "/admin/wallet";
  const txHref = "/admin/wallet?view=tx";

  return (
    <>
      <PageTopMenubar items={WALLET_MENUBAR} activeHref="/admin/wallet" />
      <main className="p-6 lg:p-8 space-y-5">
        {/* §0h — one consistent page-title hierarchy via <PageHeader>: red eyebrow →
            big bold H1 → muted subtitle, with the pending-count chips as `badges`
            and the manual-topup CTA in the `actions` slot. Display-only swap; same
            counts + links + behaviour as the prior ad-hoc <p>ADMIN</p><h1> markup. */}
        <PageHeader
          eyebrow="ADMIN · กระเป๋าสตางค์"
          title={`กระเป๋าสตางค์ — ${view === "balance" ? "ยอดคงเหลือลูกค้า" : "ประวัติรายการ"}`}
          badges={
            <>
              {totalPending ? (
                <Link
                  href="/admin/wallet?view=tx&status=1"
                  className="rounded-full border border-yellow-200 bg-yellow-50 px-3 py-1 text-xs font-semibold text-yellow-700 hover:bg-yellow-100"
                  title="ดูรายการรอตรวจทั้งหมด"
                >
                  {totalPending.toLocaleString()} รอตรวจรวม
                </Link>
              ) : null}
              {pendingTopupCount ? (
                <Link
                  href="/admin/wallet?view=tx&kind=topup&status=1"
                  className="rounded-full border border-green-200 bg-green-50 px-3 py-1 text-xs font-semibold text-green-700 hover:bg-green-100"
                >
                  เติม {pendingTopupCount.toLocaleString()}
                </Link>
              ) : null}
              {pendingWithdrawCount ? (
                <Link
                  href="/admin/wallet/withdrawals"
                  className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-100"
                >
                  ถอน {pendingWithdrawCount.toLocaleString()}
                </Link>
              ) : null}
            </>
          }
          subtitle={
            <>
              {view === "balance"
                ? "ยอดเงินคงเหลือในกระเป๋าของลูกค้าแต่ละราย — เรียงจากยอดสูงสุด (รวม Cash Back)"
                : "รายการเงินเข้า–ออกของลูกค้า — ตรวจสลิป แล้วกดอนุมัติหรือปฏิเสธได้จากหน้านี้"}
              {view === "tx" && sp.status === "1" && (
                <>
                  {" · "}
                  <Link
                    href="/admin/wallet?view=tx"
                    className="text-primary-600 hover:underline"
                    title="ล้างฟิลเตอร์ ‘รอตรวจ’ · ดูประวัติทั้งหมด"
                  >
                    ดูทั้งหมด
                  </Link>
                </>
              )}
            </>
          }
          actions={
            <Link
              href="/admin/wallet/add"
              className="rounded-md border border-primary-500 bg-primary-500 px-3 py-2 text-xs font-semibold text-white hover:bg-primary-600"
            >
              + เพิ่ม Topup ด้วยมือ
            </Link>
          }
        />

        {/* ── View-toggle tabs ── */}
        <div className="flex flex-wrap gap-1 border-b border-border">
          <Link
            href={balanceHref}
            className={
              "px-4 py-2 text-sm rounded-t-md border-b-2 -mb-px inline-flex items-center gap-2 " +
              (view === "balance"
                ? "border-primary-600 text-primary-600 font-semibold"
                : "border-transparent text-muted hover:text-foreground")
            }
          >
            <span aria-hidden>💰</span>
            <span>ยอดคงเหลือลูกค้า</span>
            {customerCount ? (
              <span
                className={
                  "rounded-full px-2 py-0.5 text-[11px] font-medium " +
                  (view === "balance"
                    ? "bg-primary-100 text-primary-700"
                    : "bg-surface-alt text-muted")
                }
              >
                {customerCount.toLocaleString()}
              </span>
            ) : null}
          </Link>
          <Link
            href={txHref}
            className={
              "px-4 py-2 text-sm rounded-t-md border-b-2 -mb-px inline-flex items-center gap-2 " +
              (view === "tx"
                ? "border-primary-600 text-primary-600 font-semibold"
                : "border-transparent text-muted hover:text-foreground")
            }
          >
            <span aria-hidden>📜</span>
            <span>ประวัติรายการ</span>
            {totalPending ? (
              <span
                className={
                  "rounded-full px-2 py-0.5 text-[11px] font-medium " +
                  (view === "tx"
                    ? "bg-primary-100 text-primary-700"
                    : "bg-yellow-100 text-yellow-700")
                }
              >
                {totalPending.toLocaleString()} รอ
              </span>
            ) : null}
          </Link>
        </div>

        {/* ── View body ── */}
        {view === "balance" ? (
          <WalletBalanceView q={sp.q} sort={sp.sort} dir={sp.dir} page={parsePage(sp.page)} />
        ) : (
          <WalletTransactionsView
            kind={sp.kind}
            status={sp.status}
            q={sp.q}
            sort={sp.sort}
            dir={sp.dir}
            page={parsePage(sp.page)}
            canSettle={canSettle}
          />
        )}
      </main>
    </>
  );
}
