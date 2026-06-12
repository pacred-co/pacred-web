/**
 * /admin/withdrawal/freight-th-list — ค่าขนส่งไทย (เบิกเงิน) · REAL read-surface
 *
 * The sibling /admin/withdrawal/freight-th is a Tailwind PLACEHOLDER (chrome
 * only · points staff at the universal AP ledger). THIS page is the real
 * surface — it lights up the already-built FREIGHT commission withdrawal
 * workflow (actions/admin/freight-commission.ts) as a clickable queue:
 *
 *   - the Thai-freight delivery payouts (freight_commission_withdrawals) listed
 *     with status + gross/WHT/net amounts + payee bank info
 *   - a status filter (รอตรวจ / อนุมัติแล้ว / จ่ายแล้ว / ปฏิเสธ / ทั้งหมด)
 *   - the dormant-flag banner (commission.freight_enabled) + the
 *     "รอ owner ยืนยันนโยบาย commission Freight 50/50" amber policy banner
 *
 * Faithful-flow source (legacy):
 *   pcs-admin/report-shops-profit-pay.php — the TH-side disbursement queue
 *   (status: ยังไม่เบิกจ่าย / เบิกจ่ายแล้ว · amounts · a "เบิกจ่าย" action).
 *   We surface the equivalent FREIGHT payout queue with our own Tailwind chrome
 *   per AGENTS.md §0a (steal the workflow, polish the UI).
 *
 * 💰 MONEY-SAFETY (§0e / §0f / the prompt directive):
 *   - reads ONLY the canonical freight_commission_* tables (via the existing
 *     actions) — no rebuilt 0-row twin, no new write path.
 *   - the APPROVE/REJECT buttons route through the EXISTING audited actions
 *     (adminApproveCommissionWithdrawal / adminRejectCommissionWithdrawal),
 *     behind a §0f confirm dialog.
 *   - while the freight-commission flag is OFF the approve button ships
 *     DISABLED with the amber "รอ owner ยืนยันนโยบาย 50/50 ก่อนเปิดจ่ายจริง"
 *     banner — no money moves until the owner confirms the policy.
 *   - the explicit money-OUT step (approved → paid, super-only + slip) is NOT
 *     surfaced here — that stays on the dedicated commission/freight surface.
 *
 * Gate: super / accounting / freight_sales_manager.
 */

import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { PageTopMenubar } from "@/components/admin/page-top-menubar";
import { DISBURSEMENT_MENUBAR } from "@/lib/admin/disbursement-menubar";
import {
  adminListCommissionWithdrawals,
  getFreightCommissionState,
  type CommissionWithdrawalRow,
  type FreightCommissionState,
} from "@/actions/admin/freight-commission";
import { FreightThWithdrawalList } from "./freight-th-list-client";

export const dynamic = "force-dynamic";

const baht = (n: number) =>
  n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default async function WithdrawalFreightThListPage() {
  // freight_sales_manager owns the TH-freight payout queue alongside
  // accounting (cuts the cheque) · super always passes (master role).
  await requireAdmin(["super", "accounting", "freight_sales_manager"]);

  // Pull the dormant flag/tiers + the withdrawal queue (all rows).
  const [stateRes, listRes] = await Promise.all([
    getFreightCommissionState(),
    adminListCommissionWithdrawals("all"),
  ]);

  const state: FreightCommissionState | null = stateRes.ok ? stateRes.data ?? null : null;
  const enabled = state?.enabled ?? false;
  const anyTierPending = state?.anyTierPending ?? false;
  const stateError = stateRes.ok ? null : stateRes.error;

  const rows: CommissionWithdrawalRow[] = listRes.ok ? listRes.data ?? [] : [];
  const listError = listRes.ok ? null : listRes.error;

  // Summary cards (the legacy footer totals analogue).
  const pendingRows = rows.filter((r) => r.status === "pending");
  const pendingNet = pendingRows.reduce((s, r) => s + r.netThb, 0);
  const paidNet = rows.filter((r) => r.status === "paid").reduce((s, r) => s + r.netThb, 0);

  return (
    <>
      <PageTopMenubar items={DISBURSEMENT_MENUBAR} activeHref="/admin/withdrawal/freight-th-list" />
      <main className="p-4 sm:p-6 lg:p-8 space-y-5">
        {/* ── header ── */}
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-600">ADMIN</p>
          <h1 className="mt-1 text-xl sm:text-2xl font-bold">ค่าขนส่งไทย (เบิกเงิน)</h1>
          <p className="mt-1 text-sm text-muted">
            คิวเบิกค่าขนส่งไทย — ค่าคอม/ส่วนแบ่งงาน Freight ฝั่งไทย (รถบรรทุก · last-mile)
            ที่ขอเบิก พร้อมสถานะและยอดเงิน gross / หัก ณ ที่จ่าย / สุทธิ
          </p>
          <nav className="mt-2 flex flex-wrap items-center gap-1 text-xs text-muted">
            <Link href="/admin" className="hover:text-primary-600">หน้าหลัก</Link>
            <span>/</span>
            <span>รายการเบิกเงิน</span>
            <span>/</span>
            <span className="text-foreground">ค่าขนส่งไทย</span>
          </nav>
        </div>

        {/* ── policy banner — ALWAYS shown (the 50/50 gate the prompt requires) ── */}
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 sm:p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <span className="text-xl leading-none">⚠️</span>
            <div className="space-y-1.5 text-sm text-amber-900">
              <p className="font-semibold">
                รอ owner ยืนยันนโยบาย commission Freight 50/50 ก่อนเปิดจ่ายจริง
              </p>
              <p className="text-amber-800">
                {enabled ? (
                  anyTierPending ? (
                    <>
                      ระบบค่าคอม Freight <strong>เปิดอยู่</strong> แต่ยังมีเรทบางรายการที่
                      <strong> owner ยังไม่ยืนยัน</strong> — ตรวจ/ยืนยันเรทที่{" "}
                      <Link
                        href="/admin/commission/freight"
                        className="font-medium underline decoration-amber-400 hover:decoration-amber-700"
                      >
                        ค่าคอม Freight
                      </Link>{" "}
                      ก่อนอนุมัติเบิก
                    </>
                  ) : (
                    <>
                      ระบบค่าคอม Freight <strong>เปิดใช้งานแล้ว</strong> — อนุมัติได้ แต่ขั้นจ่ายเงินจริง
                      (โอน + แนบสลิป) ทำที่หน้า{" "}
                      <Link
                        href="/admin/commission/freight"
                        className="font-medium underline decoration-amber-400 hover:decoration-amber-700"
                      >
                        ค่าคอม Freight
                      </Link>{" "}
                      (super เท่านั้น)
                    </>
                  )
                ) : (
                  <>
                    ระบบค่าคอม Freight ยัง <strong>ปิดอยู่ (DORMANT)</strong> —
                    ปุ่มอนุมัติถูกล็อกไว้ ยังไม่เคลื่อนย้ายเงินจนกว่า owner จะยืนยันนโยบาย 50/50
                    + เปิดใช้งานที่{" "}
                    <Link
                      href="/admin/settings/go-live"
                      className="font-medium underline decoration-amber-400 hover:decoration-amber-700"
                    >
                      Go-Live
                    </Link>
                  </>
                )}
              </p>
            </div>
          </div>
        </div>

        {(stateError || listError) && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
            ⚠ โหลดข้อมูลบางส่วนไม่สำเร็จ: {[stateError, listError].filter(Boolean).join(" · ")}
          </div>
        )}

        {/* ── summary cards ── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-2xl border border-border bg-white dark:bg-surface p-4 shadow-sm">
            <p className="text-xs text-muted">รอตรวจ (รายการ)</p>
            <p className="mt-1 text-2xl font-bold text-amber-600">{pendingRows.length}</p>
          </div>
          <div className="rounded-2xl border border-border bg-white dark:bg-surface p-4 shadow-sm">
            <p className="text-xs text-muted">ยอดสุทธิที่รอเบิก (บาท)</p>
            <p className="mt-1 text-2xl font-bold">฿{baht(pendingNet)}</p>
          </div>
          <div className="rounded-2xl border border-border bg-white dark:bg-surface p-4 shadow-sm">
            <p className="text-xs text-muted">จ่ายแล้วสะสม (บาท)</p>
            <p className="mt-1 text-2xl font-bold text-emerald-600">฿{baht(paidNet)}</p>
          </div>
        </div>

        {/* ── the queue (client island: filter + confirm-gated actions) ── */}
        <FreightThWithdrawalList rows={rows} approvalEnabled={enabled} />
      </main>
    </>
  );
}
