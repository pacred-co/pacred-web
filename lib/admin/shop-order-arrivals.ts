import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildShopArrivalSummary,
  isRealShopRow,
  type ShopArrivalSummary,
} from "./shop-order-status-rule";
import { loadLinkedShopForwarders } from "./shop-order-linked-forwarders";

// The RULE lives in ./shop-order-status-rule (pure · unit-tested · mirrored by
// the mig-0268 SQL `derive_shop_order_status`). This module is the I/O half: it
// reads the rows and builds the roll-up the rule consumes. Re-exported so every
// existing call-site (`from "./shop-order-arrivals"`) keeps working.
export {
  deriveShopStatus,
  isRealShopRow,
  ARRIVED_FSTATUS,
  DONE_FSTATUS,
} from "./shop-order-status-rule";
export type { ShopArrival, ShopArrivalSummary } from "./shop-order-status-rule";

/**
 * Per-shop arrival summary for a ฝากสั่งซื้อ order (ภูม 2026-06-30).
 *
 * THE bug this supports the fix for (owner: "3 ร้าน 2 ร้านมาถึงแล้ว อีกร้านยังไม่ถึง
 * แต่สถานะออเดอร์ไปสำเร็จแล้ว"): a multi-shop order was flipped to '5' สำเร็จ as soon
 * as ONE shop's forwarder reached the China warehouse, ignoring the others. The
 * DB trigger (mig 0268) + the TS mirror gate the '5'/'40' flip on the AGGREGATE
 * computed here; the shop-order detail page shows the same per-shop breakdown so
 * staff see "X/Y ร้าน มาถึง · เหลือ Z" without clicking อัพเดต/แก้ไข.
 *
 * Model: one tb_order row = one shop (ร้าน · cnameshop). Its ctrackingnumber
 * may be a comma bag; EVERY parcel token must reach the stage. A shop's goods
 * are "arrived" when its forwarders are at fstatus ≥ 2; "done" when they have a เลขตู้
 * (fcabinetnumber non-empty · loaded into a closed container) OR fstatus ≥ 4
 * (ถึงไทย/…). A shop with no tracking yet = not shipped.
 *
 * "REAL SHOP" filter (aligned with the DB rule · mig 0268): a tb_order row only
 * counts as a shop when it carries a ร้าน (cnameshop) / สินค้า (ctitle) /
 * tracking — an all-empty junk row is skipped. Before 0259 this filter existed
 * ONLY in the SQL trigger, so the TS mirror counted a junk row as an
 * un-arrived shop and derived '4' while the trigger derived '40'/'5' — the two
 * halves of the ONE rule disagreeing. (0 junk rows on prod today = latent.)
 *
 * The 3-stage owner rule (รอร้านจีนจัดส่ง '4' → ถึงโกดังจีน '40' → สำเร็จ '5') is
 * the PURE FUNCTION `deriveShopStatus` (./shop-order-status-rule) — the order's
 * status is a function of this per-shop roll-up, two-way inside {4,40} (so a
 * wrongly-'40' order drops back to '4' when not-all-arrived · the P22328 bug)
 * and forward-only out of '5'.
 *
 * READ-ONLY — never writes. Safe to call from a page render.
 */

export async function countShopArrivals(
  admin: SupabaseClient,
  hno: string,
): Promise<ShopArrivalSummary> {
  const empty: ShopArrivalSummary = {
    totalShops: 0, shippedShops: 0, arrivedShops: 0, doneShops: 0,
    allArrived: false, allDone: false, shops: [],
  };
  const h = (hno ?? "").trim();
  if (!h) return empty;

  // 1. The order's shops (one row = one ร้าน).
  const { data: rows, error: rowsErr } = await admin
    .from("tb_order")
    .select("id, userid, cnameshop, ctitle, cimages, ctrackingnumber")
    .eq("hno", h)
    .order("id", { ascending: true })
    .limit(10_000);
  if (rowsErr) {
    console.error("[countShopArrivals] tb_order list failed", { hno: h, code: rowsErr.code, message: rowsErr.message });
    return empty;
  }
  // Only REAL shops count — an all-empty junk row is not a shop (mig 0268 parity).
  const shopRows = (rows ?? []).filter(isRealShopRow);
  if (shopRows.length === 0) return empty;

  // 2. Resolve through the canonical link reader (migration 0268): same-user,
  // comma-tokenised, split-box base-aware, and cancelled-row proof.
  const forwarders = await loadLinkedShopForwarders(admin, h);

  // 3. Pure roll-up shared with the unit tests and mirrored by SQL.
  return buildShopArrivalSummary(shopRows, forwarders);
}

// `deriveShopStatus` (THE rule) moved to ./shop-order-status-rule — pure, unit-
// tested (shop-order-status-rule.test.ts), and mirrored by the mig-0268 SQL
// `derive_shop_order_status`. It is re-exported at the top of this file, so
// `import { deriveShopStatus } from "./shop-order-arrivals"` still works.
