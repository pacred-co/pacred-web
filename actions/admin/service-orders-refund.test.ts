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

// roundUp(x,2) — CEIL to 2dp (mirrors lib/admin/shop-disbursement-calc roundUp,
// the helper the refund + recompute now use).
function roundUp2(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const scaled = value * 100;
  const eps = 1e-9 * Math.max(1, Math.abs(scaled));
  const r = Math.ceil(scaled - eps) / 100;
  return r === 0 ? 0 : r;
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
// C. Money math (fix #1) — refundAmountThb = roundUp(cprice¥ × qty × ORDER hrate, 2)
//    cprice is the YUAN unit price → the refund converts ¥→THB at the rate the
//    customer PAID. NOT ¥-as-THB (the bug), NOT the live/current rate.
// ════════════════════════════════════════════════════════════════
section("C. Money math — ¥ × order rate → THB (ceil to satang)");

const computeRefund = (cpriceCny: number, refundQty: number, orderHrate: number): number =>
  roundUp2(cpriceCny * refundQty * orderHrate);

// ¥100/pc × 3 × 5.00 = ¥300 → ฿1,500 (NOT ฿300 — the ¥-as-฿ bug credited 5× short)
assertEq("¥100 × 3 × 5.00 = ฿1500",       computeRefund(100, 3, 5.0), 1500);
assertEq("¥55.50 × 2 × 4.90 = ฿543.90",   computeRefund(55.5, 2, 4.9), 543.9);
// ceil-to-satang: 33.33 × 3 × 4.93 = 492.95…07 → 492.96 (rounds UP)
assertEq("¥33.33 × 3 × 4.93 → ฿492.96",   computeRefund(33.33, 3, 4.93), 492.96);
assertEq("¥1 × 1 × 4.88 = ฿4.88",         computeRefund(1, 1, 4.88), 4.88);
// the bug: without the rate a ¥ was credited as ฿ (5× short) — proves the fix
assertTrue("with rate ≠ ¥-as-฿ (bug)",    computeRefund(100, 3, 5.0) !== (100 * 3));

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
// F. Header total recompute (fix #2) — re-derived from the REMAINING lines
//    via the canonical formula, NOT a delta-subtraction that drifts:
//      htotalpricechn = Σ roundUp(cprice × camount, 2)  (remaining product lines)
//      htotalpriceuser = roundUp((chn + shipChn) × rate + svc, 2)
// ════════════════════════════════════════════════════════════════
section("F. Header recompute from remaining lines");

// Σ roundUp(cprice × camount, 2) over remaining non-refunded lines.
const sumChn = (lines: Array<{ cprice: number; camount: number }>): number => {
  let s = 0;
  for (const ln of lines) if (ln.camount > 0) s = roundUp2(s + roundUp2(ln.cprice * ln.camount));
  return s;
};
const computeHeaderTotal = (chn: number, shipChn: number, rate: number, svc: number): number =>
  roundUp2((chn + shipChn) * rate + svc);

// Order: 2 lines (¥100×3, ¥50×2), ship ¥20, rate 5, svc 0.
// Full order chn = 300+100 = 400 → total (400+20)×5 = 2100.
const allLines = [{ cprice: 100, camount: 3 }, { cprice: 50, camount: 2 }];
assertEq("chn all lines = ¥400",         sumChn(allLines), 400);
assertEq("total all = ฿2100",            computeHeaderTotal(sumChn(allLines), 20, 5, 0), 2100);

// Refund the ¥50×2 line fully (camount→0) → remaining chn = ¥300 → total (300+20)×5 = 1600.
const afterFullRefund = [{ cprice: 100, camount: 3 }, { cprice: 50, camount: 0 }];
assertEq("chn after full refund = ¥300", sumChn(afterFullRefund), 300);
assertEq("total after full = ฿1600",     computeHeaderTotal(sumChn(afterFullRefund), 20, 5, 0), 1600);

// Partial: reduce ¥100 line 3→1 → remaining chn = 100 + 100 = ¥200 → (200+20)×5 = 1100.
const afterPartial = [{ cprice: 100, camount: 1 }, { cprice: 50, camount: 2 }];
assertEq("chn after partial = ¥200",     sumChn(afterPartial), 200);
assertEq("total after partial = ฿1100",  computeHeaderTotal(sumChn(afterPartial), 20, 5, 0), 1100);

// ════════════════════════════════════════════════════════════════
// F2. Shipping refund (fix #3) — refund = Δ¥ × order rate; new total uses new ship.
// ════════════════════════════════════════════════════════════════
section("F2. Shipping refund at order rate");

const shippingRefund = (curShipChn: number, newShipChn: number, rate: number): number =>
  roundUp2(Math.max(0, Math.round((curShipChn - newShipChn) * 100) / 100) * rate);

assertEq("ship ¥50 → ¥20, rate 5 → ฿150 refund", shippingRefund(50, 20, 5), 150);
assertEq("ship unchanged → ฿0",                  shippingRefund(30, 30, 5), 0);
// new header total after shipping reduce (chn 400, newShip 20, rate 5) = 2100
assertEq("header after ship reduce = ฿2100",     computeHeaderTotal(400, 20, 5, 0), 2100);

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
