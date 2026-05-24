/**
 * Zod schemas for auth-related forms.
 * Reuse on both client-side preflight + server-side validation in Server Actions.
 */

import { z } from "zod";

export const passwordSchema = z
  .string()
  .min(6, "รหัสผ่านขั้นต่ำ 6 ตัวอักษร")
  .max(30, "รหัสผ่านยาวสุด 30 ตัวอักษร");

/**
 * hCaptcha token from `<HCaptchaInvisible>` widget — optional because
 * dev (no site key) has the widget render null and execute() returns null.
 * Server's `verifyHcaptcha` is also a no-op when secret unset.
 */
export const captchaTokenField = z.string().optional().nullable();

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
  "customs",
  "order",
  "payment",
] as const;
export const serviceIdSchema = z.enum(SERVICE_IDS);

export const registerPersonalSchema = z.object({
  // 2026-05-22 — relaxed signup validation per sales-urgent ask:
  // name + surname ≥ 2 chars · phone ≥ 9 chars. OTP is bypassed in
  // `actions/otp.ts` (EMERGENCY_OTP_BYPASS) — `otp` field still required
  // by the schema but the UI passes the "bypass" sentinel + the server
  // skips verification.
  firstName: z.string().min(2, "ชื่อขั้นต่ำ 2 ตัวอักษร"),
  lastName:  z.string().min(2, "นามสกุลขั้นต่ำ 2 ตัวอักษร"),
  phone:     z.string().min(9, "เบอร์โทรขั้นต่ำ 9 ตัวอักษร").max(20),
  password: passwordSchema,
  services: z.array(serviceIdSchema).default([]),
  howKnow: z.string().optional().nullable(),
  email: z.email("อีเมลไม่ถูกต้อง").optional().or(z.literal("")),
  otp: z.string().min(1, "กรอก OTP"),
  agreed: z
    .boolean()
    .refine((v) => v === true, "ต้องยอมรับข้อกำหนด"),
  captchaToken: captchaTokenField,
});
export type RegisterPersonalInput = z.infer<typeof registerPersonalSchema>;

export const registerJuristicStep1Schema = z.object({
  phone: phoneSchema,
  password: passwordSchema,
  services: z.array(serviceIdSchema).default([]),
  howKnow: z.string().optional().nullable(),
  otp: z.string().min(1, "กรอก OTP"),
  captchaToken: captchaTokenField,
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
  phone:        phoneSchema,
  captchaToken: captchaTokenField,
});
export type ResetByPhoneInput = z.infer<typeof resetByPhoneSchema>;

export const confirmResetByPhoneSchema = z.object({
  phone:    phoneSchema,
  otp:      z.string().min(1, "กรอก OTP"),
  password: passwordSchema,
});
export type ConfirmResetByPhoneInput = z.infer<typeof confirmResetByPhoneSchema>;

export const resetByEmailSchema = z.object({
  email:        z.email("อีเมลไม่ถูกต้อง"),
  captchaToken: captchaTokenField,
});
export type ResetByEmailInput = z.infer<typeof resetByEmailSchema>;

export const updatePasswordSchema = z.object({
  password: passwordSchema,
});
export type UpdatePasswordInput = z.infer<typeof updatePasswordSchema>;

// ── availability checks (G2 — register/profile pre-flight) ──
// Legacy: member/include/pages/register/{checkEmailUser,checkTelUser}.php
//       + member/include/pages/profile/{checkEmailUser,checkTelUser}.php
// Both took the raw user-typed value and (in the profile-edit case) excluded
// the signed-in user's own row so editing your own profile didn't trip the
// "taken" warning. We mirror that contract here with explicit Zod schemas
// so the server actions get type-safe inputs + the same shape can be
// reused by client-side pre-flight if we want it later.

export const checkEmailAvailabilitySchema = z.object({
  email:         z.email("อีเมลไม่ถูกต้อง").max(100),
  currentUserId: z.uuid().optional().nullable(),
});
export type CheckEmailAvailabilityInput = z.infer<typeof checkEmailAvailabilitySchema>;

export const checkPhoneAvailabilitySchema = z.object({
  // Loose bounds — `normalizePhone()` in the action turns whatever the user
  // typed into E.164 before any lookup. The Zod check just guards against
  // obvious garbage (empty / 1000-char DoS payload).
  phone:         z.string().min(8, "เบอร์โทรไม่ถูกต้อง").max(20),
  currentUserId: z.uuid().optional().nullable(),
});
export type CheckPhoneAvailabilityInput = z.infer<typeof checkPhoneAvailabilitySchema>;
