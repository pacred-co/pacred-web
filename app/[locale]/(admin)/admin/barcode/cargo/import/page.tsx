/**
 * /admin/barcode/cargo/import — สแกนบาร์โค้ดบันทึกสินค้าถึงโกดังไทยด้วยมือถือ
 *
 * Faithful 1:1 transcription of legacy
 * `member/pcs-admin/barcode-c-import.php` (408 LOC). NOTE the legacy
 * title is "บันทึกสินค้าถึงโกดังไทย" (mark goods arrived at TH warehouse),
 * not "เข้าโกดังไทย" as the wave-2 brief said — we keep the legacy title.
 *
 * Differences from the `all` page (only):
 *   - title:  "สแกนบาร์โค้ดบันทึกสินค้าถึงโกดังไทยด้วยมือถือ"  (barcode-c-import.php L4, L19)
 *   - gateway type = "4"                                       (barcode-c-import.php L400)
 *
 * Everything else (markup, controls, Quagga config) is identical to
 * barcode-c-all.php — shared via <CameraScanner>.
 */

import { requireAdmin } from "@/lib/auth/require-admin";
import { Link } from "@/i18n/navigation";
import { CameraScanner } from "@/components/admin/camera-scanner";
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
                              <CameraScanner gatewayType="4" />
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
