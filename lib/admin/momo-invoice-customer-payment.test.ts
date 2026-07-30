/**
 * momo-invoice-customer-payment.test.ts — ล็อกกฎ "จัดกลุ่มการชำระ" + ตัวนับสรุป
 * ของคอลัมน์ "เก็บเงินลูกค้าแล้วหรือยัง" บนหน้าใบต้นทุน MOMO (owner 2026-07-30).
 * Run: tsx lib/admin/momo-invoice-customer-payment.test.ts
 */
import assert from "node:assert/strict";
import {
  walletGroupKeyOf,
  buildCustomerPaymentSummary,
  NO_PAYMENT,
  type CustomerPaymentInfo,
  type PaymentSummaryRow,
} from "./momo-invoice-customer-payment-core";

let passed = 0;
function eq(label: string, a: unknown, b: unknown) {
  assert.deepEqual(a, b, label);
  passed++;
}
function check(label: string, cond: boolean) {
  assert.equal(cond, true, label);
  passed++;
}

// ── กฎจัดกลุ่ม: cascade "เติม-แล้วจ่าย" (ทรงหลักบน prod 341/366) ───────────
// เคสจริง prod: child 106368 (fid 52554) + 106369 (fid 52562) ชี้ topup 106367
eq(
  "cascade → คีย์เป็น topup",
  walletGroupKeyOf({ id: 106368, userid: "PR7083", reforder2: 106367, imagesslip: "" }),
  "topup:106367",
);
check(
  "cascade: 2 child ของ topup เดียวกัน = กลุ่มเดียวกัน",
  walletGroupKeyOf({ id: 106368, userid: "PR7083", reforder2: 106367, imagesslip: "" })
    === walletGroupKeyOf({ id: 106369, userid: "PR7083", reforder2: 106367, imagesslip: "" }),
);
check(
  "cascade: คนละ topup = คนละกลุ่ม",
  walletGroupKeyOf({ id: 106368, userid: "PR7083", reforder2: 106367, imagesslip: "" })
    !== walletGroupKeyOf({ id: 106428, userid: "PR331", reforder2: 106427, imagesslip: "" }),
);
// topup ชนะสลิปเสมอ — child ที่มีทั้ง reforder2 และสลิป ต้องไม่หลุดไปกลุ่ม slip
eq(
  "cascade ชนะ shared-slip",
  walletGroupKeyOf({ id: 1, userid: "PR001", reforder2: 900, imagesslip: "a/b.jpg" }),
  "topup:900",
);

// ── กฎจัดกลุ่ม: shared-slip (direct-slip · mirror /admin/wallet/[id]:547-573) ──
// เคสจริง prod: PR158 ใช้สลิปใบเดียวจ่าย 4 งาน (105570-105573)
const SLIP = "5740cbb3-b2df-4f7a-8b09-51c9974c4379/forwarder_payment/1783621431975.jpg";
eq(
  "direct-slip → คีย์เป็น userid|ไฟล์",
  walletGroupKeyOf({ id: 105570, userid: "PR158", reforder2: null, imagesslip: SLIP }),
  `slip:PR158|${SLIP}`,
);
check(
  "direct-slip: สลิปเดียวกัน + ลูกค้าเดียวกัน = กลุ่มเดียวกัน",
  walletGroupKeyOf({ id: 105570, userid: "PR158", reforder2: null, imagesslip: SLIP })
    === walletGroupKeyOf({ id: 105573, userid: "PR158", reforder2: null, imagesslip: SLIP }),
);
// 🔴 กันเคสอันตราย: ชื่อไฟล์ซ้ำข้ามลูกค้า ต้องไม่ถูกมัดรวม (จะกลายเป็นการจ่ายที่ไม่มีจริง)
check(
  "direct-slip: สลิปชื่อเดียวกันแต่คนละลูกค้า = คนละกลุ่ม",
  walletGroupKeyOf({ id: 1, userid: "PR158", reforder2: null, imagesslip: SLIP })
    !== walletGroupKeyOf({ id: 2, userid: "PR050", reforder2: null, imagesslip: SLIP }),
);
eq(
  "ไม่มีสลิป + ไม่มี topup → กลุ่มเดี่ยว",
  walletGroupKeyOf({ id: 42, userid: "PR001", reforder2: null, imagesslip: "" }),
  "row:42",
);
eq(
  "มีสลิปแต่ไม่มี userid → กลุ่มเดี่ยว (ไม่เดามั่ว)",
  walletGroupKeyOf({ id: 42, userid: null, reforder2: null, imagesslip: SLIP }),
  "row:42",
);
eq(
  "สลิปเป็นช่องว่างล้วน → กลุ่มเดี่ยว",
  walletGroupKeyOf({ id: 7, userid: "PR001", reforder2: null, imagesslip: "   " }),
  "row:7",
);
eq(
  "reforder2 = NaN → ไม่ถือเป็น cascade",
  walletGroupKeyOf({ id: 8, userid: "PR001", reforder2: Number.NaN, imagesslip: "" }),
  "row:8",
);

// ── ตัวนับสรุป ────────────────────────────────────────────────────────────
const paid = (over: Partial<CustomerPaymentInfo> = {}): CustomerPaymentInfo => ({
  ...NO_PAYMENT, paid: true, channel: "wallet", amountThb: 100, ...over,
});
const row = (over: Partial<PaymentSummaryRow> = {}): PaymentSummaryRow => ({
  matched: true, ourSell: 0, payment: null, ...over,
});

const s = buildCustomerPaymentSummary([
  row({ payment: paid({ amountThb: 1056.63 }) }),
  row({ payment: paid({ amountThb: 3599.42 }) }),
  row({ payment: paid({ channel: "billing_run", amountThb: 68.53 }) }),
  row({ ourSell: 5438.16 }),
  row({ ourSell: 675.36, payment: { ...NO_PAYMENT } }),
  row({ matched: false, ourSell: null }),
]);
eq("lines นับทุกบรรทัดบนใบ", s.lines, 6);
eq("unmatched แยกจาก unpaid", s.unmatched, 1);
eq("paid = wallet + billing", s.paid, 3);
eq("paidViaWallet", s.paidViaWallet, 2);
eq("paidViaBillingRun", s.paidViaBillingRun, 1);
eq("unpaid นับเฉพาะที่จับคู่ได้", s.unpaid, 2);
eq("Σ ยอดที่รับมา (รายแถว ไม่เบิ้ล)", s.paidAmountThb, 4724.58);
eq("Σ ค่านำเข้าที่ยังไม่เก็บ", s.unpaidSellThb, 6113.52);
// invariant: ทุกบรรทัดถูกจัดลงถังใดถังหนึ่งเสมอ ไม่มีหาย ไม่มีนับซ้ำ
eq("invariant: paid + unpaid + unmatched = lines", s.paid + s.unpaid + s.unmatched, s.lines);

const empty = buildCustomerPaymentSummary([]);
eq("ลิสต์ว่าง → lines 0", empty.lines, 0);
eq("ลิสต์ว่าง → paid 0", empty.paid, 0);
eq("ลิสต์ว่าง → เงิน 0", empty.paidAmountThb + empty.unpaidSellThb, 0);

// unmatched ต้องไม่ถูกนับเป็น "ยังไม่เก็บ" และต้องไม่เอา ourSell ไปรวม
const onlyUnmatched = buildCustomerPaymentSummary([
  row({ matched: false, ourSell: 999 }),
  row({ matched: false, ourSell: null }),
]);
eq("unmatched: unpaid = 0", onlyUnmatched.unpaid, 0);
eq("unmatched: ไม่รวมยอดค้าง", onlyUnmatched.unpaidSellThb, 0);

// ourSell null/ติดลบ ไม่ทำให้ยอดเพี้ยน (NaN-safe)
const weird = buildCustomerPaymentSummary([
  row({ ourSell: null }),
  row({ payment: paid({ amountThb: null }) }),
]);
eq("ourSell null → 0 ไม่ใช่ NaN", weird.unpaidSellThb, 0);
eq("amountThb null → 0 ไม่ใช่ NaN", weird.paidAmountThb, 0);
eq("ยังนับเป็นจ่ายแล้วแม้ไม่รู้ยอด", weird.paid, 1);

// ปัดเศษสตางค์ (float ต้องไม่หลุดเป็น 0.30000000000000004)
const cents = buildCustomerPaymentSummary([
  row({ payment: paid({ amountThb: 0.1 }) }),
  row({ payment: paid({ amountThb: 0.2 }) }),
]);
eq("ปัด 2 ตำแหน่ง", cents.paidAmountThb, 0.3);

// NO_PAYMENT = ค่าเริ่มต้นที่ปลอดภัย
check("NO_PAYMENT ไม่ใช่ paid", NO_PAYMENT.paid === false && NO_PAYMENT.channel === null);
eq("NO_PAYMENT ไม่คลุมอะไร", NO_PAYMENT.coveredFids.length, 0);

console.log(`✓ momo-invoice-customer-payment.test.ts — ${passed} assertions passed`);
