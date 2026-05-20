/**
 * /admin/accounting/withdraw — faithful placeholder STUB (P0.5)
 *
 * The legacy `pcs-admin/acc-withdraw.php` is the ACCOUNTING view of
 * wallet withdrawals / direct-transfer payouts — it lives under the
 * บัญชี Cargo workspace and shows the finance team's per-period
 * reconciliation cut of the same withdrawal records the ops team
 * works in their queue (`pcs-admin/wallet/?kind=withdraw`).
 *
 * The two views are NOT duplicates — they have different filters,
 * different status semantics, and different downstream artefacts
 * (the accounting view drives the GL posting; the ops view drives
 * the bank-transfer execution). Per D1 / ADR-0017 + the owner's
 * 2026-05-19 "100% sameness FIRST" rule, the faithful 1:1 of
 * acc-withdraw.php will land in a follow-up port pilot.
 *
 * The sidebar item `accCargo.withdraw` (บัญชี Cargo → ถอนเงิน
 * โอนโดยตรง) previously pointed at the ops queue — Bug Type 1 from
 * the 2026-05-20 sidebar-pairing audit (`docs/research/
 * sidebar-pairing-audit-2026-05-20.md` §2). This P0.5 stub keeps
 * the URL alive so the sidebar can route correctly once wired,
 * and signals clearly that the accounting cut is under construction.
 *
 * Pattern reference: `/admin/cnt-hs/[id]` (the canonical stub shape)
 * + faithful-port runbook §8 (admin pattern).
 */

import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";

export const dynamic = "force-dynamic";

export default async function AccountingWithdrawStub() {
  // Legacy gate: accounting team owns acc-withdraw.php. `super` is
  // always included by requireAdmin semantics (master role).
  await requireAdmin(["super", "accounting"]);

  return (
    <div className="pcs-legacy">
      {/* Same legacy chrome the faithful admin pilots use — keeps
          look consistent with /admin/cnt-hs + /admin/admins. */}
      <link rel="stylesheet" href="/legacy/pcs/admin/admin-base.css" />

      <div className="content-wrapper">
        <div className="container-fluid">
          {/* Breadcrumb — mirrors the admin pilot shape */}
          <div className="content-header row">
            <div className="content-header-left col-md-6 col-12 mb-2">
              <h3 className="content-header-title">
                บัญชี Cargo — รายการถอนเงิน/โอนโดยตรง
              </h3>
              <div className="row breadcrumbs-top">
                <div className="breadcrumb-wrapper col-12">
                  <ol className="breadcrumb">
                    <li className="breadcrumb-item">
                      <Link href="/admin">หน้าหลัก</Link>
                    </li>
                    <li className="breadcrumb-item">
                      <Link href="/admin/accounting">บัญชี Cargo</Link>
                    </li>
                    <li className="breadcrumb-item active">
                      รายการถอนเงิน/โอนโดยตรง
                    </li>
                  </ol>
                </div>
              </div>
            </div>
          </div>

          <section className="row">
            <div className="col-12">
              <div className="card">
                <div className="card-header">
                  <h1 className="card-title">
                    บัญชี Cargo — รายการถอนเงิน/โอนโดยตรง
                  </h1>
                </div>
                <div className="card-body">
                  <div className="alert alert-warning" role="alert">
                    <strong>หน้านี้อยู่ระหว่างพัฒนา</strong>
                    <br />
                    การ port faithful 1:1 ของ{" "}
                    <code>pcs-admin/acc-withdraw.php</code> (ภาพรวมฝั่งบัญชี
                    ของรายการถอนเงิน/โอนโดยตรง) จะลงในรอบ follow-up.
                  </div>

                  <div className="alert alert-info" role="alert">
                    <strong>หมายเหตุ:</strong> หน้านี้คือ{" "}
                    <em>มุมมองฝั่งบัญชี</em> (สำหรับทีมการเงินกระทบยอด/ลง
                    บัญชีต่อ) — ส่วน <em>คิวงานปฏิบัติการ</em>{" "}
                    (สำหรับทีมโอนเงินจริง) อยู่ที่{" "}
                    <Link href="/admin/wallet" className="alert-link">
                      /admin/wallet
                    </Link>
                    .
                  </div>

                  <div className="text-center mt-3">
                    <Link href="/admin/accounting" className="btn btn-secondary">
                      ← กลับไปบัญชี Cargo
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
