import { redirect } from "next/navigation";

/**
 * Wave 29 #5 (2026-05-30 · Agent A) — orphan stub tombstone.
 *
 * This page previously rendered a "driver hub" view that read the same
 * abandoned REBUILT `forwarders` table (English-enum schema). Like the
 * sibling `/admin/barcode/page.tsx`, it always showed near-zero counts
 * because admin entry now writes to `tb_forwarder`.
 *
 * The legacy axis is **camera (`barcode-c-*.php`) vs USB scanner
 * (`barcode-d-*.php`)** — NOT cargo vs driver as our route naming
 * implied. The four real driver-side scanner pages already live at
 * `/admin/barcode/driver/{all,from,import,prepare}` and serve actual
 * USB-scanner workflows. This hub above them is the obsolete bit.
 *
 * Redirect to the daily-most-used intake page (legacy
 * `barcode-d-import.php`). Live incoming references — `forwarders` top
 * menubar "บาร์โค้ด → driver", prior sidebar `driver.barcode` leaf
 * (replaced this commit) — all still land somewhere live.
 *
 * Full axis-rename refactor (cargo → camera, driver → device) is
 * tracked as a Wave 30 TODO at top of `blockBarcode` in
 * `lib/admin/sidebar-menu.ts`.
 */
export default function AdminBarcodeDriverOrphanRedirect() {
  redirect("/admin/barcode/driver/import");
}
