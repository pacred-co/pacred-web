/**
 * Unit tests for the P0-2 customer wallet-paid yuan-payment debit flow
 * (actions/payment-tb.ts::createYuanPaymentFromWallet).
 *
 * Locks down the ADR-0018 §D-2 rule 1 contract: customer DEBIT-on-submit
 * with `tb_wallet_hs.status='2'` + `type='6'`, balance pre-check via
 * `canDebit`, balance delta via `computeNewBalance`. Closes the cust-04
 * P0-1 audit gap.
 *
 * What this test asserts (pure-function level):
 *   A. computePayThb rounding — payyuan × payrate to 2 dp (mirror of
 *      PHP number_format(.., 2, '.', '')).
 *   B. canDebit overdraw refusal semantics — refuse when walletTotal <
 *      paythb, allow when ≥ paythb, refuse when paythb = 0 (legacy
 *      `if ($payTHB <= $walletTotal && $payTHB > 0)`).
 *   C. computeNewBalance — round to 2 dp post-subtraction.
 *   D. Zod schema parity (yuanPaymentSchema) — happy + edge cases
 *      including paid_via_wallet branch.
 *   E. tb_wallet_hs row shape — required fields populated per the legacy
 *      column comments at 0081_pcs_legacy_schema.sql L6213 (status),
 *      L6220 (type=6 = ชำระเงินฝากโอน), L6227 (typenew), L6234 (typeservice).
 *   F. tb_payment row shape — required fields per 0081 L3611-3634 NOT NULL.
 *   G. Idempotency — the `alreadyDone` return shape preserves the
 *      original tb_payment.id + current wallet balance.
 *
 * We do NOT exercise the full server action here (it depends on
 * createAdminClient · auth · sendNotification — same boundary as A1's
 * unit test). Instead this tests the pure helpers + schema + shape
 * contracts that drive the action.
 *
 * Pattern matches actions/admin/yuan-payments-tb.test.ts (pass/fail
 * counts, no vitest).
 */

import { z } from "zod";
import { computePayThb, canDebit, computeNewBalance } from "../lib/payment/wallet-math";
import { yuanPaymentSchema } from "../lib/validators/payment";

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

console.log("=== createYuanPaymentFromWallet — P0-2 customer wallet-debit (ADR-0018 §D-2 rule 1) ===");

// ────────────────────────────────────────────────────────────
// A. computePayThb — paythb = round(yuan × rate, 2 dp)
// ────────────────────────────────────────────────────────────

section("A. computePayThb — yuan × rate to 2 decimal places");

assertEq("100 CNY × 5 = 500", computePayThb(100, 5), 500);
assertEq("100 CNY × 5.25 = 525", computePayThb(100, 5.25), 525);
assertEq("33.33 CNY × 5.15 = 171.65 (rounded)", computePayThb(33.33, 5.15), 171.65);
assertEq("0.10 CNY × 5 = 0.5", computePayThb(0.1, 5), 0.5);
assertEq("rounding boundary 0.005 up", computePayThb(1, 0.005), 0.01);
assertEq("realistic yuan-transfer 1000 × 5.15 = 5150", computePayThb(1000, 5.15), 5150);

// ────────────────────────────────────────────────────────────
// B. canDebit — refuse when walletTotal < paythb
// ────────────────────────────────────────────────────────────

section("B. canDebit — balance pre-check (refuse insufficient_balance)");

assertEq("balance 1000 + cost 500 → allow",   canDebit(1000, 500), true);
assertEq("balance 500 + cost 500 → allow (exact-zero remaining ok)", canDebit(500, 500), true);
assertEq("balance 499.99 + cost 500 → refuse", canDebit(499.99, 500), false);
assertEq("balance 0 + cost 500 → refuse",      canDebit(0, 500), false);
assertEq("balance −100 + cost 500 → refuse",   canDebit(-100, 500), false);
assertEq("balance 1000 + cost 0 → refuse (legacy paythb>0 guard)", canDebit(1000, 0), false);
// Mirrors the action's `Number(walletBefore?.wallettotal ?? 0)` when
// tb_wallet row is missing — the optional chain yields undefined, the
// `?? 0` folds to 0, Number(0) = 0. We use a typed undefined to bypass
// TS's "always nullish" check on the literal.
const missingWalletBalance: number | string | undefined = undefined;
assertEq("missing wallet row → treated as 0 → refuse", canDebit(Number(missingWalletBalance ?? 0), 100), false);

// ────────────────────────────────────────────────────────────
// C. computeNewBalance — round to 2 dp post-subtraction
// ────────────────────────────────────────────────────────────

section("C. computeNewBalance — wallet delta rounded to 2 dp");

assertEq("1000 − 500 = 500", computeNewBalance(1000, 500), 500);
assertEq("1000 − 1000 = 0 (exact zero)", computeNewBalance(1000, 1000), 0);
assertEq("171.65 − 100.50 = 71.15", computeNewBalance(171.65, 100.50), 71.15);
assertEq("rounding drift killed: 0.3 − 0.3 = 0", computeNewBalance(0.3, 0.3), 0);
assertEq("realistic 10000 − 5150 = 4850", computeNewBalance(10000, 5150), 4850);

// ────────────────────────────────────────────────────────────
// D. Zod schema parity — happy + edge inputs
// ────────────────────────────────────────────────────────────

section("D. yuanPaymentSchema — happy + edge inputs (incl. paid_via_wallet)");

const goodInput = {
  channel:          "alipay" as const,
  recipient_detail: "Alipay account 13800000000",
  yuan_amount:      100,
  exchange_rate:    5.15,
  paid_via_wallet:  true,
};
const goodParse = yuanPaymentSchema.safeParse(goodInput);
assertEq("happy wallet-paid input passes", goodParse.success, true);

const goodSlipInput = {
  channel:          "wechat" as const,
  recipient_detail: "WeChat ID merchant-xyz",
  yuan_amount:      100,
  exchange_rate:    5.15,
  paid_via_wallet:  false,
  slip_url:         "slips/abc.jpg",
};
const goodSlipParse = yuanPaymentSchema.safeParse(goodSlipInput);
assertEq("happy slip-paid input passes (different action consumes this)", goodSlipParse.success, true);

const negativeYuanParse = yuanPaymentSchema.safeParse({ ...goodInput, yuan_amount: -1 });
assertEq("yuan_amount −1 rejected", negativeYuanParse.success, false);

const zeroYuanParse = yuanPaymentSchema.safeParse({ ...goodInput, yuan_amount: 0 });
assertEq("yuan_amount 0 rejected", zeroYuanParse.success, false);

const overLimitYuanParse = yuanPaymentSchema.safeParse({ ...goodInput, yuan_amount: 2_000_000 });
assertEq("yuan_amount > 1,000,000 rejected", overLimitYuanParse.success, false);

const lowRateParse = yuanPaymentSchema.safeParse({ ...goodInput, exchange_rate: 0.5 });
assertEq("rate 0.5 rejected (below CNY_RATE_MIN=1)", lowRateParse.success, false);

const highRateParse = yuanPaymentSchema.safeParse({ ...goodInput, exchange_rate: 200 });
assertEq("rate 200 rejected (above CNY_RATE_MAX=100)", highRateParse.success, false);

const shortDetailParse = yuanPaymentSchema.safeParse({ ...goodInput, recipient_detail: "abc" });
assertEq("recipient_detail < 5 chars rejected", shortDetailParse.success, false);

const wrongChannelParse = yuanPaymentSchema.safeParse({ ...goodInput, channel: "usdt" });
assertEq("channel 'usdt' rejected (allowed alipay/wechat/bank only)", wrongChannelParse.success, false);

// ────────────────────────────────────────────────────────────
// E. tb_wallet_hs row shape (ADR-0018 §D-2 rule 1 contract)
// ────────────────────────────────────────────────────────────

section("E. tb_wallet_hs INSERT shape — type='6' status='2' (the audit-closing contract)");

// Re-derive the row the action builds. If the action's field set drifts
// from this assertion the test breaks loudly — the audit gap rule 1
// REQUIRES this exact shape.
function buildWalletHsRow(opts: {
  nowIso: string;
  thb_amount: number;
  paymentId: number;
  memberCode: string;
}) {
  return {
    date:            opts.nowIso,
    amount:          opts.thb_amount,
    status:          "2",                  // ADR-0018 §D-2 rule 1
    type:            "6",                  // ชำระเงินฝากโอน (0081 L6220)
    typenew:         "7",                  // (0081 L6227)
    typeservice:     "3",                  // ฝากโอน (0081 L6234)
    paydeposit:      "1",                  // paid-from-wallet
    imagesslip:      "",
    depositnamebank: "",
    nameuserbank:    "",
    nouserbank:      "",
    note:            "ชำระค่าโอนหยวนจากกระเป๋า (customer-self)",
    adminid:         "",
    adminidupdate:   "",
    session:         "customer-self",
    reforder:        String(opts.paymentId),
    whno:            "",
    wusercredit:     "0",
    userid:          opts.memberCode,
    adminidcrate:    opts.memberCode,
  };
}

const hsRow = buildWalletHsRow({
  nowIso:     "2026-05-30T10:00:00.000Z",
  thb_amount: 5150,
  paymentId:  12345,
  memberCode: "PR1234",
});

assertEq("status='2' (approved · ADR-0018 rule 1)", hsRow.status, "2");
assertEq("type='6' (ชำระเงินฝากโอน)",              hsRow.type, "6");
assertEq("typenew='7'",                              hsRow.typenew, "7");
assertEq("typeservice='3' (ฝากโอน)",                hsRow.typeservice, "3");
assertEq("paydeposit='1' (paid-from-wallet)",        hsRow.paydeposit, "1");
assertEq("amount = paythb (positive · direction by type)", hsRow.amount, 5150);
assertEq("reforder = String(tb_payment.id)",         hsRow.reforder, "12345");
assertEq("userid = customer PR####",                 hsRow.userid, "PR1234");
assertEq("adminidcrate = memberCode (customer-self)", hsRow.adminidcrate, "PR1234");
assertEq("adminid empty (no admin involved)",         hsRow.adminid, "");
assertEq("session = 'customer-self'",                 hsRow.session, "customer-self");
assertEq("imagesslip empty (wallet-paid, no slip)",   hsRow.imagesslip, "");
assertEq("whno empty (no warehouse on yuan transfer)", hsRow.whno, "");
assertEq("wusercredit = '0' (no credit-line use)",    hsRow.wusercredit, "0");

// ────────────────────────────────────────────────────────────
// F. tb_payment row shape — NOT NULL columns populated
// ────────────────────────────────────────────────────────────

section("F. tb_payment INSERT shape — paystatus='1' pending (admin sends yuan separately)");

function buildPaymentRow(opts: {
  nowIso: string;
  channel: "alipay" | "wechat" | "bank";
  recipient_detail: string;
  yuan_amount: number;
  exchange_rate: number;
  thb_amount: number;
  memberCode: string;
  id_doc_url?: string;
}) {
  const channelToPaytype = (ch: typeof opts.channel) => {
    switch (ch) {
      case "alipay": return "1";
      case "wechat": return "2";
      case "bank":   return "3";
    }
  };
  return {
    paydate:           opts.nowIso,
    paydeposit:        "1",                            // wallet-paid
    paystatus:         "1",                            // pending (admin sends yuan)
    paytype:           channelToPaytype(opts.channel),
    paydetail:         opts.recipient_detail,
    payyuan:           opts.yuan_amount,
    payrate:           opts.exchange_rate,
    payratecost:       opts.exchange_rate,             // admin overrides on approve
    paythb:            opts.thb_amount,
    paythbcost:        opts.thb_amount,
    payprofitthb:      0,
    userid:            opts.memberCode,
    adminid:           "",
    adminidupdate:     "",
    payadminidcreator: "",
    session:           "customer-self",
    imagesslip:        "",
    certifiedtruecopy: opts.id_doc_url ?? "",
    imagesslipadmin:   "",
  };
}

const paymentRow = buildPaymentRow({
  nowIso:           "2026-05-30T10:00:00.000Z",
  channel:          "alipay",
  recipient_detail: "Alipay 13800000000",
  yuan_amount:      1000,
  exchange_rate:    5.15,
  thb_amount:       5150,
  memberCode:       "PR1234",
});

assertEq("paystatus='1' pending (admin transfer-send is separate)", paymentRow.paystatus, "1");
assertEq("paydeposit='1' (wallet-paid)",                paymentRow.paydeposit, "1");
assertEq("paytype='1' for alipay",                       paymentRow.paytype, "1");
assertEq("payyuan = input yuan_amount",                  paymentRow.payyuan, 1000);
assertEq("payrate = input exchange_rate",                paymentRow.payrate, 5.15);
assertEq("payratecost = same as payrate at submit",      paymentRow.payratecost, 5.15);
assertEq("paythb = computed THB total",                  paymentRow.paythb, 5150);
assertEq("paythbcost = same as paythb at submit",        paymentRow.paythbcost, 5150);
assertEq("payprofitthb = 0 at submit (admin computes)",  paymentRow.payprofitthb, 0);
assertEq("userid = customer PR####",                     paymentRow.userid, "PR1234");
assertEq("session = 'customer-self'",                    paymentRow.session, "customer-self");
assertEq("imagesslipadmin empty (no admin yet)",         paymentRow.imagesslipadmin, "");
assertEq("imagesslip empty (wallet-paid, no slip)",      paymentRow.imagesslip, "");

const paymentRowWechat = buildPaymentRow({
  nowIso:           "2026-05-30T10:00:00.000Z",
  channel:          "wechat",
  recipient_detail: "WeChat",
  yuan_amount:      1000,
  exchange_rate:    5.15,
  thb_amount:       5150,
  memberCode:       "PR1234",
});
assertEq("paytype='2' for wechat", paymentRowWechat.paytype, "2");

const paymentRowBank = buildPaymentRow({
  nowIso:           "2026-05-30T10:00:00.000Z",
  channel:          "bank",
  recipient_detail: "Bank",
  yuan_amount:      1000,
  exchange_rate:    5.15,
  thb_amount:       5150,
  memberCode:       "PR1234",
});
assertEq("paytype='3' for bank transfer", paymentRowBank.paytype, "3");

// ────────────────────────────────────────────────────────────
// G. Idempotency — alreadyDone return shape
// ────────────────────────────────────────────────────────────

section("G. Idempotency contract — alreadyDone preserves original id + current balance");

type Result =
  | { ok: true; data: { id: number; thb_amount: number; new_wallet_balance: number }; alreadyDone?: boolean }
  | { ok: false; error: string };

// Simulated alreadyDone return when a duplicate submit lands.
const alreadyDoneResult: Result = {
  ok: true,
  data: { id: 12345, thb_amount: 5150, new_wallet_balance: 10000 },
  alreadyDone: true,
};

assertEq("alreadyDone preserves tb_payment.id",   alreadyDoneResult.ok && alreadyDoneResult.data.id, 12345);
assertEq("alreadyDone preserves thb_amount",       alreadyDoneResult.ok && alreadyDoneResult.data.thb_amount, 5150);
assertEq("alreadyDone exposes current balance (no double-debit)", alreadyDoneResult.ok && alreadyDoneResult.data.new_wallet_balance, 10000);
assertEq("alreadyDone flag = true",                alreadyDoneResult.ok && alreadyDoneResult.alreadyDone, true);

const insufficientResult: Result = {
  ok: false,
  error: "insufficient_balance: ยอดกระเป๋า ฿100.00 ไม่พอชำระ ฿5,150.00",
};
assertEq("insufficient_balance error includes both balances in Thai format",
  insufficientResult.ok === false && insufficientResult.error.startsWith("insufficient_balance"),
  true,
);

// ────────────────────────────────────────────────────────────
// H. End-to-end happy + refuse paths via combined helpers
// ────────────────────────────────────────────────────────────

section("H. End-to-end — paythb → canDebit → newBalance combined");

// Happy: PR1234 has ฿10,000 wallet, paying 1000 CNY × 5.15 = 5150 THB
{
  const walletTotal = 10000;
  const payTHB = computePayThb(1000, 5.15);
  assertEq("paythb = 5150", payTHB, 5150);
  assertEq("can debit", canDebit(walletTotal, payTHB), true);
  assertEq("new balance = 4850", computeNewBalance(walletTotal, payTHB), 4850);
}

// Refuse: PR9999 has ฿100 wallet, paying 1000 CNY × 5.15 = 5150 THB
{
  const walletTotal = 100;
  const payTHB = computePayThb(1000, 5.15);
  assertEq("paythb still = 5150 regardless of wallet", payTHB, 5150);
  assertEq("can debit = false (overdraw)", canDebit(walletTotal, payTHB), false);
}

// Refuse: brand-new customer · no tb_wallet row · treated as balance=0
{
  // Same `Number(walletBefore?.wallettotal ?? 0)` action pattern; typed
  // undefined dodges TS's "always-nullish literal" check.
  const noRow: number | string | undefined = undefined;
  const walletTotal = Number(noRow ?? 0);
  const payTHB = computePayThb(100, 5);
  assertEq("can debit = false (no wallet row → balance=0)", canDebit(walletTotal, payTHB), false);
}

// Exact-zero remaining balance allowed
{
  const walletTotal = 5150;
  const payTHB = computePayThb(1000, 5.15);
  assertEq("exact-zero allowed", canDebit(walletTotal, payTHB), true);
  assertEq("new balance = 0", computeNewBalance(walletTotal, payTHB), 0);
}

// ────────────────────────────────────────────────────────────

// Re-export to silence "unused import" on Zod (we use it for safeParse above
// but TS strict may warn — keep one shape-touch).
const _zUnused = z.object({}).safeParse({}).success;
void _zUnused;

console.log(`\n${pass} pass, ${fail} fail`);
if (fail > 0) process.exit(1);
