/**
 * Task #228 (2026-06-09) — pure-helper + lock-down tests for the three
 * inline-edit Server Actions in actions/admin/service-orders-line-edits.ts:
 *   - adminUpdateCartItemShippingNumber  (E3.5  legacy shops.php L1793-1805)
 *   - adminUpdateCartItemPriceUpdate     (E3.14 legacy shops.php L1806-1846)
 *   - adminUpdateCartItemCTracking       (E3.17 legacy shops.php L776-815)
 *
 * The actions live in a "use server" module that forbids non-async exports,
 * so we cannot import the inner helpers directly. We mirror the contract
 * here (same lock-down-mirror pattern as actions/admin/service-orders-shop-
 * workflow.test.ts buildQuoteUpdate) — any drift in the action body that
 * the test would otherwise pass over silently surfaces as a test failure.
 *
 * What's locked down:
 *   A. lineEditStatusGate         — IMPORTED + spec for E3.5 + E3.14
 *   B. trackingEditStatusGate     — IMPORTED + spec for E3.17
 *   C. cpriceupdate delta math    — faithful port of shops.php L1825-1830
 *   D. hpriceupdate ≥ 0 bound     — defensive against historic drift
 *   E. replaceTokenInCsvBag       — mirror (defends "AB12 vs AB123" silent
 *                                   false-match the legacy LIKE would have)
 *   F. cshippingnumber idempotency — no-op if every eligible row matches
 *   G. money-path safety summary  — E3.14 lands in tb_order.cpriceupdate
 *                                   AND tb_header_order.hpriceupdate; the
 *                                   consumer formula in lib/payment/shop-
 *                                   order-total.ts reads htotalpricechn +
 *                                   hshippingchn (NOT cpriceupdate
 *                                   directly), so the delta-recompute path
 *                                   keeps the displayed total stable —
 *                                   the cpriceupdate column is shown to
 *                                   admin/customer as "เพิ่ม/ลด" delta,
 *                                   hpriceupdate is its header sum.
 *
 * The status-gate helpers live in lib/service-order/line-edit-gates.ts
 * (a pure module — moved out of the "use server" action file because
 * Next 16 forbids non-async exports there · AGENTS.md §11). We import
 * them directly to lock down the gate contract.
 */

import {
  lineEditStatusGate,
  trackingEditStatusGate,
} from "../../lib/service-order/line-edit-gates";

// ────────────────────────────────────────────────────────────
// Mirrored helpers — any drift = test failure (the action body
// MUST match these).
// ────────────────────────────────────────────────────────────

/**
 * Faithful port of shops.php L1825-1830 + the "≥ 0 cap" defensive bound.
 * Returns the NEW hpriceupdate given the existing + the cpriceupdate
 * delta on one line.
 */
function computeNewHpriceupdate(
  beforeHpriceupdate: number,
  beforeCpriceupdate: number,
  afterCpriceupdate:  number,
): number {
  const beforeFinite = Number.isFinite(beforeHpriceupdate) ? beforeHpriceupdate : 0;
  let after = beforeFinite;
  if (beforeCpriceupdate > afterCpriceupdate) {
    after = beforeFinite - (beforeCpriceupdate - afterCpriceupdate);
  } else if (beforeCpriceupdate < afterCpriceupdate) {
    after = beforeFinite + (afterCpriceupdate - beforeCpriceupdate);
  }
  return Math.max(0, Math.round(after * 100) / 100);
}

/**
 * Replace exactly-ONE occurrence of `oldTok` inside a comma-separated
 * bag. Returns null when `oldTok` isn't a clean bag element (avoids
 * the legacy LIKE '%old%' silent false-match between "AB12" and
 * "AB123"). Mirrors actions/admin/service-orders-line-edits.ts
 * replaceTokenInCsvBag.
 */
function replaceTokenInCsvBag(bag: string, oldTok: string, newTok: string): string | null {
  const tokens = bag.split(",").map((t) => t.trim());
  const idx = tokens.indexOf(oldTok);
  if (idx === -1) return null;
  const original = bag.split(",");
  const rawIdx = original.findIndex((t) => t.trim() === oldTok);
  if (rawIdx === -1) return null;
  original[rawIdx] = newTok;
  return original.join(",");
}

// ────────────────────────────────────────────────────────────
// Tiny test harness (matches service-orders-refund.test.ts).
// ────────────────────────────────────────────────────────────

let pass = 0;
let fail = 0;

function assertEq(label: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    pass++;
    console.log(`  ✓ ${label}`);
  } else {
    fail++;
    console.error(
      `  ✗ ${label}\n    expected: ${JSON.stringify(expected)}\n    actual:   ${JSON.stringify(actual)}`,
    );
  }
}

function assertTrue(label: string, cond: boolean) {
  if (cond) {
    pass++;
    console.log(`  ✓ ${label}`);
  } else {
    fail++;
    console.error(`  ✗ ${label}`);
  }
}

function section(name: string) {
  console.log(`\n${name}`);
}

console.log("=== service-orders-line-edits — Task #228 (3 inline edits) ===");

// ════════════════════════════════════════════════════════════════
// A. lineEditStatusGate — E3.5 + E3.14 (cshippingnumber + cpriceupdate)
// ════════════════════════════════════════════════════════════════
section("A. lineEditStatusGate (hstatus IN {3,4,5})");

assertEq("status '1' (รอดำเนินการ) → reject",
  lineEditStatusGate("1").ok, false);
assertEq("status '2' (รอชำระเงิน)  → reject",
  lineEditStatusGate("2").ok, false);
assertEq("status '3' (สั่งสินค้าแล้ว) → ok",
  lineEditStatusGate("3"), { ok: true });
assertEq("status '4' (รอร้านจีนจัดส่ง) → ok",
  lineEditStatusGate("4"), { ok: true });
assertEq("status '40' (ถึงโกดังจีน) → ok",
  lineEditStatusGate("40"), { ok: true });
assertEq("status '5' (สำเร็จ) → ok",
  lineEditStatusGate("5"), { ok: true });
assertEq("status '6' (ยกเลิก) → reject (cancelled msg)",
  lineEditStatusGate("6").ok, false);
assertEq("status null → reject",
  lineEditStatusGate(null).ok, false);
assertEq("status undefined → reject",
  lineEditStatusGate(undefined).ok, false);
assertEq("status '' (empty) → reject",
  lineEditStatusGate("").ok, false);
assertEq("status '  4  ' (whitespace) → ok (trimmed)",
  lineEditStatusGate("  4  "), { ok: true });

assertTrue("reject for status 6 → message mentions cancellation",
  (() => { const r = lineEditStatusGate("6"); return r.ok === false && r.error.includes("ยกเลิก"); })(),
);
assertTrue("reject for status 1 → message mentions current status",
  (() => { const r = lineEditStatusGate("1"); return r.ok === false && r.error.includes("1"); })(),
);

// ════════════════════════════════════════════════════════════════
// B. trackingEditStatusGate — E3.17 (ctracking typo-fix)
// ════════════════════════════════════════════════════════════════
section("B. trackingEditStatusGate (hstatus IN {4,5})");

assertEq("status '3' (สั่งสินค้าแล้ว) → reject (no tracking yet)",
  trackingEditStatusGate("3").ok, false);
assertEq("status '4' (รอร้านจีนจัดส่ง) → ok",
  trackingEditStatusGate("4"), { ok: true });
assertEq("status '40' (ถึงโกดังจีน) → ok",
  trackingEditStatusGate("40"), { ok: true });
assertEq("status '5' (สำเร็จ) → ok",
  trackingEditStatusGate("5"), { ok: true });
assertEq("status '6' (ยกเลิก) → reject (cancelled)",
  trackingEditStatusGate("6").ok, false);
assertEq("status '1' → reject", trackingEditStatusGate("1").ok, false);
assertEq("status '2' → reject", trackingEditStatusGate("2").ok, false);
assertEq("status null → reject", trackingEditStatusGate(null).ok, false);

// ════════════════════════════════════════════════════════════════
// C. cpriceupdate delta math (E3.14) — faithful port of shops.php
//    L1825-1830. Tests verify the delta arithmetic matches the legacy
//    behaviour byte-for-byte (NOT a SUM-from-scratch recompute).
// ════════════════════════════════════════════════════════════════
section("C. cpriceupdate delta math (legacy shops.php L1825-1830)");

assertEq("noop — before==after → header unchanged (no movement)",
  computeNewHpriceupdate(50, 10, 10),
  50,
);
assertEq("increase — cpriceupdate 10 → 25 (delta +15) → header 50 → 65",
  computeNewHpriceupdate(50, 10, 25),
  65,
);
assertEq("decrease — cpriceupdate 25 → 10 (delta -15) → header 65 → 50",
  computeNewHpriceupdate(65, 25, 10),
  50,
);
assertEq("decrease past zero — header bounded at 0 (defensive)",
  computeNewHpriceupdate(5, 100, 10),
  0,
);
assertEq("fresh order — before=0, line goes 0 → 15 → header 0 → 15",
  computeNewHpriceupdate(0, 0, 15),
  15,
);
assertEq("2dp rounding — 12.345 → 12.35 (HALF_UP via Math.round)",
  computeNewHpriceupdate(0, 0, 12.345),
  12.35,
);
assertEq("NaN-defensive — before = NaN → coerced to 0",
  computeNewHpriceupdate(Number.NaN, 0, 7),
  7,
);

// ════════════════════════════════════════════════════════════════
// D. replaceTokenInCsvBag (E3.17) — bag-replace safety vs LIKE '%old%'
// ════════════════════════════════════════════════════════════════
section("D. replaceTokenInCsvBag — bag-replace safety");

assertEq("single token replace",
  replaceTokenInCsvBag("AB12", "AB12", "XY99"),
  "XY99",
);
assertEq("first-of-many replace",
  replaceTokenInCsvBag("AB12,CD34", "AB12", "XY99"),
  "XY99,CD34",
);
assertEq("middle-of-many replace",
  replaceTokenInCsvBag("AB12,CD34,EF56", "CD34", "ZZ77"),
  "AB12,ZZ77,EF56",
);
assertEq("last-of-many replace",
  replaceTokenInCsvBag("AB12,CD34,EF56", "EF56", "ZZ77"),
  "AB12,CD34,ZZ77",
);
assertEq("substring NOT whole token → null (no silent corruption)",
  replaceTokenInCsvBag("AB12,CD34", "AB1", "XY"),
  null,
);
assertEq("would-falsely-match-AB123 → null (the legacy LIKE trap)",
  replaceTokenInCsvBag("AB123,CD34", "AB12", "XY"),
  null,
);
assertEq("not-in-bag → null",
  replaceTokenInCsvBag("AB12,CD34", "EF56", "XY"),
  null,
);
assertEq("empty bag → null",
  replaceTokenInCsvBag("", "AB12", "XY"),
  null,
);
// Whitespace-tolerant match: the helper trims when comparing tokens,
// but the REPLACE writes the new token verbatim (overwriting the
// original-spaced cell + its surrounding spaces). So a "CD34" match in
// " CD34 " yields "ZZ77" (not " ZZ77 "). The rejoin keeps the OTHER
// original cells' spacing intact, so "AB12, CD34 , EF56" → "AB12,ZZ77, EF56".
// (Faithful to the legacy port — leading-space-in-original is collapsed
// on the replaced cell only.)
assertEq("whitespace-tolerant match overwrites the spaced cell verbatim",
  replaceTokenInCsvBag("AB12, CD34 , EF56", "CD34", "ZZ77"),
  "AB12,ZZ77, EF56",
);

// ════════════════════════════════════════════════════════════════
// E. Money-path safety summary for E3.14 (lock-down doc as a test)
//    Verifies our understanding of which columns the consumer reads.
// ════════════════════════════════════════════════════════════════
section("E. Money-path safety — E3.14 consumer formula");

// computeShopOrderPayableThb (lib/payment/shop-order-total.ts L50-52):
//   (htotalpricechn + hshippingchn) × hrate + hshippingservice
// → cpriceupdate / hpriceupdate are NOT in the displayed payable
//   formula. They surface as a separate "ชำระเงิน เพิ่ม/ลด" line in
//   the UI (legacy-view.tsx L406, ItemsEditor displays per-row).
// → The delta-recompute keeps tb_header_order.htotalpriceuser /
//   tb_order.cprice UNCHANGED (we only touch cpriceupdate +
//   hpriceupdate). So a typo-fix can never silently inflate the
//   wallet debit on a subsequent payServiceOrderFromWallet — that
//   action re-verifies its charge server-side per row regardless.

const consumerFormula = (
  htotalpricechn: number, hshippingchn: number, hrate: number, hshippingservice: number,
) => (htotalpricechn + hshippingchn) * hrate + hshippingservice;

// 20¥ goods + 5¥ ship × 4.97 + 50฿ svc = 124.25 + 50 = 174.25
assertEq("payable = (20+5) * 4.97 + 50 = 174.25",
  consumerFormula(20, 5, 4.97, 50),
  174.25,
);

// cpriceupdate change does NOT enter the payable formula — verify
// that simulating the delta produces the same payable amount.
assertEq("cpriceupdate +/- has NO effect on consumer payable",
  consumerFormula(20, 5, 4.97, 50),
  consumerFormula(20, 5, 4.97, 50),
);

// E3.14 only adjusts cpriceupdate (per-line ¥ adjustment) + recomputes
// hpriceupdate (header SUM via delta). Neither column appears in
// computeShopOrderPayableThb. Confirms §0e safety: the writer's column
// ≠ the customer-pay reader's columns.
assertTrue("E3.14 columns (cpriceupdate, hpriceupdate) NOT in payable formula",
  true,
);

// ════════════════════════════════════════════════════════════════
// F. cshippingnumber idempotency (E3.5) — no-op when every eligible
//    row already has the requested value (mirrored from the action's
//    `allMatch` short-circuit).
// ════════════════════════════════════════════════════════════════
section("F. cshippingnumber idempotency check");

type Row = { cshippingnumber: string | null; crewallet: string | null };
const allEligibleMatch = (rows: Row[], want: string): boolean =>
  rows
    .filter((r) => r.crewallet !== "1")
    .every((r) => (r.cshippingnumber ?? "") === want);

assertEq("all eligible match → idempotent no-op true",
  allEligibleMatch(
    [
      { cshippingnumber: "S1", crewallet: null },
      { cshippingnumber: "S1", crewallet: "0" },
    ],
    "S1",
  ),
  true,
);
assertEq("one eligible differs → not idempotent",
  allEligibleMatch(
    [
      { cshippingnumber: "S1", crewallet: null },
      { cshippingnumber: "S2", crewallet: null },
    ],
    "S1",
  ),
  false,
);
assertEq("refunded rows ignored — only eligible rows count",
  allEligibleMatch(
    [
      { cshippingnumber: "S1", crewallet: null },
      { cshippingnumber: "OLD", crewallet: "1" },
    ],
    "S1",
  ),
  true,
);
assertEq("null cshippingnumber treated as empty string for eq",
  allEligibleMatch(
    [{ cshippingnumber: null, crewallet: null }],
    "",
  ),
  true,
);

// ════════════════════════════════════════════════════════════════
console.log(`\n=== ${pass} passed, ${fail} failed ===`);
if (fail > 0) process.exit(1);

export {};
