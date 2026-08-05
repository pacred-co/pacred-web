import assert from "node:assert/strict";
import {
  isAwaitingReceipt,
  matchesForwarderOperationalQueue,
  resolveRowStatusCode,
} from "./forwarder-status";

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

// Production shape 2026-08-05: staff attached one cash slip, which moved each
// forwarder to provisional fstatus=6 while accounting still had to review it.
assert.equal(
  matchesForwarderOperationalQueue("6", "5.1", { pendingSlip: true }),
  true,
  "staff cash slip must appear in 5.1",
);
assert.equal(
  matchesForwarderOperationalQueue("6", "6", { pendingSlip: true }),
  false,
  "staff cash slip must not be counted again in prepare-to-ship",
);
assert.equal(
  matchesForwarderOperationalQueue("6", "6", { pendingSlip: true, pendingSlipIsCredit: true }),
  true,
  "credit slip review remains physically ready to ship",
);
assert.equal(
  matchesForwarderOperationalQueue("6", "6.1", { driverOpen: true, pendingSlip: true }),
  true,
  "an already-dispatched cash row remains in the driver lane",
);
assert.equal(
  matchesForwarderOperationalQueue("5", "5", { pendingSlip: true }),
  false,
  "a submitted slip must leave the plain waiting-payment queue",
);

console.log("forwarder-status cash/credit dual-lane tests passed");
