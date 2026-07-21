import assert from "node:assert/strict";
import { computeShopOrderTransferAmount } from "./payment-amount";

assert.equal(computeShopOrderTransferAmount(10_000, "receipt"), 10_000);
assert.equal(computeShopOrderTransferAmount(10_000, "customs"), 10_000);
assert.equal(computeShopOrderTransferAmount(10_000, "tax_invoice"), 10_700);
assert.equal(computeShopOrderTransferAmount(1_234.56, "tax_invoice"), 1_320.98);
assert.equal(Number.isNaN(computeShopOrderTransferAmount(0, "tax_invoice")), true);

console.log("✓ shop payment amount: UI and slip ledger share VAT-inclusive total");
