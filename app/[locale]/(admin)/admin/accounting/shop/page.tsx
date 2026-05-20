/**
 * /admin/accounting/shop — P0.5 sidebar-pairing placeholder.
 *
 * This route exists to give the sidebar item `accCargo.shop`
 * ("บัญชี Cargo → รายงานฝากสั่ง") a faithful destination per D1 /
 * ADR-0017. The legacy reference is `pcs-admin/acc-shop.php` — the
 * SHOP-ORDER REVENUE / AR view from the Accounting team's frame
 * (recognised revenue + outstanding balances by customer/period),
 * which is a distinct screen from the OPS-side `report-shop`
 * (operational throughput / job counts).
 *
 * Before this stub, the sidebar wire pointed at the ops report by
 * mistake (sidebar-pairing audit 2026-05-20 §2 "Bug Type 1"). The
 * full faithful 1:1 port of `acc-shop.php` lands in a P0.5 follow-up.
 *
 * Pattern reference: faithful-port runbook §8 (admin pilot).
 */

import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";

export const dynamic = "force-dynamic";

export default async function AccountingShopStub() {
  await requireAdmin(["super", "accounting"]);

  return (
    <div className="pcs-legacy">
      {/* Same legacy chrome the sister accounting pages load — keeps
          the look consistent across /admin/accounting/*. */}
      <link rel="stylesheet" href="/legacy/pcs/admin/admin-base.css" />

      <div className="content-wrapper">
        <div className="container-fluid">
          {/* Breadcrumb */}
          <div className="content-header row">
            <div className="content-header-left col-md-6 col-12 mb-2">
              <h3 className="content-header-title">บัญชี Cargo — รายงานฝากสั่ง</h3>
              <div className="row breadcrumbs-top">
                <div className="breadcrumb-wrapper col-12">
                  <ol className="breadcrumb">
                    <li className="breadcrumb-item">
                      <Link href="/admin">หน้าหลัก</Link>
                    </li>
                    <li className="breadcrumb-item">
                      <Link href="/admin/accounting">บัญชี</Link>
                    </li>
                    <li className="breadcrumb-item active">รายงานฝากสั่ง</li>
                  </ol>
                </div>
              </div>
            </div>
          </div>

          <section className="row">
            <div className="col-12">
              <div className="card">
                <div className="card-header">
                  <h1 className="card-title">บัญชี Cargo — รายงานฝากสั่ง</h1>
                </div>
                <div className="card-body">
                  <div className="alert alert-warning" role="alert">
                    <strong>อยู่ระหว่างพัฒนา</strong>
                    <br />
                    port faithful 1:1 ของ <code>acc-shop.php</code> ลงในรอบ P0.5
                    {" "}follow-up. หน้านี้คือมุมมอง <em>บัญชี</em> ของรายการฝากสั่งซื้อ
                    {" "}(recognised revenue / AR ตามรอบบัญชี) ซึ่งแยกจาก
                    {" "}<code>report-shop</code> ฝั่ง ops (job throughput).
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
