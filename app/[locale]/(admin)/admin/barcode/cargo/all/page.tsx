/**
 * /admin/barcode/cargo/all — สแกนบาร์โค้ดรายการทั้งหมดด้วยมือถือ
 *
 * Faithful 1:1 transcription of legacy
 * `member/pcs-admin/barcode-c-all.php` (409 LOC). Mobile-camera barcode
 * scanner — decodes a tracking number then redirects to
 * `/admin/barcode/gateway?type=all&device=mobile&tracking=<code>`
 * (Agent 3's gateway route handles the dispatch — same shape as legacy
 * `gateway.php?type=all&device=mobile&tracking=…`, see barcode-c-all.php L401).
 *
 * Structure transcribed verbatim from barcode-c-all.php L10-100:
 *   - .app-content / .content-wrapper           L11-13
 *   - breadcrumbs                                L14-25 (หน้าแรก > สแกนบาร์โค้ด…)
 *   - .card .card-content .card-body            L31-91
 *   - h3 with la-barcode icon                    L37  (no text-danger — default colour)
 *   - <section id="container"> ...inline CameraScanner  L44-87
 *
 * Bootstrap-4 classes scoped under `.pcs-legacy` (admin-base.css).
 */

import { requireAdmin } from "@/lib/auth/require-admin";
import { Link } from "@/i18n/navigation";
import { CameraScanner } from "@/components/admin/camera-scanner";
import { TopMenuBarcode } from "@/components/admin/top-menu-barcode";

export const dynamic = "force-dynamic";

export default async function BarcodeCargoAllPage() {
  await requireAdmin(["super", "ops", "warehouse"]);

  return (
    <>
      <TopMenuBarcode activeHref="/admin/barcode/cargo/all" />
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
                        สแกนบาร์โค้ดรายการทั้งหมดด้วยมือถือ
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
                                  สแกนบาร์โค้ดรายการทั้งหมดด้วยมือถือ
                                </h3>
                              </div>
                            </div>
                            <div className="content-header-right col-md-6 col-12"></div>
                          </div>
                          <div className="row">
                            <div className="col-md-12">
                              <CameraScanner gatewayType="all" />
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
