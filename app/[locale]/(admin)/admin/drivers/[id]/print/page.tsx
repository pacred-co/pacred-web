/**
 * /admin/drivers/[id]/print — "บิลจัดส่ง" (Delivery Note · คนขับ).
 *
 * ตัวเอกสารทั้งหมดอยู่ที่ `../run-document.tsx` ซึ่งใช้ร่วมกับบิลหาสินค้า
 * (owner 2026-07-23: "ฟอร์มเหมือนกันแบบ 1:1 … แค่หัวต่างกันเฉยๆ") — หน้านี้ทำหน้าที่
 * แค่บอกว่าเป็น variant ไหน. อยากแก้เนื้อเอกสาร → แก้ที่ run-document.tsx ที่เดียว
 * แล้วได้ทั้งสองใบพร้อมกัน.
 */

import type { Metadata } from "next";
import { DriverRunDocument, RUN_DOC_DELIVERY } from "../run-document";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  return { title: `บิลจัดส่ง รอบ #${id}` };
}

export default async function DriverDeliveryNotePrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <DriverRunDocument params={params} variant={RUN_DOC_DELIVERY} />;
}
