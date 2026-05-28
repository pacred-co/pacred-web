import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { ScannerInput } from "@/components/admin/scanner-input";
import { TopMenuBarcode } from "@/components/admin/top-menu-barcode";

/**
 * Admin > สแกนบาร์โค้ดเตรียมส่ง (เครื่องสแกน) — a FAITHFUL
 * 1:1 TRANSCRIPTION of the legacy PCS Cargo admin
 * `pcs-admin/barcode-d-prepare.php` (L1-94), per D1 / ADR-0017 +
 * the faithful-port transcription runbook (`docs/runbook/
 * faithful-port-transcription.md` §8 — admin pattern).
 *
 * The legacy page is a USB-handheld-scanner form (no camera) that
 * auto-focuses an <input>, then on Enter posts a GET to
 * `/pcs-admin/gateway.php?type=6&device=scanner&tracking=…`. The
 * Pacred port redirects to `/admin/barcode/gateway?type=6&
 * device=scanner&tracking=…` (Agent 3 implements the gateway).
 *
 * `type=6` (legacy L37) is the "ready-to-ship / paid-and-prepared"
 * scan — fired when packing the customer's paid parcel onto the
 * delivery rack. Matches `tb_forwarder.fStatus=6` (เตรียมส่ง).
 *
 * The legacy page includes the forwarder-6 icon (`assets/images/
 * icon/forwarder/forwarder-6.png` L34) — preserved.
 *
 * Auth — legacy gate is implicit; narrow to warehouse/driver/ops/
 * super (the parcel-handling roles).
 */

export const dynamic = "force-dynamic";

export default async function BarcodeDriverPreparePage() {
  await requireAdmin(["super", "ops", "warehouse", "driver"]);

  return (
    <div className="pcs-legacy">
      <link rel="stylesheet" href="/legacy/pcs/admin/admin-base.css" />

      <TopMenuBarcode activeHref="/admin/barcode/driver/prepare" />

      {/* BEGIN: Content — barcode-d-prepare.php L9-59 */}
      <div className="app-content content">
        <div className="content-overlay"></div>
        <div className="content-wrapper">
          <div className="content-header row">
            <div className="content-header-left col-12 mb-2">
              <div className="row breadcrumbs-top ">
                <div className="breadcrumb-wrapper col-12">
                  <ol className="breadcrumb ">
                    <li className="breadcrumb-item">
                      <Link href="/admin">หน้าแรก</Link>
                    </li>
                    <li className="breadcrumb-item active">
                      สแกนบาร์โค้ดรายการเตรียมส่งด้วยเครื่องอ่าน
                    </li>
                  </ol>
                </div>
              </div>
            </div>
          </div>
          <div className="content-body">
            <div
              className="row"
              style={{ display: "flex", flexWrap: "wrap" }}
            >
              <div className="col-12">
                <div className="card">
                  <div
                    className="card-body"
                    style={{ height: "75vh" }}
                  >
                    <div className="row ">
                      <div className="col-md-6 offset-md-3 filtered-list-search pl-2 pr-2">
                        <div style={{ paddingTop: "5%" }}>
                          <div className="text-center">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              className="img-fluid"
                              src="/legacy/pcs/assets/images/icon/forwarder/forwarder-6.png"
                              width={100}
                              alt="forwarder-6"
                            />
                          </div>
                          <h3 className="text-center text-color-main mb-3">
                            ค้นหาเลข Tracking รายการเตรียมส่ง
                            (รายการที่ชำระเงินแล้ว) ด้วยเครื่องอ่าน
                          </h3>
                          <ScannerInput type="6" />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      {/* END: Content */}
    </div>
  );
}
