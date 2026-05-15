import { BulkSearchForm } from "./bulk-search-form";
import { Link } from "@/i18n/navigation";

/**
 * /admin/forwarders/bulk-search — bulk tracking lookup (U2-5).
 *
 * Per chat audit W-9: staff paste a batch of tracking numbers (one per
 * line) from suppliers / WeChat / carriers and want to know which
 * Pacred forwarder each belongs to. Legacy was
 * `forwarder-search-muti.php?fTracking=xxxx%0D%0Ayyyy`.
 *
 * Action: `adminBulkTrackingSearch` does 3 parallel queries:
 *   forwarders.tracking_chn
 *   forwarders.tracking_th
 *   forwarder_items.product_tracking
 *
 * Renders results table grouped by input tracking + unmatched section.
 *
 * Page is a server component → renders the client BulkSearchForm
 * which calls the action + manages local state for results display.
 */

export default function BulkSearchPage() {
  return (
    <main className="p-6 lg:p-8 space-y-5 max-w-5xl">
      <div>
        <p className="text-xs font-semibold tracking-widest text-primary-500">ADMIN · ปฏิบัติการ</p>
        <h1 className="mt-1 text-2xl font-bold">ค้นหา tracking หลายเลข (Bulk Search)</h1>
        <p className="mt-1 text-sm text-muted">
          วาง tracking number หลายเลข (แยกบรรทัดละเลข, comma หรือ spaces ได้)
          → ระบบจะหาให้ว่าตรงกับ forwarder ไหน · ใช้สำหรับ batch ingest จากซัพพลายเออร์ / WeChat / โกดัง.
          จำกัด 200 เลขต่อครั้ง.
        </p>
        <p className="mt-1 text-xs text-muted">
          ค้นจาก: <code>forwarders.tracking_chn</code> · <code>forwarders.tracking_th</code> · <code>forwarder_items.product_tracking</code>
        </p>
        <div className="mt-2">
          <Link href="/admin/forwarders" className="text-xs text-primary-500 hover:underline">
            ← กลับหน้ารายการ forwarder
          </Link>
        </div>
      </div>

      <BulkSearchForm />
    </main>
  );
}
