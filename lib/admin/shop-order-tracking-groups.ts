import type { ShopArrivalSummary } from "./shop-order-arrivals";

/**
 * "จัดกลุ่มตามแทรคกิ้ง" — collapse a ฝากสั่งซื้อ order's items (tb_order rows) into
 * one group per `ctrackingnumber` (2026-06-30 spec §5 · ภูม 2026-07-01 shared).
 *
 * P22328 = 16 ร้าน / 150 รายการ; grouping by tracking lets staff scan
 * "this tracking = N รายการ · M ชิ้น · ¥รวม · arrival pill · #fNo ฝากนำเข้า"
 * instead of 150 flat rows (or N duplicated-tracking shop rows). MANY shops
 * can share ONE tracking → the group folds them (`shops[]`).
 *
 * Extracted here so the /edit board summary AND the read-only detail panel
 * (legacy-view) render the SAME groups from the SAME math (no drift · §12).
 * PURE + display-only — takes already-fetched data, never queries, never writes.
 *
 * Arrival (arrived/done/hasContainer/fstatus) comes from the SAME
 * `countShopArrivals` roll-up the 3-stage status gate uses, so the SUMMARY
 * agrees with the order status to the satang.
 */
export type TrackingGroupItem = {
  id: number;
  ctitle: string;
  camount: number;
  cprice: number;
  cshippingchn: number;
  crewallet: string | null;
  coverUrl: string | null;
  curl: string | null;
  ccolor: string | null;
  csize: string | null;
};

export type TrackingGroup = {
  tracking: string;       // ctrackingnumber ("" = ยังไม่ส่ง → its own group)
  itemCount: number;      // จำนวนรายการ
  totalQty: number;       // จำนวนรวม (Σ camount · skip refunded)
  subtotalCny: number;    // ¥รวม (Σ camount×cprice + cshippingchn · skip refunded)
  fstatus: string;        // linked forwarder status ("" = no forwarder)
  hasContainer: boolean;  // เลขตู้ assigned
  arrived: boolean;       // fstatus ≥ 2 (ถึงโกดังจีน)
  done: boolean;          // hasContainer || fstatus ≥ 4
  fNo: number | null;     // linked tb_forwarder id (deep link #fNo)
  shops: string[];        // distinct ร้าน (cnameshop) folded into this tracking
  items: TrackingGroupItem[];
};

/** One tb_order row (a line of the shop order) — the raw input to the grouper. */
export type TrackingGroupSourceItem = {
  id: number;
  ctitle: string | null;
  cnameshop: string | null;
  camount: number | null;
  cprice: number | null;
  cshippingchn: number | null;
  crewallet: string | null;
  ctrackingnumber: string | null;
  curl: string | null;
  ccolor: string | null;
  csize: string | null;
};

export function buildTrackingGroups(input: {
  items: TrackingGroupSourceItem[];
  /** item.id → resolved cover image URL (already fetched by the caller). */
  coverUrlById: Map<number, string | null>;
  /** ctrackingnumber → the spawned tb_forwarder (id + live fstatus). */
  spawnedByTracking: Map<string, { id: number; fstatus: string | null }>;
  /** the per-shop arrival roll-up (countShopArrivals) for the arrival pill. */
  arrivalSummary: ShopArrivalSummary;
}): TrackingGroup[] {
  const { items, coverUrlById, spawnedByTracking, arrivalSummary } = input;

  // tracking → arrival roll-up (best/most-advanced forwarder per tracking).
  const arrivalByTracking = new Map<
    string,
    { fstatus: string; hasContainer: boolean; arrived: boolean; done: boolean }
  >();
  for (const s of arrivalSummary.shops) {
    const tr = (s.tracking ?? "").trim();
    if (!tr) continue;
    const cur = arrivalByTracking.get(tr);
    // keep the strongest signal (container > higher fstatus) — matches
    // countShopArrivals' own per-tracking dedupe.
    if (
      !cur ||
      (s.hasContainer && !cur.hasContainer) ||
      Number(s.fstatus || 0) > Number(cur.fstatus || 0)
    ) {
      arrivalByTracking.set(tr, {
        fstatus: s.fstatus,
        hasContainer: s.hasContainer,
        arrived: s.arrived,
        done: s.done,
      });
    }
  }

  // Reduce items into a Map keyed by ctrackingnumber.
  const groupMap = new Map<
    string,
    { totalQty: number; subtotalCny: number; shops: Set<string>; items: TrackingGroupItem[] }
  >();
  for (const it of items) {
    const tracking = (it.ctrackingnumber ?? "").trim();
    let g = groupMap.get(tracking);
    if (!g) {
      g = { totalQty: 0, subtotalCny: 0, shops: new Set<string>(), items: [] };
      groupMap.set(tracking, g);
    }
    const refunded = it.crewallet === "1";
    const qty = Number(it.camount ?? 0);
    const price = Number(it.cprice ?? 0);
    const shipChn = Number(it.cshippingchn ?? 0);
    if (!refunded) {
      g.totalQty += qty;
      g.subtotalCny += qty * price + shipChn;
    }
    const shop = (it.cnameshop ?? "").trim();
    if (shop) g.shops.add(shop);
    g.items.push({
      id: it.id,
      ctitle: it.ctitle ?? "",
      camount: qty,
      cprice: price,
      cshippingchn: shipChn,
      crewallet: it.crewallet,
      coverUrl: coverUrlById.get(it.id) ?? null,
      curl: it.curl ?? null,
      ccolor: it.ccolor ?? null,
      csize: it.csize ?? null,
    });
  }

  const out: TrackingGroup[] = [];
  for (const [tracking, g] of groupMap.entries()) {
    const arr = tracking ? arrivalByTracking.get(tracking) : undefined;
    const spawned = tracking ? spawnedByTracking.get(tracking) : undefined;
    out.push({
      tracking,
      itemCount: g.items.length,
      totalQty: g.totalQty,
      subtotalCny: g.subtotalCny,
      fstatus: arr?.fstatus ?? spawned?.fstatus ?? "",
      hasContainer: arr?.hasContainer ?? false,
      arrived: arr?.arrived ?? false,
      done: arr?.done ?? false,
      fNo: spawned?.id ?? null,
      shops: Array.from(g.shops),
      items: g.items,
    });
  }
  // Sort: shipped (has tracking) first, then by item count desc; the
  // "— ยังไม่ส่ง" group (empty tracking) sinks to the bottom.
  out.sort((a, b) => {
    if (!a.tracking && b.tracking) return 1;
    if (a.tracking && !b.tracking) return -1;
    return b.itemCount - a.itemCount;
  });
  return out;
}
