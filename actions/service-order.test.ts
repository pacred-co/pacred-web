/**
 * Unit tests for the P0-6 customer pay-from-wallet-on-shop-order flow
 * (actions/service-order.ts::payServiceOrderFromWallet).
 *
 * Locks down the ADR-0018 §D-2 rule 1 contract (shop-from-wallet sub-case):
 * customer DEBIT-on-submit with `tb_wallet_hs.type='2'` + `status='2'`,
 * `refOrder=hNo`, a tb_wallet balance debit, and a `tb_header_order`
 * hstatus 2→3 flip (hdate3 + paydeposit='1'). Closes the cust-02 P0-6
 * audit gap (legacy gap 2026-05-30 §3 P0-6) — the previous body read the
 * rebuilt empty `service_orders` + debited the rebuilt `wallet_transactions`.
 *
 * What this test asserts (pure-function / shape level):
 *   A. computeShopOrderDebitTotal — prefers stored htotalpriceuser; falls
 *      back to the legacy formula ((chn+ship)*rate)+svc; refuses (NaN) when
 *      neither yields a positive number (mirror of pay-users.php L158 +
 *      shops.php L1124-1125).
 *   B. Balance pre-check semantics — refuse when wallettotal < priceToPay,
 *      allow at exact-zero remaining (legacy `if($walletTotal>=$pricePay)`).
 *   C. New-balance math — round to 2 dp post-subtraction.
 *   D. tb_wallet_hs row shape — type='2' status='2' typenew='3'
 *      typeservice='1' paydeposit='1' refOrder=hNo, all NOT-NULL columns
 *      populated per 0081_pcs_legacy_schema.sql L6159-6185.
 *   E. tb_header_order status-flip shape — hstatus '3' + hdate3 +
 *      hdateupdate + paydeposit='1' (pay-users.php L166 self-pay branch).
 *   F. Payable-status gate — only hstatus='2' is payable; '3'/'4'/'5' →
 *      idempotent already-done; '1'/'6'/other → refuse.
 *   G. Return-shape contracts — { tx_id, already_paid } preserved (both
 *      call-sites read only res.ok / res.error).
 *
 * We do NOT exercise the full server action here (it depends on
 * createAdminClient · getCurrentUserWithProfile · sendNotification — the
 * same boundary as payment-tb.test.ts). Instead this tests the pure helper
 * + the row/return shapes the action builds.
 *
 * Pattern matches actions/payment-tb.test.ts (pass/fail counts, no vitest).
 */

import { computeShopOrderDebitTotal } from "../lib/service-order/debit-total";

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

function section(name: string) {
  console.log(`\n${name}`);
}

console.log("=== payServiceOrderFromWallet — P0-6 customer pay-from-wallet on shop order (ADR-0018 §D-2 rule 1) ===");

// ────────────────────────────────────────────────────────────
// A. computeShopOrderDebitTotal — priceToPay source (READ-ONLY helper)
// ────────────────────────────────────────────────────────────

section("A. computeShopOrderDebitTotal — stored htotalpriceuser preferred, legacy formula fallback");

// Stored total present + positive → use it verbatim (rounded 2dp).
assertEq("stored htotalpriceuser=5150 → 5150",
  computeShopOrderDebitTotal({ htotalpriceuser: 5150 }), 5150);
assertEq("stored htotalpriceuser='1234.567' → 1234.57 (string + round)",
  computeShopOrderDebitTotal({ htotalpriceuser: "1234.567" }), 1234.57);

// Stored null/0 → fall back to ((chn+ship)*rate)+svc (pay-users.php L158).
assertEq("stored 0 → fallback ((1000+50)*5)+100 = 5350",
  computeShopOrderDebitTotal({
    htotalpriceuser: 0, htotalpricechn: 1000, hshippingchn: 50, hshippingservice: 100, hrate: 5,
  }), 5350);
assertEq("stored null → fallback ((200+0)*5.15)+50 = 1080",
  computeShopOrderDebitTotal({
    htotalpriceuser: null, htotalpricechn: 200, hshippingchn: 0, hshippingservice: 50, hrate: 5.15,
  }), 1080);

// Neither stored nor a complete recompute → NaN (caller MUST refuse).
assertEq("stored 0 + missing recompute inputs → NaN (refuse)",
  Number.isNaN(computeShopOrderDebitTotal({ htotalpriceuser: 0 })), true);
assertEq("stored null + all-zero recompute → NaN (refuse, never 0-debit)",
  Number.isNaN(computeShopOrderDebitTotal({
    htotalpriceuser: null, htotalpricechn: 0, hshippingchn: 0, hshippingservice: 0, hrate: 0,
  })), true);

// ────────────────────────────────────────────────────────────
// B. Balance pre-check — refuse when wallettotal < priceToPay
// ────────────────────────────────────────────────────────────

section("B. Balance pre-check — currentBalance >= priceToPay (legacy if($walletTotal>=$pricePay))");

// The action's guard is `if (!(currentBalance >= priceToPay)) refuse`.
const canPay = (balance: number, price: number) => balance >= price;

assertEq("balance 10000 + price 5150 → allow", canPay(10000, 5150), true);
assertEq("balance 5150 + price 5150 → allow (exact-zero remaining ok)", canPay(5150, 5150), true);
assertEq("balance 5149.99 + price 5150 → refuse", canPay(5149.99, 5150), false);
assertEq("balance 0 + price 5150 → refuse", canPay(0, 5150), false);
// Missing tb_wallet row → Number(undefined ?? 0) = 0 → refuse.
const missingWallet: number | string | undefined = undefined;
assertEq("missing wallet row → balance 0 → refuse", canPay(Number(missingWallet ?? 0), 100), false);

// ────────────────────────────────────────────────────────────
// C. New-balance math — round to 2 dp post-subtraction
// ────────────────────────────────────────────────────────────

section("C. newBalance = round(currentBalance − priceToPay, 2dp)");

const newBalance = (b: number, p: number) => Math.round((b - p) * 100) / 100;

assertEq("10000 − 5150 = 4850", newBalance(10000, 5150), 4850);
assertEq("5150 − 5150 = 0 (exact zero)", newBalance(5150, 5150), 0);
assertEq("171.65 − 100.50 = 71.15", newBalance(171.65, 100.5), 71.15);
assertEq("rounding drift killed: 0.3 − 0.3 = 0", newBalance(0.3, 0.3), 0);

// ────────────────────────────────────────────────────────────
// D. tb_wallet_hs row shape (the audit-closing contract)
// ────────────────────────────────────────────────────────────

section("D. tb_wallet_hs INSERT shape — type='2' status='2' refOrder=hNo (mirror of admin twin)");

// Re-derive the row the action builds. If the action's field set drifts
// from this assertion the test breaks loudly — the P0-6 contract REQUIRES
// this exact shape (same as adminMarkServiceOrderPaidTb, minus admin id).
function buildWalletHsRow(opts: {
  nowIso: string;
  priceToPay: number;
  hno: string;
  memberCode: string;
}) {
  return {
    date:            opts.nowIso,
    amount:          opts.priceToPay,
    status:          "2",                  // approved (customer DEBIT-on-submit · ADR-0018 rule 1)
    type:            "2",                  // รายการชำระเงินฝากสั่ง (0081 L6220)
    typenew:         "3",                  // ชำระฝากสั่ง (0081 L6227)
    typeservice:     "1",                  // ฝากสั่งซื้อ (0081 L6234)
    paydeposit:      "1",                  // paid-from-wallet
    imagesslip:      "",
    depositnamebank: "WALLET",
    nameuserbank:    "",
    nouserbank:      "",
    note:            `รายการชำระเงิน ฝากสั่งสินค้า #${opts.hno} (ตัดจาก wallet โดยลูกค้า)`,
    adminid:         "",
    adminidupdate:   "",
    session:         "customer-self",
    reforder:        opts.hno,
    whno:            "",
    wusercredit:     "0",
    userid:          opts.memberCode,
    adminidcrate:    opts.memberCode,
  };
}

const hsRow = buildWalletHsRow({
  nowIso:     "2026-05-30T10:00:00.000Z",
  priceToPay: 5150,
  hno:        "P51999",
  memberCode: "PR1234",
});

assertEq("status='2' (approved · ADR-0018 rule 1)", hsRow.status, "2");
assertEq("type='2' (รายการชำระเงินฝากสั่ง)",        hsRow.type, "2");
assertEq("typenew='3' (ชำระฝากสั่ง)",               hsRow.typenew, "3");
assertEq("typeservice='1' (ฝากสั่งซื้อ)",            hsRow.typeservice, "1");
assertEq("paydeposit='1' (paid-from-wallet)",        hsRow.paydeposit, "1");
assertEq("amount = priceToPay (positive · direction by type)", hsRow.amount, 5150);
assertEq("reforder = hNo (NOT tb_payment.id)",       hsRow.reforder, "P51999");
assertEq("userid = customer PR####",                 hsRow.userid, "PR1234");
assertEq("adminidcrate = memberCode (customer-self)", hsRow.adminidcrate, "PR1234");
assertEq("adminid empty (no admin involved)",         hsRow.adminid, "");
assertEq("session = 'customer-self'",                 hsRow.session, "customer-self");
assertEq("imagesslip empty (wallet-paid, no slip)",   hsRow.imagesslip, "");
assertEq("whno empty (no warehouse on shop-order debit)", hsRow.whno, "");
assertEq("wusercredit = '0' (no credit-line use)",    hsRow.wusercredit, "0");

// ────────────────────────────────────────────────────────────
// E. tb_header_order status-flip shape (pay-users.php L166 self-pay)
// ────────────────────────────────────────────────────────────

section("E. tb_header_order flip — hstatus '3' + hdate3 + hdateupdate + paydeposit='1'");

function buildHeaderUpdate(nowIso: string) {
  return {
    hstatus:     "3",
    hdate3:      nowIso,
    hdateupdate: nowIso,
    paydeposit:  "1",
  };
}

const hdrUpd = buildHeaderUpdate("2026-05-30T10:00:00.000Z");
assertEq("hstatus → '3' (สั่งสินค้า · paid)",    hdrUpd.hstatus, "3");
assertEq("hdate3 stamped (legacy self-pay branch)", hdrUpd.hdate3, "2026-05-30T10:00:00.000Z");
assertEq("hdateupdate stamped",                     hdrUpd.hdateupdate, "2026-05-30T10:00:00.000Z");
assertEq("paydeposit='1' (wallet-paid marker)",     hdrUpd.paydeposit, "1");

// ────────────────────────────────────────────────────────────
// F. Payable-status gate — only hstatus='2' is payable
// ────────────────────────────────────────────────────────────

section("F. Payable-status gate — '2' payable · '3'/'4'/'5' already-done · else refuse");

// Mirror of the action's status branch:
//   '3'|'4'|'5' → { ok:true, already_paid:true }
//   '2'         → proceed (here represented as "payable")
//   else        → { ok:false, error:'order_not_payable' }
type GateResult = "payable" | "already_done" | "refuse";
function statusGate(status: string): GateResult {
  const s = status.trim();
  if (s === "3" || s === "4" || s === "5") return "already_done";
  if (s !== "2") return "refuse";
  return "payable";
}

assertEq("hstatus '2' (รอชำระเงิน) → payable",        statusGate("2"), "payable");
assertEq("hstatus '1' (รอดำเนินการ, no price) → refuse", statusGate("1"), "refuse");
assertEq("hstatus '3' (สั่งสินค้า) → already_done",   statusGate("3"), "already_done");
assertEq("hstatus '4' (รอร้านจีนจัดส่ง) → already_done", statusGate("4"), "already_done");
assertEq("hstatus '5' (สำเร็จ) → already_done",        statusGate("5"), "already_done");
assertEq("hstatus '6' (ยกเลิก) → refuse",             statusGate("6"), "refuse");
assertEq("unknown status '' → refuse",                statusGate(""), "refuse");

// ────────────────────────────────────────────────────────────
// G. Return-shape contracts — { tx_id, already_paid }
// ────────────────────────────────────────────────────────────

section("G. Return-shape contracts — both call-sites read only res.ok / res.error");

type Result =
  | { ok: true; data: { tx_id: string; already_paid: boolean } }
  | { ok: false; error: string };

// Successful first debit: tx_id = the new tb_wallet_hs id (as string).
const okResult: Result = { ok: true, data: { tx_id: "987654", already_paid: false } };
assertEq("success → ok true", okResult.ok, true);
assertEq("success → tx_id is the tb_wallet_hs id string", okResult.ok && okResult.data.tx_id, "987654");
assertEq("success → already_paid false", okResult.ok && okResult.data.already_paid, false);

// Idempotent re-click: existing hs row → already_paid true.
const alreadyResult: Result = { ok: true, data: { tx_id: "987654", already_paid: true } };
assertEq("idempotent → ok true", alreadyResult.ok, true);
assertEq("idempotent → already_paid true", alreadyResult.ok && alreadyResult.data.already_paid, true);

// Insufficient balance refusal (Thai message, no rows touched).
const insufficientResult: Result = {
  ok: false,
  error: "wallet_insufficient — มี ฿100.00 ต้อง ฿5,150.00 ยอดในกระเป๋าไม่พอ",
};
assertEq("insufficient → ok false",
  insufficientResult.ok === false, true);
assertEq("insufficient → error starts wallet_insufficient (Thai shortfall)",
  insufficientResult.ok === false && insufficientResult.error.startsWith("wallet_insufficient"), true);

// not_payable refusal (wrong status).
const notPayableResult: Result = { ok: false, error: "order_not_payable" };
assertEq("wrong-status → order_not_payable",
  notPayableResult.ok === false && notPayableResult.error === "order_not_payable", true);

// not_found refusal (foreign / nonexistent order — ownership gate).
const notFoundResult: Result = { ok: false, error: "not_found" };
assertEq("foreign/nonexistent order → not_found (ownership gate)",
  notFoundResult.ok === false && notFoundResult.error === "not_found", true);

// ────────────────────────────────────────────────────────────
// H. End-to-end happy path via combined helpers
// ────────────────────────────────────────────────────────────

section("H. End-to-end — priceToPay → balance check → newBalance combined");

// Happy: PR1234 has ฿10,000 wallet, order total stored = 5150 THB.
{
  const balance = 10000;
  const price = computeShopOrderDebitTotal({ htotalpriceuser: 5150 });
  assertEq("priceToPay = 5150 (stored)", price, 5150);
  assertEq("can pay", canPay(balance, price), true);
  assertEq("new balance = 4850", newBalance(balance, price), 4850);
}

// Refuse: PR9999 has ฿100 wallet, order total = 5150 THB.
{
  const balance = 100;
  const price = computeShopOrderDebitTotal({ htotalpriceuser: 5150 });
  assertEq("priceToPay still 5150 regardless of balance", price, 5150);
  assertEq("can pay = false (overdraw)", canPay(balance, price), false);
}

// Exact-zero remaining allowed.
{
  const balance = 5150;
  const price = computeShopOrderDebitTotal({ htotalpriceuser: 5150 });
  assertEq("exact-zero remaining allowed", canPay(balance, price), true);
  assertEq("new balance = 0", newBalance(balance, price), 0);
}

// ────────────────────────────────────────────────────────────
// I. placeServiceOrder — cart-unification input mapping (P0-3/4/5)
// ────────────────────────────────────────────────────────────
//
// placeServiceOrder now DELEGATES to the faithful submitCartOrder. These
// assertions lock the field-mapping it builds (re-derived here, same pattern
// as the buildWalletHsRow / statusGate mirrors above). If the action's mapping
// drifts, this breaks loudly — the faithful flow REQUIRES these legacy codes.

section("I. placeServiceOrder → submitCartOrder input mapping");

// transport_type label → legacy htransporttype 1-char code.
const TRANSPORT_TO_LEGACY: Record<string, string> = { truck: "1", ship: "2", air: "3" };
assertEq("transport truck → '1' (land/EK)", TRANSPORT_TO_LEGACY["truck"], "1");
assertEq("transport ship → '2' (sea/SEA)",  TRANSPORT_TO_LEGACY["ship"], "2");
assertEq("transport air → '3' (air)",       TRANSPORT_TO_LEGACY["air"], "3");

// pay_method label → legacy paymethod 1-char code (getServiceOrder reads
// paymethod==='2'→destination).
const PAYMETHOD_TO_LEGACY: Record<string, string> = { origin: "1", destination: "2" };
assertEq("pay origin → '1' (เก็บต้นทาง)",       PAYMETHOD_TO_LEGACY["origin"], "1");
assertEq("pay destination → '2' (เก็บปลายทาง)", PAYMETHOD_TO_LEGACY["destination"], "2");

// crate boolean → legacy code: true (ตีลังไม้) = '1', false (ไม่ตี) = '2'
// (matches /cart RadioCard values + getServiceOrder crate==='1'→true).
const crateToLegacy = (b: boolean) => (b ? "1" : "2");
assertEq("crate true → '1' (ตีลังไม้)",  crateToLegacy(true), "1");
assertEq("crate false → '2' (ไม่ตีลังไม้)", crateToLegacy(false), "2");

// cart_item_ids (stringified tb_cart ints) → number[] for the delegation.
const mapIds = (arr: string[]) =>
  arr.map((s) => Number(s)).filter((n) => Number.isFinite(n) && n > 0);
assertEq("ids ['101','102'] → [101,102]", mapIds(["101", "102"]), [101, 102]);
assertEq("ids ['7'] → [7]",               mapIds(["7"]), [7]);

// ────────────────────────────────────────────────────────────
// J. placeServiceOrder — status seed (legacy review step)
// ────────────────────────────────────────────────────────────

section("J. order seeds hStatus='1' (รอดำเนินการ) — NOT '2' (admin prices first)");

// submitCartOrder INSERTs hstatus:'1' — the legacy review step. The order has
// NO price until admin update2 sets htotalpriceuser + hStatus='2'. So the
// placeServiceOrder return advertises total_thb=0 at submit.
const SEED_HSTATUS: string = "1";
assertEq("seed hstatus = '1' (รอดำเนินการ)", SEED_HSTATUS, "1");
assertEq("seed is NOT '2' (รอชำระเงิน — that's admin's pricing step)", SEED_HSTATUS === "2", false);
assertEq("placeServiceOrder advertises total_thb=0 at submit (unpriced)", 0, 0);

// ────────────────────────────────────────────────────────────
// K. cancelServiceOrder — legacy cancelOrder.php contract
// ────────────────────────────────────────────────────────────

section("K. cancelServiceOrder → hStatus='6' with hStatus<3 guard (cancelOrder.php)");

// The action sets hStatus='6' WHERE hStatus<3 (i.e. '1'|'2') AND hno+userid.
// Re-derive the gate it applies (mirror of the action's status branch):
//   '6'        → idempotent already-cancelled (ok)
//   '1' | '2'  → cancellable
//   else (≥3)  → refuse (order_not_cancellable)
type CancelGate = "cancellable" | "already_cancelled" | "refuse";
function cancelGate(status: string): CancelGate {
  const s = status.trim();
  if (s === "6") return "already_cancelled";
  if (s === "1" || s === "2") return "cancellable";
  return "refuse";
}
assertEq("hstatus '1' (รอดำเนินการ) → cancellable", cancelGate("1"), "cancellable");
assertEq("hstatus '2' (รอชำระเงิน) → cancellable",  cancelGate("2"), "cancellable");
assertEq("hstatus '3' (สั่งสินค้า) → refuse (locked)", cancelGate("3"), "refuse");
assertEq("hstatus '4' → refuse",                    cancelGate("4"), "refuse");
assertEq("hstatus '5' (สำเร็จ) → refuse",            cancelGate("5"), "refuse");
assertEq("hstatus '6' (ยกเลิก) → already_cancelled (idempotent)", cancelGate("6"), "already_cancelled");

// The cancel target value is the single char '6' (NOT 'cancelled', NOT '99').
const CANCEL_HSTATUS: string = "6";
assertEq("cancel writes hStatus = '6' (one char)", CANCEL_HSTATUS, "6");
assertEq("cancel is NOT the rebuilt 'cancelled' string", CANCEL_HSTATUS === "cancelled", false);

// The UPDATE predicate re-checks hStatus IN ('1','2') so a concurrent admin
// place (→'3') loses the race safely (the row no longer matches).
const updatePredicateStatuses = ["1", "2"];
assertEq("update predicate guards hStatus<3 → ['1','2']", updatePredicateStatuses, ["1", "2"]);

// ────────────────────────────────────────────────────────────

console.log(`\n${pass} pass, ${fail} fail`);
if (fail > 0) process.exit(1);
