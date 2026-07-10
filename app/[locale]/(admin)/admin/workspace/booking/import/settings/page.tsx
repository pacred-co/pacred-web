/**
 * /admin/workspace/booking/import/settings — "ตั้งค่าเรท" (Booking pricing catalog).
 *
 * 2026-07-10 (ปอน · owner brief) — Pricing ตั้ง/แก้ "เรทตั้งต้น" ต่อเงื่อนไข (Term × ขนส่ง ×
 *   LCL/FCL) เอง — sale + cost + profit — เก็บเป็น DATA (Supabase booking_pricing_catalog)
 *   → หน้าใบเสนอราคา (Condition Builder) ดึงชุด line-item ไปใช้อัตโนมัติ.
 *
 * gate = canViewCost (Pricing/Ultra/Accounting) — หน้านี้โชว์ต้นทุน/กำไร จึงจำกัดเฉพาะ
 *   role ที่เห็น money internals. role อื่น → 404.
 */
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { canViewCost } from "@/lib/admin/money-visibility";
import { PageHeader } from "@/components/admin/page-header";
import { Link } from "@/i18n/navigation";
import { ArrowLeft } from "lucide-react";
import { loadBookingCatalog } from "@/actions/admin/booking-catalog";
import { BookingCatalogSettings } from "./booking-catalog-settings";

export const dynamic = "force-dynamic";

export default async function BookingCatalogSettingsPage() {
  const { roles } = await requireAdmin();
  if (!canViewCost(roles)) notFound();

  const { templates, persisted } = await loadBookingCatalog();

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <PageHeader
          eyebrow="WORKSPACE · BOOKING · นำเข้า"
          title="ตั้งค่าเรท (Pricing) — ใบเสนอราคานำเข้า"
          subtitle="ตั้ง/แก้เรทตั้งต้นต่อเงื่อนไข (Term × ขนส่ง × LCL/FCL) — ราคาขาย + ต้นทุน + กำไร · ใบเสนอราคาจะดึงชุดนี้ไปใช้อัตโนมัติ"
        />
        <Link href="/admin/workspace/booking/import" className="inline-flex items-center gap-1 text-sm text-muted transition-colors hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> กลับหน้า Booking
        </Link>
      </div>
      <BookingCatalogSettings templates={templates} persisted={persisted} />
    </div>
  );
}
