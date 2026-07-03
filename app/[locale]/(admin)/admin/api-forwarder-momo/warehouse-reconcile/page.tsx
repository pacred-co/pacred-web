/**
 * /admin/api-forwarder-momo/warehouse-reconcile — แต้ม (ไอแต้ม) ground-truth reconcile.
 *
 * Paste แต้ม's "MOMO Pacred" sheet → match each tracking to tb_forwarder → preview the
 * diff (container · transport · box · weight · volume) → apply the authoritative values
 * to NON-BILLED rows and re-derive the sell price. The owner's rule (2026-06-19):
 * แต้ม's side is the correct/sure data. Gated ops/super/warehouse. Preview-before-apply.
 */

import { requireAdmin } from "@/lib/auth/require-admin";
import { Link } from "@/i18n/navigation";
import { TaemReconcileClient } from "./warehouse-reconcile-client";

export const dynamic = "force-dynamic";

export default async function TaemReconcilePage() {
  await requireAdmin(["ops", "super", "warehouse"]);

  return (
    <main className="p-4 lg:p-8 space-y-5">
      <nav className="flex items-center gap-1.5 text-xs text-muted">
        <Link href="/admin" className="hover:text-primary-600">Admin</Link>
        <span>›</span>
        <Link href="/admin/api-forwarder-momo" className="hover:text-primary-600">MOMO</Link>
        <span>›</span>
        <span className="text-foreground font-medium">เทียบข้อมูลกับแต้ม</span>
      </nav>

      <header>
        <p className="text-xs font-semibold tracking-widest text-primary-600">ADMIN · MOMO · แต้ม RECONCILE</p>
        <h1 className="mt-1 text-2xl font-bold">อัปเดตข้อมูลให้ตรงกับฝั่งแต้ม</h1>
        <p className="mt-1.5 text-sm text-muted">
          ฝั่งแต้มคือ <strong>ข้อมูลที่ถูกต้องที่ชัวร์</strong> (ตู้ · ขนส่ง · จำนวนกล่อง · น้ำหนักรวม ·
          ปริมาตรรวม). <strong>อัปโหลดไฟล์ .xlsx</strong> (packing list ชีต &quot;Shipment Report&quot;) หรือคัดลอกแถว
          จากชีตแล้ววาง → ระบบจะแสดงตาราง Excel ให้ตรวจ + จับคู่ตามเลขแทรคกิ้ง → แสดงส่วนต่าง +
          <strong>แจ้งเตือนแทรคตกหล่น (🔴 มีในไฟล์แต่ระบบไม่พบ) และสถานะค้าง (📦 มีตู้แล้วแต่ยังไม่ขยับ)</strong> →
          แก้ค่าได้เอง → ให้ตรวจก่อนบันทึก. เมื่อบันทึก จะอัปเดตเฉพาะรายการที่ <strong>ยังไม่วางบิล</strong> แล้ว
          <strong>คิดราคาขายใหม่อัตโนมัติ</strong> จากค่าที่อัปเดต. รายการที่วางบิลแล้วจะถูกข้าม (แสดง ⚠ ให้ตรวจเอง).
        </p>
      </header>

      <TaemReconcileClient />
    </main>
  );
}
