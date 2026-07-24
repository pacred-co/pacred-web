/**
 * /admin/barcode/cargo/import — สแกนบาร์โค้ดบันทึกสินค้าถึงโกดังไทยด้วยมือถือ
 *
 * Wave 17 P1-7: camera-mode sibling of the USB-scanner page at
 * /admin/barcode/driver/import. Both call the same `adminBarcodeImportScan`
 * Server Action — the tb_forwarder_import2 UPSERT + tb_forwarder.fstatus='4'
 * auto-flip (port of legacy `include/pages/barcode-import/index.php`).
 *
 * Faithful port of legacy `member/pcs-admin/barcode-c-import.php` (408 LOC).
 * **Workflow stolen from legacy · UI = Pacred Tailwind** per AGENTS.md §0a —
 * chrome matches the approved USB-scanner page. ภูม warehouse-polish 2026-06-12.
 */

import { Link } from "@/i18n/navigation";
import { ScanBarcode } from "lucide-react";
import { requireAdmin } from "@/lib/auth/require-admin";
import { CargoImportScanner } from "./cargo-import-scanner";
import { TopMenuBarcode } from "@/components/admin/top-menu-barcode";

export const dynamic = "force-dynamic";

export default async function BarcodeCargoImportPage() {
  await requireAdmin(["super", "ops", "warehouse", "driver"]);

  return (
    <>
      <TopMenuBarcode activeHref="/admin/barcode/cargo/import" />
      <div className="min-h-screen bg-slate-50">
        <div className="mx-auto max-w-2xl px-4 py-6 sm:py-8">
          <nav className="mb-3 text-sm text-slate-500" aria-label="breadcrumb">
            <Link href="/admin" className="hover:text-primary-700">หน้าแรก</Link>
            <span className="mx-1.5">/</span>
            <span className="text-slate-700">สแกนบาร์โค้ดบันทึกสินค้าถึงโกดังไทยด้วยมือถือ</span>
          </nav>

          <div className="mb-5 flex items-center gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
              <ScanBarcode className="h-7 w-7" aria-hidden="true" />
            </span>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">บันทึกสินค้าถึงโกดังไทย</h1>
              <p className="mt-1 text-sm text-slate-600">ด้วยกล้องมือถือ · ยิงครบจำนวน = อัปเดตถึงไทยอัตโนมัติ</p>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="p-4 sm:p-6">
              <CargoImportScanner />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
