import { Link } from "@/i18n/navigation";
import { ScanLine } from "lucide-react";
import { requireAdmin } from "@/lib/auth/require-admin";
import { ScannerInput } from "@/components/admin/scanner-input";
import { TopMenuBarcode } from "@/components/admin/top-menu-barcode";

/**
 * Admin > สแกนจากหน้ากล่อง (เครื่องสแกน) — workflow ported 1:1 from the legacy
 * PCS Cargo admin `pcs-admin/barcode-d-from.php` (USB-handheld-scanner form,
 * no camera) per D1 / ADR-0017. **UI = Pacred Tailwind** per AGENTS.md §0a —
 * the legacy Bootstrap-4 `.app-content`/`.card`/admin-base.css scaffold is
 * gone; chrome now matches the cargo camera-scanner pages.
 *
 * `type=from` (legacy L34) is the "scan-from-the-box-face" mode — used when
 * the warehouse/driver staff print the China-intake receipt straight from the
 * package label. The form auto-focuses, then on Enter redirects to
 * `/admin/barcode/gateway?type=from&device=scanner&tracking=…` (logic in the
 * shared `<ScannerInput>` island).
 *
 * Auth — legacy gate is implicit; narrowed to warehouse/driver/ops/super
 * (the parcel-handling roles). ภูม warehouse-polish.
 */

export const dynamic = "force-dynamic";

export default async function BarcodeDriverFromPage() {
  await requireAdmin(["super", "ops", "warehouse", "driver"]);

  return (
    <>
      <TopMenuBarcode activeHref="/admin/barcode/driver/from" />
      <div className="min-h-screen bg-slate-50">
        <div className="mx-auto max-w-2xl px-4 py-6 sm:py-8">
          <nav className="mb-3 text-sm text-slate-500" aria-label="breadcrumb">
            <Link href="/admin" className="hover:text-primary-700">หน้าแรก</Link>
            <span className="mx-1.5">/</span>
            <span className="text-slate-700">สแกนจากหน้ากล่อง (เครื่องสแกน)</span>
          </nav>

          <div className="mb-5 flex items-center gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-red-50 text-red-600">
              <ScanLine className="h-7 w-7" aria-hidden="true" />
            </span>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">สแกนจากหน้ากล่อง</h1>
              <p className="mt-1 text-sm text-slate-600">ด้วยเครื่องสแกน USB · พิมพ์รับเข้าจากหน้ากล่อง</p>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="p-4 sm:p-6">
              <ScannerInput type="from" />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
