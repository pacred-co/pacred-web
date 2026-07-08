/**
 * /admin/api-forwarder-momo/packing-upload — MOMO packing-list (.xlsx) ingest.
 *
 * MOMO exports a per-container "PACKING LIST" .xlsx when it CLOSES a container (ปิดตู้ =
 * goods shipping to Thailand). Upload it → the server unzips + parses the inline-string
 * sheet (SheetJS can't) → match each Tracking to tb_forwarder → preview the diff
 * (น้ำหนัก/คิว/กล่อง/ตู้) → apply the measurement to NON-BILLED rows, advance สถานะ 1/2→3
 * (กำลังส่งมาไทย), and re-derive the sell price. Gated ops/super/warehouse. Preview-before-apply.
 */

import { requireAdmin } from "@/lib/auth/require-admin";
import { Link } from "@/i18n/navigation";
import { MomoPackingUploadClient } from "./packing-upload-client";

export const dynamic = "force-dynamic";

export default async function MomoPackingUploadPage() {
  await requireAdmin(["ops", "super", "warehouse"]);

  return (
    <main className="p-4 lg:p-8 space-y-5">
      <nav className="flex items-center gap-1.5 text-xs text-muted">
        <Link href="/admin" className="hover:text-primary-600">Admin</Link>
        <span>›</span>
        <Link href="/admin/api-forwarder-momo" className="hover:text-primary-600">MOMO</Link>
        <span>›</span>
        <span className="text-foreground font-medium">อัปโหลด packing list (ปิดตู้)</span>
      </nav>

      <header>
        <p className="text-xs font-semibold tracking-widest text-primary-600">ADMIN · MOMO · PACKING LIST</p>
        <h1 className="mt-1 text-2xl font-bold">อัปโหลด packing list ปิดตู้ (MOMO .xlsx)</h1>
        <p className="mt-1.5 text-sm text-muted">
          เมื่อ MOMO <strong>ปิดตู้</strong> (ของกำลังส่งมาไทย) จะส่งไฟล์ <strong>PACKING LIST (.xlsx)</strong> ต่อหนึ่งตู้มาให้ —
          <strong>โยนไฟล์เข้ามาได้เลย</strong> ระบบจะอ่านไฟล์ (แตกไฟล์ + อ่านเอง · SheetJS อ่านไฟล์นี้ไม่ได้) →
          แสดงตาราง Excel ให้ตรวจ → จับคู่ตามเลขแทรคกิ้ง → เทียบ <strong>น้ำหนัก/คิว/กล่อง/เลขตู้</strong> กับระบบ +
          แจ้ง <strong>แทรคตกหล่น (🔴 มีในไฟล์แต่ระบบไม่พบ)</strong> → ให้ตรวจก่อนบันทึก. เมื่อบันทึก จะอัปเดตเฉพาะรายการ
          ที่ <strong>ยังไม่วางบิล</strong> · เลื่อนสถานะ <strong>1/2 → 3 (กำลังส่งมาไทย)</strong> · แล้ว
          <strong>คิดราคาขายใหม่อัตโนมัติ</strong> จากค่าที่อัปเดต. รายการที่วางบิลแล้วจะถูกข้าม (แสดง ⚠ ให้ตรวจเอง).
        </p>
      </header>

      <MomoPackingUploadClient />
    </main>
  );
}
