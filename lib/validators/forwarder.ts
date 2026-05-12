/**
 * Zod schemas for the forwarder (service-import) submission flow.
 */

import { z } from "zod";

const thaiPhone = z
  .string()
  .trim()
  .regex(/^0\d{8,9}$/, "เบอร์โทรต้องขึ้นต้น 0 และมี 9-10 หลัก");

const thaiPostal = z.string().trim().regex(/^\d{5}$/, "รหัสไปรษณีย์ต้องเป็นตัวเลข 5 หลัก");

export const forwarderItemSchema = z.object({
  product_name:        z.string().trim().min(1, "กรุณาระบุชื่อสินค้า").max(255),
  product_tracking:    z.string().trim().max(255).optional().or(z.literal("").transform(() => undefined)),
  product_qty:         z.number().int().min(1, "จำนวนต้องไม่น้อยกว่า 1"),
  width_cm:            z.number().nonnegative().optional(),
  length_cm:           z.number().nonnegative().optional(),
  height_cm:           z.number().nonnegative().optional(),
  weight_per_item_kg:  z.number().nonnegative().optional(),
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

  // measurements
  box_count:  z.number().int().min(1).default(1),
  weight_kg:  z.number().nonnegative(),
  width_cm:   z.number().nonnegative(),
  length_cm:  z.number().nonnegative(),
  height_cm:  z.number().nonnegative(),

  // optional services
  crate:                 z.boolean().default(false),
  qc:                    z.boolean().default(false),
  domestic_china_thb:    z.number().nonnegative().default(0),
  thailand_delivery_thb: z.number().nonnegative().default(0),
  other_price:           z.number().nonnegative().default(0),
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
