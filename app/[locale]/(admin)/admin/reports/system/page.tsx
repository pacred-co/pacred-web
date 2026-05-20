/**
 * /admin/reports/system — faithful placeholder STUB (P0.5 sidebar-pairing)
 *
 * The legacy `pcs-admin/report-system.php` is the "ออกรายงาน →
 * การเข้าถึงเว็บไซต์" report — the umbrella system-access report that
 * fans out into 4 sub-reports:
 *   - `report-api-cn.php`  → API จีน (TAMIT 1688/Taobao calls)
 *   - `report-search.php`  → ค้นหา (China search query log)
 *   - `report-api-sms.php` → SMS (ThaiBulkSMS dispatch log)
 *   - `report-otp.php`     → OTP (OTP send/verify rate-limit telemetry)
 *
 * The full faithful 1:1 transcription of each lands in a follow-up of
 * the P0.5 reports batch — each becomes its own page at
 * `/admin/reports/system/api-cn`, `.../search`, `.../sms`, `.../otp`.
 *
 * For now this stub keeps the URL alive so the sidebar item
 * `report.system` (ออกรายงาน → การเข้าถึงเว็บไซต์ + API จีน + SMS + OTP)
 * — previously misrouted per
 * `docs/research/sidebar-pairing-audit-2026-05-20.md` §2 "Bug Type 1" —
 * can be relinked at this canonical path without 404. The body shows
 * a grid of the 4 sub-reports as greyed-out "เร็วๆ นี้" placeholders
 * so staff see what's coming.
 *
 * Pattern reference: faithful-port runbook §8 (admin pattern) +
 * sibling stub `/admin/cnt-hs/[id]`.
 */

import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";

export const dynamic = "force-dynamic";

export default async function ReportSystemStub() {
  await requireAdmin(["super"]);

  // The 4 sub-reports the legacy fans out into. Each label mirrors the
  // PHP file's window title. All disabled until their faithful ports
  // land in the P0.5 follow-up.
  const subReports = [
    { label: "รายงาน API จีน",   legacy: "report-api-cn.php"  },
    { label: "รายงานการค้นหา",   legacy: "report-search.php"  },
    { label: "รายงาน SMS",       legacy: "report-api-sms.php" },
    { label: "รายงาน OTP",       legacy: "report-otp.php"     },
  ];

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
              <h1 className="content-header-title">รายงานการเข้าถึงระบบ</h1>
              <div className="row breadcrumbs-top">
                <div className="breadcrumb-wrapper col-12">
                  <ol className="breadcrumb">
                    <li className="breadcrumb-item">
                      <Link href="/admin">หน้าหลัก</Link>
                    </li>
                    <li className="breadcrumb-item">
                      <Link href="/admin/reports">ออกรายงาน</Link>
                    </li>
                    <li className="breadcrumb-item active">การเข้าถึงระบบ</li>
                  </ol>
                </div>
              </div>
            </div>
          </div>

          <section className="row">
            <div className="col-12">
              <div className="card">
                <div className="card-header">
                  <h4 className="card-title">รายงานการเข้าถึงระบบ</h4>
                </div>
                <div className="card-body">
                  <div className="alert alert-warning" role="alert">
                    <strong>อยู่ระหว่างพัฒนา</strong>
                    <br />
                    การ port faithful 1:1 ของ <code>pcs-admin/report-system.php</code>{" "}
                    และ sub-reports (API จีน · ค้นหา · SMS · OTP) จะลงในรอบ P0.5 follow-up.
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

          {/* Quick-link grid of the 4 sub-reports — all greyed-out
              "เร็วๆ นี้" placeholders until their faithful ports land. */}
          <section className="row mt-2">
            <div className="col-12">
              <div className="card">
                <div className="card-header">
                  <h4 className="card-title">รายงานย่อย</h4>
                </div>
                <div className="card-body">
                  <div className="row">
                    {subReports.map((r) => (
                      <div key={r.legacy} className="col-md-6 col-sm-12 mb-2">
                        <div className="card border" style={{ opacity: 0.55 }}>
                          <div className="card-body text-center">
                            <h5 className="card-title">{r.label}</h5>
                            <p className="text-muted mb-2">
                              <code>{r.legacy}</code>
                            </p>
                            <button
                              type="button"
                              className="btn btn-sm btn-secondary"
                              disabled
                            >
                              เร็วๆ นี้
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
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
