import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { ImportScannerPanel } from "./import-scanner-panel";

/**
 * Admin > สแกนบาร์โค้ดเข้าโกดังไทย (เครื่องสแกน) — Wave 29 #213
 *
 * Faithful PORT of the legacy PCS Cargo admin `pcs-admin/barcode-d-import.php`
 * (L1-258) per D1 / ADR-0017. **WORKFLOW stolen from legacy · UI = Pacred
 * Tailwind mobile-first design** per AGENTS.md §0a + §6.
 *
 * Wave 29 #213 — rewrote chrome from Bootstrap-4 + `pcs-legacy` CSS scaffolding
 * to pure Pacred Tailwind. Workflow + data + interactions unchanged from
 * Wave 17. Warehouse staff use this DAILY on mobile — every tap target ≥ 44px,
 * text ≥ 16px, no horizontal scroll at 360/390px. Top-menu-barcode removed
 * (warehouse intake doesn't need mode switcher; sidebar has other modes).
 *
 * Unlike the other 3 `barcode-d-*.php` siblings (which simply GET-redirect to
 * the gateway), this is the warehouse-intake workstation form:
 *
 *   1. `fPallet` (LOCATION) input — sticky via cookie. Required before any
 *      scan is accepted. Set by typing one of the 46 hardcoded location codes
 *      (`A1`..`Z6`) — legacy L192-199.
 *   2. `search-tracking` (TRACKING) input — auto-focused; fires on Enter
 *      (USB scanner) or button-click. Calls the `adminBarcodeImportScan`
 *      Server Action (port of `include/pages/barcode-import/index.php`) which:
 *        - UPSERTs `tb_forwarder_import2` (scan event row)
 *        - Auto-flips `tb_forwarder.fstatus='4'` when fi2amount reaches the
 *          parcel-count threshold
 *      The panel then renders a green / orange / red Tailwind card and plays
 *      `sSave.mp4` (matched / location) or `notFoundSave.mp4` (orphan-saved)
 *      per legacy behaviour.
 *   3. A "คำอธิบายระบบ" modal (`#recom`) explaining the 8-rule flow.
 *
 * Auth — narrow to super/ops/warehouse (the parcel-handling roles for the
 * WRITE path; driver no longer needed since the write touches money-status
 * fields).
 */

export const dynamic = "force-dynamic";

export default async function BarcodeDriverImportPage() {
  await requireAdmin(["super", "ops", "warehouse"]);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-2xl px-4 py-6 sm:py-8">
        {/* Breadcrumb */}
        <nav className="text-sm text-slate-500 mb-3" aria-label="breadcrumb">
          <Link href="/admin" className="hover:text-primary-700">
            หน้าแรก
          </Link>
          <span className="mx-1.5">/</span>
          <span className="text-slate-700">
            สแกนบาร์โค้ดบันทึกสินค้าเข้าโกดัง
          </span>
        </nav>

        {/* Page header */}
        <div className="mb-5">
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">
            บันทึกสินค้าเข้าโกดัง
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            ตั้ง location ก่อนสแกน · บันทึกอัตโนมัติเมื่อยิงครบจำนวน
          </p>
        </div>

        {/* Main scanner card */}
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="p-4 sm:p-6">
            <ImportScannerPanel />
          </div>
        </div>
      </div>
    </div>
  );
}
