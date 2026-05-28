/**
 * /admin/barcode/cargo/import — สแกนบาร์โค้ดบันทึกสินค้าถึงโกดังไทยด้วยมือถือ
 *
 * Wave 17 P1-7: camera-mode sibling of the USB-scanner page at
 * /admin/barcode/driver/import. Both pages now call the same
 * `adminBarcodeImportScan` Server Action which does the actual
 * tb_forwarder_import2 UPSERT + tb_forwarder.fstatus='4' auto-flip
 * (the port of legacy `include/pages/barcode-import/index.php`).
 *
 * Faithful port of legacy `member/pcs-admin/barcode-c-import.php`
 * (408 LOC). The mobile page never had its own writer in legacy
 * either — it just bounced through gateway.php?type=4. Wave 17
 * replaces the redirect with a direct server-action call so the
 * operator never leaves the camera view between scans.
 */

import { requireAdmin } from "@/lib/auth/require-admin";
import { Link } from "@/i18n/navigation";
import { CargoImportScanner } from "./cargo-import-scanner";
import { TopMenuBarcode } from "@/components/admin/top-menu-barcode";

export const dynamic = "force-dynamic";

export default async function BarcodeCargoImportPage() {
  await requireAdmin(["super", "ops", "warehouse"]);

  return (
    <>
      <TopMenuBarcode activeHref="/admin/barcode/cargo/import" />
      <div className="pcs-legacy">
        <div className="app-content content">
          <div className="content-overlay"></div>
          <div className="content-wrapper">
            <div className="content-header row">
              <div className="content-header-left col-12 mb-2">
                <div className="row breadcrumbs-top">
                  <div className="breadcrumb-wrapper col-12">
                    <ol className="breadcrumb">
                      <li className="breadcrumb-item">
                        <Link href="/admin">หน้าแรก</Link>
                      </li>
                      <li className="breadcrumb-item active">
                        สแกนบาร์โค้ดบันทึกสินค้าถึงโกดังไทยด้วยมือถือ
                      </li>
                    </ol>
                  </div>
                </div>
              </div>
            </div>
            <div className="content-body">
              <section id="basic-carousel">
                <div className="row">
                  <div className="col-md-12 col-sm-12">
                    <div className="card">
                      <div className="card-content">
                        <div className="card-body">
                          <div className="row">
                            <div className="content-header-left col-md-6 col-12">
                              <div className="text-center text-md-left">
                                <h3 className="text-center text-md-left">
                                  <span className="la la-barcode" style={{ fontSize: "2.4rem" }}></span>{" "}
                                  สแกนบาร์โค้ดบันทึกสินค้าถึงโกดังไทยด้วยมือถือ
                                </h3>
                              </div>
                            </div>
                            <div className="content-header-right col-md-6 col-12"></div>
                          </div>
                          <div className="row">
                            <div className="col-md-12">
                              <CargoImportScanner />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
