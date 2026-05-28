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
      {/* Wave 22 — the "คำอธิบายระบบ" modal moved INTO ImportScannerPanel
          (native <dialog> via components/ui/pacred-dialog). The previous
          Bootstrap data-toggle="#recom" target lived here but no longer
          worked after Wave 21 dropped jQuery. */}
    </div>
  );
}
