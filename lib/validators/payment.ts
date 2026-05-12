/**
 * Zod schema for Yuan transfer (service-payment) requests.
 */

import { z } from "zod";

export const yuanPaymentSchema = z.object({
  channel:          z.enum(["alipay", "wechat", "bank"], {
    message: "กรุณาเลือกช่องทาง",
  }),
  recipient_detail: z
    .string()
    .trim()
    .min(5, "กรุณาระบุข้อมูลผู้รับ (บัญชี / ชื่อ / ข้อความ)")
    .max(2000),
  yuan_amount:      z
    .number({ message: "กรุณากรอกจำนวนหยวน" })
    .positive("จำนวนต้องมากกว่า 0")
    .max(1_000_000, "เกินวงเงิน"),
  exchange_rate:    z
    .number({ message: "ไม่มีเรทแลกเปลี่ยน" })
    .positive("เรทต้องมากกว่า 0"),
  paid_via_wallet:  z.boolean().optional(),
  slip_url:         z.string().optional(),
  id_doc_url:       z.string().optional(),
});
export type YuanPaymentInput = z.infer<typeof yuanPaymentSchema>;
