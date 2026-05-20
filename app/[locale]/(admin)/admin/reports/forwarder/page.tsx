/**
 * /admin/reports/forwarder — faithful placeholder STUB (P0.5 sidebar-pairing)
 *
 * The legacy `pcs-admin/report-forwarder.php` is the "ออกรายงาน → ฝากนำเข้า"
 * GENERAL report — period revenue + per-status counts for the ฝากนำเข้า
 * (forwarder) service. NOT the volume-by-origin × shipper sub-report —
 * that one lives at `/admin/reports/forwarder-volume` (already shipped).
 *
 * Per `docs/research/sidebar-pairing-audit-2026-05-20.md` §2 "Bug Type 1"
 * the sidebar item `report.forwarder` (ออกรายงาน → ฝากนำเข้า) was
 * misrouted to the wrong page — ภูม flagged "ปริมาณฝากนำเข้า..."
 * (the volume-by-origin sub-report) being shown instead of the general
 * report. This stub keeps the canonical URL alive so the sidebar can
 * be relinked correctly; the full faithful 1:1 transcription of
 * `report-forwarder.php` lands in a follow-up of the P0.5 batch.
 *
 * Pattern reference: faithful-port runbook §8 (admin pattern) +
 * sibling stub `/admin/cnt-hs/[id]`.
 */

import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";

export const dynamic = "force-dynamic";

export default async function ReportForwarderStub() {
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
              <h1 className="content-header-title">รายงานฝากนำเข้า — ข้อมูลทั่วไป</h1>
              <div className="row breadcrumbs-top">
                <div className="breadcrumb-wrapper col-12">
                  <ol className="breadcrumb">
                    <li className="breadcrumb-item">
                      <Link href="/admin">หน้าหลัก</Link>
                    </li>
                    <li className="breadcrumb-item">
                      <Link href="/admin/reports">ออกรายงาน</Link>
                    </li>
                    <li className="breadcrumb-item active">ฝากนำเข้า</li>
                  </ol>
                </div>
              </div>
            </div>
          </div>

          <section className="row">
            <div className="col-12">
              <div className="card">
                <div className="card-header">
                  <h4 className="card-title">รายงานฝากนำเข้า</h4>
                </div>
                <div className="card-body">
                  <div className="alert alert-warning" role="alert">
                    <strong>อยู่ระหว่างพัฒนา</strong>
                    <br />
                    การ port faithful 1:1 ของ <code>pcs-admin/report-forwarder.php</code>{" "}
                    (รายงานฝากนำเข้า — ข้อมูลทั่วไป) จะลงในรอบ P0.5 follow-up.
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

          {/* Quick-link to the existing volume-by-origin × shipper
              sub-report — the page that was previously misrouted from
              this sidebar item. Helps staff who came here looking for
              "ปริมาณฝากนำเข้าแยกตามต้นทาง × ขนส่ง" find it. */}
          <section className="row mt-2">
            <div className="col-12">
              <div className="card">
                <div className="card-header">
                  <h4 className="card-title">รายงานที่เกี่ยวข้อง</h4>
                </div>
                <div className="card-body">
                  <Link href="/admin/reports/forwarder-volume" className="btn btn-info">
                    ดูปริมาณแยกตามต้นทาง × ขนส่ง
                  </Link>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
