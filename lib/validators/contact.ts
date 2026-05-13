/**
 * Zod schema for the public contact form (P-6).
 */

import { z } from "zod";

export const contactMessageSchema = z.object({
  name:    z.string().trim().min(1, "กรุณากรอกชื่อ").max(200),
  contact: z.string().trim().min(3, "กรุณากรอกอีเมลหรือเบอร์โทร").max(200),
  subject: z.string().trim().max(200).optional().or(z.literal("").transform(() => undefined)),
  message: z.string().trim().min(5, "ข้อความสั้นเกินไป").max(4000, "ข้อความยาวเกิน 4000 ตัวอักษร"),
});
export type ContactMessageInput = z.infer<typeof contactMessageSchema>;
