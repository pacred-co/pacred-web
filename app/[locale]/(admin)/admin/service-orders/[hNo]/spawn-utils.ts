/**
 * Pure helpers for the shop→forwarder auto-spawn form (Wave 21 P0 · Task #106).
 *
 * Kept separate from page.tsx + spawn-form.tsx so both server (page +
 * legacy-view) and client (spawn-form) sides can import without touching
 * RSC-only modules — and to avoid the page.tsx ↔ legacy-view.tsx circular
 * import that an inline helper would create.
 */

import type { TrackingRow } from "./spawn-form";

// ────────────────────────────────────────────────────────────
// Expand `tb_order` rows into spawn candidates.
//
// Legacy data shape (per tb_order row):
//   cnameshop       = shop name (one)
//   cshippingnumber = comma-sep China shop order numbers (1..N)
//   ctrackingnumber = comma-sep China tracking numbers (0..N — admin fills in)
//
// Legacy `update4.php` L78-117 expands these in parallel: row[i] of
// cshippingnumber pairs with row[i] of ctrackingnumber. We do the same
// here so a 3-parcel shop becomes 3 form rows.
// ────────────────────────────────────────────────────────────
export function buildSpawnRows(
  raw: Array<{ cnameshop: string; cshippingnumber: string; ctrackingnumber: string | null }>,
): TrackingRow[] {
  const out: TrackingRow[] = [];
  // Dedup by (cnameshop, ship-number-index) — multiple tb_order rows for
  // the same shop share the same comma-sep header values; the legacy form
  // renders ONE form per (shop, shipping-number-index).
  const seen = new Set<string>();
  for (const r of raw) {
    const shop = r.cnameshop ?? "";
    const shippingList = (r.cshippingnumber ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const trackingList = (r.ctrackingnumber ?? "")
      .split(",")
      .map((s) => s.trim());
    const max = Math.max(shippingList.length, 1);
    for (let i = 0; i < max; i++) {
      const ship = shippingList[i] ?? "";
      const track = trackingList[i] ?? "";
      const key = `${shop}|${ship}|${i}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        cNameShop:       shop,
        cShippingNumber: ship,
        cTrackingNumber: track,
      });
    }
  }
  return out;
}
