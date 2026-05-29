import { redirect } from "next/navigation";

/**
 * Wave 29 #5 (2026-05-30 · Agent A) — orphan stub tombstone.
 *
 * This page previously rendered a "scan-form" hub that counted from the
 * REBUILT `forwarders` table (English-enum schema). After Phase A data
 * migration that table is near-empty on prod — admin entry goes to
 * `tb_forwarder` via Wave 12-C. The page kept showing 0/0/0 cards while
 * the real intake screen lives at `/admin/barcode/driver/import` (USB
 * scanner) and `/admin/barcode/cargo/import` (mobile camera).
 *
 * Per audit `docs/research/legacy-accounting-reality-2026-05-30.md` §4 and
 * the Wave 29 #5 brief: redirect to the USB-scanner intake page (the
 * daily-most-used flow). Incoming live references — `forwarders` top
 * menubar "บาร์โค้ด → ทั้งหมด", `barcode/gateway/page.tsx` error fallback,
 * `inventory/page.tsx` redirect chain, `actions/admin/barcode.ts`
 * `revalidatePath` cache invalidation — all still land somewhere live.
 *
 * Phase-access entry (`lib/admin/phase-access.ts` line 86) intentionally
 * left in place: the route still exists, it just hops to intake.
 */
export default function AdminBarcodeOrphanRedirect() {
  redirect("/admin/barcode/driver/import");
}
