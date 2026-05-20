import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { ScannerInput } from "@/components/admin/scanner-input";
import { TopMenuBarcode } from "@/components/admin/top-menu-barcode";

/**
 * Admin > สแกนบาร์โค้ดจากหน้ากล่อง (เครื่องสแกน) — a FAITHFUL
 * 1:1 TRANSCRIPTION of the legacy PCS Cargo admin
 * `pcs-admin/barcode-d-from.php` (L1-91), per D1 / ADR-0017 + the
 * faithful-port transcription runbook (`docs/runbook/
 * faithful-port-transcription.md` §8 — admin pattern).
 *
 * The legacy page is a USB-handheld-scanner form (no camera) that
 * auto-focuses an <input>, then on Enter posts a GET to
 * `/pcs-admin/gateway.php?type=from&device=scanner&tracking=…`.
 * The Pacred port redirects to `/admin/barcode/gateway?type=from&
 * device=scanner&tracking=…` (Agent 3 implements the gateway).
 *
 * `type=from` (legacy L34) is the "scan-from-the-box-face" mode —
 * used when the driver/warehouse staff print the China-warehouse-
 * intake receipt straight from the package label.
 *
 * Auth — legacy gate is implicit; narrow to warehouse/driver/ops/
 * super (the parcel-handling roles).
 */

export const dynamic = "force-dynamic";

export default async function BarcodeDriverFromPage() {
  await requireAdmin(["super", "ops", "warehouse", "driver"]);

  return (
    <div className="pcs-legacy">
      <link rel="stylesheet" href="/legacy/pcs/admin/admin-base.css" />

      <TopMenuBarcode activeHref="/admin/barcode/driver/from" />

      {/* BEGIN: Content — barcode-d-from.php L9-56 */}
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
                      สแกนบาร์โค้ดจากหน้ากล่อง
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
                      <div className="col-md-6 offset-md-3 filtered-list-search barcode pl-2 pr-2">
                        <div style={{ paddingTop: "30%" }}>
                          <h3 className="text-center text-color-main mb-3">
                            ค้นหาเลข Tracking ด้วยเครื่องอ่านเพื่อพิมพ์จากหน้ากล่อง
                          </h3>
                          <ScannerInput type="from" />
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
