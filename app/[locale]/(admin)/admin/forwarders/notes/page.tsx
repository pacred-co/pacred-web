/**
 * /admin/forwarders/notes — retired 2026-07-24 (ปอน · owner directive).
 *
 * เดิมเป็นตารางหมายเหตุนำเข้าแบบเรียบ (port ของ forwarder-action.php?action=Note
 * แต่ตัดรายละเอียดออก). owner: "ดึงหน้ารายการเต็มของ PCS มาใช้เลย ทั้งฝากสั่ง+นำเข้า"
 * → หมายเหตุนำเข้า = ตารางนำเข้าหลัก (rich list · รูป/badge/สถานะ/ปุ่มพิมพ์) กรองด้วย
 * ?filter=note. เก็บ route ไว้เป็น redirect กัน bookmark/ลิงก์เก่าพัง.
 */
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ForwarderNotesRedirect({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const sp = await searchParams;
  // คง status filter เดิมถ้ามี (ตารางหลักรับ ?status= อยู่แล้ว จึงส่งต่อตรงๆ).
  const status = sp.status ? `&status=${encodeURIComponent(sp.status)}` : "";
  redirect(`/admin/forwarders?filter=note${status}`);
}
