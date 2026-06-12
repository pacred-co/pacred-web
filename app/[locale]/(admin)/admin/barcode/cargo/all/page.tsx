/**
 * /admin/barcode/cargo/all — สแกนบาร์โค้ดรายการทั้งหมดด้วยมือถือ
 *
 * Faithful port of legacy `member/pcs-admin/barcode-c-all.php` (409 LOC):
 * mobile-camera barcode scanner that decodes a tracking number then redirects
 * to `/admin/barcode/gateway?type=all&device=mobile&tracking=<code>` (same shape
 * as legacy `gateway.php?type=all`, barcode-c-all.php L401).
 *
 * **Workflow stolen from legacy · UI = Pacred Tailwind** per AGENTS.md §0a.
 * Chrome matches the approved USB-scanner page (driver/import) — the legacy
 * Bootstrap-4 `.app-content`/`.card`/`la la-barcode` scaffold is gone.
 * ภูม warehouse-polish 2026-06-12.
 */

import { Link } from "@/i18n/navigation";
import { ScanBarcode } from "lucide-react";
import { requireAdmin } from "@/lib/auth/require-admin";
import { CameraScanner } from "@/components/admin/camera-scanner";
import { TopMenuBarcode } from "@/components/admin/top-menu-barcode";

export const dynamic = "force-dynamic";

export default async function BarcodeCargoAllPage() {
  await requireAdmin(["super", "ops", "warehouse"]);

  return (
    <>
      <TopMenuBarcode activeHref="/admin/barcode/cargo/all" />
      <div className="min-h-screen bg-slate-50">
        <div className="mx-auto max-w-2xl px-4 py-6 sm:py-8">
          <nav className="mb-3 text-sm text-slate-500" aria-label="breadcrumb">
            <Link href="/admin" className="hover:text-primary-700">หน้าแรก</Link>
            <span className="mx-1.5">/</span>
            <span className="text-slate-700">สแกนบาร์โค้ดรายการทั้งหมดด้วยมือถือ</span>
          </nav>

          <div className="mb-5 flex items-center gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary-50 text-primary-600">
              <ScanBarcode className="h-7 w-7" aria-hidden="true" />
            </span>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">สแกนบาร์โค้ดทั้งหมด</h1>
              <p className="mt-1 text-sm text-slate-600">ด้วยกล้องมือถือ · ค้นหาได้ทุกสถานะ</p>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="p-4 sm:p-6">
              <CameraScanner gatewayType="all" />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
