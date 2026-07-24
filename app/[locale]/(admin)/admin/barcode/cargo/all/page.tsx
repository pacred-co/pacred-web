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

export const dynamic = "force-dynamic";

export default async function BarcodeCargoAllPage() {
  await requireAdmin(["super", "ops", "warehouse"]);

  // เพรียว/กะทัดรัด + เอา TopMenuBarcode ออก (ปอน 2026-07-24) — เข้าชุดกับหน้า
  // "ด้วยเครื่องสแกน" (driver/all). legacy barcode-c-all.php ก็ไม่มีแถบแท็บนี้.
  return (
    <>
      <div className="min-h-screen bg-slate-50">
        <div className="mx-auto max-w-2xl px-4 py-3 sm:py-4">
          <nav className="mb-2 text-xs text-slate-500" aria-label="breadcrumb">
            <Link href="/admin" className="hover:text-primary-700">หน้าแรก</Link>
            <span className="mx-1.5">/</span>
            <span className="text-slate-700">สแกนบาร์โค้ดด้วยกล้องมือถือ</span>
          </nav>

          <div className="mb-3 flex items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-600">
              <ScanBarcode className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <h1 className="text-lg font-bold text-slate-900 sm:text-xl">สแกนบาร์โค้ดทั้งหมด</h1>
              <p className="text-xs text-slate-600">ด้วยกล้องมือถือ · ค้นหาได้ทุกสถานะ</p>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="p-3 sm:p-4">
              <CameraScanner gatewayType="all" />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
