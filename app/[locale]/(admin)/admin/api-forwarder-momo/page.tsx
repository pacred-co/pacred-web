/**
 * /admin/api-forwarder-momo — RETIRED card-hub → redirect to the ONE workspace.
 *
 * ── 2026-07-20 (owner: "ยุบทุกหน้า MOMO ให้เหลือแค่หน้าที่เราทำกันอยู่ — หน้า api
 *    กับหน้าแพคกิ้งลิส · ไอแต้มไม่มีแล้ว · กระจายจนจะอัพจะทำงานหาไม่เจอ") ──
 * หน้านี้เคยเป็น card-hub 10+ การ์ด (review/drift/live/discovery/missing/manual/
 * warehouse-reconcile/…) = the ยุบยับ. ทุก workflow ถูกยุบเข้า:
 *   - /admin/momo-containers            — ตรวจตู้ (sync + pending/committed + Live
 *     merge + commit + missing-parcel + ตู้⊃กระสอบ⊃ชิปเม้น tier)
 *   - /admin/api-forwarder-momo/packing-upload — แพคกิ้งลิสจาก MOMO
 * ที่ยังมีหน้าที่เฉพาะ (ลิงก์จาก hub/ที่อื่นตรง ๆ): /sync (ปุ่มบน hub) ·
 * /manual (เพิ่มงานเอง) · /invoice-cost (บัญชีจ่ายต้นทุนตู้ — คนละ lane).
 */
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function RetiredMomoCardHub() {
  redirect("/admin/momo-containers");
}
