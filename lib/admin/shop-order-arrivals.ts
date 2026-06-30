import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Per-shop arrival summary for a ฝากสั่งซื้อ order (ภูม 2026-06-30).
 *
 * THE bug this supports the fix for (owner: "3 ร้าน 2 ร้านมาถึงแล้ว อีกร้านยังไม่ถึง
 * แต่สถานะออเดอร์ไปสำเร็จแล้ว"): a multi-shop order was flipped to '5' สำเร็จ as soon
 * as ONE shop's forwarder reached the China warehouse, ignoring the others. The
 * DB trigger (mig 0232) + the TS mirrors gate the '5'/'40' flip on the AGGREGATE
 * computed here; the shop-order detail page shows the same per-shop breakdown so
 * staff see "X/Y ร้าน มาถึง · เหลือ Z" without clicking อัพเดต/แก้ไข.
 *
 * Model: one tb_order row = one shop (ร้าน · cnameshop) with one ctrackingnumber.
 * A shop's goods are "arrived" when ANY forwarder for its tracking is at
 * fstatus ≥ 2 (ถึงโกดังจีน); "done" when that forwarder has a container OR
 * fstatus ≥ 3 (ออกจากจีน/ถึงไทย/…). A shop with no tracking yet = not shipped.
 *
 * READ-ONLY — never writes. Safe to call from a page render.
 */

export type ShopArrival = {
  orderRowId: number;
  shopName: string;        // ร้าน (cnameshop) · "" if none
  productTitle: string;    // ชื่อสินค้า (ctitle) · "" if none
  image: string | null;    // cimages (first) · for a thumbnail
  tracking: string;        // ctrackingnumber · "" = ยังไม่ส่ง
  fstatus: string;         // linked forwarder status · "" = no forwarder
  hasContainer: boolean;
  arrived: boolean;        // forwarder fstatus ≥ 2 (ถึงโกดังจีน)
  done: boolean;           // container OR fstatus ≥ 3
};

export type ShopArrivalSummary = {
  totalShops: number;
  shippedShops: number;    // have a tracking
  arrivedShops: number;    // forwarder ≥ 2
  doneShops: number;       // container / ≥ 3
  /** every shop shipped AND arrived China (≥2) */
  allArrived: boolean;
  /** every shop shipped AND done (container/≥3) — the gate for hstatus '5' */
  allDone: boolean;
  shops: ShopArrival[];
};

const ARRIVED = new Set(["2", "3", "4", "5", "6", "7"]);
const DONE_FS = new Set(["3", "4", "5", "6", "7"]);

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
    .select("id, cnameshop, ctitle, cimages, ctrackingnumber")
    .eq("hno", h)
    .order("id", { ascending: true })
    .limit(500);
  if (rowsErr) {
    console.error("[countShopArrivals] tb_order list failed", { hno: h, code: rowsErr.code, message: rowsErr.message });
    return empty;
  }
  const shopRows = rows ?? [];
  if (shopRows.length === 0) return empty;

  // 2. Resolve forwarder status for every tracking on the order (one query).
  const trackings = Array.from(
    new Set(shopRows.map((r) => (r.ctrackingnumber ?? "").trim()).filter(Boolean)),
  );
  // tracking → best (most-advanced) forwarder state. A split shipment may have
  // siblings; take the strongest signal (any arrived → arrived · any done → done).
  const fwByTracking = new Map<string, { fstatus: string; hasContainer: boolean }>();
  if (trackings.length > 0) {
    const { data: fwds, error: fwErr } = await admin
      .from("tb_forwarder")
      .select("ftrackingchn, fstatus, fcabinetnumber")
      .in("ftrackingchn", trackings)
      .limit(2000);
    if (fwErr) {
      console.error("[countShopArrivals] tb_forwarder list failed", { hno: h, code: fwErr.code, message: fwErr.message });
    } else {
      for (const f of fwds ?? []) {
        const tr = (f.ftrackingchn ?? "").trim();
        if (!tr) continue;
        const fstatus = String(f.fstatus ?? "").trim();
        const hasContainer = (f.fcabinetnumber ?? "").trim() !== "";
        const cur = fwByTracking.get(tr);
        // keep the strongest: prefer one with container, else higher fstatus.
        if (
          !cur ||
          (hasContainer && !cur.hasContainer) ||
          (Number(fstatus || 0) > Number(cur.fstatus || 0))
        ) {
          fwByTracking.set(tr, { fstatus, hasContainer });
        }
      }
    }
  }

  // 3. Build per-shop + roll up.
  const shops: ShopArrival[] = shopRows.map((r) => {
    const tracking = (r.ctrackingnumber ?? "").trim();
    const fw = tracking ? fwByTracking.get(tracking) : undefined;
    const fstatus = fw?.fstatus ?? "";
    const hasContainer = fw?.hasContainer ?? false;
    const arrived = ARRIVED.has(fstatus);
    const done = hasContainer || DONE_FS.has(fstatus);
    const img = (r.cimages ?? "").split(",").map((s: string) => s.trim()).filter(Boolean)[0] ?? null;
    return {
      orderRowId: Number(r.id),
      shopName: (r.cnameshop ?? "").trim(),
      productTitle: (r.ctitle ?? "").trim(),
      image: img,
      tracking,
      fstatus,
      hasContainer,
      arrived,
      done,
    };
  });

  const totalShops = shops.length;
  const shippedShops = shops.filter((s) => s.tracking !== "").length;
  const arrivedShops = shops.filter((s) => s.arrived).length;
  const doneShops = shops.filter((s) => s.done).length;
  // Gate: every shop must be shipped AND at the level. (A not-yet-shipped shop —
  // empty tracking — is neither arrived nor done, so it correctly blocks.)
  const allArrived = totalShops > 0 && arrivedShops === totalShops;
  const allDone = totalShops > 0 && doneShops === totalShops;

  return { totalShops, shippedShops, arrivedShops, doneShops, allArrived, allDone, shops };
}
