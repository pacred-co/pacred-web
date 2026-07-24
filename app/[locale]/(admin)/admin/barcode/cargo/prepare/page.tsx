/**
 * /admin/barcode/cargo/prepare — สแกนบาร์โค้ดรายการเตรียมส่งด้วยกล้อง
 *
 * Faithful port of legacy `member/pcs-admin/barcode-c-prepare.php` (409 LOC):
 * mobile-camera scanner for the "เตรียมส่ง" stage → redirects to
 * `/admin/barcode/gateway?type=6&device=mobile&tracking=<code>` (gateway type
 * "6", barcode-c-prepare.php L401).
 *
 * **Workflow stolen from legacy · UI = Pacred Tailwind** per AGENTS.md §0a —
 * chrome matches the approved USB-scanner page (driver/import). The legacy
 * Bootstrap-4 `.app-content`/`.card`/`la la-barcode` scaffold is gone.
 * ภูม warehouse-polish 2026-06-12.
 */

import { Link } from "@/i18n/navigation";
import { ScanBarcode } from "lucide-react";
import { requireAdmin } from "@/lib/auth/require-admin";
import { CameraScanner } from "@/components/admin/camera-scanner";
import { TopMenuBarcode } from "@/components/admin/top-menu-barcode";

export const dynamic = "force-dynamic";

export default async function BarcodeCargoPreparePage() {
  await requireAdmin(["super", "ops", "warehouse", "driver"]);

  return (
    <>
      <TopMenuBarcode activeHref="/admin/barcode/cargo/prepare" />
      <div className="min-h-screen bg-slate-50">
        <div className="mx-auto max-w-2xl px-4 py-6 sm:py-8">
          <nav className="mb-3 text-sm text-slate-500" aria-label="breadcrumb">
            <Link href="/admin" className="hover:text-primary-700">หน้าแรก</Link>
            <span className="mx-1.5">/</span>
            <span className="text-slate-700">สแกนบาร์โค้ดรายการเตรียมส่งด้วยกล้อง</span>
          </nav>

          <div className="mb-5 flex items-center gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
              <ScanBarcode className="h-7 w-7" aria-hidden="true" />
            </span>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">สแกนรายการเตรียมส่ง</h1>
              <p className="mt-1 text-sm text-slate-600">ด้วยกล้องมือถือ · สถานะ &quot;เตรียมส่ง&quot;</p>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="p-4 sm:p-6">
              <CameraScanner gatewayType="6" />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
