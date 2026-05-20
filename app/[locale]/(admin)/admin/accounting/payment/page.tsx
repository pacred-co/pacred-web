/**
 * /admin/accounting/payment — P0.5 sidebar-pairing placeholder.
 *
 * This route exists to give the sidebar item `accCargo.payment`
 * ("บัญชี Cargo → ฝากชำระ/โอนหยวน") a faithful destination per D1 /
 * ADR-0017. The legacy reference is `pcs-admin/acc-payment.php` —
 * the YUAN-TRANSFER REVENUE ACCOUNTING view (recognised revenue +
 * exchange-rate margin + commission breakdown by period/customer),
 * which is distinct from `/admin/yuan-payments` (the OPS QUEUE
 * for processing transfers in real time).
 *
 * Before this stub, the sidebar wire pointed at the ops queue by
 * mistake (sidebar-pairing audit 2026-05-20 §2 "Bug Type 1"). The
 * full faithful 1:1 port of `acc-payment.php` lands in a P0.5
 * follow-up.
 *
 * Pattern reference: faithful-port runbook §8 (admin pilot).
 */

import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";

export const dynamic = "force-dynamic";

export default async function AccountingPaymentStub() {
  await requireAdmin(["super", "accounting"]);

  return (
    <div className="pcs-legacy">
      <link rel="stylesheet" href="/legacy/pcs/admin/admin-base.css" />

      <div className="content-wrapper">
        <div className="container-fluid">
          {/* Breadcrumb */}
          <div className="content-header row">
            <div className="content-header-left col-md-6 col-12 mb-2">
              <h3 className="content-header-title">
                บัญชี Cargo — รายงานฝากชำระ/โอนหยวน
              </h3>
              <div className="row breadcrumbs-top">
                <div className="breadcrumb-wrapper col-12">
                  <ol className="breadcrumb">
                    <li className="breadcrumb-item">
                      <Link href="/admin">หน้าหลัก</Link>
                    </li>
                    <li className="breadcrumb-item">
                      <Link href="/admin/accounting">บัญชี</Link>
                    </li>
                    <li className="breadcrumb-item active">
                      รายงานฝากชำระ/โอนหยวน
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
                    บัญชี Cargo — รายงานฝากชำระ/โอนหยวน
                  </h1>
                </div>
                <div className="card-body">
                  <div className="alert alert-warning" role="alert">
                    <strong>อยู่ระหว่างพัฒนา</strong>
                    <br />
                    port faithful 1:1 ของ <code>acc-payment.php</code> ลงใน
                    {" "}รอบ P0.5 follow-up. หน้านี้คือมุมมอง <em>บัญชี</em> ของ
                    {" "}รายการฝากชำระ/โอนหยวน (recognised revenue + margin
                    {" "}อัตราแลกเปลี่ยน + ค่าคอม) ซึ่งแยกจาก
                    {" "}<Link href="/admin/yuan-payments" className="alert-link">
                      /admin/yuan-payments
                    </Link>{" "}
                    ฝั่ง ops (คิวรับงานโอนแบบ real-time).
                  </div>

                  <div className="text-center mt-3">
                    <Link href="/admin/accounting" className="btn btn-secondary">
                      ← กลับไปหน้าบัญชี
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
