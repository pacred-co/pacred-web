import assert from "node:assert/strict";
import {
  buildShopArrivalSummary,
  deriveShopStatus,
  isRealShopRow,
  shopTrackingBase,
  shopTrackingsMatch,
  splitShopTrackingTokens,
  type ShopArrival,
  type ShopArrivalSummary,
} from "./shop-order-status-rule";

/**
 * The owner's 3-stage ฝากสั่งซื้อ status rule — the ONE rule that mig 0259's
 * `derive_shop_order_status(hno)` mirrors in SQL. Keep the two in lockstep:
 * a change here without the matching change in 0259 re-opens the owner's
 * recurring "สถานะไม่เป็นเส้นเดียวกันทั้งระบบ".
 *
 *   '4'  รอร้านจีนจัดส่ง   ← otherwise
 *   '40' ถึงโกดังจีน        ← ทุกร้านถึงโกดังจีน (fstatus≥2), ยังไม่ได้เลขตู้
 *   '5'  สำเร็จ            ← ทุกร้านได้เลขตู้ / ถึงไทย (fstatus≥4)
 */

// ── helpers ──────────────────────────────────────────────────────────────────
function shop(over: Partial<ShopArrival> = {}): ShopArrival {
  return {
    orderRowId: 1, shopName: "ร้านจีน", productTitle: "สินค้า", image: null,
    tracking: "1783998478", fstatus: "", hasContainer: false,
    arrived: false, done: false, ...over,
  };
}
function roll(shops: ShopArrival[]): ShopArrivalSummary {
  const total = shops.length;
  const arrivedShops = shops.filter((s) => s.arrived).length;
  const doneShops = shops.filter((s) => s.done).length;
  return {
    totalShops: total,
    shippedShops: shops.filter((s) => s.tracking !== "").length,
    arrivedShops, doneShops,
    allArrived: total > 0 && arrivedShops === total,
    allDone: total > 0 && doneShops === total,
    shops,
  };
}
const ARRIVED = { arrived: true, done: false, fstatus: "2" } as const;
const DONE = { arrived: true, done: true, fstatus: "4" } as const;
const PENDING = { arrived: false, done: false, fstatus: "" } as const;

// ── STAGE 1 → '4' รอร้านจีนจัดส่ง ────────────────────────────────────────────
assert.equal(deriveShopStatus(roll([shop(PENDING)])), "4", "1 shop not shipped → 4");
assert.equal(
  deriveShopStatus(roll([shop({ tracking: "", ...PENDING })])),
  "4", "shop with no tracking → 4",
);
assert.equal(
  deriveShopStatus(roll([shop(ARRIVED), shop(PENDING)])),
  "4", "2 shops · 1 arrived 1 not → 4 (owner: อีกร้านยังไม่ถึง)",
);
assert.equal(
  deriveShopStatus(roll([shop(DONE), shop(DONE), shop(PENDING)])),
  "4", "3 shops · 2 done 1 not shipped → 4 (never complete early)",
);

// ── STAGE 2 → '40' ถึงโกดังจีน — THE P22332 CASE ─────────────────────────────
assert.equal(
  deriveShopStatus(roll([shop(ARRIVED)])),
  "40",
  "P22332: 1 shop · forwarder fstatus=2 · no เลขตู้ → 40 (was pinned at 4)",
);
assert.equal(
  deriveShopStatus(roll([shop(ARRIVED), shop(ARRIVED)])),
  "40", "all shops arrived China, none containered → 40",
);
assert.equal(
  deriveShopStatus(roll([shop(DONE), shop(ARRIVED)])),
  "40", "all arrived but only 1 done → 40 (not 5)",
);
// fstatus '3' (กำลังส่งมาไทย) alone is arrived-but-NOT-done without a เลขตู้.
assert.equal(
  deriveShopStatus(roll([shop({ arrived: true, done: false, fstatus: "3" })])),
  "40", "fstatus=3 without เลขตู้ → 40, NOT 5",
);

// ── STAGE 3 → '5' สำเร็จ ─────────────────────────────────────────────────────
assert.equal(deriveShopStatus(roll([shop(DONE)])), "5", "1 shop done → 5");
assert.equal(
  deriveShopStatus(roll([shop(DONE), shop(DONE), shop(DONE)])),
  "5", "all 3 shops done → 5",
);
assert.equal(
  deriveShopStatus(roll([shop({ arrived: true, done: true, fstatus: "2", hasContainer: true })])),
  "5", "เลขตู้ stamped at fstatus=2 → done → 5 (container = authoritative)",
);

// ── NEVER auto-'5' an empty order (divergence D1 · mig 0259 closes it) ───────
// The pre-0259 SQL used NOT EXISTS(pending) which is TRUE for zero shops →
// all_done → '5' (auto-สำเร็จ an empty order). TS was always right: '4'.
assert.equal(deriveShopStatus(roll([])), "4", "0 real shops → 4, NEVER auto-5");

// ── the rule is a PURE FUNCTION (allDone ⇒ allArrived; order of checks) ──────
{
  const s = roll([shop(DONE)]);
  assert.equal(s.allDone && s.allArrived, true, "done ⇒ arrived (superset invariant)");
  assert.equal(deriveShopStatus(s), "5", "allDone wins over allArrived");
}
// deterministic + side-effect free
{
  const s = roll([shop(ARRIVED), shop(PENDING)]);
  assert.equal(deriveShopStatus(s), deriveShopStatus(s), "pure: same input → same output");
}

// ── "REAL SHOP" filter — mirrors the mig-0259 real_shop CTE (divergence D3) ──
assert.equal(isRealShopRow({ cnameshop: "ร้านจีน" }), true, "has ร้าน → real shop");
assert.equal(isRealShopRow({ ctitle: "自粘木纹" }), true, "has สินค้า → real shop");
assert.equal(isRealShopRow({ ctrackingnumber: "1783998478" }), true, "has tracking → real shop");
assert.equal(isRealShopRow({}), false, "all-empty junk row → NOT a shop");
assert.equal(
  isRealShopRow({ cnameshop: "", ctitle: "", ctrackingnumber: "" }),
  false, "empty strings → NOT a shop",
);
assert.equal(
  isRealShopRow({ cnameshop: "   ", ctitle: null, ctrackingnumber: undefined }),
  false, "whitespace/null/undefined → NOT a shop (btrim parity)",
);
assert.equal(
  isRealShopRow({ cnameshop: null, ctitle: null, ctrackingnumber: "  1783998478  " }),
  true, "untrimmed tracking still counts → real shop",
);

// ─── CANONICAL LINK NORMALISATION (migration 0268 parity) ─────────────────
assert.deepEqual(
  splitShopTrackingTokens("T1, T2，T3"),
  ["T1", "T2", "T3"],
  "ASCII/Chinese comma bags split into tracking tokens",
);
assert.equal(shopTrackingBase("1782113771-1/7"), "1782113771", "-N/M split suffix → base");
assert.equal(shopTrackingBase("1782113771-3"), "1782113771", "-N split suffix → base");
assert.equal(shopTrackingBase("CBX260620-SEA07"), "CBX260620-SEA07", "non-numeric suffix is identity");
assert.equal(shopTrackingsMatch("1782113771", "1782113771-2/7"), true, "base matches split child");

// One shop with two parcel tokens is not arrived/done until BOTH parcels reach
// the stage. Cancelled rows and another customer's reused tracking never count.
{
  const orderRows = [{
    id: 10,
    userid: "PR001",
    cnameshop: "shopA",
    ctitle: "two parcels",
    ctrackingnumber: "BASE,T2",
    cimages: "a.jpg,b.jpg",
  }];
  const oneArrived = buildShopArrivalSummary(orderRows, [
    { userid: "PR001", ftrackingchn: "BASE-1/2", fstatus: "2", fcabinetnumber: "" },
    { userid: "PR001", ftrackingchn: "T2", fstatus: "1", fcabinetnumber: "" },
    { userid: "PR999", ftrackingchn: "T2", fstatus: "7", fcabinetnumber: "CROSS-USER" },
    { userid: "", ftrackingchn: "T2", fstatus: "7", fcabinetnumber: "OWNERLESS" },
    { userid: "PR001", ftrackingchn: "T2", fstatus: "99", fcabinetnumber: "STALE" },
  ]);
  assert.equal(oneArrived.allArrived, false, "one of two parcels pending → shop stays at 4");
  assert.equal(oneArrived.allDone, false, "cancelled/cross-user rows do not complete the shop");
  assert.equal(deriveShopStatus(oneArrived), "4");

  const bothArrived = buildShopArrivalSummary(orderRows, [
    { userid: "PR001", ftrackingchn: "BASE-1/2", fstatus: "2", fcabinetnumber: "" },
    { userid: "PR001", ftrackingchn: "BASE-2/2", fstatus: "2", fcabinetnumber: "" },
    { userid: "PR001", ftrackingchn: "T2", fstatus: "3", fcabinetnumber: "" },
  ]);
  assert.equal(deriveShopStatus(bothArrived), "40", "every token arrived, not done → 40");

  const bothDone = buildShopArrivalSummary(orderRows, [
    { userid: "PR001", ftrackingchn: "BASE-1/2", fstatus: "2", fcabinetnumber: "CNT-1" },
    { userid: "PR001", ftrackingchn: "BASE-2/2", fstatus: "4", fcabinetnumber: "" },
    { userid: "PR001", ftrackingchn: "T2", fstatus: "4", fcabinetnumber: "" },
  ]);
  assert.equal(deriveShopStatus(bothDone), "5", "every token containered/at Thailand → 5");

  const missingSplitChild = buildShopArrivalSummary(orderRows, [
    { userid: "PR001", ftrackingchn: "BASE-1/3", fstatus: "4", fcabinetnumber: "CNT-1" },
    { userid: "PR001", ftrackingchn: "T2", fstatus: "4", fcabinetnumber: "CNT-2" },
  ]);
  assert.equal(deriveShopStatus(missingSplitChild), "4", "BASE-1/3 alone cannot represent all three boxes");

  const pendingFamilyChild = buildShopArrivalSummary(orderRows, [
    { userid: "PR001", ftrackingchn: "BASE-1/2", fstatus: "4", fcabinetnumber: "CNT-1" },
    { userid: "PR001", ftrackingchn: "BASE-2/2", fstatus: "1", fcabinetnumber: "" },
    { userid: "PR001", ftrackingchn: "T2", fstatus: "4", fcabinetnumber: "CNT-2" },
  ]);
  assert.equal(deriveShopStatus(pendingFamilyChild), "4", "one pending child holds the whole tracking family at 4");
}

// ── the reforder-empty / ctrackingnumber-fallback shape (P22332 / MOMO) ──────
// A MOMO-created forwarder carries reforder='' — the link resolves via
// tb_order.ctrackingnumber = tb_forwarder.ftrackingchn. The rule itself is
// link-agnostic (it consumes the roll-up), so what matters is that a shop
// matched by tracking-fallback produces the SAME derivation as a reforder one.
{
  const viaReforder = roll([shop({ ...ARRIVED, tracking: "1783998478" })]);
  const viaTracking = roll([shop({ ...ARRIVED, tracking: "1783998478", orderRowId: 129257 })]);
  assert.equal(
    deriveShopStatus(viaReforder), deriveShopStatus(viaTracking),
    "reforder-linked and tracking-linked shops derive identically",
  );
  assert.equal(deriveShopStatus(viaTracking), "40", "MOMO tracking-linked arrival → 40");
}

console.log("✓ shop-order-status-rule: 3 stages · never-auto-5 · real-shop filter · MOMO fallback");
