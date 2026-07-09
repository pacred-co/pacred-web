/**
 * /admin/workspace/booking/import/[orderNo] — ฟอร์มสร้าง/ดู ใบเสนอราคา (Quotation).
 *
 * 2026-07-09 (ปอน) — ทั้ง "เพิ่ม Quotation/Booking" (orderNo = "new") และ "ดูข้อมูล"
 *   (orderNo = เลข booking เดิม) เข้าหน้านี้เหมือนกัน = ฟอร์มสร้างใบเสนอราคา.
 *   Data = SEED_IMPORT_BOOKINGS lookup (prototype · ยังไม่ต่อ DB — booking ที่เพิ่งเพิ่มบนบอร์ด
 *   [client-state] จะยังหาไม่เจอ). See memory: pacred-booking-flow.
 */
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { getCurrentUserWithProfile } from "@/lib/auth/get-user";
import { SEED_IMPORT_BOOKINGS } from "../booking-data";
import { QuotationFormClient } from "./quotation-form-client";

export const dynamic = "force-dynamic";

export default async function BookingImportQuotationPage({
  params,
}: {
  params: Promise<{ orderNo: string }>;
}) {
  await requireAdmin();
  const { orderNo } = await params;
  const key = decodeURIComponent(orderNo);
  const isNew = key === "new";
  const booking = isNew ? null : SEED_IMPORT_BOOKINGS.find((x) => x.orderNo === key) ?? null;
  if (!isNew && !booking) notFound();

  const withProfile = await getCurrentUserWithProfile();
  const p = withProfile?.profile ?? null;
  const salesName =
    [p?.first_name, p?.last_name].filter(Boolean).join(" ").trim() || p?.member_code || "Sales Pacred";

  const docNo = isNew ? "QO-ใหม่ (ยังไม่บันทึก)" : `QO-${key}`;

  return <QuotationFormClient booking={booking} isNew={isNew} docNo={docNo} salesName={salesName} />;
}
