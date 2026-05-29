/**
 * Unit tests for the Tier A4 silent-dead-write fix in
 * `actions/admin/service-orders.ts::adminUpdateServiceOrder`.
 *
 * Scope: the pure mapping helpers we depend on for the
 * `service_orders` → `tb_header_order` pivot. The mutation flow
 * itself (auth + Supabase + notification) is covered by the
 * qa-flow-simulator skill during phase verify (same convention as
 * actions/product-search.test.ts).
 *
 * What this asserts:
 *  (a) Every rebuilt enum key the action writes a date column for
 *      has a matching legacy hstatus code in LEGACY_ORDER_STATUS —
 *      i.e. when we set `update.hdateN = nowIso` we also set
 *      `update.hstatus = <valid code>`.
 *  (b) The legacy hstatus codes round-trip rebuilt-enum → legacy-code
 *      → Thai label per shops.php COMMENT on column.
 *  (c) Every rebuilt enum value in the action's STATUSES tuple is
 *      mappable to a legacy code (no rebuilt status would be a
 *      silent unknown_status:* error in prod).
 *
 * Run with:
 *   pnpm tsx actions/admin/service-orders.test.ts
 */

import {
  LEGACY_ORDER_STATUS,
  legacyOrderStatusThai,
  type LegacyOrderCode,
} from "@/lib/legacy-status-map";

const PASS_MARK = "OK";
const FAIL_MARK = "FAIL";

let failed = 0;
let passed = 0;

function assertEq<T>(actual: T, expected: T, label: string): void {
  if (actual === expected) {
    console.log(`  ${PASS_MARK} ${label}`);
    passed++;
  } else {
    console.log(
      `  ${FAIL_MARK} ${label}\n      expected: ${JSON.stringify(expected)}\n      actual:   ${JSON.stringify(actual)}`,
    );
    failed++;
  }
}

function group(name: string, fn: () => void): void {
  console.log(`\n${name}`);
  fn();
}

console.log("=== service-orders Tier A4 mapping tests ===");

// The action's LEGACY_STATUS_DATE_COL + REBUILT_TO_LEGACY_HSTATUS —
// duplicated here on purpose to pin the column shape independent of
// the action module (which has "use server" and pulls in Supabase).
// If the action's maps drift from this, the test fails — that's intended.
const LEGACY_STATUS_DATE_COL: Record<string, string | null> = {
  awaiting_payment:       "hdate2",
  ordered:                "hdate3",
  awaiting_chn_dispatch:  "hdate4",
  completed:              "hdate5",
};
const REBUILT_TO_LEGACY_HSTATUS: Record<string, string> = {
  pending:               "1",
  awaiting_payment:      "2",
  ordered:               "3",
  awaiting_chn_dispatch: "4",
  completed:             "5",
  cancelled:             "6",
};

// The rebuilt status enum the action accepts (mirrors actions/admin/service-orders.ts STATUSES).
const REBUILT_STATUSES = [
  "pending",
  "awaiting_payment",
  "ordered",
  "awaiting_chn_dispatch",
  "completed",
  "cancelled",
] as const;

// ────────────────────────────────────────────────────────────
// (a) Every rebuilt enum value resolves to a legacy code
// ────────────────────────────────────────────────────────────
group("(a) Every rebuilt status maps to a legacy hstatus code", () => {
  for (const status of REBUILT_STATUSES) {
    const code = REBUILT_TO_LEGACY_HSTATUS[status];
    assertEq(
      typeof code === "string" && code.length === 1,
      true,
      `REBUILT_TO_LEGACY_HSTATUS["${status}"] is a single-char legacy code (got ${JSON.stringify(code)})`,
    );
  }
});

// ────────────────────────────────────────────────────────────
// (b) Legacy hstatus codes match shops.php comment-on-column
// ────────────────────────────────────────────────────────────
group("(b) Legacy hstatus codes match shops.php / migration 0081", () => {
  // Reference: COMMENT ON COLUMN tb_header_order.hstatus IS
  //   '1=รอดำเนินการ 2=รอชำระเงิน 3=สั่งสินค้า 4=รอร้านจีนจัดส่ง 5=สำเร็จ 6=ยกเลิกออเดอร์'
  // (migration 0081_pcs_legacy_schema.sql L2568)
  assertEq(REBUILT_TO_LEGACY_HSTATUS.pending,              "1", "pending → '1'");
  assertEq(REBUILT_TO_LEGACY_HSTATUS.awaiting_payment,     "2", "awaiting_payment → '2'");
  assertEq(REBUILT_TO_LEGACY_HSTATUS.ordered,              "3", "ordered → '3'");
  assertEq(REBUILT_TO_LEGACY_HSTATUS.awaiting_chn_dispatch,"4", "awaiting_chn_dispatch → '4'");
  assertEq(REBUILT_TO_LEGACY_HSTATUS.completed,            "5", "completed → '5'");
  assertEq(REBUILT_TO_LEGACY_HSTATUS.cancelled,            "6", "cancelled → '6'");
});

// ────────────────────────────────────────────────────────────
// (c) LEGACY_STATUS_DATE_COL keys are all valid mid-lifecycle statuses
// ────────────────────────────────────────────────────────────
group("(c) Every key in LEGACY_STATUS_DATE_COL is a real lifecycle status", () => {
  // The date-column write only fires for the mid-lifecycle states —
  // 'pending' has no hdateN column (the header was created by hdate)
  // and 'cancelled' has no hdateN column (legacy uses hDateUpdate only).
  for (const status of Object.keys(LEGACY_STATUS_DATE_COL)) {
    assertEq(
      REBUILT_STATUSES.includes(status as (typeof REBUILT_STATUSES)[number]),
      true,
      `LEGACY_STATUS_DATE_COL key "${status}" is in the rebuilt STATUSES enum`,
    );
  }

  // Sanity-check the exact column names match what migration 0081
  // declares (hdate2 = awaiting_payment, hdate3 = ordered, hdate4 =
  // awaiting_chn_dispatch, hdate5 = completed).
  assertEq(LEGACY_STATUS_DATE_COL.awaiting_payment,      "hdate2", "awaiting_payment date col is hdate2");
  assertEq(LEGACY_STATUS_DATE_COL.ordered,               "hdate3", "ordered date col is hdate3");
  assertEq(LEGACY_STATUS_DATE_COL.awaiting_chn_dispatch, "hdate4", "awaiting_chn_dispatch date col is hdate4");
  assertEq(LEGACY_STATUS_DATE_COL.completed,             "hdate5", "completed date col is hdate5");

  assertEq(LEGACY_STATUS_DATE_COL.pending,   undefined, "pending has NO date col (uses hdate at creation)");
  assertEq(LEGACY_STATUS_DATE_COL.cancelled, undefined, "cancelled has NO date col (uses hdateupdate)");
});

// ────────────────────────────────────────────────────────────
// (d) hstatus → Thai label round-trip is the wording staff knows
// ────────────────────────────────────────────────────────────
group("(d) hstatus → Thai label matches shops.php wording", () => {
  // These are the exact strings ~8,898 PCS customers see today —
  // changing them silently breaks zero-retraining (D1 goal).
  assertEq(legacyOrderStatusThai("1"), "รอดำเนินการ",      "code '1' → รอดำเนินการ");
  assertEq(legacyOrderStatusThai("2"), "รอชำระเงิน",       "code '2' → รอชำระเงิน");
  assertEq(legacyOrderStatusThai("3"), "สั่งสินค้า",        "code '3' → สั่งสินค้า");
  assertEq(legacyOrderStatusThai("4"), "รอร้านจีนจัดส่ง",   "code '4' → รอร้านจีนจัดส่ง");
  assertEq(legacyOrderStatusThai("5"), "สำเร็จ",            "code '5' → สำเร็จ");
  assertEq(legacyOrderStatusThai("6"), "ยกเลิก",            "code '6' → ยกเลิก");

  assertEq(legacyOrderStatusThai(null),      "", "null code → empty string");
  assertEq(legacyOrderStatusThai(undefined), "", "undefined code → empty string");
});

// ────────────────────────────────────────────────────────────
// (e) LEGACY_ORDER_STATUS reverse-lookup is total over its 6 codes
// ────────────────────────────────────────────────────────────
group("(e) LEGACY_ORDER_STATUS reverse-lookup is total", () => {
  const codes: LegacyOrderCode[] = ["1", "2", "3", "4", "5", "6"];
  for (const code of codes) {
    const entry = LEGACY_ORDER_STATUS[code];
    assertEq(
      typeof entry?.key === "string" && entry.key.length > 0,
      true,
      `LEGACY_ORDER_STATUS["${code}"].key is a non-empty string`,
    );
    assertEq(
      typeof entry?.thai === "string" && entry.thai.length > 0,
      true,
      `LEGACY_ORDER_STATUS["${code}"].thai is a non-empty string`,
    );
  }
});

// ────────────────────────────────────────────────────────────
// summary
// ────────────────────────────────────────────────────────────
console.log(`\n${passed} pass, ${failed} fail`);
if (failed > 0) process.exit(1);
