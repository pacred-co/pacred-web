/**
 * /admin/reports/shop — faithful placeholder STUB (P0.5 sidebar-pairing)
 *
 * The legacy `pcs-admin/report-shop.php` is the "ออกรายงาน → ฝากสั่งซื้อ"
 * general report — period revenue + per-status counts for the ฝากสั่งซื้อ
 * (shop-order) service. The full faithful 1:1 transcription lands in
 * a follow-up of the P0.5 reports batch.
 *
 * For now this stub keeps the URL alive so the sidebar item
 * `report.shop` (ออกรายงาน → ฝากสั่งซื้อ) — previously misrouted per
 * `docs/research/sidebar-pairing-audit-2026-05-20.md` §2 "Bug Type 1"
 * — can be relinked at this canonical path without 404.
 *
 * Pattern reference: faithful-port runbook §8 (admin pattern) +
 * sibling stub `/admin/cnt-hs/[id]`.
 */

import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";

export const dynamic = "force-dynamic";

export default async function ReportShopStub() {
  await requireAdmin(["super", "accounting"]);

  return (
    <div className="pcs-legacy">
      {/* Legacy admin chrome — served as a static /public/ asset so it
          bypasses Tailwind / PostCSS (the rule da4cd79 set). */}
      <link rel="stylesheet" href="/legacy/pcs/admin/admin-base.css" />

      <div className="content-wrapper">
        <div className="container-fluid">
          {/* Breadcrumb — mirrors the admin pilot shape */}
          <div className="content-header row">
            <div className="content-header-left col-md-6 col-12 mb-2">
              <h1 className="content-header-title">รายงานฝากสั่งซื้อ — ข้อมูลทั่วไป</h1>
              <div className="row breadcrumbs-top">
                <div className="breadcrumb-wrapper col-12">
                  <ol className="breadcrumb">
                    <li className="breadcrumb-item">
                      <Link href="/admin">หน้าหลัก</Link>
                    </li>
                    <li className="breadcrumb-item">
                      <Link href="/admin/reports">ออกรายงาน</Link>
                    </li>
                    <li className="breadcrumb-item active">ฝากสั่งซื้อ</li>
                  </ol>
                </div>
              </div>
            </div>
          </div>

          <section className="row">
            <div className="col-12">
              <div className="card">
                <div className="card-header">
                  <h4 className="card-title">รายงานฝากสั่งซื้อ</h4>
                </div>
                <div className="card-body">
                  <div className="alert alert-warning" role="alert">
                    <strong>อยู่ระหว่างพัฒนา</strong>
                    <br />
                    การ port faithful 1:1 ของ <code>pcs-admin/report-shop.php</code>{" "}
                    (รายงานฝากสั่งซื้อ — ข้อมูลทั่วไป) จะลงในรอบ P0.5 follow-up.
                    <br />
                    ระหว่างนี้กรุณากลับไปยังหน้าสรุปรายงาน{" "}
                    <Link href="/admin/reports" className="alert-link">
                      /admin/reports
                    </Link>
                    .
                  </div>

                  <div className="text-center mt-3">
                    <Link href="/admin/reports" className="btn btn-secondary">
                      ← กลับไปหน้าสรุปรายงาน
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
