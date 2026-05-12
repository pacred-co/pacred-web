/**
 * Zod schemas for profile + juristic corporate forms.
 * Used in both /profile edit form and /complete-profile flow.
 */

import { z } from "zod";

// ── basic atoms ──
const thaiPhone = z
  .string()
  .trim()
  .regex(/^0\d{8,9}$/, "เบอร์โทรต้องขึ้นต้น 0 และมี 9-10 หลัก");

const taxIdSchema = z
  .string()
  .trim()
  .regex(/^\d{13}$/, "เลขประจำตัวผู้เสียภาษีต้องเป็นตัวเลข 13 หลัก");

const optionalText = (max = 200) =>
  z.string().trim().max(max).optional().or(z.literal("").transform(() => undefined));

// ── shared profile (personal + juristic) ──
export const profileBasicSchema = z.object({
  first_name: z.string().trim().min(1, "กรุณากรอกชื่อ").max(200),
  last_name:  z.string().trim().min(1, "กรุณากรอกนามสกุล").max(200),
  phone:      thaiPhone,
  email:      z.string().trim().email("รูปแบบอีเมลไม่ถูกต้อง").max(100).optional().or(z.literal("").transform(() => undefined)),

  sex:        z.enum(["male", "female", "other"]).optional(),
  birthday:   z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "รูปแบบวันเกิดต้องเป็น YYYY-MM-DD")
    .optional()
    .or(z.literal("").transform(() => undefined)),

  line_id:      optionalText(50),
  facebook_url: optionalText(255),

  // shipping prefs (used by service-import in Phase D)
  freight_type:   z.enum(["seafreight", "cargo"]).optional(),
  pay_method:     z.enum(["origin", "destination"]).optional(),
  transport_type: optionalText(10),
  ship_by:        optionalText(20),

  shop_user:      z.boolean().optional(),

  note: optionalText(2000),
});
export type ProfileBasicInput = z.infer<typeof profileBasicSchema>;

// ── corporate (juristic only) ──
export const corporateSchema = z.object({
  tax_id:          taxIdSchema,
  company_name:    z.string().trim().min(1, "กรุณากรอกชื่อบริษัท").max(300),
  company_address: z.string().trim().min(1, "กรุณากรอกที่อยู่บริษัท").max(1000),
});
export type CorporateInput = z.infer<typeof corporateSchema>;

// ── notification preferences ──
export const notifyChannelsSchema = z.object({
  line:  z.boolean(),
  email: z.boolean(),
});
export type NotifyChannels = z.infer<typeof notifyChannelsSchema>;
