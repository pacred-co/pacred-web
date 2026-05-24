/**
 * Zod schemas for cart + service-order placement.
 */

import { z } from "zod";

export const PROVIDERS = ["1688", "taobao", "tmall", "shop", "nice"] as const;
export type Provider = (typeof PROVIDERS)[number];

// ────────────────────────────────────────────────────────────
// LEGACY (D1) — PROMO CODE SCHEMAS
// ────────────────────────────────────────────────────────────
//
// The legacy PCS cart "promo code" UX is misleadingly named in the
// gap-research doc — there is NO `tb_promo_codes` table in the legacy
// MySQL dump. Promos are:
//   1. URL-driven flags (`pro`, `pro2` query string) that the cart page
//      surfaces as buttons (cart.php hardcodes the list).
//   2. Each numeric ID is mapped to a static label + exchange-rate hint
//      in PHP `tagPro($ID)` (member/include/function.php L1289-1374,
//      80 cases). NO discount % / fixed amount is recorded — the discount
//      IS the `rsDefault` override (e.g. promoid=19 → rate 5.10 instead
//      of the live 5.00; promoid='f' → +50฿ shipping = "PCSF" freebie).
//   3. After order submit, `tb_promotion` logs (id, date, promoid, fid,
//      hno) — purely an audit trail of "this header order used promoid X".
//   4. `tb_pro_valentine` (userid, message, date) — Valentine event
//      opt-in (one-shot per user).
//   5. `tb_promotion33` (userid, statuspro 1/2) — 3.3-sale opt-in tracker.
//
// To preserve the 1:1 port contract while letting the new cart UI show
// "Apply promo code" + "Available promos" UX, we:
//   - Keep `tb_promotion` as the post-submit audit log (existing).
//   - Re-purpose `tb_pro_valentine` as the "selected-promo cookie" for
//     the cart session (matches legacy's "opt-in" semantics — one row
//     per user, replaced on re-apply).
//   - Hardcode the promo catalog in `lib/promo/catalog.ts` (mirrors PHP
//     `tagPro()` — the source of truth in legacy was always PHP code,
//     never a DB row).
//
// `promoCodeSchema` accepts a code as the user typed it — the canonical
// form is the legacy numeric promoid OR the prefixed label (e.g. "PR19",
// "PROVAL", "PCSF"). We trim + uppercase + bound length so a bad input
// can't OOM the lookup.
export const promoCodeSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2, { message: "รหัสโปรโมชั่นสั้นเกินไป" })
    .max(32, { message: "รหัสโปรโมชั่นยาวเกินไป" })
    .transform((s) => s.toUpperCase()),
  // The current cart subtotal in THB. Required so validators with a
  // "minimum spend" rule can reject under-the-bar carts.
  // Legacy parity: legacy doesn't enforce min-spend at validate time —
  // it just shows the badge — but the gap-research doc explicitly asks
  // for `cartTotal` as an arg, so we accept it and use it in optional
  // future per-promo rules. Non-negative; "0" still validates the code.
  cartTotal: z
    .number()
    .nonnegative({ message: "ยอดตะกร้าต้องไม่ติดลบ" }),
  // Caller may pass the customer's member_code so per-user once-only
  // promos (Valentine, 3.3) can check the legacy opt-in tables.
  // Optional — undefined disables the per-user gate (anonymous preview).
  userId: z
    .string()
    .trim()
    .max(30)
    .optional(),
});
export type PromoCodeInput = z.infer<typeof promoCodeSchema>;

// applyPromoToCart payload — `promoCode` is the same surface as
// validatePromoCode's `code`. We re-use the same trim/upper transform
// so callers always send the same shape.
export const applyPromoSchema = z.object({
  promoCode: z
    .string()
    .trim()
    .min(2, { message: "รหัสโปรโมชั่นสั้นเกินไป" })
    .max(32, { message: "รหัสโปรโมชั่นยาวเกินไป" })
    .transform((s) => s.toUpperCase()),
});
export type ApplyPromoInput = z.infer<typeof applyPromoSchema>;

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
