/**
 * Zod schemas for security-sensitive actions (password change, phone change).
 */

import { z } from "zod";
import { passwordSchema, phoneSchema } from "./auth";

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "กรุณากรอกรหัสผ่านปัจจุบัน"),
    newPassword:     passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "รหัสผ่านยืนยันไม่ตรงกัน",
    path: ["confirmPassword"],
  })
  .refine((d) => d.newPassword !== d.currentPassword, {
    message: "รหัสผ่านใหม่ต้องไม่เหมือนรหัสเดิม",
    path: ["newPassword"],
  });
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

// ── P-3: phone change (atomic auth + profile) ──
// Step 1 — verify identity (password) + reserve new phone + send OTP
export const requestPhoneChangeSchema = z.object({
  currentPassword: z.string().min(1, "กรุณากรอกรหัสผ่านปัจจุบัน"),
  newPhone:        phoneSchema,
});
export type RequestPhoneChangeInput = z.infer<typeof requestPhoneChangeSchema>;

// Step 2 — submit OTP → atomic update of auth.users.phone + profiles.phone
export const confirmPhoneChangeSchema = z.object({
  newPhone: phoneSchema,
  otp:      z.string().min(1, "กรอก OTP"),
});
export type ConfirmPhoneChangeInput = z.infer<typeof confirmPhoneChangeSchema>;
