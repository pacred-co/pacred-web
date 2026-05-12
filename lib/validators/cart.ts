/**
 * Zod schemas for cart + service-order placement.
 */

import { z } from "zod";

export const PROVIDERS = ["1688", "taobao", "tmall", "shop", "nice"] as const;
export type Provider = (typeof PROVIDERS)[number];

export const cartItemSchema = z.object({
  provider:   z.enum(PROVIDERS).default("shop"),
  shop_name:  z.string().trim().max(300).default("pacred"),
  url:        z.string().trim().max(2000).optional().or(z.literal("").transform(() => undefined)),
  title:      z.string().trim().max(300).optional().or(z.literal("").transform(() => undefined)),
  image_path: z.string().trim().max(500).optional().or(z.literal("").transform(() => undefined)),
  color:      z.string().trim().max(200).optional().or(z.literal("").transform(() => undefined)),
  size:       z.string().trim().max(200).optional().or(z.literal("").transform(() => undefined)),
  price_cny:  z.number().nonnegative({ message: "ราคาต้องไม่ติดลบ" }),
  amount:     z.number().int().positive({ message: "จำนวนต้องมากกว่า 0" }),
  details:    z.string().trim().max(2000).optional().or(z.literal("").transform(() => undefined)),
});
export type CartItemInput = z.infer<typeof cartItemSchema>;

export const placeOrderSchema = z.object({
  cart_item_ids:    z.array(z.string().uuid()).min(1, "เลือกอย่างน้อย 1 รายการ"),
  warehouse_china:  z.enum(["guangzhou", "yiwu"]),
  transport_type:   z.enum(["truck", "ship", "air"]).default("truck"),
  ship_by:          z.string().trim().max(50).optional().or(z.literal("").transform(() => undefined)),
  pay_method:       z.enum(["origin", "destination"]).default("origin"),
  crate:            z.boolean().default(false),

  // Shipping address — required snapshot
  ship_first_name:    z.string().trim().min(1).max(200),
  ship_last_name:     z.string().trim().min(1).max(200),
  ship_phone:         z.string().trim().regex(/^0\d{8,9}$/, "เบอร์โทรต้องขึ้นต้น 0"),
  ship_phone2:        z.string().trim().optional().or(z.literal("").transform(() => undefined)),
  ship_address_line:  z.string().trim().min(1).max(500),
  ship_sub_district:  z.string().trim().min(1).max(255),
  ship_district:      z.string().trim().min(1).max(255),
  ship_province:      z.string().trim().min(1).max(255),
  ship_postal_code:   z.string().trim().regex(/^\d{5}$/, "รหัสไปรษณีย์ 5 หลัก"),
  ship_note:          z.string().trim().max(500).optional().or(z.literal("").transform(() => undefined)),

  note_user:        z.string().trim().max(2000).optional().or(z.literal("").transform(() => undefined)),
});
export type PlaceOrderInput = z.infer<typeof placeOrderSchema>;
