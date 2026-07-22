import assert from "node:assert/strict";
import { computeForwarderDebitBatch, type ForwarderDebitRow } from "./forwarder-debit-total";
import { checkLinkedPaymentConsistency } from "./linked-payment-consistency";

const rows: ForwarderDebitRow[] = [
  { id: 52436, fshipby: "PRF", ftrackingchn: "1783582989-3/4", paymethod: "1", ftotalprice: 229.5, ftransportprice: 0, fpriceupdate: 0, fshippingservice: 0, pricecrate: 0, ftransportpricechnthb: 0, priceother: 0, fdiscount: 0 },
  { id: 52437, fshipby: "PRF", ftrackingchn: "1783582989-4/4", paymethod: "1", ftotalprice: 229.5, ftransportprice: 0, fpriceupdate: 0, fshippingservice: 0, pricecrate: 0, ftransportpricechnthb: 0, priceother: 0, fdiscount: 0 },
  { id: 52557, fshipby: "PRF", ftrackingchn: "1783582989-2/4", paymethod: "1", ftotalprice: 238, ftransportprice: 0, fpriceupdate: 0, fshippingservice: 0, pricecrate: 0, ftransportpricechnthb: 0, priceother: 0, fdiscount: 0 },
  { id: 52559, fshipby: "PRF", ftrackingchn: "1783582989", paymethod: "1", ftotalprice: 289, ftransportprice: 100, fpriceupdate: 0, fshippingservice: 0, pricecrate: 0, ftransportpricechnthb: 0, priceother: 0, fdiscount: 0 },
];

const batch = computeForwarderDebitBatch(rows, { userId: "PR086", isCorporate: true });
assert.equal(batch.total_thb, 1075.14);
assert.deepEqual(batch.lines.map((line) => line.price_thb), [227.21, 227.21, 235.62, 385.1]);

assert.equal(checkLinkedPaymentConsistency(1075.15, [
  { reforder: "52436", amount: 227.21 },
  { reforder: "52437", amount: 227.21 },
  { reforder: "52557", amount: 235.62 },
  { reforder: "52559", amount: 385.11 },
], batch).ok, false);

assert.deepEqual(checkLinkedPaymentConsistency(1075.14, [
  { reforder: "52436", amount: 227.21 },
  { reforder: "52437", amount: 227.21 },
  { reforder: "52557", amount: 235.62 },
  { reforder: "52559", amount: 385.1 },
], batch), { ok: true });

console.log("linked-payment consistency: OK");
