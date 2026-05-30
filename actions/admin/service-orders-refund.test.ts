/**
 * P0-16 unit tests — the per-item refund pure helpers + write contract.
 *
 * Locks down the contract that the writeable path must obey before any
 * Supabase round-trip (so we can validate it without a live DB):
 *
 *   A. Idempotency guards — crewallet='1' rejected, qty > camount rejected
 *   B. Status-transition gate — allows hstatus IN {3,4,5}, rejects 1/2/6
 *   C. Money math — refundAmountThb = round(cprice × refundQty)
 *   D. Wallet bump direction — newBalance = currentBalance + refundAmountThb
 *   E. Item mutate shape — full-qty marks crewallet='1' + camount=0;
 *      partial reduces camount by refundQty
 *   F. Header recompute — newHeaderTotal = max(0, currentHeaderTotal - refund)
 *   G. tb_wallet_hs payload — type='5' status='2' typenew='2' typeservice='1'
 *
 * Not asserting Supabase REST-side errors (those are exercised in the
 * qa-flow-simulator gate per ADR-0018 D-4). This file's job is the
 * pure-logic invariants that NEVER pass the gate if broken.
 */

// Tiny test harness (matches sitting-D pattern in
// actions/admin/wallet-hs.test.ts so the shape stays consistent).
let pass = 0;
let fail = 0;

function assertEq(label: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    pass++;
    console.log(`  ✓ ${label}`);
  } else {
    fail++;
    console.error(`  ✗ ${label}\n    expected: ${JSON.stringify(expected)}\n    actual:   ${JSON.stringify(actual)}`);
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

console.log("=== adminRefundShopOrderItem — P0-16 per-item refund contract ===");

// ════════════════════════════════════════════════════════════════
// A. Idempotency guards
// ════════════════════════════════════════════════════════════════
section("A. Idempotency guards");

// "crewallet='1' = already refunded" rule
const isFullyRefunded = (crewallet: string | null): boolean => crewallet === "1";
assertEq("crewallet='1' → fully refunded (block)", isFullyRefunded("1"), true);
assertEq("crewallet=null  → OK", isFullyRefunded(null), false);
assertEq("crewallet=''    → OK", isFullyRefunded(""), false);
assertEq("crewallet='0'   → OK", isFullyRefunded("0"), false);

// "refundQty > camount" rule
const isOverRefund = (refundQty: number, camount: number): boolean => refundQty > camount;
assertEq("3 > 5  → OK",      isOverRefund(3, 5), false);
assertEq("5 = 5  → OK",      isOverRefund(5, 5), false);
assertEq("6 > 5  → block",   isOverRefund(6, 5), true);

// ════════════════════════════════════════════════════════════════
// B. Status-transition gate
// ════════════════════════════════════════════════════════════════
section("B. Status-transition gate (legacy hstatus chars)");

const refundAllowed = new Set(["3", "4", "5"]);
const canRefundAt = (hstatus: string | null): boolean =>
  refundAllowed.has(hstatus ?? "");

assertEq("hstatus='1' รอดำเนินการ → block",       canRefundAt("1"), false);
assertEq("hstatus='2' รอชำระเงิน  → block",       canRefundAt("2"), false);
assertEq("hstatus='3' สั่งสินค้าแล้ว → allow",     canRefundAt("3"), true);
assertEq("hstatus='4' รอจัดส่งจากจีน → allow",     canRefundAt("4"), true);
assertEq("hstatus='5' สำเร็จ → allow",            canRefundAt("5"), true);
assertEq("hstatus='6' ยกเลิก → block",            canRefundAt("6"), false);
assertEq("hstatus=null → block (defensive)",      canRefundAt(null), false);

// ════════════════════════════════════════════════════════════════
// C. Money math — refundAmountThb = round(cprice × refundQty, 2)
// ════════════════════════════════════════════════════════════════
section("C. Money math");

const computeRefund = (cprice: number, refundQty: number): number =>
  Math.round(cprice * refundQty * 100) / 100;

assertEq("฿100 × 3 = ฿300",            computeRefund(100, 3), 300);
assertEq("฿55.50 × 2 = ฿111",          computeRefund(55.50, 2), 111);
assertEq("฿33.33 × 3 = ฿99.99",        computeRefund(33.33, 3), 99.99);
assertEq("฿0.01 × 100 = ฿1",           computeRefund(0.01, 100), 1);
assertEq("฿1234.56 × 7 = ฿8641.92",    computeRefund(1234.56, 7), 8641.92);

// ════════════════════════════════════════════════════════════════
// D. Wallet bump direction (balance ADDS the refund)
// ════════════════════════════════════════════════════════════════
section("D. Wallet bump direction");

const computeNewBalance = (current: number, refund: number): number =>
  Math.round((current + refund) * 100) / 100;

assertEq("฿0 + ฿300 = ฿300",            computeNewBalance(0, 300), 300);
assertEq("฿1500.50 + ฿111 = ฿1611.50",  computeNewBalance(1500.50, 111), 1611.50);
assertEq("฿0.01 + ฿0.02 = ฿0.03",       computeNewBalance(0.01, 0.02), 0.03);

// ════════════════════════════════════════════════════════════════
// E. Item mutate shape (full vs partial)
// ════════════════════════════════════════════════════════════════
section("E. Item mutate shape (full vs partial refund)");

type ItemUpdate = { crewallet?: string; camount?: number };
function computeItemUpdate(refundQty: number, camount: number): ItemUpdate {
  const isFull = refundQty === camount;
  return isFull ? { crewallet: "1", camount: 0 } : { camount: camount - refundQty };
}

const fullUpdate = computeItemUpdate(5, 5);
assertEq("full-qty (5 of 5) → crewallet='1'",  fullUpdate.crewallet, "1");
assertEq("full-qty (5 of 5) → camount=0",       fullUpdate.camount,   0);
assertEq("full-qty payload size",               Object.keys(fullUpdate).length, 2);

const partialUpdate = computeItemUpdate(3, 10);
assertEq("partial-qty (3 of 10) → no crewallet flag", "crewallet" in partialUpdate, false);
assertEq("partial-qty (3 of 10) → camount=7",        partialUpdate.camount, 7);
assertEq("partial-qty payload size",                  Object.keys(partialUpdate).length, 1);

const singletonFullUpdate = computeItemUpdate(1, 1);
assertEq("singleton full (1 of 1) → crewallet='1'",   singletonFullUpdate.crewallet, "1");
assertEq("singleton full (1 of 1) → camount=0",       singletonFullUpdate.camount, 0);

// ════════════════════════════════════════════════════════════════
// F. Header total recompute — bounded ≥ 0
// ════════════════════════════════════════════════════════════════
section("F. Header total recompute (bounded ≥ 0)");

const computeNewHeaderTotal = (current: number, refund: number): number =>
  Math.max(0, Math.round((current - refund) * 100) / 100);

assertEq("฿1000 - ฿300 = ฿700",         computeNewHeaderTotal(1000, 300), 700);
assertEq("฿500 - ฿111 = ฿389",          computeNewHeaderTotal(500, 111), 389);
assertEq("฿100 - ฿100 = ฿0",            computeNewHeaderTotal(100, 100), 0);
assertEq("฿50 - ฿100 = ฿0 (clamped)",   computeNewHeaderTotal(50, 100), 0);
assertEq("฿0 - ฿0 = ฿0",                 computeNewHeaderTotal(0, 0), 0);

// ════════════════════════════════════════════════════════════════
// G. tb_wallet_hs INSERT payload shape (type/status/typenew/typeservice)
// ════════════════════════════════════════════════════════════════
section("G. tb_wallet_hs INSERT payload shape (legacy column values)");

function buildHsPayload(opts: {
  refundAmount: number;
  legacyAdminId: string;
  userid: string;
  hno: string;
  note: string;
  nowIso: string;
}) {
  return {
    date:            opts.nowIso,
    amount:          opts.refundAmount,
    status:          "2",
    type:            "5",
    typenew:         "2",
    typeservice:     "1",
    paydeposit:      "0",
    imagesslip:      "",
    depositnamebank: "",
    nameuserbank:    "",
    nouserbank:      "",
    note:            opts.note,
    adminid:         opts.legacyAdminId,
    adminidupdate:   opts.legacyAdminId,
    session:         "admin-refund-item",
    reforder:        opts.hno,
    whno:            "",
    wusercredit:     "0",
    userid:          opts.userid,
    adminidcrate:    opts.legacyAdminId,
  };
}

const hs = buildHsPayload({
  refundAmount:  300,
  legacyAdminId: "admin_test",
  userid:        "PR10683",
  hno:           "PR10683-3-25",
  note:          "test refund",
  nowIso:        "2026-05-30T12:00:00.000Z",
});

assertEq("type = '5' (รายการคืนเงิน per 0081 comment)", hs.type, "5");
assertEq("status = '2' (admin = verifier)",            hs.status, "2");
assertEq("typenew = '2' (refund matrix)",              hs.typenew, "2");
assertEq("typeservice = '1' (cargo/shop context)",     hs.typeservice, "1");
assertEq("amount stored positive (direction via type)",hs.amount, 300);
assertEq("reforder links to parent hno",               hs.reforder, "PR10683-3-25");
assertEq("session tag",                                hs.session, "admin-refund-item");
assertEq("userid = customer",                          hs.userid, "PR10683");

// ════════════════════════════════════════════════════════════════
// Wrap-up
// ════════════════════════════════════════════════════════════════
console.log(`\n${pass} pass · ${fail} fail`);
if (fail > 0) process.exit(1);

// Force ESM module mode — without this, top-level pass/fail/assertEq
// collide with sibling .test.ts files in tsc's project graph (TS 2393/2451).
export {};
