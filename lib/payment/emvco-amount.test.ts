/**
 * lib/payment/emvco-amount.test.ts — prove injectAmountIntoEmvco produces a
 * structurally-correct dynamic EMVCo payload WITHOUT a phone scan.
 *
 * Run: npx tsx lib/payment/emvco-amount.test.ts
 */

import { injectAmountIntoEmvco } from "./emvco-amount";
import {
  composePromptPayPayload,
  parseEmvcoTlv,
  verifyPromptPayPayload,
  DEFAULT_PROMPTPAY_ID,
} from "../promptpay-payload";

let pass = 0;
let fail = 0;
function assert(cond: boolean, msg: string) {
  if (cond) {
    pass++;
  } else {
    fail++;
    console.error("  ✗ " + msg);
  }
}

// A real static PromptPay payload for the company tax id (amount omitted).
const staticPayload = composePromptPayPayload(DEFAULT_PROMPTPAY_ID, 0);
assert(staticPayload.length > 0, "static payload composes");
assert(parseEmvcoTlv(staticPayload)["54"] === undefined, "static payload has NO amount tag 54");

// ── Inject 100.00 → the amount must appear + the CRC must verify. ──
const injected = injectAmountIntoEmvco(staticPayload, 100);
assert(injected != null, "inject(100) returns a payload");
if (injected) {
  const tlv = parseEmvcoTlv(injected);
  assert(tlv["54"] === "100.00", `tag 54 === "100.00" (got ${JSON.stringify(tlv["54"])})`);
  assert(tlv["53"] === "764", `tag 53 === "764" THB (got ${JSON.stringify(tlv["53"])})`);
  assert(tlv["01"] === "12", `tag 01 === "12" dynamic (got ${JSON.stringify(tlv["01"])})`);
  assert(verifyPromptPayPayload(injected), "injected payload CRC verifies");

  // ── Structure parity: injecting equals what a dynamic PromptPay QR is. ──
  const nativeDynamic = composePromptPayPayload(DEFAULT_PROMPTPAY_ID, 100);
  assert(
    injected === nativeDynamic,
    "injected(static,100) === composePromptPayPayload(id,100) — byte-identical",
  );
}

// ── Satang precision + rounding ──
const inj1 = injectAmountIntoEmvco(staticPayload, 1234.5);
assert(inj1 != null && parseEmvcoTlv(inj1)["54"] === "1234.50", "amount 1234.5 → '1234.50'");
const inj2 = injectAmountIntoEmvco(staticPayload, 99.999);
assert(inj2 != null && parseEmvcoTlv(inj2)["54"] === "100.00", "amount 99.999 rounds → '100.00'");

// ── Replace an EXISTING amount (idempotent re-inject) ──
const reinjected = injectAmountIntoEmvco(composePromptPayPayload(DEFAULT_PROMPTPAY_ID, 50), 200);
assert(
  reinjected != null && parseEmvcoTlv(reinjected)["54"] === "200.00",
  "re-inject over an existing amount → '200.00'",
);
assert(reinjected != null && verifyPromptPayPayload(reinjected), "re-injected CRC verifies");

// ── Graceful null on bad input (caller falls back to the static PNG) ──
assert(injectAmountIntoEmvco("", 100) === null, "empty payload → null");
assert(injectAmountIntoEmvco("garbage-not-emvco", 100) === null, "non-EMVCo payload → null");
assert(injectAmountIntoEmvco(staticPayload, 0) === null, "amount 0 → null");
assert(injectAmountIntoEmvco(staticPayload, -5) === null, "negative amount → null");
assert(injectAmountIntoEmvco(staticPayload, NaN) === null, "NaN amount → null");
// Declared-length overrun (malformed TLV) → null
assert(injectAmountIntoEmvco("000299xx", 100) === null, "declared length overrun → null");

console.log(`\nemvco-amount.test.ts — ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
