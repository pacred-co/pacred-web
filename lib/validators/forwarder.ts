/**
 * Zod schemas for the forwarder (service-import) submission flow.
 *
 * V-E5 hardening (2026-05-25): every numeric input goes through the
 * `safe-numeric.ts` helpers — bounded ranges + explicit int32-overflow
 * rejection. Legacy Excel ingestion produced `-2_146_826_xxx` values; this
 * is the validator gate that stops them at the door.
 */

import { z } from "zod";
import { safeDecimalQty, safeQty, safeThbAmount } from "./safe-numeric";

const thaiPhone = z
  .string()
  .trim()
  .regex(/^0\d{8,9}$/, "เบอร์โทรต้องขึ้นต้น 0 และมี 9-10 หลัก");

const thaiPostal = z.string().trim().regex(/^\d{5}$/, "รหัสไปรษณีย์ต้องเป็นตัวเลข 5 หลัก");

// V-E5 — dimensions in cm are real-world bounded (no shipment > 10m on a side).
const safeDimCm = safeDecimalQty;
const safeWeightKg = safeDecimalQty;

export const forwarderItemSchema = z.object({
  product_name:        z.string().trim().min(1, "กรุณาระบุชื่อสินค้า").max(255),
  product_tracking:    z.string().trim().max(255).optional().or(z.literal("").transform(() => undefined)),
  product_qty:         safeQty.refine((n) => n >= 1, { message: "จำนวนต้องไม่น้อยกว่า 1" }),
  width_cm:            safeDimCm.optional(),
  length_cm:           safeDimCm.optional(),
  height_cm:           safeDimCm.optional(),
  weight_per_item_kg:  safeWeightKg.optional(),
  product_type_code:   z.string().trim().max(5).optional().or(z.literal("").transform(() => undefined)),
});
export type ForwarderItemInput = z.infer<typeof forwarderItemSchema>;

export const forwarderSchema = z.object({
  // classification
  source_warehouse: z.enum(["guangzhou", "yiwu"], { message: "เลือกโกดังต้นทาง" }),
  transport_type:   z.enum(["truck", "ship", "air"], { message: "เลือกการขนส่ง" }),
  product_type:     z.enum(["general", "tisi", "fda", "special"], { message: "เลือกประเภทสินค้า" }),
  rate_basis:       z.enum(["kg", "cbm", "auto"]).default("auto"),
  ship_by:          z.string().trim().max(50).optional().or(z.literal("").transform(() => undefined)),
  pay_method:       z.enum(["origin", "destination"]).default("origin"),

  // shipping address (required snapshot)
  ship_first_name:    z.string().trim().min(1).max(200),
  ship_last_name:     z.string().trim().min(1).max(200),
  ship_phone:         thaiPhone,
  ship_phone2:        thaiPhone.optional().or(z.literal("").transform(() => undefined)),
  ship_address_line:  z.string().trim().min(1).max(500),
  ship_sub_district:  z.string().trim().min(1).max(255),
  ship_district:      z.string().trim().min(1).max(255),
  ship_province:      z.string().trim().min(1).max(255),
  ship_postal_code:   thaiPostal,
  ship_note:          z.string().trim().max(500).optional().or(z.literal("").transform(() => undefined)),

  // measurements — V-E5 bounded + int32-overflow rejected
  box_count:  safeQty.refine((n) => n >= 1, { message: "box_count ต้องไม่น้อยกว่า 1" }).default(1),
  weight_kg:  safeWeightKg,
  width_cm:   safeDimCm,
  length_cm:  safeDimCm,
  height_cm:  safeDimCm,

  // optional services — V-E5 THB caps + int32-overflow rejected
  crate:                 z.boolean().default(false),
  qc:                    z.boolean().default(false),
  domestic_china_thb:    safeThbAmount.default(0),
  thailand_delivery_thb: safeThbAmount.default(0),
  other_price:           safeThbAmount.default(0),
  other_price_desc:      z.string().trim().max(255).optional().or(z.literal("").transform(() => undefined)),

  // user-attached files (Storage paths)
  cover_image_path:    z.string().optional(),
  extra_image_paths:   z.array(z.string()).default([]),

  // free-form
  detail:    z.string().trim().max(5000).optional().or(z.literal("").transform(() => undefined)),
  note_user: z.string().trim().max(2000).optional().or(z.literal("").transform(() => undefined)),

  // optional line items
  items:     z.array(forwarderItemSchema).default([]),
});
export type ForwarderInput = z.infer<typeof forwarderSchema>;
