/**
 * /admin/accounting/forwarder-invoice — P0.5 sidebar-pairing placeholder.
 *
 * This route exists to give the sidebar item `accCargo.invoice`
 * ("บัญชี Cargo → ฝากนำเข้า → ใบแจ้งหนี้") a faithful destination
 * per D1 / ADR-0017. The legacy reference is
 * `pcs-admin/hs-forwarder-invoice.php` — the FORWARDER INVOICE
 * LEDGER (ใบแจ้งหนี้ฝากนำเข้า: AR document register, payment-status
 * tracking, re-issue / void).
 *
 * Before this stub, the sidebar wire pointed at
 * `/admin/freight/declarations` (which is CUSTOMS DECLARATIONS —
 * ใบขนสินค้า, a totally different document) by mistake (sidebar-
 * pairing audit 2026-05-20 §2 "Bug Type 1"). The full faithful 1:1
 * port of `hs-forwarder-invoice.php` lands in a P0.5 follow-up.
 *
 * Pattern reference: faithful-port runbook §8 (admin pilot).
 */

import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";

export const dynamic = "force-dynamic";

export default async function AccountingForwarderInvoiceStub() {
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
                บัญชี Cargo — ใบแจ้งหนี้ฝากนำเข้า
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
                      ใบแจ้งหนี้ฝากนำเข้า
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
                  <h1 className="card-title">บัญชี Cargo — ใบแจ้งหนี้ฝากนำเข้า</h1>
                </div>
                <div className="card-body">
                  <div className="alert alert-warning" role="alert">
                    <strong>อยู่ระหว่างพัฒนา</strong>
                    <br />
                    port faithful 1:1 ของ <code>hs-forwarder-invoice.php</code>
                    {" "}ลงในรอบ P0.5 follow-up — สมุดทะเบียนใบแจ้งหนี้ฝากนำเข้า
                    {" "}(AR document register · payment-status · re-issue/void).
                  </div>
                  <div className="alert alert-info" role="alert">
                    <strong>หมายเหตุ:</strong> <code>ใบแจ้งหนี้</code>{" "}
                    <strong>ไม่ใช่</strong> <code>ใบขนสินค้า</code> —
                    เป็นเอกสารคนละชนิด. ก่อนหน้านี้ sidebar เคยชี้ไปที่
                    {" "}<Link href="/admin/freight/declarations" className="alert-link">
                      /admin/freight/declarations
                    </Link>
                    {" "}(ใบขนสินค้า — customs declarations) ซึ่งเป็นมุมมอง
                    {" "}freight clearance คนละโดเมนกัน. รอบ P0.5 นี้แก้ wire
                    ให้ตรงเอกสารจริง.
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
