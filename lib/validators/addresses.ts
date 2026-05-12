/**
 * Zod schema for the addresses CRUD UI under /(protected)/addresses.
 */

import { z } from "zod";

const thaiPhone = z
  .string()
  .trim()
  .regex(/^0\d{8,9}$/, "เบอร์โทรต้องขึ้นต้น 0 และมี 9-10 หลัก");

const thaiPostal = z.string().trim().regex(/^\d{5}$/, "รหัสไปรษณีย์ต้องเป็นตัวเลข 5 หลัก");

export const addressSchema = z.object({
  first_name:    z.string().trim().min(1, "กรุณากรอกชื่อ").max(200),
  last_name:     z.string().trim().min(1, "กรุณากรอกนามสกุล").max(200),
  phone:         thaiPhone,
  phone2:        thaiPhone.optional().or(z.literal("").transform(() => undefined)),
  address_line:  z.string().trim().min(1, "กรุณากรอกบ้านเลขที่ / ถนน").max(500),
  sub_district:  z.string().trim().min(1, "กรุณากรอกตำบล/แขวง").max(255),
  district:      z.string().trim().min(1, "กรุณากรอกอำเภอ/เขต").max(255),
  province:      z.string().trim().min(1, "กรุณากรอกจังหวัด").max(255),
  postal_code:   thaiPostal,
  note:          z.string().trim().max(500).optional().or(z.literal("").transform(() => undefined)),
  latitude:      z.number().min(-90).max(90).optional(),
  longitude:     z.number().min(-180).max(180).optional(),
  is_default:    z.boolean().optional(),
});
export type AddressInput = z.infer<typeof addressSchema>;
