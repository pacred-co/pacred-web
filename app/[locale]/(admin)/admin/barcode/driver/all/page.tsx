import { Link } from "@/i18n/navigation";
import { ScanLine } from "lucide-react";
import { requireAdmin } from "@/lib/auth/require-admin";
import { ScannerInput } from "@/components/admin/scanner-input";

/**
 * Admin > สแกนทั้งหมด (เครื่องสแกน) — workflow ported 1:1 from the legacy
 * PCS Cargo admin `pcs-admin/barcode-d-all.php` (USB-handheld-scanner form,
 * no camera) per D1 / ADR-0017. **UI = Pacred Tailwind** per AGENTS.md §0a —
 * the legacy Bootstrap-4 `.app-content`/`.card`/admin-base.css scaffold is
 * gone; chrome now matches the cargo camera-scanner pages.
 *
 * The form auto-focuses, then on Enter (USB reader emits keystrokes + `\r`)
 * redirects to `/admin/barcode/gateway?type=all&device=scanner&tracking=…`.
 * That logic lives in the shared `<ScannerInput>` island.
 *
 * Auth — legacy gate is implicit (any logged-in admin); narrowed to the
 * warehouse/driver/ops/super parcel-handling roles. ภูม warehouse-polish.
 */

export const dynamic = "force-dynamic";

export default async function BarcodeDriverAllPage() {
  await requireAdmin(["super", "ops", "warehouse", "driver"]);

  return (
    <>
      {/* กะทัดรัด/เพรียว (ปอน 2026-07-24) — ดันขึ้น: py เล็กลง · หัวข้อ+ไอคอนเล็กลง
          · ระยะห่างแคบลง. ให้ช่องสแกนอยู่สูง มือถือเห็นครบในหน้าเดียวไม่ต้องเลื่อน. */}
      <div className="min-h-screen bg-slate-50">
        <div className="mx-auto max-w-2xl px-4 py-3 sm:py-4">
          <nav className="mb-2 text-xs text-slate-500" aria-label="breadcrumb">
            <Link href="/admin" className="hover:text-primary-700">หน้าแรก</Link>
            <span className="mx-1.5">/</span>
            <span className="text-slate-700">สแกนทั้งหมด (เครื่องสแกน)</span>
          </nav>

          <div className="mb-3 flex items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-600">
              <ScanLine className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <h1 className="text-lg font-bold text-slate-900 sm:text-xl">สแกนทั้งหมด</h1>
              <p className="text-xs text-slate-600">ด้วยเครื่องสแกน USB · ค้นหาได้ทุกสถานะ</p>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="p-3 sm:p-4">
              <ScannerInput type="all" />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
