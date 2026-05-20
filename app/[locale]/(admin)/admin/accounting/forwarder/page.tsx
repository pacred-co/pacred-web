/**
 * /admin/accounting/forwarder — P0.5 sidebar-pairing placeholder.
 *
 * This route exists to give the sidebar item `accCargo.total`
 * ("บัญชี Cargo → ฝากนำเข้า → ยอดทั้งหมด") a faithful destination
 * per D1 / ADR-0017. The legacy reference is
 * `pcs-admin/acc-forwarder.php` — the FORWARDER REVENUE TOTAL view
 * from the Accounting team's frame (รวมยอดรับชำระจาก forwarder
 * orders by period/customer), which is distinct from the OPS-side
 * `report-forwarder-volume` (volume / throughput by warehouse).
 *
 * Before this stub, the sidebar wire pointed at the ops volume
 * report by mistake (sidebar-pairing audit 2026-05-20 §2
 * "Bug Type 1"). The full faithful 1:1 port of `acc-forwarder.php`
 * lands in a P0.5 follow-up.
 *
 * Pattern reference: faithful-port runbook §8 (admin pilot).
 */

import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";

export const dynamic = "force-dynamic";

export default async function AccountingForwarderStub() {
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
                บัญชี Cargo — ฝากนำเข้า · ยอดทั้งหมด
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
                      ฝากนำเข้า · ยอดทั้งหมด
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
                    บัญชี Cargo — ฝากนำเข้า · ยอดทั้งหมด
                  </h1>
                </div>
                <div className="card-body">
                  <div className="alert alert-warning" role="alert">
                    <strong>อยู่ระหว่างพัฒนา</strong>
                    <br />
                    port faithful 1:1 ของ <code>acc-forwarder.php</code> ลงใน
                    {" "}รอบ P0.5 follow-up. หน้านี้คือมุมมอง <em>บัญชี</em> ของ
                    {" "}รายการฝากนำเข้า (รวมยอดรับชำระตามรอบ) ซึ่งแยกจาก
                    {" "}<code>report-forwarder-volume</code> ฝั่ง ops
                    {" "}(volume / throughput ตามคลังต้นทาง).
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
