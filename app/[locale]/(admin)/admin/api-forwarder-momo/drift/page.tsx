/**
 * /admin/api-forwarder-momo/drift — RETIRED → redirect.
 *
 * ── 2026-07-20 (owner: "ยุบทุกหน้า MOMO ให้เหลือ hub ตรวจตู้ + แพคกิ้งลิส ·
 *    ไอแต้มไม่มีแล้ว มีแต่แพคกิ้งลิสจาก MOMO · กระจายจนหาไม่เจอ") ──
 * เครื่องมือของหน้านี้ถูกยุบเข้า hub แล้ว: /admin/momo-containers (ตรวจตู้ —
 * sync + pending/committed + Live merge + commit) และ
 * /admin/api-forwarder-momo/packing-upload (แพคกิ้งลิสจาก MOMO — sole writer
 * ของ container_packing_reconcile). ตาราง taem_* (iTAM เดิม) คงอยู่ใน DB เป็น
 * ประวัติ — ไม่มี live writer แล้ว. Redirect กันลิงก์เก่า/bookmark ตาย.
 */
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function Retired() {
  redirect("/admin/momo-containers");
}
