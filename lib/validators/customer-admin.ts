/**
 * Zod schemas for the admin-side customer CRUD (staff-CRUD gap · §PM-6 #3.3):
 *   - adminCreateCustomerSchema — admin creates a customer WITHOUT
 *     self-register/OTP (actions/admin/customer-admin.ts → adminCreateCustomer).
 *   - hardDeleteCustomerSchema  — super-admin HARD-delete of a truly-empty
 *     (0-activity) account (actions/admin/customer-admin.ts →
 *     adminHardDeleteCustomer).
 *
 * Kept in a PLAIN module (NOT a `"use server"` file) so these non-async value
 * exports compile + are importable from both the server action and the client
 * form for shared preflight — a `"use server"` file may only export async
 * functions (CLAUDE_TECHNICAL §"use server" · margin-monitor 2026-06-02).
 *
 * Reuses passwordSchema (≥6 chars) from the auth validators so an admin-set
 * password obeys the same floor as a self-register one.
 */

import { z } from "zod";
import { passwordSchema } from "./auth";

/**
 * adminCreateCustomer input. Mirrors the faithful self-register field set
 * (name · phone · optional email · juristic flag) minus OTP/captcha (the admin
 * is trusted — no SMS round-trip). The password is admin-chosen; when blank the
 * action auto-generates one and reveals it once (like the reset-pwd flow).
 *
 * `company` (optional) — when present the customer is seeded juristic:
 * tb_users.userCompany='1' + a tb_corporate row (taxId 13-digit required then).
 */
export const adminCreateCustomerSchema = z
  .object({
    firstName: z.string().trim().min(1, "กรอกชื่อ").max(100),
    lastName: z.string().trim().min(1, "กรอกนามสกุล").max(100),
    // Accept the loose local form (0XXXXXXXXX / +66…) — normalizePhone in the
    // action canonicalises to E.164 before any write. min 8 mirrors phoneSchema.
    phone: z.string().trim().min(8, "เบอร์โทรไม่ถูกต้อง").max(20),
    email: z
      .string()
      .trim()
      .email("อีเมลไม่ถูกต้อง")
      .max(150)
      .optional()
      .or(z.literal("")),
    // Blank → auto-generate (revealed once). Non-blank → must clear the floor.
    password: passwordSchema.optional().or(z.literal("")),
    isJuristic: z.boolean().default(false),
    // Company fields — REQUIRED only when isJuristic (superRefine below).
    companyName: z.string().trim().max(200).optional().or(z.literal("")),
    taxId: z.string().trim().max(20).optional().or(z.literal("")),
    companyAddress: z.string().trim().max(500).optional().or(z.literal("")),
  })
  .superRefine((d, ctx) => {
    if (d.isJuristic) {
      if (!d.companyName || d.companyName.trim().length === 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["companyName"], message: "กรอกชื่อบริษัท" });
      }
      // Legacy juristic tax id = 13 digits (juristicStep2Schema).
      if (!d.taxId || !/^\d{13}$/.test(d.taxId.trim())) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["taxId"], message: "เลขประจำตัวผู้เสียภาษีต้อง 13 หลัก" });
      }
    }
  });

export type AdminCreateCustomerInput = z.infer<typeof adminCreateCustomerSchema>;

export type AdminCreateCustomerData = {
  /** The minted member code (`PR<n>`). */
  memberCode: string;
  /** Cleartext password — shown ONCE so the admin can relay it to the customer. */
  password: string;
  /** True when the password was auto-generated (vs admin-chosen). */
  generated: boolean;
};

/**
 * adminHardDeleteCustomer input — DESTRUCTIVE. The `confirm` field must equal
 * the customer's member code (typed by the admin) so a stray click can't fire:
 * the action re-checks `confirm === user_id` server-side too (double-confirm).
 */
export const hardDeleteCustomerSchema = z
  .object({
    user_id: z.string().trim().min(1).max(20),
    /** Must match user_id — the admin types the PR-code to confirm. */
    confirm: z.string().trim().min(1).max(20),
  })
  .refine((d) => d.confirm.toUpperCase() === d.user_id.toUpperCase(), {
    path: ["confirm"],
    message: "รหัสยืนยันไม่ตรงกับรหัสสมาชิก",
  });

export type HardDeleteCustomerInput = z.infer<typeof hardDeleteCustomerSchema>;
