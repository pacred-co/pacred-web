/**
 * momo-invoice-upload-stamp.ts — ประทับ "ใบนี้บันทึกต้นทุนไปแล้ว" ลงแถวประวัติ (mig 0283).
 *
 * แยกออกมาเป็น helper ตัวเดียวเพราะมี **2 ทางเรียก** และต้องประทับเหมือนกันเสมอ:
 *   1) `applyMomoInvoiceCost` (actions/admin/momo-invoice-ingest.ts) — ประทับให้เองฝั่ง server
 *      ทันทีที่บันทึกต้นทุนสำเร็จ (เสถียรกว่ารอ client ยิงตาม)
 *   2) `markMomoInvoiceUploadApplied` (actions/admin/momo-invoice-history.ts) — ทางที่ client
 *      เรียกได้ (มี role gate + audit log)
 * ถ้าเขียนแยกกัน 2 ที่ วันหนึ่งจะ drift → ที่นี่คือที่เดียว. (ไฟล์นี้ไม่ใช่ "use server" จึงถูก
 * import ได้จากทั้ง 2 action file โดยไม่เกิด circular import.)
 *
 * 🔴 กติกา: ประทับด้วย **id ของแถวนั้น** เท่านั้น. ฝั่งแพคกิ้งลิสมีบั๊กอยู่ตอนนี้ — มัน UPDATE
 *    ด้วย `container_no` โดยไม่มี order/limit → กด apply ครั้งเดียว แถวประวัติของตู้นั้น
 *    **ทุกไฟล์ที่เคยอัพ** กลายเป็น "ใช้แล้ว" หมด (ประวัติโกหก). ที่นี่จะไม่ทำซ้ำความผิดนั้น.
 *
 * ไม่แตะเงินเลย (เขียนแค่ applied_at/status บนตาราง reference) · best-effort: พังแล้ว
 * คืน false เฉยๆ ไม่ throw — การบันทึกต้นทุนที่สำเร็จไปแล้วต้องไม่ล้มเพราะประวัติ.
 */

import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/** ชื่อตารางประวัติการอัพใบวางบิล MOMO (mig 0283) — ที่เดียวที่สะกดชื่อนี้. */
export const MOMO_INVOICE_UPLOAD_TABLE = "momo_invoice_upload";

/**
 * ประทับว่าแถวประวัติ `uploadId` ถูกนำไปบันทึกต้นทุนแล้ว.
 *
 * idempotent: `applied_at is null` อยู่ใน WHERE → กดบันทึกซ้ำจะไม่ขยับเวลาเดิม
 * (เวลาที่ประทับครั้งแรก = ความจริงที่บัญชีต้องเห็น) · คืน true เมื่อประทับจริงในรอบนี้.
 */
export async function stampMomoInvoiceUploadApplied(uploadId: number): Promise<boolean> {
  if (!Number.isInteger(uploadId) || uploadId <= 0) return false;
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from(MOMO_INVOICE_UPLOAD_TABLE)
      .update({ applied_at: new Date().toISOString(), status: "applied" })
      .eq("id", uploadId) // 🔴 id-scoped เท่านั้น (ดูหัวไฟล์)
      .is("applied_at", null)
      .select("id");
    if (error) {
      console.error("[momo-invoice-upload-stamp] update failed", {
        uploadId,
        code: error.code,
        message: error.message,
      });
      return false;
    }
    return (data ?? []).length > 0;
  } catch (e) {
    console.error("[momo-invoice-upload-stamp] threw", { uploadId, error: String(e) });
    return false;
  }
}
