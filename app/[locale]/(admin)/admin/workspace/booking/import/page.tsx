/**
 * /admin/workspace/booking/import — "สถานะ Booking · นำเข้า"
 *
 * 2026-07-08 (ปอน) — the import Booking status board. Mirrors the legacy
 * "ส่งสอบถามราคา PRICING" Google-Sheet (the quotation-request log): Sales ขอราคา →
 * Pricing ทำใบเสนอราคา → รอลูกค้าเฟิร์ม → สำเร็จ (เปิดงาน → หน้ารายการ) / ไม่สำเร็จ.
 *
 * Data = SEED_IMPORT_BOOKINGS (sample derived from that sheet · NOT yet a DB table —
 * ปอน is finalizing the model). When the real table/action lands, replace the seed
 * with a server query here; <BookingImportBoard> consumes the same Booking[] shape.
 * See memory: pacred-booking-flow.
 *
 * currentSales (owner 2026-07-08 "sales = user ที่ล็อกอิน · ไม่ต้องเลือก") — the
 * logged-in staffer becomes the Sales on any booking THEY create; the add form
 * shows it auto (locked), no manual entry.
 */
import { requireAdmin } from "@/lib/auth/require-admin";
import { PageHeader } from "@/components/admin/page-header";
import { BookingImportBoard } from "./booking-import-board";
import { SEED_IMPORT_BOOKINGS } from "./booking-data";

export const dynamic = "force-dynamic";

export default async function WorkspaceBookingImportPage() {
  await requireAdmin();

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="WORKSPACE · BOOKING"
        title="สถานะ Booking · นำเข้า"
        subtitle="ลูปใบเสนอราคา → จอง งานนำเข้า — ลูกค้าสร้าง → Pricing เคาะราคา Net → ลูกค้าคอนเฟิร์ม → รอ/คอนเฟิร์ม Booking → สำเร็จ (เปิดงานเข้า “รายการ”)"
        badges={
          <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-medium text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
            ตัวอย่างข้อมูล · รอเชื่อมฐานข้อมูลจริง
          </span>
        }
      />
      <BookingImportBoard initial={SEED_IMPORT_BOOKINGS} />
    </div>
  );
}
