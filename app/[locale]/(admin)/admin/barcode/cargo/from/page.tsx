/**
 * /admin/barcode/cargo/from — สแกนบาร์โค้ดพิมพ์จากหน้ากล่องด้วยมือถือ
 *
 * Faithful 1:1 transcription of legacy
 * `member/pcs-admin/barcode-c-from.php` (409 LOC). NOTE — the legacy file
 * title says "พิมพ์จากหน้ากล่อง" (printed from box face), NOT "รับเข้า
 * โกดังจีน" as the wave-2 brief speculated; we keep the legacy title
 * exactly per the owner's "100% sameness FIRST" rule.
 *
 * Differences from the `all` page (only):
 *   - title:  "สแกนบาร์โค้ดพิมพ์จากหน้ากล่องด้วยมือถือ"   (barcode-c-from.php L4, L20)
 *   - h3 has `text-danger` class                       (barcode-c-from.php L37)
 *   - gateway type = "from"                            (barcode-c-from.php L401)
 *
 * Everything else (markup, controls, Quagga config) is identical to
 * barcode-c-all.php — shared via <CameraScanner>.
 */

import { requireAdmin } from "@/lib/auth/require-admin";
import { Link } from "@/i18n/navigation";
import { CameraScanner } from "@/components/admin/camera-scanner";
import { TopMenuBarcode } from "@/components/admin/top-menu-barcode";

export const dynamic = "force-dynamic";

export default async function BarcodeCargoFromPage() {
  await requireAdmin(["super", "ops", "warehouse"]);

  return (
    <>
      <TopMenuBarcode activeHref="/admin/barcode/cargo/from" />
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
                        สแกนบาร์โค้ดพิมพ์จากหน้ากล่องด้วยมือถือ
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
                                <h3 className="text-center text-danger text-md-left">
                                  <span className="la la-barcode" style={{ fontSize: "2.4rem" }}></span>{" "}
                                  สแกนบาร์โค้ดพิมพ์จากหน้ากล่องด้วยมือถือ
                                </h3>
                              </div>
                            </div>
                            <div className="content-header-right col-md-6 col-12"></div>
                          </div>
                          <div className="row">
                            <div className="col-md-12">
                              <CameraScanner gatewayType="from" />
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
