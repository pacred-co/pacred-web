/**
 * paid-work-report.test.ts — ล็อกตัวจำแนก + การรวม/เดือน + invariant reconcile
 * ของรายงาน "งานที่ลูกค้าจ่ายแล้ว" (owner 2026-07-30).
 * Run: tsx lib/admin/paid-work-report.test.ts
 */
import assert from "node:assert/strict";
import {
  aggregatePaidWork,
  transportBucketOf,
  originBucketOf,
  type PaidOrderRecord,
} from "./paid-work-report-core";

let passed = 0;
function check(label: string, cond: boolean) {
  assert.equal(cond, true, label);
  passed++;
}
function eq(label: string, a: unknown, b: unknown) {
  assert.deepEqual(a, b, label);
  passed++;
}

// ── ตัวจำแนก (pure) ─────────────────────────────────────────────
eq("mode 1 → รถ", transportBucketOf("1"), "road");
eq("mode 2 → เรือ", transportBucketOf("2"), "sea");
eq("mode 3 → อากาศ", transportBucketOf("3"), "air");

eq("wh '1' → กวางโจว", originBucketOf("1"), "guangzhou");
eq("wh '2' → อี้อู", originBucketOf("2"), "yiwu");
eq("wh '' → ไม่ระบุ", originBucketOf(""), "unknown");
eq("wh null → ไม่ระบุ", originBucketOf(null), "unknown");
eq("wh ' 1 ' (trim) → กวางโจว", originBucketOf(" 1 "), "guangzhou");
eq("wh '8' → ไม่ระบุ", originBucketOf("8"), "unknown");

// ── ชุดข้อมูลจริง 2 เดือน (สั่งซื้อ + นำเข้า หลายมิติ) ─────────────
const imp = (
  month: string,
  sell: number,
  cost: number,
  cbm: number,
  transport: "road" | "sea" | "air",
  origin: "guangzhou" | "yiwu" | "unknown",
  unpriced = false,
): PaidOrderRecord => ({ service: "import", month, sell, cost, cbm, transport, origin, unpriced });
const shop = (month: string, sell: number, cost: number, unpriced = false): PaidOrderRecord =>
  ({ service: "shop", month, sell, cost, cbm: 0, transport: null, origin: null, unpriced });

const records: PaidOrderRecord[] = [
  // July
  imp("2026-07", 1000, 700, 1.5, "road", "guangzhou"),
  imp("2026-07", 2000, 1500, 3.0, "sea", "guangzhou"),
  imp("2026-07", 500, 400, 0.5, "air", "yiwu"),
  imp("2026-07", 300, 0, 0.2, "road", "unknown", true), // unpriced (cost=0)
  shop("2026-07", 5000, 4800),
  shop("2026-07", 1000, 0, true), // unpriced
  // June
  imp("2026-06", 800, 600, 1.0, "sea", "yiwu"),
  shop("2026-06", 2000, 1900),
];

const rep = aggregatePaidWork(records, "2026-06-01", "2026-07-31");

// เดือนล่าสุดก่อน
eq("2 เดือน", rep.months.length, 2);
eq("เดือนแรก = ก.ค. (ล่าสุดก่อน)", rep.months[0].month, "2026-07");
eq("เดือนสอง = มิ.ย.", rep.months[1].month, "2026-06");

const jul = rep.months[0];

// จำนวนงานต่อกลุ่ม
eq("ก.ค. total orders = 6", jul.total.orders, 6);
eq("ก.ค. นำเข้า orders = 4", jul.byService.import.orders, 4);
eq("ก.ค. สั่งซื้อ orders = 2", jul.byService.shop.orders, 2);
eq("ก.ค. ขนส่ง รถ orders = 2", jul.byTransport.road.orders, 2);
eq("ก.ค. ขนส่ง เรือ orders = 1", jul.byTransport.sea.orders, 1);
eq("ก.ค. ขนส่ง อากาศ orders = 1", jul.byTransport.air.orders, 1);
eq("ก.ค. ต้นทาง กวางโจว orders = 2", jul.byOrigin.guangzhou.orders, 2);
eq("ก.ค. ต้นทาง อี้อู orders = 1", jul.byOrigin.yiwu.orders, 1);
eq("ก.ค. ต้นทาง ไม่ระบุ orders = 1", jul.byOrigin.unknown.orders, 1);

// เงิน
eq("ก.ค. total sell = 9800", jul.total.sell, 9800);
eq("ก.ค. total cost = 7400 (นำเข้า 2600 + สั่งซื้อ 4800)", jul.total.cost, 7400);
eq("ก.ค. total profit = 2400", jul.total.profit, 2400);
eq("ก.ค. นำเข้า sell = 3800", jul.byService.import.sell, 3800);
eq("ก.ค. สั่งซื้อ sell = 6000", jul.byService.shop.sell, 6000);
eq("ก.ค. นำเข้า cbm = 5.2", jul.byService.import.cbm, 5.2);
eq("ก.ค. สั่งซื้อ cbm = 0", jul.byService.shop.cbm, 0);

// unpriced
eq("ก.ค. unpriced orders = 2 (import cost=0 + shop cost=0)", jul.unpricedOrders, 2);

// ── RECONCILE invariants ต่อเดือน ──────────────────────────────
for (const m of rep.months) {
  // Σ byService = total
  check(
    `${m.month}: Σ byService.sell == total.sell`,
    Math.abs(m.byService.shop.sell + m.byService.import.sell - m.total.sell) < 1e-6,
  );
  check(
    `${m.month}: Σ byService.orders == total.orders`,
    m.byService.shop.orders + m.byService.import.orders === m.total.orders,
  );
  // Σ byTransport = import (นำเข้าเท่านั้น)
  check(
    `${m.month}: Σ byTransport.sell == import.sell`,
    Math.abs(m.byTransport.road.sell + m.byTransport.sea.sell + m.byTransport.air.sell - m.byService.import.sell) < 1e-6,
  );
  check(
    `${m.month}: Σ byTransport.orders == import.orders`,
    m.byTransport.road.orders + m.byTransport.sea.orders + m.byTransport.air.orders === m.byService.import.orders,
  );
  // Σ (byTransport + shop) == total  ← สิ่งที่ owner จะ reconcile
  check(
    `${m.month}: Σ (byTransport + shop).sell == total.sell`,
    Math.abs(
      m.byTransport.road.sell + m.byTransport.sea.sell + m.byTransport.air.sell + m.byService.shop.sell - m.total.sell,
    ) < 1e-6,
  );
  // Σ byOrigin = import
  check(
    `${m.month}: Σ byOrigin.sell == import.sell`,
    Math.abs(m.byOrigin.guangzhou.sell + m.byOrigin.yiwu.sell + m.byOrigin.unknown.sell - m.byService.import.sell) < 1e-6,
  );
  // cbm: byOrigin/byTransport รวม = import cbm (สั่งซื้อ cbm=0 · ไม่เข้ากลุ่มนำเข้า)
  check(
    `${m.month}: Σ byTransport.cbm == import.cbm`,
    Math.abs(m.byTransport.road.cbm + m.byTransport.sea.cbm + m.byTransport.air.cbm - m.byService.import.cbm) < 1e-6,
  );
  // profit = sell − cost ทุกกลุ่ม
  check(`${m.month}: total profit == sell − cost`, Math.abs(m.total.profit - (m.total.sell - m.total.cost)) < 1e-6);
}

// ── grand total ────────────────────────────────────────────────
eq("grand orders = 8", rep.grand.orders, 8);
eq("grand sell = 12600", rep.grand.sell, 9800 + 2800); // ก.ค.9800 + มิ.ย.2800
eq("grand profit = sell − cost", rep.grand.profit, rep.grand.sell - rep.grand.cost);
eq("grand unpriced = 2", rep.grand.unpricedOrders, 2);
check(
  "grand.sell == Σ months.total.sell",
  Math.abs(rep.grand.sell - rep.months.reduce((s, m) => s + m.total.sell, 0)) < 1e-6,
);

// ── edge: ว่าง ──────────────────────────────────────────────────
const emptyRep = aggregatePaidWork([]);
eq("records ว่าง → 0 เดือน", emptyRep.months.length, 0);
eq("records ว่าง → grand orders 0", emptyRep.grand.orders, 0);

// ── shop ไม่หลุดเข้ากลุ่ม transport/origin ─────────────────────
const onlyShop = aggregatePaidWork([shop("2026-07", 100, 90)]);
eq("shop-only: byTransport ทุกกลุ่ม orders 0", onlyShop.months[0].byTransport.road.orders + onlyShop.months[0].byTransport.sea.orders + onlyShop.months[0].byTransport.air.orders, 0);
eq("shop-only: byOrigin ทุกกลุ่ม orders 0", onlyShop.months[0].byOrigin.guangzhou.orders + onlyShop.months[0].byOrigin.yiwu.orders + onlyShop.months[0].byOrigin.unknown.orders, 0);
eq("shop-only: import orders 0", onlyShop.months[0].byService.import.orders, 0);
eq("shop-only: total orders 1", onlyShop.months[0].total.orders, 1);

console.log(`✓ paid-work-report.test.ts — ${passed} assertions passed`);
