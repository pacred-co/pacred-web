/**
 * THE ฝากสั่งซื้อ status rule — ONE definition, one home. PURE · no I/O · no
 * `server-only` (so it is unit-testable and importable from anywhere).
 *
 * Owner's standing invariant (2026-06-19 → 2026-07-17, raised repeatedly):
 *   "สถานะงาน ทั้งระบบ มันต้องเป็นเส้นตรง และเป็นเส้นเดียวกันทั้งระบบ"
 * A ฝากสั่งซื้อ order's status is a PURE FUNCTION of its shops' arrivals — not a
 * latch, not per-page logic:
 *   '4'  รอร้านจีนจัดส่ง   ← otherwise (a shop not shipped / not arrived)
 *   '40' ถึงโกดังจีน        ← ทุกร้านถึงโกดังจีน (fstatus≥2) แต่ยังมีร้านไม่ได้เลขตู้
 *   '5'  สำเร็จ            ← ทุกร้านได้เลขตู้ (fcabinetnumber) / ถึงไทย (fstatus≥4)
 *
 * ⚠️ MIRRORED IN SQL — `derive_shop_order_status(hno)` (migration 0259). The DB
 * trigger is the systemic SOT (it fires from EVERY writer of either side of the
 * link); this module is the TS half. THEY MUST AGREE — a change here without the
 * matching change in 0259 re-opens the exact bug the owner keeps hitting.
 * `lib/admin/shop-order-status-rule.test.ts` locks the rule.
 *
 * STATUS-ONLY · never money.
 */

export type ShopArrival = {
  orderRowId: number;
  shopName: string;        // ร้าน (cnameshop) · "" if none
  productTitle: string;    // ชื่อสินค้า (ctitle) · "" if none
  image: string | null;    // cimages (first) · for a thumbnail
  tracking: string;        // ctrackingnumber · "" = ยังไม่ส่ง
  fstatus: string;         // linked forwarder status · "" = no forwarder
  hasContainer: boolean;   // เลขตู้ (fcabinetnumber) assigned
  arrived: boolean;        // forwarder fstatus ≥ 2 (ถึงโกดังจีน)
  done: boolean;           // เลขตู้ (container) OR fstatus ≥ 4 (ถึงไทย/…)
};

export type ShopArrivalSummary = {
  totalShops: number;
  shippedShops: number;    // have a tracking
  arrivedShops: number;    // forwarder ≥ 2
  doneShops: number;       // container / ≥ 4
  /** every shop shipped AND arrived China (≥2) */
  allArrived: boolean;
  /** every shop shipped AND done (เลขตู้/≥4) — the gate for hstatus '5' */
  allDone: boolean;
  shops: ShopArrival[];
};

/** arrived = ถึงโกดังจีน or beyond. Mirrors the 0259 `arrived` EXISTS clause. */
export const ARRIVED_FSTATUS = new Set(["2", "3", "4", "5", "6", "7"]);

/**
 * done = fstatus ≥ 4 (ถึงไทย/รอชำระ/เตรียมส่ง/ส่งแล้ว). NOTE: fstatus '3'
 * (กำลังส่งมาไทย) alone is NOT done unless a เลขตู้ is stamped — the container
 * assignment (fcabinetnumber) is the authoritative "loaded + left China" signal.
 * Mirrors the 0259 `done` EXISTS clause.
 */
export const DONE_FSTATUS = new Set(["4", "5", "6", "7"]);

/**
 * A tb_order row is a REAL SHOP when it carries a ร้าน / สินค้า / tracking.
 * An all-empty junk row is not a shop. Mirrors the mig-0259 `real_shop` CTE.
 *
 * (Before 0259 this filter lived ONLY in the SQL trigger, so the TS half counted
 * a junk row as an un-arrived shop → derived '4' while SQL derived '40'/'5'.
 * Latent on prod — 0 junk rows — but it was two rules wearing one name.)
 */
export function isRealShopRow(r: {
  cnameshop?: string | null;
  ctitle?: string | null;
  ctrackingnumber?: string | null;
}): boolean {
  return (
    (r.cnameshop ?? "").trim() !== "" ||
    (r.ctitle ?? "").trim() !== "" ||
    (r.ctrackingnumber ?? "").trim() !== ""
  );
}

/**
 * The rule. Maps a per-shop arrival roll-up → the status the order SHOULD be at,
 * within the active set the gate governs ({4,40,5}).
 *
 *   allDone     → '5'  สำเร็จ            (ทุกร้านได้เลขตู้ / ถึงไทยแล้ว)
 *   allArrived  → '40' ถึงโกดังจีน        (ทุกร้านถึงโกดังจีน แต่ยังมีร้านไม่ได้เลขตู้)
 *   otherwise   → '4'  รอร้านจีนจัดส่ง    (ยังมีร้านที่ยังไม่ถึง / ยังไม่ส่ง)
 *
 * allDone ⇒ allArrived (done is a superset), so checking allDone first is correct.
 * totalShops === 0 → '4' (no real shop yet → NEVER auto-'5' an empty order).
 *
 * Two-way inside {4,40}: callers apply it to orders currently in {4,40} and write
 * whatever it returns (so a wrongly-'40' order drops back to '4' — the P22328
 * down-correction). Forward-only OUT of '5': callers exclude '5'/'6'/'99' from the
 * live re-derive (a wrongly-'5' order is surfaced for manual owner review, never
 * auto-demoted).
 */
export function deriveShopStatus(s: ShopArrivalSummary): "4" | "40" | "5" {
  if (s.totalShops === 0) return "4"; // no real shop yet → stay at 4 (never auto-5)
  if (s.allDone) return "5"; // ทุกร้านได้เลขตู้/ถึงไทย
  if (s.allArrived) return "40"; // ทุกร้านถึงโกดังจีน
  return "4"; // ยังมีร้านไม่ถึง/ยังไม่ส่ง
}
