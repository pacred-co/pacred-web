/**
 * /admin/barcode/cargo/from — สแกนบาร์โค้ดพิมพ์จากหน้ากล่องด้วยมือถือ
 *
 * Faithful port of legacy `member/pcs-admin/barcode-c-from.php`: mobile-camera
 * scanner that decodes a box-face barcode then redirects to
 * `/admin/barcode/gateway?type=from&device=mobile&tracking=<code>`.
 *
 * **Workflow stolen from legacy · UI = Pacred Tailwind** per AGENTS.md §0a.
 * Legacy gave this page a red (text-danger) heading to set it apart from the
 * "all" page — we preserve that cue with a red icon badge. ภูม polish 2026-06-12.
 */

import { Link } from "@/i18n/navigation";
import { ScanBarcode } from "lucide-react";
import { requireAdmin } from "@/lib/auth/require-admin";
import { CameraScanner } from "@/components/admin/camera-scanner";
import { TopMenuBarcode } from "@/components/admin/top-menu-barcode";

export const dynamic = "force-dynamic";

export default async function BarcodeCargoFromPage() {
  await requireAdmin(["super", "ops", "warehouse"]);

  return (
    <>
      <TopMenuBarcode activeHref="/admin/barcode/cargo/from" />
      <div className="min-h-screen bg-slate-50">
        <div className="mx-auto max-w-2xl px-4 py-6 sm:py-8">
          <nav className="mb-3 text-sm text-slate-500" aria-label="breadcrumb">
            <Link href="/admin" className="hover:text-primary-700">หน้าแรก</Link>
            <span className="mx-1.5">/</span>
            <span className="text-slate-700">สแกนบาร์โค้ดพิมพ์จากหน้ากล่องด้วยมือถือ</span>
          </nav>

          <div className="mb-5 flex items-center gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-red-50 text-red-600">
              <ScanBarcode className="h-7 w-7" aria-hidden="true" />
            </span>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">สแกนบาร์โค้ดจากหน้ากล่อง</h1>
              <p className="mt-1 text-sm text-slate-600">ด้วยกล้องมือถือ · บาร์โค้ดที่พิมพ์ติดหน้ากล่อง</p>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="p-4 sm:p-6">
              <CameraScanner gatewayType="from" />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
