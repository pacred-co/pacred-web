/**
 * /admin/withdrawal/freight-th — Tailwind placeholder (Wave 23 P1 batch 2-D)
 *
 * Wave 23 P1 #2D (2026-05-27 ค่ำ): rewrote the Bootstrap-4 / `.pcs-legacy`
 * chrome (3 legacy markers — `card / card-body / alert alert-warning`) to
 * Pacred Tailwind v4 chrome per AGENTS.md §0a (workflow vs UI). This page
 * is still a STUB — the faithful 1:1 port of the legacy data flow is
 * deferred to Phase C / Wave 24+. Today's change is chrome-only so the
 * page stops looking Bootstrap-broken inside the Pacred admin shell.
 *
 * Eventual data-flow port source:
 *   D:\REALSHITDATAPCS\pcsc\public_html\member\pcs-admin\report-shops-profit-pay.php
 * (PCS Freight branch — TH-side trucking disbursement queue: domestic
 * line-haul + last-mile costs paid to trucking partners). No Pacred
 * equivalent exists yet; the universal AP ledger filter
 * `/admin/accounting/disbursements?kind=trucking` is the current path.
 *
 * Original placeholder context (preserved): the legacy
 * `pcs-admin/freight-th/` queue is NARROWER and more role-specific than
 * the generic AP disbursements ledger — own status/RBAC + matches each
 * payout against a specific shipment leg. Per D1 / ADR-0017 + the owner's
 * 2026-05-19 "100% sameness FIRST" rule, the faithful 1:1 lands in Phase C.
 *
 * Sidebar wiring: `withdrawal.thaiFreight` (รายการเบิกเงิน → ค่าขนส่งไทย)
 * routes here so the URL is alive — Bug Type 1 from the 2026-05-20
 * sidebar-pairing audit (`docs/research/sidebar-pairing-audit-2026-05-20.md` §2).
 *
 * Chrome reference: app/[locale]/(admin)/admin/sales-payouts/page.tsx
 * (sister disbursement queue · same `<main className="p-6 lg:p-8 space-y-5">`).
 */

import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { PageTopMenubar } from "@/components/admin/page-top-menubar";
import { DISBURSEMENT_MENUBAR } from "@/lib/admin/disbursement-menubar";

export const dynamic = "force-dynamic";

export default async function WithdrawalFreightThStub() {
  // Legacy gate: the freight-th payout queue is jointly owned by
  // accounting (cuts the cheque) + ops (verifies the leg). `super`
  // is always included by requireAdmin semantics (master role).
  await requireAdmin(["super", "accounting", "ops"]);

  return (
    <>
      <PageTopMenubar items={DISBURSEMENT_MENUBAR} activeHref="/admin/withdrawal/freight-th" />
      <main className="p-6 lg:p-8 space-y-5">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-600">ADMIN</p>
          <h1 className="mt-1 text-2xl font-bold">รายการเบิกเงิน — ค่าขนส่งไทย</h1>
          <nav className="mt-2 flex items-center gap-1 text-xs text-muted">
            <Link href="/admin" className="hover:text-primary-600">หน้าหลัก</Link>
            <span>/</span>
            <span>รายการเบิกเงิน</span>
            <span>/</span>
            <span className="text-foreground">ค่าขนส่งไทย</span>
          </nav>
        </div>

        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <span className="text-2xl leading-none">🚧</span>
            <div className="space-y-2 text-sm text-amber-900">
              <p className="font-semibold">
                หน้านี้เป็น placeholder — ยังไม่เปิดใช้งานจริง
              </p>
              <p>
                คิวจ่ายค่าขนส่งไทย (รถบรรทุก line-haul + last-mile) — port faithful 1:1
                จาก <code className="rounded bg-amber-100 px-1 py-0.5 font-mono text-xs">pcs-admin/report-shops-profit-pay.php</code>{" "}
                (PCS Freight branch) — ยังไม่มีเทียบเท่าใน Pacred. กำหนดส่งใน Phase C / Wave 24+.
              </p>
              <p>
                <strong>ระหว่างนี้:</strong> ใช้ filter ของบัญชีจ่ายทั่วไป (universal AP ledger) ดูรายการ
                เบิกค่าขนส่งไทยได้ที่{" "}
                <Link
                  href={{
                    pathname: "/admin/accounting/disbursements",
                    query: { kind: "trucking" },
                  }}
                  className="font-mono text-amber-900 underline decoration-amber-400 hover:decoration-amber-700"
                >
                  /admin/accounting/disbursements?kind=trucking
                </Link>
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-white dark:bg-surface p-6 shadow-sm">
          <div className="flex flex-col items-center gap-3 text-center">
            <p className="text-sm text-muted">
              ไปดูรายการเบิกค่าขนส่งไทย (filter ของบัญชีจ่ายทั่วไป)
            </p>
            <Link
              href={{
                pathname: "/admin/accounting/disbursements",
                query: { kind: "trucking" },
              }}
              className="inline-flex items-center gap-2 rounded-full bg-primary-500 px-5 py-2 text-sm font-medium text-white shadow-sm hover:bg-primary-600"
            >
              → บัญชีจ่าย (filter: trucking)
            </Link>
          </div>
        </div>
      </main>
    </>
  );
}
