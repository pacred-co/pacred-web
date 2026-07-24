/**
 * /admin/service-orders/notes — retired 2026-07-24 (ปอน · owner directive).
 *
 * เดิมหน้านี้เป็นตารางหมายเหตุแบบเรียบ ( port ของ forwarder-action.php?action=NoteShop
 * แต่ตัด รูปสินค้า/badge/สถานะ icon/ปุ่มพิมพ์ ออก). owner: "ดึงหน้ารายการเต็มของ PCS
 * มาใช้เลย ทั้งฝากสั่ง+นำเข้า" → หมายเหตุ = ตารางฝากสั่งหลัก (rich list · รูป+badge+
 * สถานะ+ปุ่มดูรายละเอียด/พิมพ์ใบแจ้งหนี้) กรองด้วย ?filter=note.
 *
 * เก็บ route ไว้เป็น redirect เพื่อกัน bookmark/ลิงก์เก่าพัง (consolidate → redirect ·
 * แนวเดียวกับที่ยุบ /admin/tax-invoices → /admin/accounting/etax).
 */
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ServiceOrderNotesRedirect({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const sp = await searchParams;
  // คง status filter เดิมถ้ามี (เลข legacy 1..6) เพื่อไม่ให้ลิงก์เก่าที่พก ?status= มาเสียความหมาย
  const status = sp.status ? `&q=${encodeURIComponent(sp.status)}` : "";
  redirect(`/admin/service-orders?filter=note${status}`);
}
