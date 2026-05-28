/**
 * Zod schemas for admin-side cart mutations — the CS-staff-shops-on-
 * behalf-of-a-customer flow (legacy `pcs-admin/cart.php` mutations).
 *
 * Fields mirror the ported `tb_cart` columns (migration 0081, table
 * `public.tb_cart`) and the `addOrder` flow's POST shape (legacy
 * `pcs-admin/shops.php` L4-159). Column names kept verbatim per the
 * 1:1 faithful-port rule (CLAUDE.md / ADR-0017).
 *
 * tb_cart columns (0081 L877-890, all NOT NULL):
 *   id        integer
 *   cdetails  text
 *   curl      varchar(300)
 *   ctitle    varchar(300)
 *   cnameshop varchar(300)  DEFAULT 'pcs'
 *   cprovider varchar(1)    DEFAULT '4' ('1'=1688 '2'=Taobao '3'=Tmall '4'=Shops '5'=Nice)
 *   cimages   varchar(300)
 *   cprice    numeric(10,2)
 *   camount   integer
 *   ccolor    varchar(200)
 *   csize     varchar(200)
 *   userid    varchar(30)   the customer's PR<n> code (or adminid for admin-owned)
 */

import { z } from "zod";

// Provider codes — legacy `tb_cart.cprovider` is a 1-char string code.
// '4'=Shops is the catch-all/admin-custom default.
export const ADMIN_CART_PROVIDERS = ["1", "2", "3", "4", "5"] as const;

// One-item shape — what the staff form submits for a single product.
// Optional fields default to "" so the INSERT carries the legacy NOT NULL
// columns without forcing the form to require every field.
export const adminCartItemSchema = z.object({
  cdetails:  z.string().trim().min(1, "กรุณากรอกรายละเอียดสินค้า").max(2000),
  curl:      z.string().trim().min(1, "กรุณากรอก URL สินค้า").max(300),
  ctitle:    z.string().trim().max(300).default(""),
  cnameshop: z.string().trim().max(300).default("pcs"),
  cprovider: z.enum(ADMIN_CART_PROVIDERS).default("4"),
  cimages:   z.string().trim().max(300).default(""),
  cprice:    z.number().nonnegative({ message: "ราคาต้องไม่ติดลบ" }),
  camount:   z.number().int().positive({ message: "จำนวนต้องมากกว่า 0" }),
  ccolor:    z.string().trim().max(200).default(""),
  csize:     z.string().trim().max(200).default(""),
});
export type AdminCartItemInput = z.infer<typeof adminCartItemSchema>;

// Add to cart — single-item form. `userid` is the legacy "row owner" — when
// CS staff add for a customer it's the customer's PR<n>; when CS adds for
// themselves it's the staff's legacy `tb_admin.adminid` (resolved by the
// action from the current admin's Supabase email).
export const adminAddItemToCartSchema = z.object({
  userid: z.string().trim().min(1, "userid required").max(30),
  item:   adminCartItemSchema,
});
export type AdminAddItemToCartInput = z.infer<typeof adminAddItemToCartSchema>;

// "Add cart for user" — legacy `addCartUser` switched the active shopping
// context to a different customer. In Pacred this is exposed as a URL
// search-param on the cart page (already done by the read-only page); the
// action just verifies the target customer exists (so the staff sees a
// friendly error if they typed a wrong PR<n>).
export const adminAddCartUserSchema = z.object({
  userid: z.string().trim().min(1, "userid required").max(30),
});
export type AdminAddCartUserInput = z.infer<typeof adminAddCartUserSchema>;

// Remove a single cart row by ID (legacy `removeItem(ID)` AJAX).
export const adminRemoveCartItemSchema = z.object({
  cartId: z.number().int().positive(),
});
export type AdminRemoveCartItemInput = z.infer<typeof adminRemoveCartItemSchema>;

// Edit qty of a single cart row (legacy `updateQuantity.php` AJAX).
export const adminEditCartQtySchema = z.object({
  cartId: z.number().int().positive(),
  qty:    z.number().int().positive({ message: "จำนวนต้องมากกว่า 0" }).max(99999),
});
export type AdminEditCartQtyInput = z.infer<typeof adminEditCartQtySchema>;

// Submit cart as order — legacy `addOrder` (shops.php L4-159).
// Inserts ONE `tb_header_order` row (the order header) + N `tb_order` rows
// (one per `tb_cart` row for this owner) + DELETEs the source `tb_cart` rows.
// The shipping/address fields mirror the legacy POST shape.
export const adminSubmitCartSchema = z.object({
  // The legacy "row owner" — the cart rows being submitted (cart.tb_cart.userid).
  // For admin self-shop: the staff's own legacy adminid.
  cart_owner_userid: z.string().trim().min(1).max(30),

  // The customer the order is FOR (tb_header_order.userid).
  // For admin self-shop: the staff's own adminid (rare).
  // For shop-on-behalf: the customer's PR<n>.
  customer_userid: z.string().trim().min(1).max(30),

  // Legacy htransporttype — '1' = truck, '2' = ship.
  htransporttype: z.enum(["1", "2"]).default("1"),

  // Legacy hshipby — carrier code (e.g. 'PCS' = pickup at warehouse, 'F' = free,
  // numeric strings for the carrier list). Verbatim.
  hshipby: z.string().trim().min(1).max(10),

  // Address snapshot — legacy ships these as separate columns. If PCS pickup,
  // the action will substitute the static PCS Cargo HQ address (mirrors
  // shops.php L26-36). Otherwise these come from the form.
  haddressname:         z.string().trim().max(200).default(""),
  haddresslastname:     z.string().trim().max(200).default(""),
  haddressno:           z.string().trim().max(255).default(""),
  haddresssubdistrict:  z.string().trim().max(255).default(""),
  haddressdistrict:     z.string().trim().max(255).default(""),
  haddressprovince:     z.string().trim().max(255).default(""),
  haddresszipcode:      z.string().trim().max(5).default(""),
  haddressnote:         z.string().trim().max(2000).default(""),
  haddresstel:          z.string().trim().max(10).default(""),
  haddresstel2:         z.string().trim().max(10).default(""),
});
export type AdminSubmitCartInput = z.infer<typeof adminSubmitCartSchema>;
