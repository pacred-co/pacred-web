/**
 * Zod schemas for sales-team payout requests.
 */

import { z } from "zod";

export const requestPayoutSchema = z.object({
  commission_ids: z.array(z.string().uuid()).min(1, "เลือกอย่างน้อย 1 รายการ"),
  bank_name:      z.string().trim().min(1, "กรุณาเลือกธนาคาร").max(100),
  account_name:   z.string().trim().min(1, "กรุณากรอกชื่อบัญชี").max(200),
  account_number: z.string().trim().regex(/^[\d-]{8,20}$/, "เลขบัญชีไม่ถูกต้อง"),
  note:           z.string().trim().max(500).optional().or(z.literal("").transform(() => undefined)),
});
export type RequestPayoutInput = z.infer<typeof requestPayoutSchema>;
