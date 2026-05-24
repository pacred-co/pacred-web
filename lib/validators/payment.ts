/**
 * Zod schema for Yuan transfer (service-payment) requests.
 *
 * V-E5 hardening (2026-05-25): exchange_rate is now bounded — the legacy
 * Excel sheets in cargo-ops-forensics §3.5 carried int32-overflow garbage
 * for currency rates; this gate stops them at the door.
 */

import { z } from "zod";
import { isInt32OverflowSuspect } from "./safe-numeric";

/** CNY→THB rate: real-world ~5.0; tight floor/ceiling protects from typos. */
const CNY_RATE_MIN = 1;
const CNY_RATE_MAX = 100;

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
    .refine((n) => !isInt32OverflowSuspect(n), {
      message: "int32_overflow_suspected — กรุณาตรวจค่าตัวเลขที่กรอก",
    })
    .refine((n) => n > 0,         { message: "จำนวนต้องมากกว่า 0" })
    .refine((n) => n <= 1_000_000, { message: "เกินวงเงิน" }),
  exchange_rate:    z
    .number({ message: "ไม่มีเรทแลกเปลี่ยน" })
    .refine((n) => !isInt32OverflowSuspect(n), {
      message: "int32_overflow_suspected — กรุณาตรวจค่าเรทแลกเปลี่ยน",
    })
    .refine(
      (n) => n >= CNY_RATE_MIN && n <= CNY_RATE_MAX,
      { message: `เรทแลกเปลี่ยน CNY→THB อยู่นอกช่วงที่อนุญาต (${CNY_RATE_MIN}-${CNY_RATE_MAX})` },
    ),
  paid_via_wallet:  z.boolean().optional(),
  slip_url:         z.string().optional(),
  id_doc_url:       z.string().optional(),
});
export type YuanPaymentInput = z.infer<typeof yuanPaymentSchema>;
