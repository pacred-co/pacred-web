/**
 * /admin/workspace/list/import/[shipment] — "ใบบุ๊คกิ้ง" (booking document) detail.
 *
 * 2026-07-08 (ปอน · พี่ป๊อป brief) — click a shipment in รายการ → open its ใบบุ๊คกิ้ง:
 *   หัว = สถานะ + timeline · กลาง = กรอก/แก้ข้อมูลงาน · ล่าง = การกระทำ (แนบรูปหลักฐาน →
 *   ระบบลงวันที่+ผู้ทำ อัตโนมัติ → สถานะเลื่อนขั้นเอง · ไม่ต้องพิมพ์/ต่อเมล).
 *
 * Data = SEED_IMPORT_LIST lookup (NOT DB yet — prototype). userName = the logged-in staffer
 * (stamped as ผู้ทำ on each milestone). See memory: pacred-booking-flow.
 */
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { getCurrentUserWithProfile } from "@/lib/auth/get-user";
import { SEED_IMPORT_LIST } from "../list-data";
import { BookingDocClient } from "./booking-doc-client";

export const dynamic = "force-dynamic";

export default async function BookingDocPage({ params }: { params: Promise<{ shipment: string }> }) {
  await requireAdmin();
  const { shipment } = await params;
  const item = SEED_IMPORT_LIST.find((r) => r.shipment === decodeURIComponent(shipment));
  if (!item) notFound();

  const withProfile = await getCurrentUserWithProfile();
  const p = withProfile?.profile ?? null;
  const userName =
    [p?.first_name, p?.last_name].filter(Boolean).join(" ").trim() || p?.member_code || "ผู้ใช้";

  return <BookingDocClient item={item} userName={userName} />;
}
