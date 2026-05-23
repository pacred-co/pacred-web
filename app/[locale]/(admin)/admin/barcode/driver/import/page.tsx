import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { ImportScannerPanel } from "./import-scanner-panel";
import { TopMenuBarcode } from "@/components/admin/top-menu-barcode";

/**
 * Admin > สแกนบาร์โค้ดเข้าโกดังไทย (เครื่องสแกน) — Wave 17 P1-7.
 *
 * Faithful port of the legacy PCS Cargo admin
 * `pcs-admin/barcode-d-import.php` (L1-258) per D1 / ADR-0017 +
 * the faithful-port transcription runbook (`docs/runbook/
 * faithful-port-transcription.md` §8 — admin pattern).
 *
 * Unlike the other 3 `barcode-d-*.php` siblings (which simply GET-
 * redirect to the gateway), this is the warehouse-intake
 * workstation form:
 *
 *   1. `fPallet` (LOCATION) input — sticky via cookie. Required
 *      before any scan is accepted. Set by typing one of the 46
 *      hardcoded location codes (`A1`..`Z6`) — legacy L192-199.
 *   2. `search-tracking` (TRACKING) input — auto-focused; fires
 *      on Enter (USB scanner) or button-click. Wave 17 wires this
 *      to the `adminBarcodeImportScan` Server Action (the port of
 *      `include/pages/barcode-import/index.php`) which:
 *        - UPSERTs `tb_forwarder_import2` (scan event row)
 *        - Auto-flips `tb_forwarder.fstatus='4'` when fi2amount
 *          reaches the parcel-count threshold
 *      The panel then renders a green / orange / red Tailwind card
 *      and plays `sSave.mp4` (matched / location) or
 *      `notFoundSave.mp4` (orphan-saved) per legacy behaviour.
 *   3. A "คำอธิบายระบบ" modal (`#recom`) explaining the 8-rule
 *      flow (L143-156).
 *
 * Auth — narrow to super/ops/warehouse (the parcel-handling roles
 * for the WRITE path; driver no longer needed since the write
 * touches money-status fields).
 */

export const dynamic = "force-dynamic";

export default async function BarcodeDriverImportPage() {
  await requireAdmin(["super", "ops", "warehouse"]);

  return (
    <div className="pcs-legacy">
      <link rel="stylesheet" href="/legacy/pcs/admin/admin-base.css" />

      {/* Inline <style> block — barcode-d-import.php L7-58 — the
          loading-ring spinner + alternate row-bg colours + the
          counter-reset rule for the modal's nested ol. */}
      <style>{`
        .pcs-legacy .lds-ring {
          display: inline-block;
          position: relative;
          width: 80px;
          height: 80px;
        }
        .pcs-legacy .lds-ring div {
          box-sizing: border-box;
          display: block;
          position: absolute;
          width: 64px;
          height: 64px;
          margin: 8px;
          border: 8px solid #FBB73C;
          border-radius: 50%;
          animation: lds-ring 1.2s cubic-bezier(0.5, 0, 0.5, 1) infinite;
          border-color: #FBB73C transparent transparent transparent;
        }
        .pcs-legacy .lds-ring div:nth-child(1) { animation-delay: -0.45s; }
        .pcs-legacy .lds-ring div:nth-child(2) { animation-delay: -0.3s; }
        .pcs-legacy .lds-ring div:nth-child(3) { animation-delay: -0.15s; }
        @keyframes lds-ring {
          0%   { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        .pcs-legacy .bg-warning-2 { background-color: rgb(255, 238, 218); }
        .pcs-legacy .bg-success-2 { background-color: #f5ffe9; }
        .pcs-legacy #recom ol { counter-reset: item; }
        .pcs-legacy #recom li { display: block; }
        .pcs-legacy #recom li:before {
          content: counters(item, ".") " ";
          counter-increment: item;
        }
      `}</style>

      <TopMenuBarcode activeHref="/admin/barcode/driver/import" />

      {/* BEGIN: Content — barcode-d-import.php L62-134 */}
      <div className="app-content content">
        <div className="content-overlay"></div>
        <div className="content-wrapper">
          <div className="content-header row">
            <div className="content-header-left col-12">
              <div className="row breadcrumbs-top ">
                <div className="breadcrumb-wrapper col-12">
                  <ol className="breadcrumb ">
                    <li className="breadcrumb-item">
                      <Link href="/admin">
                        <span className="menu-home">หน้าแรก</span>
                      </Link>
                    </li>
                    <li className="breadcrumb-item active">
                      สแกนบาร์โค้ดบันทึกสินค้าเข้าโกดัง
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
              <div className="col-12 pl-0 pr-0">
                <div className="card">
                  <div
                    className="card-body"
                    style={{ minHeight: "75vh" }}
                  >
                    <ImportScannerPanel />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      {/* END: Content */}

      {/* "คำอธิบายระบบ" modal — barcode-d-import.php L135-161.
          Faithful structure; bootstrap data-toggle/data-target work
          when the `bootstrap.bundle.js` vendor script is present
          (`docs/runbook/faithful-port-plan.md` cross-cutting infra
          item — staged for `/admin/*` per the evening pivot). */}
      <div
        id="recom"
        className="modal fade in"
        tabIndex={-1}
        role="dialog"
        aria-hidden="true"
      >
        <div className="modal-dialog modal-lg">
          <div className="modal-content header-from">
            <div className="modal-header">
              <h4 className="modal-title">
                การใช้งานระบบบันทึกรายการเข้าโกดัง
              </h4>
              <button
                type="button"
                className="close"
                data-dismiss="modal"
                aria-hidden="true"
              >
                <i className="la la-close"> </i>
              </button>
            </div>
            <div className="modal-body header-from">
              <ol className="">
                <li>
                  ต้องระบุ location เริ่มต้นก่อนทำรายการ
                  ครั้งต่อ ๆ ไประบบจะจำค่าล่าสุดที่เคยใช้ไว้
                </li>
                <li>
                  หากต้องการเปลี่ยน location
                  ให้ยิงรายการใหม่ ระบบจะอ่านค่าอัตโนมัติโดยดูจากข้อมูลที่กรอกไปในช่องค้นหา
                  หากข้อมูลอยู่ระหว่าง A1, A2, A3, B1, B2, B3, C1, C2, C3, D1, D2,
                  D3, E1, E2, E3, F1, F2, F3, G1, G2, G3, H1, H2, H3, I1, I2, I3,
                  J1, J2, J3, K1, K2, K3, L2, L3, M1-1, M1-2, M1-3, M2, M3, Z1,
                  Z2, Z3, Z4, Z5 and Z6 ระบบจะมองว่าเป็น location
                </li>
                <li>
                  ระบบจะเปลี่ยนสถานะรายการถึงไทยแล้ว
                  เมื่อจำนวนกล่องที่ยิงมากกว่าหรือเท่ากับจำนวนกล่องจริงในระบบ
                </li>
                <li>
                  กรณีระบบขึ้นกรอบสีเขียว
                  มาหลังจากการยิงแสดงว่าระบบบันทึกสำเร็จและทำการเชื่อมโยงออเดอร์นำเข้าได้
                </li>
                <li>
                  กรณีระบบขึ้นเป็นสีส้ม และมีเสียงแจ้งไม่พบรายการ บันทึกสำเร็จ
                  นั่นแสดงว่า เจ้าหน้าที่ฝ่ายที่อยู่หน้าประว้ติสินค้าเข้าโกดังจะต้องทำการเชื่อมรายการนั้น
                  โดยจะอธิบายในหน้าดังกล่าวอีกครั้ง
                </li>
                <li>
                  การค้นหารายการระบบจะรับค่ามาจากช่องค้นหา
                  แล้วแบ่งการทำงานเป็นลำดับดังนี้
                  <ol>
                    <li>
                      ค้นหารายการที่ตรงกันด้วยเลข ID CO หรือ เลขแทรคกิ้ง
                      โดยที่สถานะจะต้องน้อยกว่ารอชำระเงินลงมา
                      ข้อมูลที่เจอมากกว่า 1 รายการ ระบบจะใช้ รายการจากระบบ
                      รายการจากแอดมินและรายการจากลูกค้าตามลำดับ
                    </li>
                    <li>
                      หากไม่เจอข้างต้น จะทำการ ตัดข้อมูลตัวอักษรนำหน้า 2
                      ตัวออกแล้วเทียบรายการ แต่ในกรณที่เลขเป็น SF1234 SF1234-001
                      SF1234-002 ระบบจะมองว่ารายการเป็นของ SF1234
                      หากผิดพลาดให้แก้ไขในหน้าประวัติเข้าโกดังไทย
                    </li>
                  </ol>
                </li>
                <li>
                  หากต้องการลบประวัติหารยิงเข้าให้ไปที่หน้าประวัติเข้าโกดังไทย
                </li>
                <li>
                  หากยิงไม่เข้าให้ตรวจสอบว่ารายการนั้นมี เลขแทรคนี้มากกว่า 2
                  รายการหรือไม่
                </li>
              </ol>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
