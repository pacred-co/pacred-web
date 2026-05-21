/**
 * /admin/rates/custom-hs — Custom rate overrides per customer + HS code (Phase A pending).
 *
 * Wave 7.2 (2026-05-21 night): the previous page queried + mutated the
 * rebuilt `rate_custom_hs` table (empty on prod). The backing legacy
 * tables (`tb_priceuser_member`, `tb_priceuser_hs`) have NOT been
 * migrated to Supabase yet — only the base rate defaults in
 * `tb_settings` are on prod.
 *
 * Until Phase A backfills the price tables, the page banners "ยังไม่มี
 * ข้อมูล" so accounting doesn't try to add overrides into a table no
 * other surface reads → would silently break per-HS pricing.
 *
 * Status: Phase A migration backlog item · tracked in
 * docs/runbook/pcs-data-migration.md.
 */

import { requireAdmin } from "@/lib/auth/require-admin";
import { Link } from "@/i18n/navigation";

export const dynamic = "force-dynamic";

export default async function CustomHsRatesPage() {
  await requireAdmin(["accounting"]);

  return (
    <main className="p-6 lg:p-8 space-y-5 max-w-3xl">
      <div>
        <p className="text-xs font-semibold tracking-widest text-primary-500">
          ADMIN · RATES · Custom-HS
        </p>
        <h1 className="mt-1 text-2xl font-bold">Rate Override ต่อลูกค้า × HS code</h1>
      </div>

      <div className="rounded-2xl border border-yellow-200 bg-yellow-50 p-5 space-y-3 text-sm">
        <p className="font-medium text-yellow-900">
          ตาราง <code className="rounded bg-yellow-100 px-1.5 py-0.5">tb_priceuser_hs</code>{" "}
          ยังไม่ถูกย้ายจาก legacy MySQL → Supabase (Phase A migration backlog)
        </p>
        <p className="text-yellow-800">
          ข้อมูล custom rate ต่อลูกค้า + HS code (per-product overrides สำหรับสินค้าพิเศษ
          เช่น แบตเตอรี่ / สารเคมี) ยังอยู่ที่ legacy DB · การคำนวณราคาขนส่งปัจจุบันใช้
          default rates จาก{" "}
          <code className="rounded bg-yellow-100 px-1.5 py-0.5">tb_settings</code>{" "}
          เท่านั้น · custom HS overrides จะกลับมาทำงานเมื่อ migration Phase A เสร็จ
        </p>
        <p className="text-yellow-800 font-medium">วิธีดู / แก้ไข custom HS rate ชั่วคราว:</p>
        <ol className="list-decimal pl-6 text-yellow-800 space-y-1">
          <li>
            ใช้ legacy PHP admin (
            <code className="rounded bg-yellow-100 px-1.5 py-0.5">
              pcs-admin/rate-custom-hs.php
            </code>
            ) สำหรับเพิ่ม / แก้ไข custom HS rate
          </li>
          <li>
            ดู rate default ปัจจุบัน:{" "}
            <Link
              href="/admin/rates/general"
              className="font-medium text-yellow-900 underline"
            >
              /admin/rates/general
            </Link>
          </li>
        </ol>
      </div>

      <div className="flex gap-2 flex-wrap">
        <Link
          href="/admin"
          className="rounded-md border border-border bg-white px-3 py-2 text-xs hover:bg-surface-alt"
        >
          ← Dashboard
        </Link>
        <Link
          href="/admin/rates"
          className="rounded-md border border-primary-500 bg-primary-500 px-3 py-2 text-xs text-white hover:bg-primary-600"
        >
          กลับหน้า rates →
        </Link>
      </div>
    </main>
  );
}
