/**
 * Zod schemas for wallet (deposit / withdraw) forms.
 */

import { z } from "zod";

const moneyBaht = z
  .number({ message: "กรุณากรอกจำนวนเงิน" })
  .positive("จำนวนเงินต้องมากกว่า 0")
  .max(1_000_000, "จำนวนเงินสูงสุด 1,000,000 บาท");

export const depositSchema = z.object({
  amount:        moneyBaht,
  slip_url:      z.string().min(1, "กรุณาแนบสลิป").optional(),
  slip_date:     z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}/, "รูปแบบวันที่ไม่ถูกต้อง")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  bank_name:     z.string().trim().max(100).optional().or(z.literal("").transform(() => undefined)),
  note:          z.string().trim().max(500).optional().or(z.literal("").transform(() => undefined)),
});
export type DepositInput = z.infer<typeof depositSchema>;

export const withdrawSchema = z.object({
  amount:         moneyBaht,
  bank_name:      z.string().trim().min(1, "กรุณาเลือกธนาคาร").max(100),
  account_name:   z.string().trim().min(1, "กรุณากรอกชื่อบัญชี").max(200),
  account_number: z
    .string()
    .trim()
    .regex(/^[\d-]{8,20}$/, "เลขบัญชีไม่ถูกต้อง"),
  note:           z.string().trim().max(500).optional().or(z.literal("").transform(() => undefined)),
});
export type WithdrawInput = z.infer<typeof withdrawSchema>;
