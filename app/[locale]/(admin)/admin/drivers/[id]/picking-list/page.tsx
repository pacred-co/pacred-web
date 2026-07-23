/**
 * /admin/drivers/[id]/picking-list — "บิลหาสินค้า" (Picking List · คลัง).
 *
 * 🔴 owner 2026-07-23: "เอาบิลหาสินค้าทำให้เหมือนบิลจัดส่งเลย … เหมือนกันเลย แค่หัว
 * ต่างกันเฉยๆ" → หน้านี้ render เอกสารตัวเดียวกับบิลจัดส่ง (`../run-document.tsx`)
 * เปลี่ยนแค่ชื่อ/ป้ายผ่าน variant.
 *
 * ⚠️ ของเดิมที่ถูกถอดออกไปพร้อมกับการรวมนี้ (owner รับทราบก่อนตัดสินใจแล้ว):
 * ช่องติ๊กหยิบของ · รูปสินค้า · การจัดกลุ่มตามตำแหน่งจัดเก็บ (A1…) + แถวรวมต่อตำแหน่ง
 * · บรรทัด "เรียงตามตำแหน่งจัดเก็บ". ถ้าวันหนึ่งคลังอยากได้คืน = เพิ่ม field ใน
 * RunDocVariant (เช่น showPickColumns) แล้วเปิดเฉพาะใบนี้ ไม่ต้อง fork ไฟล์กลับมาอีก.
 */

import type { Metadata } from "next";
import { DriverRunDocument, RUN_DOC_PICKING } from "../run-document";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  return { title: `บิลหาสินค้า รอบ #${id}` };
}

export default async function DriverPickingListPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <DriverRunDocument params={params} variant={RUN_DOC_PICKING} />;
}
