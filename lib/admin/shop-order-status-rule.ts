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
 * ⚠️ MIRRORED IN SQL — `derive_shop_order_status(hno)` (migration 0268). The DB
 * trigger is the systemic SOT (it fires from EVERY writer of either side of the
 * link); this module is the TS half. THEY MUST AGREE — a change here without the
 * matching change in migration 0268 re-opens the exact bug the owner keeps hitting.
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

export type ShopOrderArrivalRow = {
  id: number | string;
  userid?: string | null;
  cnameshop?: string | null;
  ctitle?: string | null;
  cimages?: string | null;
  ctrackingnumber?: string | null;
};

export type LinkedForwarderArrivalRow = {
  id?: number | string;
  userid?: string | null;
  reforder?: string | null;
  ftrackingchn?: string | null;
  fstatus?: string | null;
  fcabinetnumber?: string | null;
};

/** arrived = ถึงโกดังจีน or beyond. Mirrors migration 0268. */
export const ARRIVED_FSTATUS = new Set(["2", "3", "4", "5", "6", "7"]);

/**
 * done = fstatus ≥ 4 (ถึงไทย/รอชำระ/เตรียมส่ง/ส่งแล้ว). NOTE: fstatus '3'
 * (กำลังส่งมาไทย) alone is NOT done unless a เลขตู้ is stamped — the container
 * assignment (fcabinetnumber) is the authoritative "loaded + left China" signal.
 * Mirrors migration 0268.
 */
export const DONE_FSTATUS = new Set(["4", "5", "6", "7"]);

/** Split the legacy comma-bag used by tb_order (ASCII and Chinese comma). */
export function splitShopTrackingTokens(value: string | null | undefined): string[] {
  return (value ?? "")
    .split(/[,，]/)
    .map((token) => token.trim())
    .filter(Boolean);
}

/**
 * Canonical shipment-family key. MOMO can split a base tracking into `-N` or
 * `-N/M` box rows. A legitimate non-numeric suffix is preserved.
 */
export function shopTrackingBase(value: string | null | undefined): string {
  return (value ?? "").trim().replace(/-\d+(?:\/\d+)?$/, "");
}

export function shopTrackingsMatch(
  orderTracking: string | null | undefined,
  forwarderTracking: string | null | undefined,
): boolean {
  const orderBase = shopTrackingBase(orderTracking);
  const forwarderBase = shopTrackingBase(forwarderTracking);
  return orderBase !== "" && orderBase === forwarderBase;
}

/**
 * Build the exact roll-up consumed by `deriveShopStatus`.
 *
 * One tb_order row is one shop row, but its `ctrackingnumber` can be a comma
 * bag of several parcels. A shop arrives/completes only when EVERY token has a
 * non-cancelled matching forwarder. Matches are scoped to the same legacy
 * userid and are base-aware for MOMO split boxes.
 */
export function buildShopArrivalSummary(
  orderRows: readonly ShopOrderArrivalRow[],
  forwarderRows: readonly LinkedForwarderArrivalRow[],
): ShopArrivalSummary {
  const realRows = orderRows.filter(isRealShopRow);

  const shops: ShopArrival[] = realRows.map((row) => {
    const tracking = (row.ctrackingnumber ?? "").trim();
    const tokens = splitShopTrackingTokens(tracking);
    const rowUser = (row.userid ?? "").trim();

    const tokenStates = tokens.map((token) => {
      const matches = forwarderRows.filter((forwarder) => {
        if ((forwarder.fstatus ?? "").trim() === "99") return false;
        const forwarderUser = (forwarder.userid ?? "").trim();
        if (rowUser && rowUser !== forwarderUser) return false;
        return shopTrackingsMatch(token, forwarder.ftrackingchn);
      });

      // A split-box family is one order token. Every ACTIVE family row must
      // reach the stage; `BASE-1/3` also declares that indices 1..3 must exist.
      // Counting only the strongest child made an order arrive when box 1/3
      // landed while boxes 2/3 and 3/3 were still absent/pending.
      const splitParts = matches.flatMap((forwarder) => {
        const match = (forwarder.ftrackingchn ?? "").trim().match(/-(\d+)\/(\d+)$/);
        return match ? [{ index: Number(match[1]), total: Number(match[2]) }] : [];
      });
      const expectedSplitTotal = splitParts.reduce((max, part) => Math.max(max, part.total), 0);
      const splitIndexes = new Set(splitParts.map((part) => part.index));
      const splitCoverageComplete = expectedSplitTotal === 0
        || (
          splitIndexes.size === expectedSplitTotal
          && [...splitIndexes].every((index) => index >= 1 && index <= expectedSplitTotal)
        );
      const familyComplete = matches.length > 0 && splitCoverageComplete;

      const arrived = familyComplete
        && matches.every((f) => ARRIVED_FSTATUS.has((f.fstatus ?? "").trim()));
      const done = familyComplete && matches.every((f) => {
        const fstatus = (f.fstatus ?? "").trim();
        return (f.fcabinetnumber ?? "").trim() !== "" || DONE_FSTATUS.has(fstatus);
      });
      const hasContainer = matches.some((f) => (f.fcabinetnumber ?? "").trim() !== "");
      const strongest = matches.reduce((best, f) => {
        const status = (f.fstatus ?? "").trim();
        const rank = ARRIVED_FSTATUS.has(status) || status === "1" ? Number(status) : 0;
        return rank > best.rank ? { status, rank } : best;
      }, { status: "", rank: 0 });

      return { arrived, done, hasContainer, fstatus: strongest.status };
    });

    // A comma-bag is one shop with N parcels. The least-advanced/missing parcel
    // is the shop bottleneck, so EVERY token must satisfy the stage.
    const arrived = tokenStates.length > 0 && tokenStates.every((state) => state.arrived);
    const done = tokenStates.length > 0 && tokenStates.every((state) => state.done);
    const hasContainer = tokenStates.some((state) => state.hasContainer);
    const weakestStatus = tokenStates.length > 0
      ? tokenStates.reduce((weakest, state) => {
          if (!state.fstatus) return "";
          if (!weakest) return state.fstatus;
          return Number(state.fstatus) < Number(weakest) ? state.fstatus : weakest;
        }, "")
      : "";
    const image = (row.cimages ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)[0] ?? null;

    return {
      orderRowId: Number(row.id),
      shopName: (row.cnameshop ?? "").trim(),
      productTitle: (row.ctitle ?? "").trim(),
      image,
      tracking,
      fstatus: weakestStatus,
      hasContainer,
      arrived,
      done,
    };
  });

  const totalShops = shops.length;
  const shippedShops = shops.filter((shop) => splitShopTrackingTokens(shop.tracking).length > 0).length;
  const arrivedShops = shops.filter((shop) => shop.arrived).length;
  const doneShops = shops.filter((shop) => shop.done).length;
  const allArrived = totalShops > 0 && arrivedShops === totalShops;
  const allDone = totalShops > 0 && doneShops === totalShops;

  return { totalShops, shippedShops, arrivedShops, doneShops, allArrived, allDone, shops };
}

/**
 * A tb_order row is a REAL SHOP when it carries a ร้าน / สินค้า / tracking.
 * An all-empty junk row is not a shop. Mirrors migration 0268's `real_shop` CTE.
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
