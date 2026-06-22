/**
 * SHARED shop-print computation — the SINGLE source of the per-line money
 * + the order grand-total for the ฝากสั่งซื้อ (shop-order) print document.
 *
 * Why this file exists (owner directive · 2026-06-22): the print page now
 * renders the SAME document in two skins — the legacy/PCS form (default) and
 * a new PEAK-style form (`?form=peak`). The legacy renderer (`ShopItemRows`
 * in `page.tsx`) historically computed the money INLINE while it emitted
 * rows. If the PEAK renderer re-did that math independently the two skins
 * could drift (rounding / order) → a document whose total ≠ the legacy's =
 * a money defect. So the math is extracted HERE and BOTH skins consume it.
 *
 * The formula is copied 1:1 from the legacy `ShopItemRows` (which mirrors
 * `pcs-admin/printShop.php`):
 *
 *   rowTotal      = cAmount × (cPrice × hRate) + cShippingChn × hRate
 *   priceShopAll  = Σ rowTotal   (cumulative across EVERY provider→shop→item,
 *                                 in the same first-seen iteration order)
 *
 * `noRow` is a 1-based running counter across the WHOLE order (every shop of
 * every provider), exactly as the legacy zebra counter. The PEAK form prints
 * that same ลำดับ.
 *
 * NOTE: pure module — no React, no supabase, no "use server"/"use client".
 */

import type { PrintDoc } from "./shop-document-types";

/** One fully-resolved print line — the legacy row + its computed total. */
export type ShopFlatRow = {
  /** 1-based running order across the whole order (legacy $noRow). */
  no: number;
  cProvider: string;
  cNameShop: string;
  cShippingNumber: string;
  cTrackingNumber: string;
  cTitle: string;
  cColor: string;
  cSize: string;
  cAmount: number;
  /** cPrice × hRate — the per-piece THB price the legacy column prints. */
  unitPriceThb: number;
  /** cShippingChn × hRate — the China-shipping THB the legacy column prints. */
  shippingChnThb: number;
  /** cAmount × unitPriceThb + shippingChnThb — the row total (= legacy). */
  rowTotal: number;
};

export type ShopDocComputed = {
  /** Every line of the order, flattened in legacy iteration order. */
  rows: ShopFlatRow[];
  /** Σ rowTotal — the FULL-PRECISION grand total (= legacy $priceShopAll). */
  grandTotalRaw: number;
  /** grandTotalRaw rounded half-up to 2dp (the headline figure). */
  grandTotalRounded: number;
};

/**
 * Flatten a PrintDoc into the ordered line list + grand total, using the
 * EXACT legacy formula + iteration order. Both the legacy and PEAK skins
 * call this so their numbers are byte-identical.
 */
export function computeShopDocument(doc: PrintDoc): ShopDocComputed {
  const rows: ShopFlatRow[] = [];
  let noRow = 0;
  let grandTotalRaw = 0;

  for (const provider of doc.providers) {
    for (const shop of provider.shops) {
      for (const it of shop.items) {
        noRow += 1;
        const unitPriceThb = it.cprice * doc.header.hrate;
        const shippingChnThb = it.cshippingchn * doc.header.hrate;
        const rowTotal = it.camount * unitPriceThb + shippingChnThb;
        grandTotalRaw += rowTotal;
        rows.push({
          no: noRow,
          cProvider: provider.cProvider,
          cNameShop: shop.cNameShop,
          cShippingNumber: shop.cShippingNumber,
          cTrackingNumber: shop.cTrackingNumber,
          cTitle: it.ctitle,
          cColor: it.ccolor,
          cSize: it.csize,
          cAmount: it.camount,
          unitPriceThb,
          shippingChnThb,
          rowTotal,
        });
      }
    }
  }

  return {
    rows,
    grandTotalRaw,
    grandTotalRounded: Math.round(grandTotalRaw * 100) / 100,
  };
}
