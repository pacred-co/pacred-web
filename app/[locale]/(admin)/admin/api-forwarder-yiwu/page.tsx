/**
 * /admin/api-forwarder-yiwu — อี้อู (Yiwu) ใบส่งของ → box-split arrival rows.
 *
 * อี้อู warehouse has NO API (unlike MOMO). When goods land at the China warehouse
 * it sends a ใบส่งของ (delivery-note) IMAGE. Staff upload it here → OCR-assisted
 * review grid → commit → box-split tb_forwarder rows at "ถึงโกดังจีน" (fstatus 2,
 * fwarehousechina 2 = อี้อู rate card). The packing-list upload (Phase later) then
 * assigns the real container + advances to "กำลังส่งมาไทย".
 *
 * ภูม 2026-07-16 · Phase 3.
 */

import { requireAdmin } from "@/lib/auth/require-admin";
import { Link } from "@/i18n/navigation";
import { PageTopMenubar, type MenubarItem } from "@/components/admin/page-top-menubar";
import { YiwuDeliveryClient } from "./yiwu-client";
import { YiwuPackingClient } from "./yiwu-packing-client";

export const dynamic = "force-dynamic";

const CARRIER_MENUBAR: MenubarItem[] = [
  { label: "MOMO", href: "/admin/api-forwarder-momo" },
  { label: "อี้อู (ใบส่งของ)", href: "/admin/api-forwarder-yiwu" },
  { label: "CargoCenter", href: "/admin/api-forwarder-cn" },
];

export default async function AdminApiForwarderYiwuPage() {
  await requireAdmin(["super", "ops", "warehouse", "accounting"]);

  return (
    <main className="p-4 lg:p-8 space-y-5">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs text-muted">
        <Link href="/admin" className="hover:text-primary-600">Admin</Link>
        <span>›</span>
        <Link href="/admin/forwarders" className="hover:text-primary-600">ฝากนำเข้า</Link>
        <span>›</span>
        <span className="text-foreground font-medium">อี้อู · ใบส่งของ</span>
      </nav>

      {/* Header */}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-600">
            ADMIN · อี้อู (YIWU) · ใบส่งของ
          </p>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-teal-600 text-white shadow-sm">义</span>
            อี้อู — อ่านใบส่งของ เข้าระบบ
          </h1>
          <p className="mt-1.5 text-sm text-muted">
            โกดังอี้อูไม่มี API — อัปโหลด <strong>รูปใบส่งของ</strong> ที่โกดังจีนส่งมา →
            ตรวจ/แก้ข้อมูล → กด <strong className="text-emerald-700">เอาเข้าระบบ</strong> →
            ได้สถานะ <strong>ถึงโกดังจีนแล้ว</strong> (แตกกล่องตามขนาดจริงให้อัตโนมัติ).
          </p>
        </div>
      </header>

      <PageTopMenubar items={CARRIER_MENUBAR} activeHref="/admin/api-forwarder-yiwu" />

      {/* How-it-works banner */}
      <div className="rounded-2xl border border-teal-200 bg-teal-50 p-4 text-xs leading-relaxed text-teal-900">
        <strong>ขั้นตอน:</strong>{" "}
        <span className="font-medium">1)</span> อัปรูปใบส่งของ ·{" "}
        <span className="font-medium">2)</span> กด “อ่านรูป (OCR)” ให้ระบบเติมให้ก่อน (จะพลาดบ้าง — แก้ได้) ·{" "}
        <span className="font-medium">3)</span> ตรวจ 单号 / รหัสลูกค้า (PR) / ทุกกล่อง ·{" "}
        <span className="font-medium">4)</span> กด “เอาเข้าระบบ”. ยังไม่กด = ยังไม่เข้าระบบ.
        <br />
        <span className="text-teal-700">
          เงินคิดจากขนาด/น้ำหนักที่กรอก (ระบบตั้งราคาให้เองตามเรทอี้อู) — ยังไม่วางบิล.
          เลขตู้จริง + สถานะ “กำลังส่งมาไทย” จะมาตอนอัปไฟล์ packing list.
        </span>
      </div>

      <YiwuDeliveryClient />

      {/* divider between the two uploads */}
      <div className="flex items-center gap-3 pt-2">
        <div className="h-px flex-1 bg-gray-200" />
        <span className="text-[11px] font-medium tracking-widest text-muted">แล้วเมื่อได้ PACKING LIST</span>
        <div className="h-px flex-1 bg-gray-200" />
      </div>

      <YiwuPackingClient />
    </main>
  );
}
