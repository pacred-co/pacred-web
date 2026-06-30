/**
 * Money-routing test — locks the owner's 3-account rule (2026-06-30).
 * Run: tsx lib/payment/bank-accounts.test.ts
 */
import assert from "node:assert";
import {
  resolvePaymentAccount,
  PACRED_BANK_ACCOUNTS,
  PACRED_TAX_ID,
  OUTPUT_VAT_RATE,
} from "./bank-accounts";

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; };

// ── the routing rule ──────────────────────────────────────────────
t("ใบกำกับ → TRADING (232-1-07669-9) + tax invoice", () => {
  const a = resolvePaymentAccount({ issuesTaxInvoice: true });
  assert.equal(a.key, "trading");
  assert.equal(a.accountNo, "232-1-07669-9");
  assert.equal(a.issuesTaxInvoice, true);
});

t("ใบกำกับ WINS over domestic-delivery leg", () => {
  const a = resolvePaymentAccount({ issuesTaxInvoice: true, isDomesticDeliveryLeg: true });
  assert.equal(a.key, "trading"); // tax invoice overrides everything
});

t("domestic-delivery leg (no tax invoice) → LOGISTICS (225-2-91144-0)", () => {
  const a = resolvePaymentAccount({ issuesTaxInvoice: false, isDomesticDeliveryLeg: true });
  assert.equal(a.key, "logistics");
  assert.equal(a.accountNo, "225-2-91144-0");
  assert.equal(a.issuesTaxInvoice, false);
});

t("general service/freight (no tax invoice, not domestic leg) → SERVICE (204-1-55856-6) PromptPay", () => {
  const a = resolvePaymentAccount({ issuesTaxInvoice: false });
  assert.equal(a.key, "service");
  assert.equal(a.accountNo, "204-1-55856-6");
  assert.equal(a.channel, "promptpay");
  assert.equal(a.promptPayId, PACRED_TAX_ID);
});

// ── account integrity (the numbers must never drift) ──────────────
t("the three account numbers are exactly the owner's", () => {
  assert.equal(PACRED_BANK_ACCOUNTS.service.accountNo, "204-1-55856-6");
  assert.equal(PACRED_BANK_ACCOUNTS.logistics.accountNo, "225-2-91144-0");
  assert.equal(PACRED_BANK_ACCOUNTS.trading.accountNo, "232-1-07669-9");
  // only TRADING issues a tax invoice; only SERVICE uses PromptPay
  assert.equal(PACRED_BANK_ACCOUNTS.service.issuesTaxInvoice, false);
  assert.equal(PACRED_BANK_ACCOUNTS.logistics.issuesTaxInvoice, false);
  assert.equal(PACRED_BANK_ACCOUNTS.trading.issuesTaxInvoice, true);
  assert.equal(PACRED_BANK_ACCOUNTS.service.channel, "promptpay");
  assert.equal(PACRED_BANK_ACCOUNTS.logistics.channel, "qr");
  assert.equal(PACRED_BANK_ACCOUNTS.trading.channel, "qr");
  assert.equal(PACRED_TAX_ID, "0105564077716");
  assert.equal(OUTPUT_VAT_RATE, 0.07);
});

console.log(`bank-accounts: ${n} passed`);
