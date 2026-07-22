import assert from "node:assert/strict";
import { parseFrozenWalletPaymentQuote } from "./payment-quote-snapshot";

const valid = {
  schema_version: 1,
  currency: "THB",
  gross_satang: 12_000,
  vat_satang: 0,
  wht_satang: 120,
  net_satang: 11_880,
  cashback_satang: 80,
  bank_satang: 11_800,
  lines: [
    { forwarder_id: 101, amount_satang: 5_000 },
    { forwarder_id: 102, amount_satang: 6_880 },
  ],
  submission: { apply_niti: true },
  billing_identity: {
    name: "บริษัท ทดสอบ จำกัด",
    tax_id: "0105564077716",
    address: "99/9 ถนนทดสอบ แขวงทดสอบ เขตทดสอบ กรุงเทพฯ 10240",
    is_juristic: true,
  },
  metadata: { mao_fee_satang: 10_000 },
};

const parsed = parseFrozenWalletPaymentQuote(valid);
assert.ok(parsed);
assert.equal(parsed.netSatang, 11_880);
assert.equal(parsed.bankSatang, 11_800);
assert.equal(parsed.isJuristic, true);
assert.deepEqual(parsed.lines.map((line) => line.forwarderId), [101, 102]);

assert.equal(
  parseFrozenWalletPaymentQuote({ ...valid, bank_satang: 11_799 }),
  null,
  "bank + cashback must equal net",
);
assert.equal(
  parseFrozenWalletPaymentQuote({ ...valid, lines: [{ forwarder_id: 101, amount_satang: 11_879 }] }),
  null,
  "line sum must equal net",
);
assert.equal(
  parseFrozenWalletPaymentQuote({
    ...valid,
    lines: [
      { forwarder_id: 101, amount_satang: 5_000 },
      { forwarder_id: 101, amount_satang: 6_880 },
    ],
  }),
  null,
  "forwarder IDs must be unique",
);

console.log("payment quote snapshot: all assertions passed");
