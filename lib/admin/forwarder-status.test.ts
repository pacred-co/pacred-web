import assert from "node:assert/strict";
import { isAwaitingReceipt, resolveRowStatusCode } from "./forwarder-status";

assert.equal(isAwaitingReceipt("5", true), true, "customer cash slip: 5 -> 5.1");
assert.equal(isAwaitingReceipt("6", true), true, "staff cash slip: provisional 6 -> 5.1");
assert.equal(isAwaitingReceipt("6", true, true), false, "credit keeps physical prep-ship lane");
assert.equal(resolveRowStatusCode("6", { pendingSlip: true }), "5.1");
assert.equal(
  resolveRowStatusCode("6", { pendingSlip: true, pendingSlipIsCredit: true }),
  "6",
  "credit payment review must not block dispatch status",
);
assert.equal(
  resolveRowStatusCode("6", { driverOpen: true, pendingSlip: true }),
  "6.1",
  "an already-dispatched row keeps the physical driver state",
);

console.log("forwarder-status cash/credit dual-lane tests passed");
