/**
 * /admin/withdrawal/freight-th — faithful placeholder STUB (P0.5)
 *
 * The legacy `pcs-admin/freight-th/` (the TH-side trucking
 * disbursement screen) is the dedicated payout queue for ค่าขนส่งไทย
 * — domestic Thai trucking line-haul + last-mile costs the company
 * pays the trucking partners. It's a NARROWER, role-specific view
 * than the generic AP disbursements ledger (which shows every
 * vendor across every spend category).
 *
 * The two are NOT duplicates — the freight-th queue carries its
 * own status/RBAC + matches each payout against a specific shipment
 * leg, while `/admin/accounting/disbursements?kind=trucking` is the
 * downstream filtered slice of the universal AP ledger. Per D1 /
 * ADR-0017 + the owner's 2026-05-19 "100% sameness FIRST" rule,
 * the faithful 1:1 of freight-th will land in a follow-up port
 * pilot.
 *
 * The sidebar item `withdrawal.thaiFreight` (รายการเบิกเงิน →
 * ค่าขนส่งไทย) previously pointed at the generic AP filter — Bug
 * Type 1 from the 2026-05-20 sidebar-pairing audit
 * (`docs/research/sidebar-pairing-audit-2026-05-20.md` §2). This
 * P0.5 stub keeps the URL alive so the sidebar can route correctly
 * once wired, and signals clearly that the dedicated freight-th
 * queue is under construction.
 *
 * Pattern reference: `/admin/cnt-hs/[id]` (the canonical stub shape)
 * + faithful-port runbook §8 (admin pattern).
 */

import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";

export const dynamic = "force-dynamic";

export default async function WithdrawalFreightThStub() {
  // Legacy gate: the freight-th payout queue is jointly owned by
  // accounting (cuts the cheque) + ops (verifies the leg). `super`
  // is always included by requireAdmin semantics (master role).
  await requireAdmin(["super", "accounting", "ops"]);

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
                รายการเบิกเงิน — ค่าขนส่งไทย
              </h3>
              <div className="row breadcrumbs-top">
                <div className="breadcrumb-wrapper col-12">
                  <ol className="breadcrumb">
                    <li className="breadcrumb-item">
                      <Link href="/admin">หน้าหลัก</Link>
                    </li>
                    <li className="breadcrumb-item">รายการเบิกเงิน</li>
                    <li className="breadcrumb-item active">ค่าขนส่งไทย</li>
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
                    รายการเบิกเงิน — ค่าขนส่งไทย
                  </h1>
                </div>
                <div className="card-body">
                  <div className="alert alert-warning" role="alert">
                    <strong>หน้านี้อยู่ระหว่างพัฒนา</strong>
                    <br />
                    การ port faithful 1:1 ของ <code>pcs-admin/freight-th</code>{" "}
                    (คิวจ่ายค่าขนส่งไทยฝั่งรถ-รถบรรทุก-last-mile)
                    {" "}จะลงในรอบ follow-up.
                  </div>

                  <div className="alert alert-info" role="alert">
                    <strong>ระหว่างนี้:</strong>{" "}
                    ดูรายการเบิกค่าขนส่งไทย (ผ่าน filter ของบัญชีจ่ายทั่วไป)
                    {" "}ได้ที่{" "}
                    <Link
                      href={{
                        pathname: "/admin/accounting/disbursements",
                        query: { kind: "trucking" },
                      }}
                      className="alert-link"
                    >
                      /admin/accounting/disbursements?kind=trucking
                    </Link>
                    .
                  </div>

                  <div className="text-center mt-3">
                    <Link
                      href={{
                        pathname: "/admin/accounting/disbursements",
                        query: { kind: "trucking" },
                      }}
                      className="btn btn-secondary"
                    >
                      → ไปดูบัญชีจ่าย (filter: trucking)
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
