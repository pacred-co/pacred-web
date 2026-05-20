/**
 * /admin/cnt-hs/[id] — faithful detail/edit pilot STUB
 *
 * The legacy `cnt-hs.php?page=detail&id=<id>` sub-route (cnt-hs.php
 * L486+) is the per-container payment detail screen (cabinet-number
 * pivot, attached slip viewer, "addPay" mutation form, multi-row
 * select-pay composer). The full faithful 1:1 of that screen is a
 * follow-up pilot.
 *
 * For now this stub keeps the URL alive (so the list page's
 * "อัปเดตและดูรายละเอียด" + "เพิ่มไฟล์" / "ดูไฟล์" links don't 404)
 * and clearly signals that the detail/edit flow is under
 * construction. Staff who land here are sent back to the main
 * `cnt-hs` ledger.
 *
 * Per ภูม's Q3 decision 2026-05-20 (sidebar-pairing audit cleanup),
 * the prior rebuilt-style sister page `/admin/accounting/container-
 * payments/[id]` was retired and its action file deleted. The full
 * faithful-port replacement of that mutation surface lands here.
 *
 * Pattern reference: faithful-port runbook §8 (admin pilot).
 */

import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function CntHsDetailStub({ params }: PageProps) {
  await requireAdmin(["super", "ops", "accounting"]);
  const { id } = await params;

  return (
    <div className="pcs-legacy">
      {/* Same legacy chrome the list page loads — keeps the look
          consistent with /admin/cnt-hs. */}
      <link rel="stylesheet" href="/legacy/pcs/admin/admin-base.css" />

      <div className="content-wrapper">
        <div className="container-fluid">
          {/* Breadcrumb — mirrors cnt-hs.php L189-200 shape */}
          <div className="content-header row">
            <div className="content-header-left col-md-6 col-12 mb-2">
              <h3 className="content-header-title">รายการเบิกเงินค่าตู้ — รายละเอียด</h3>
              <div className="row breadcrumbs-top">
                <div className="breadcrumb-wrapper col-12">
                  <ol className="breadcrumb">
                    <li className="breadcrumb-item">
                      <Link href="/admin">หน้าหลัก</Link>
                    </li>
                    <li className="breadcrumb-item">
                      <Link href="/admin/cnt-hs">รายการเบิกเงินค่าตู้</Link>
                    </li>
                    <li className="breadcrumb-item active">รายละเอียด #{id}</li>
                  </ol>
                </div>
              </div>
            </div>
          </div>

          <section className="row">
            <div className="col-12">
              <div className="card">
                <div className="card-header">
                  <h4 className="card-title">รายการ #{id}</h4>
                </div>
                <div className="card-body">
                  <div className="alert alert-warning" role="alert">
                    <strong>หน้ารายละเอียดอยู่ระหว่างพัฒนา</strong>
                    <br />
                    การ port faithful 1:1 ของ <code>cnt-hs.php?page=detail</code>
                    {" "}(เพิ่ม/แก้ไขสลิป, multi-row select-pay) จะลงในรอบถัดไป.
                    <br />
                    ระหว่างนี้กรุณากลับไปยังหน้ารายการหลัก{" "}
                    <Link href="/admin/cnt-hs" className="alert-link">
                      /admin/cnt-hs
                    </Link>
                    .
                  </div>

                  <div className="text-center mt-3">
                    <Link href="/admin/cnt-hs" className="btn btn-secondary">
                      ← กลับไปหน้ารายการ
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
