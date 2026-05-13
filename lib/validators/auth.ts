/**
 * Zod schemas for auth-related forms.
 * Reuse on both client-side preflight + server-side validation in Server Actions.
 */

import { z } from "zod";

export const passwordSchema = z
  .string()
  .min(6, "รหัสผ่านขั้นต่ำ 6 ตัวอักษร")
  .max(30, "รหัสผ่านยาวสุด 30 ตัวอักษร");

export const phoneSchema = z
  .string()
  .min(8, "เบอร์โทรไม่ถูกต้อง")
  .max(20);

export const signInSchema = z.object({
  identifier: z.string().min(3, "กรุณาระบุอีเมล/รหัสสมาชิก/เบอร์โทร"),
  password: z.string().min(1, "กรุณากรอกรหัสผ่าน"),
});
export type SignInInput = z.infer<typeof signInSchema>;

const SERVICE_IDS = [
  "import",
  "export",
  "clear",
  "customs",
  "order",
  "payment",
] as const;
export const serviceIdSchema = z.enum(SERVICE_IDS);

export const registerPersonalSchema = z.object({
  firstName: z.string().min(1, "กรอกชื่อ"),
  lastName: z.string().min(1, "กรอกนามสกุล"),
  phone: phoneSchema,
  password: passwordSchema,
  services: z.array(serviceIdSchema).default([]),
  howKnow: z.string().optional().nullable(),
  email: z.email("อีเมลไม่ถูกต้อง").optional().or(z.literal("")),
  otp: z.string().min(1, "กรอก OTP"),
  agreed: z
    .boolean()
    .refine((v) => v === true, "ต้องยอมรับข้อกำหนด"),
});
export type RegisterPersonalInput = z.infer<typeof registerPersonalSchema>;

export const registerJuristicStep1Schema = z.object({
  phone: phoneSchema,
  password: passwordSchema,
  services: z.array(serviceIdSchema).default([]),
  howKnow: z.string().optional().nullable(),
  otp: z.string().min(1, "กรอก OTP"),
});
export type RegisterJuristicStep1Input = z.infer<
  typeof registerJuristicStep1Schema
>;

export const juristicStep2Schema = z.object({
  taxId: z.string().regex(/^\d{13}$/, "เลขประจำตัวผู้เสียภาษีต้อง 13 หลัก"),
  companyName: z.string().min(1, "กรอกชื่อบริษัท"),
  addressLine: z.string().min(1, "กรอกที่อยู่"),
  subdistrict: z.string().optional().nullable(),
  district: z.string().optional().nullable(),
  province: z.string().optional().nullable(),
  postcode: z
    .string()
    .regex(/^\d{5}$/, "รหัสไปรษณีย์ต้อง 5 หลัก")
    .optional()
    .or(z.literal("")),
});
export type JuristicStep2Input = z.infer<typeof juristicStep2Schema>;

export const requestOtpSchema = z.object({
  phone: phoneSchema,
  purpose: z.enum(["register", "login", "reset"]),
});
export type RequestOtpInput = z.infer<typeof requestOtpSchema>;

// ── password reset (P-2) ──
export const resetByPhoneSchema = z.object({
  phone: phoneSchema,
});
export type ResetByPhoneInput = z.infer<typeof resetByPhoneSchema>;

export const confirmResetByPhoneSchema = z.object({
  phone:    phoneSchema,
  otp:      z.string().min(1, "กรอก OTP"),
  password: passwordSchema,
});
export type ConfirmResetByPhoneInput = z.infer<typeof confirmResetByPhoneSchema>;

export const resetByEmailSchema = z.object({
  email: z.email("อีเมลไม่ถูกต้อง"),
});
export type ResetByEmailInput = z.infer<typeof resetByEmailSchema>;

export const updatePasswordSchema = z.object({
  password: passwordSchema,
});
export type UpdatePasswordInput = z.infer<typeof updatePasswordSchema>;
